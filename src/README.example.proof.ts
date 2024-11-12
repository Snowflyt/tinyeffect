/* eslint-disable sonarjs/no-identical-functions */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import { equal, expect, extend, test, error as triggerError } from "typroof";

import { Effected, defineHandlerFor, dependency, effect, effected, effectify, error } from ".";

import type { Effect, EffectFactory, InferEffect, UnhandledEffect, Unresumable } from ".";

type User = { id: number; name: string; role: "admin" | "user" };

test("banner", () => {
  const log = effect("log")<[msg: string], void>;
  const askUser = dependency("user")<User | null>;
  const authError = error("auth");

  const requiresAdmin = () =>
    effected(function* () {
      const user = yield* askUser();
      if (!user) return yield* authError("No user found");
      if (user.role !== "admin") return yield* authError(`User ${user.name} is not an admin`);
    });

  const fetchAdminData = () =>
    effected(function* () {
      yield* requiresAdmin();
      const data = yield* effectify(
        fetch("https://jsonplaceholder.typicode.com/todos/1").then((res) => res.json()),
      );
      yield* log("Fetched data: " + JSON.stringify(data));
    });

  const program = fetchAdminData()
    .resume("log", (msg) => console.log(msg))
    .provideBy("user", () => ({ id: 1, name: "Alice", role: "admin" }) satisfies User)
    .catch("auth", (err) => console.error("Authorization error:", err));

  expect(program).to(equal<Effected<never, void>>);
});

test("Usage", () => {
  const println = effect("println")<unknown[], void>;
  const executeSQL = effect("executeSQL")<[sql: string, ...params: unknown[]], any>;
  const askCurrentUser = dependency("currentUser")<User | null>;
  const authenticationError = error("authentication");
  const unauthorizedError = error("unauthorized");

  const requiresAdmin = () =>
    effected(function* () {
      const currentUser = yield* askCurrentUser();
      if (!currentUser) return yield* authenticationError();
      if (currentUser.role !== "admin")
        return yield* unauthorizedError(`User "${currentUser.name}" is not an admin`);
    });

  const createUser = (user: Omit<User, "id">) =>
    effected(function* () {
      yield* requiresAdmin();
      const id = yield* executeSQL("INSERT INTO users (name) VALUES (?)", user.name);
      const savedUser: User = { id, ...user };
      yield* println("User created:", savedUser);
      return savedUser;
    });

  expect(requiresAdmin).to(
    equal<
      () => Effected<
        | Unresumable<Effect<"error:authentication", [message?: string], never>>
        | Effect<"dependency:currentUser", [], User | null>
        | Unresumable<Effect<"error:unauthorized", [message?: string], never>>,
        undefined
      >
    >,
  );

  expect(createUser).to(
    equal<
      (
        user: Omit<User, "id">,
      ) => Effected<
        | Unresumable<Effect<"error:authentication", [message?: string], never>>
        | Effect<"dependency:currentUser", [], User | null>
        | Unresumable<Effect<"error:unauthorized", [message?: string], never>>
        | Effect<"executeSQL", [sql: string, ...params: unknown[]], any>
        | Effect<"println", unknown[], void>,
        User
      >
    >,
  );

  const alice: Omit<User, "id"> = { name: "Alice", role: "user" };

  const handled1 = createUser(alice).handle("executeSQL", ({ resume }, sql, ...params) => {
    console.log(`Executing SQL: ${sql}`);
    console.log("Parameters:", params);
    resume(42);
  });

  expect(handled1).to(
    equal<
      Effected<
        | Unresumable<Effect<"error:authentication", [message?: string], never>>
        | Effect<"dependency:currentUser", [], User | null>
        | Unresumable<Effect<"error:unauthorized", [message?: string], never>>
        | Effect<"println", unknown[], void>,
        User
      >
    >,
  );

  const handled2 = createUser(alice)
    .handle("executeSQL", ({ resume }, sql, ...params) => {
      console.log(`Executing SQL: ${sql}`);
      console.log("Parameters:", params);
      resume(42);
    })
    .handle("println", ({ resume }, ...args) => {
      console.log(...args);
      resume();
    })
    .handle("dependency:currentUser", ({ resume }) => {
      resume({ id: 1, name: "Charlie", role: "admin" });
    })
    .handle<"error:authentication", void>("error:authentication", ({ terminate }) => {
      console.error("Authentication error");
      terminate();
    })
    .handle<"error:unauthorized", void>("error:unauthorized", ({ terminate }) => {
      console.error("Unauthorized error");
      terminate();
    });

  expect(handled2).to(equal<Effected<never, void | User>>);
  expect(handled2.runSync()).to(equal<void | User>);

  const handled3 = createUser(alice)
    .handle("executeSQL", ({ resume }, sql, ...params) => {
      console.log(`Executing SQL: ${sql}`);
      console.log("Parameters:", params);
      resume(42);
    })
    .handle<"error:authentication", void>("error:authentication", ({ terminate }) => {
      console.error("Authentication error");
      terminate();
    })
    .handle<"error:unauthorized", void>("error:unauthorized", ({ terminate }) => {
      console.error("Unauthorized error");
      terminate();
    });

  expect(handled3.runSync).to(
    equal<
      UnhandledEffect<
        Effect<"dependency:currentUser", [], User | null> | Effect<"println", unknown[], void>
      >
    >,
  );

  const handled4 = createUser(alice)
    .resume("executeSQL", (sql, ...params) => {
      console.log(`Executing SQL: ${sql}`);
      console.log("Parameters:", params);
      return 42;
    })
    .resume("println", console.log)
    .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
    .catch("authentication", () => console.error("Authentication error"))
    .catch("unauthorized", () => console.error("Unauthorized error"));

  expect(handled4).to(equal<Effected<never, void | User>>);
  expect(handled4.runSync()).to(equal<void | User>);

  const db = {
    user: {
      create: (_user: Omit<User, "id">) =>
        new Promise<number>((resolve) => setTimeout(() => resolve(42), 100)),
    },
  };

  const createUser2 = (user: Omit<User, "id">) =>
    effected(function* () {
      yield* requiresAdmin();
      const id = yield* effectify(db.user.create(user));
      const savedUser = { id, ...user };
      yield* println("User created:", savedUser);
      return savedUser;
    });

  expect(createUser2).to(
    equal<
      (
        user: Omit<User, "id">,
      ) => Effected<
        | Unresumable<Effect<"error:authentication", [message?: string], never>>
        | Effect<"dependency:currentUser", [], User | null>
        | Unresumable<Effect<"error:unauthorized", [message?: string], never>>
        | Effect<"println", unknown[], void>,
        User
      >
    >,
  );
});

test("The `Effect` type > Unresumable effects", () => {
  const raise = effect("raise", { resumable: false })<[error: unknown], never>;

  expect(raise).to(
    equal<
      (error: unknown) => Effected<Unresumable<Effect<"raise", [error: unknown], never>>, never>
    >,
  );

  const program = effected(function* () {
    yield* raise(new Error("Something went wrong"));
  });
  // @ts-expect-error
  expect(program.resume("raise", console.error)).to(triggerError);
});

test("The `Effect` type > Provide more readable type information", () => {
  type Println = Effect<"println", unknown[], void>;
  const println: EffectFactory<Println> = effect("println");
  type ExecuteSQL = Effect<"executeSQL", [sql: string, ...params: unknown[]], any>;
  const executeSQL: EffectFactory<ExecuteSQL> = effect("executeSQL");
  type CurrentUserDependency = Effect.Dependency<"currentUser", User | null>;
  const askCurrentUser: EffectFactory<CurrentUserDependency> = dependency(
    "currentUser",
  )<User | null>;
  type AuthenticationError = Effect.Error<"authentication">;
  const authenticationError: EffectFactory<AuthenticationError> = error("authentication");
  type UnauthorizedError = Effect.Error<"unauthorized">;
  const unauthorizedError: EffectFactory<UnauthorizedError> = error("unauthorized");

  const requiresAdmin = () =>
    effected(function* () {
      const currentUser = yield* askCurrentUser();
      if (!currentUser) return yield* authenticationError();
      if (currentUser.role !== "admin")
        return yield* unauthorizedError(`User "${currentUser.name}" is not an admin`);
    });

  const createUser = (user: Omit<User, "id">) =>
    effected(function* () {
      yield* requiresAdmin();
      const id = yield* executeSQL("INSERT INTO users (name) VALUES (?)", user.name);
      const savedUser: User = { id, ...user };
      yield* println("User created:", savedUser);
      return savedUser;
    });

  expect(createUser).to(
    equal<
      (
        user: Omit<User, "id">,
      ) => Effected<
        | Unresumable<AuthenticationError>
        | CurrentUserDependency
        | Unresumable<UnauthorizedError>
        | ExecuteSQL
        | Println,
        User
      >
    >,
  );
});

test("A deep dive into `resume` and `terminate`", () => {
  type Iterate<T> = Effect<"iterate", [value: T], void>;
  const iterate = <T>(value: T) => effect("iterate")<[value: T], void>(value);

  const iterateOver = <T>(iterable: Iterable<T>) =>
    effected(function* () {
      for (const value of iterable) {
        yield* iterate(value);
      }
    });

  expect(iterateOver).to(equal<<T>(iterable: Iterable<T>) => Effected<Iterate<T>, void>>);

  let i = 0;
  const program = iterateOver([1, 2, 3, 4, 5]).handle("iterate", ({ resume, terminate }, value) => {
    if (i++ >= 3) {
      // Too many iterations
      terminate();
      return;
    }
    console.log("Iterating over", value);
    resume();
  });

  expect(program).to(equal<Effected<never, void>>);
});

test("Handling effects with another effected program", () => {
  {
    type Ask<T> = Effect<"ask", [], T>;
    const ask = <T>(): Effected<Ask<T>, T> => effect("ask")();

    const double = (): Effected<Ask<number>, number> =>
      effected(function* () {
        return (yield* ask<number>()) + (yield* ask<number>());
      });

    type Random = Effect<"random", [], number>;
    const random: EffectFactory<Random> = effect("random");

    const program = effected(function* () {
      return yield* double();
    }).resume("ask", function* () {
      return yield* random();
    });

    expect(program).to(equal<Effected<Random, number>>);
  }

  {
    type Emit = Effect<"emit", [msg: string], void>;
    const emit: EffectFactory<Emit> = effect("emit");

    const program1 = effected(function* () {
      yield* emit("hello");
      yield* emit("world");
    }).resume("emit", (msg) => emit(`"${msg}"`));

    expect(program1).to(equal<Effected<Emit, void>>);

    const program2 = program1.resume("emit", (...args) => console.log(...args));

    expect(program2).to(equal<Effected<never, void>>);
  }
});

test("Handling return values", () => {
  {
    type Raise = Unresumable<Effect<"raise", [error: unknown], never>>;
    const raise: EffectFactory<Raise> = effect("raise", { resumable: false });

    const safeDivide = (a: number, b: number) =>
      effected(function* () {
        if (b === 0) return yield* raise("Division by zero");
        return a / b;
      });

    expect(safeDivide).to(equal<(a: number, b: number) => Effected<Raise, number>>);

    type Option<T> = { kind: "some"; value: T } | { kind: "none" };

    const some = <T>(value: T): Option<T> => ({ kind: "some", value });
    const none: Option<never> = { kind: "none" };

    const safeDivide2 = (a: number, b: number) =>
      safeDivide(a, b)
        .map((value) => some(value))
        .terminate("raise", () => none);

    expect(safeDivide2).to(equal<(a: number, b: number) => Effected<never, Option<number>>>);
  }

  {
    type Defer = Effect<"defer", [fn: () => void], void>;
    const defer: EffectFactory<Defer> = effect("defer");

    const deferHandler = defineHandlerFor<Defer>().with((effected) => {
      const deferredActions: Array<() => void> = [];

      return effected
        .resume("defer", (fn) => {
          deferredActions.push(fn);
        })
        .tap(() => {
          deferredActions.forEach((fn) => fn());
        });
    });

    const program = effected(function* () {
      yield* defer(() => console.log("Deferred action"));
      console.log("Normal action");
    }).with(deferHandler);

    expect(program).to(equal<Effected<never, void>>);
  }
});

test("Handling multiple effects in one handler", () => {
  {
    type Logging =
      | Effect<"logging:log", unknown[], void>
      | Effect<"logging:warn", unknown[], void>
      | Effect<"logging:error", unknown[], void>;
    const logger = {
      log: effect("logging:log")<unknown[], void>,
      warn: effect("logging:warn")<unknown[], void>,
      error: effect("logging:error")<unknown[], void>,
    };

    type ReadFile = Effect<"readFile", [path: string], string>;
    const readFile: EffectFactory<ReadFile> = effect("readFile");

    interface Settings {
      something: string;
    }

    const defaultSettings: Settings = {
      something: "foo",
    };

    const readSettings = (path: string): Effected<Logging | ReadFile, Settings> =>
      effected(function* () {
        const content = yield* readFile(path);
        try {
          const settings = JSON.parse(content);
          yield* logger.log("Settings loaded");
          return settings;
        } catch (e) {
          yield* logger.error("Failed to parse settings file:", e);
          return defaultSettings;
        }
      });

    const readSettingsWithoutLogging = (path: string) =>
      readSettings(path).resume(
        (name): name is Logging["name"] => name.startsWith("logging:"),
        () => {
          // Omit logging
        },
      );

    expect(readSettingsWithoutLogging).to(equal<(path: string) => Effected<ReadFile, Settings>>);
  }

  {
    type Result<T, E> = { kind: "ok"; value: T } | { kind: "err"; error: E };

    const ok = <T>(value: T): Result<T, never> => ({ kind: "ok", value });
    const err = <E>(error: E): Result<never, E> => ({ kind: "err", error });

    type TypeError = Effect.Error<"type">;
    const typeError: EffectFactory<TypeError> = error("type");
    type RangeError = Effect.Error<"range">;
    const rangeError: EffectFactory<RangeError> = error("range");

    type Log = Effect<"println", unknown[], void>;
    const log: EffectFactory<Log> = effect("println");

    const range = (start: number, stop: number): Effected<TypeError | RangeError | Log, number[]> =>
      effected(function* () {
        if (start >= stop) return yield* rangeError("Start must be less than stop");
        if (!Number.isInteger(start) || !Number.isInteger(stop))
          return yield* typeError("Start and stop must be integers");
        yield* log(`Generating range from ${start} to ${stop}`);
        return Array.from({ length: stop - start }, (_, i) => start + i);
      });

    const handleErrorAsResult = <R, E extends Effect, ErrorName extends string>(
      effected: Effected<Effect.Error<ErrorName> | E, R>,
    ): Effected<E, Result<R, { error: ErrorName; message?: string }>> => {
      const isErrorEffect = (name: string | symbol): name is `error:${ErrorName}` => {
        if (typeof name === "symbol") return false;
        return name.startsWith("error:");
      };

      return effected
        .map((value) => ok(value))
        .handle(isErrorEffect, ({ effect, terminate }: any, message: any) => {
          terminate(err({ error: effect.name.slice("error:".length), message }));
        });
    };

    const range2 = (start: number, stop: number) => handleErrorAsResult(range(start, stop));

    expect(range2).to(
      equal<
        (
          start: number,
          stop: number,
        ) => Effected<Log, Result<number[], { error: "type" | "range"; message?: string }>>
      >,
    );

    const range3 = (start: number, stop: number) => range(start, stop).with(handleErrorAsResult);

    expect(range3).to(equal(range2));

    const range4 = (start: number, stop: number) =>
      range(start, stop)
        .map((value) => ok(value))
        .catchAll((error, ...args) =>
          err({ error, ...(args.length === 0 ? {} : { message: args[0] }) }),
        );

    expect<InferEffect<typeof range4>>().to(equal<Log>);
    expect(range4).to(extend(range3));
  }
});

test("Handling error effects", () => {
  {
    type SyntaxError = Effect.Error<"syntax">;
    const syntaxError: EffectFactory<SyntaxError> = error("syntax");
    type Raise = Unresumable<Effect<"raise", [error: unknown], never>>;
    const raise: EffectFactory<Raise> = effect("raise", { resumable: false });

    const parseJSON = <T>(json: string): Effected<SyntaxError | Raise, T> =>
      effected(function* () {
        try {
          return JSON.parse(json);
        } catch (e) {
          if (e instanceof SyntaxError) return yield* syntaxError(e.message);
          return yield* raise(e);
        }
      });

    interface Settings {
      something: string;
    }

    const defaultSettings: Settings = {
      something: "foo",
    };

    const readSettings = (json: string) =>
      effected(function* () {
        const settings = yield* parseJSON<Settings>(json).catch("syntax", (message) => {
          console.error(`Invalid JSON: ${message}`);
          return defaultSettings;
        });
        expect(settings).to(equal<Settings>);
        /* ... */
      });

    expect(readSettings).to(equal<(json: string) => Effected<Raise, void>>);
  }

  {
    type TypeError = Effect.Error<"type">;
    const typeError: EffectFactory<TypeError> = error("type");
    type RangeError = Effect.Error<"range">;
    const rangeError: EffectFactory<RangeError> = error("range");

    type Log = Effect<"log", unknown[], void>;
    const log: EffectFactory<Log> = effect("log");

    const range = (start: number, stop: number): Effected<TypeError | RangeError | Log, number[]> =>
      effected(function* () {
        if (start >= stop) return yield* rangeError("Start must be less than stop");
        if (!Number.isInteger(start) || !Number.isInteger(stop))
          return yield* typeError("Start and stop must be integers");
        yield* log(`Generating range from ${start} to ${stop}`);
        return Array.from({ length: stop - start }, (_, i) => start + i);
      });

    const tolerantRange = (start: number, stop: number) =>
      range(start, stop).catchAll((error, message) => {
        console.warn(`Error(${error}): ${message || ""}`);
        return [] as number[];
      });

    expect(tolerantRange).to(equal<(start: number, stop: number) => Effected<Log, number[]>>);

    const range2 = (start: number, stop: number) => range(start, stop).catchAndThrow("type");

    expect(range2).to(equal<(start: number, stop: number) => Effected<RangeError | Log, number[]>>);

    const range3 = (start: number, stop: number) =>
      range(start, stop).catchAndThrow("type", "Invalid start or stop value");

    expect(range3).to(equal<(start: number, stop: number) => Effected<RangeError | Log, number[]>>);

    const range4 = (start: number, stop: number) =>
      range(start, stop).catchAndThrow("range", (message) => `Invalid range: ${message}`);

    expect(range4).to(equal<(start: number, stop: number) => Effected<TypeError | Log, number[]>>);

    const range5 = (start: number, stop: number) => range(start, stop).catchAllAndThrow();

    expect(range5).to(equal<(start: number, stop: number) => Effected<Log, number[]>>);

    const range6 = (start: number, stop: number) =>
      range(start, stop).catchAllAndThrow("An error occurred while generating the range");

    expect(range6).to(equal<(start: number, stop: number) => Effected<Log, number[]>>);

    const range7 = (start: number, stop: number) =>
      range(start, stop).catchAllAndThrow((error, message) => `Error(${error}): ${message}`);

    expect(range7).to(equal<(start: number, stop: number) => Effected<Log, number[]>>);
  }
});

test("Abstracting handlers", () => {
  {
    type State<T> = Effect<"state.get", [], T> | Effect<"state.set", [value: T], void>;
    const state = {
      get: <T>(): Effected<State<T>, T> => effect("state.get")<[], T>(),
      set: <T>(value: T): Effected<State<T>, void> => effect("state.set")<[value: T], void>(value),
    };

    const sumDown = (sum: number = 0): Effected<State<number>, number> =>
      effected(function* () {
        const n = yield* state.get<number>();
        if (n <= 0) return sum;
        yield* state.set(n - 1);
        return yield* sumDown(sum + n);
      });

    const stateHandler = <T>({ get, set }: { get: () => T; set: (x: T) => void }) =>
      defineHandlerFor<State<T>>().with((effected) =>
        effected.resume("state.get", get).resume("state.set", set),
      );

    let n = 10;
    const handler = stateHandler({ get: () => n, set: (x) => (n = x) });

    expect(sumDown().with(handler)).not.to(triggerError);
    expect(sumDown().with(handler)).to(equal<Effected<never, number>>);
  }

  {
    type Raise = Unresumable<Effect<"raise", [error: unknown], never>>;
    const raise: EffectFactory<Raise> = effect("raise", { resumable: false });

    const safeDivide = (a: number, b: number): Effected<Raise, number> =>
      effected(function* () {
        if (b === 0) return yield* raise("Division by zero");
        return a / b;
      });

    type Option<T> = { kind: "some"; value: T } | { kind: "none" };

    const some = <T>(value: T): Option<T> => ({ kind: "some", value });
    const none: Option<never> = { kind: "none" };

    const raiseOption = defineHandlerFor<Raise>().with((effected) =>
      effected.map((value) => some(value)).terminate("raise", () => none),
    );

    const safeDivide2 = (a: number, b: number) => safeDivide(a, b).with(raiseOption);

    expect(safeDivide2).to(equal<(a: number, b: number) => Effected<never, Option<number>>>);
  }
});

test("Effects without generators", () => {
  expect(Effected.of(42)).not.to(triggerError);
  expect(Effected.of(42)).to(equal<Effected<never, number>>);

  expect(Effected.from(() => 42)).not.to(triggerError);
  expect(Effected.from(() => 42)).to(equal<Effected<never, number>>);
});
