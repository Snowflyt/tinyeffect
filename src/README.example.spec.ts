/* eslint-disable sonarjs/no-identical-functions */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import { expect, test, vi } from "vitest";

import {
  UnhandledEffectError,
  defineHandlerFor,
  dependency,
  effect,
  effected,
  effectify,
  error,
} from ".";

import type { Effect, EffectFactory, Effected, Unresumable } from ".";

test("banner", async () => {
  type User = { id: number; name: string; role: "admin" | "user" };

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

  const spyLog = vi.spyOn(console, "log").mockImplementation(() => {});
  await program.runAsync();
  expect(spyLog.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Fetched data: {"userId":1,"id":1,"title":"delectus aut autem","completed":false}",
      ],
    ]
  `);
});

test("Usage", async () => {
  type User = { id: number; name: string; role: "admin" | "user" };

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

  const alice: Omit<User, "id"> = { name: "Alice", role: "user" };

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

  let logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  handled2.runSync();
  expect(logSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Executing SQL: INSERT INTO users (name) VALUES (?)",
      ],
      [
        "Parameters:",
        [
          "Alice",
        ],
      ],
      [
        "User created:",
        {
          "id": 42,
          "name": "Alice",
          "role": "user",
        },
      ],
    ]
  `);
  logSpy.mockRestore();

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

  let thrown = false;
  try {
    // @ts-expect-error
    handled3.runSync();
  } catch (error) {
    thrown = true;
    expect(error).toBeInstanceOf(UnhandledEffectError);
    expect((error as UnhandledEffectError).effect).toMatchInlineSnapshot(`
      Effect {
        "name": "dependency:currentUser",
        "payloads": [],
      }
    `);
    expect((error as UnhandledEffectError).message).toMatchInlineSnapshot(
      `"Unhandled effect: dependency:currentUser()"`,
    );
  }
  expect(thrown).toBe(true);

  const handled4 = createUser(alice)
    .resume("executeSQL", (sql, ...params) => {
      console.log(`Executing SQL: ${sql}`);
      console.log("Parameters:", params);
      return 42;
    })
    .resume("println", (...args) => console.log(...args))
    .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
    .catch("authentication", () => console.error("Authentication error"))
    .catch("unauthorized", () => console.error("Unauthorized error"));

  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  handled4.runSync();
  expect(logSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Executing SQL: INSERT INTO users (name) VALUES (?)",
      ],
      [
        "Parameters:",
        [
          "Alice",
        ],
      ],
      [
        "User created:",
        {
          "id": 42,
          "name": "Alice",
          "role": "user",
        },
      ],
    ]
  `);
  logSpy.mockRestore();

  const handled5 = createUser(alice)
    .handle("executeSQL", ({ resume }, sql, ...params) => {
      console.log(`Executing SQL: ${sql}`);
      console.log("Parameters:", params);
      // Simulate async operation
      setTimeout(() => {
        console.log(`SQL executed`);
        resume(42);
      }, 10);
    })
    .resume("println", (...args) => console.log(...args))
    .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
    .catch("authentication", () => console.error("Authentication error"))
    .catch("unauthorized", () => console.error("Unauthorized error"));

  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const promise = handled5.runAsync();
  expect(logSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Executing SQL: INSERT INTO users (name) VALUES (?)",
      ],
      [
        "Parameters:",
        [
          "Alice",
        ],
      ],
    ]
  `);
  await promise;
  expect(logSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Executing SQL: INSERT INTO users (name) VALUES (?)",
      ],
      [
        "Parameters:",
        [
          "Alice",
        ],
      ],
      [
        "SQL executed",
      ],
      [
        "User created:",
        {
          "id": 42,
          "name": "Alice",
          "role": "user",
        },
      ],
    ]
  `);
  logSpy.mockRestore();

  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(handled5.runSync).toThrow(
    new Error("Cannot run an asynchronous effected program with `runSync`, use `runAsync` instead"),
  );
  expect(logSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Executing SQL: INSERT INTO users (name) VALUES (?)",
      ],
      [
        "Parameters:",
        [
          "Alice",
        ],
      ],
    ]
  `);
  // Wait for the async operation to complete
  await new Promise((resolve) => setTimeout(resolve, 15));
  logSpy.mockRestore();

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

  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(
    await createUser2(alice)
      .resume("println", (...args) => console.log(...args))
      .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
      .catch("authentication", () => console.error("Authentication error"))
      .catch("unauthorized", () => console.error("Unauthorized error"))
      .runAsync(),
  ).toEqual({ id: 42, name: "Alice", role: "user" });
  expect(logSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "User created:",
        {
          "id": 42,
          "name": "Alice",
          "role": "user",
        },
      ],
    ]
  `);
  logSpy.mockRestore();

  let sqlId = 1;

  const program = effected(function* () {
    yield* createUser({ name: "Alice", role: "user" });
    yield* createUser({ name: "Bob", role: "admin" });
  })
    .resume("println", (...args) => {
      console.log(...args);
    })
    .handle("executeSQL", ({ resume }, sql, ...params) => {
      console.log(`[${sqlId}] Executing SQL: ${sql}`);
      console.log(`[${sqlId}] Parameters: ${params.join(", ")}`);
      // Simulate async operation
      setTimeout(() => {
        console.log(`[${sqlId}] SQL executed`);
        sqlId++;
        resume(sqlId);
      }, 100);
    })
    .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
    .catch("authentication", () => {
      console.error("Authentication error");
    })
    .catch("unauthorized", () => {
      console.error("Unauthorized error");
    });

  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  await program.runAsync();
  expect(logSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "[1] Executing SQL: INSERT INTO users (name) VALUES (?)",
      ],
      [
        "[1] Parameters: Alice",
      ],
      [
        "[1] SQL executed",
      ],
      [
        "User created:",
        {
          "id": 2,
          "name": "Alice",
          "role": "user",
        },
      ],
      [
        "[2] Executing SQL: INSERT INTO users (name) VALUES (?)",
      ],
      [
        "[2] Parameters: Bob",
      ],
      [
        "[2] SQL executed",
      ],
      [
        "User created:",
        {
          "id": 3,
          "name": "Bob",
          "role": "admin",
        },
      ],
    ]
  `);
  logSpy.mockRestore();
});

test("The `Effect` type > Name collisions", () => {
  {
    const effectA = effect("foo");
    const programA = effected(function* () {
      return yield* effectA();
    });

    const effectB = effect("foo"); // Same name as effectA
    const programB = effected(function* () {
      return yield* effectB();
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    effected(function* () {
      console.log(yield* programA);
      console.log(yield* programB);
    })
      .resume("foo", () => 42)
      .runSync();
    expect(logSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          42,
        ],
        [
          42,
        ],
      ]
    `);
    logSpy.mockRestore();
  }

  {
    const effectA = effect("foo");
    const programA = effected(function* () {
      return yield* effectA();
    }).resume("foo", () => 21);

    const effectB = effect("foo");
    const programB = effected(function* () {
      return yield* effectB();
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    effected(function* () {
      console.log(yield* programA);
      console.log(yield* programB);
    })
      .resume("foo", () => 42)
      .runSync();
    expect(logSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          21,
        ],
        [
          42,
        ],
      ]
    `);
    logSpy.mockRestore();
  }

  {
    const nameA = Symbol("nameA");
    const effectA = effect(nameA);
    const programA = effected(function* () {
      return yield* effectA();
    });

    const nameB = Symbol("nameB");
    const effectB = effect(nameB);
    const programB = effected(function* () {
      return yield* effectB();
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    effected(function* () {
      console.log(yield* programA);
      console.log(yield* programB);
    })
      .resume(nameA, () => 21)
      .resume(nameB, () => 42)
      .runSync();
    expect(logSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          21,
        ],
        [
          42,
        ],
      ]
    `);
    logSpy.mockRestore();
  }
});

test("The `Effect` type > Unresumable effects", () => {
  const raise = effect("raise", { resumable: false })<[error: unknown], never>;

  const program = effected(function* () {
    yield* raise("An error occurred");
  }).resume(
    // @ts-expect-error
    "raise",
    () => {},
  );

  expect(program.runSync).toThrow(
    new Error('Cannot resume non-resumable effect: raise("An error occurred")'),
  );
});

test("Interlude: Where’s “try-catch”?", () => {
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
      return yield* parseJSON<Settings>(json).catch("syntax", (message) => {
        console.error(`Invalid JSON: ${message}`);
        return defaultSettings;
      });
    });

  const spyError = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(
    readSettings("invalid json")
      .terminate("raise", () => {})
      .runSync(),
  ).toEqual(defaultSettings);
  expect(spyError.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Invalid JSON: Unexpected token 'i', "invalid json" is not valid JSON",
      ],
    ]
  `);
  spyError.mockRestore();

  expect(
    readSettings('{"something": "bar"}')
      .terminate("raise", () => {})
      .runSync(),
  ).toEqual({ something: "bar" });
});

test("A deep dive into `resume` and `terminate`", () => {
  {
    const raise = effect("raise")<[error: unknown], any>;

    const safeDivide = (a: number, b: number) =>
      effected(function* () {
        if (b === 0) return yield* raise("Division by zero");
        return a / b;
      });

    expect(
      effected(function* () {
        return 8 + (yield* safeDivide(1, 0));
      })
        .terminate("raise", () => 42)
        .runSync(),
    ).toBe(42);
  }

  {
    type Iterate<T> = Effect<"iterate", [value: T], void>;
    const iterate = <T>(value: T) => effect("iterate")<[value: T], void>(value);

    const iterateOver = <T>(iterable: Iterable<T>): Effected<Iterate<T>, void> =>
      effected(function* () {
        for (const value of iterable) {
          yield* iterate(value);
        }
      });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let i = 0;
    iterateOver([1, 2, 3, 4, 5])
      .handle("iterate", ({ resume, terminate }, value) => {
        if (i++ >= 3) {
          // Too many iterations
          terminate();
          return;
        }
        console.log("Iterating over", value);
        resume();
      })
      .runSync();
    expect(logSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "Iterating over",
          1,
        ],
        [
          "Iterating over",
          2,
        ],
        [
          "Iterating over",
          3,
        ],
      ]
    `);
    logSpy.mockRestore();
  }
});

test("Handling return values", () => {
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

  const safeDivide2 = (a: number, b: number): Effected<never, Option<number>> =>
    safeDivide(a, b)
      .map((value) => some(value))
      .terminate("raise", () => none);

  expect(safeDivide2(1, 0).runSync()).toEqual(none);
  expect(safeDivide2(1, 2).runSync()).toEqual(some(0.5));
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

    const readSettingsWithoutLogging = readSettings("settings.json").resume(
      (name): name is Logging["name"] => name.startsWith("logging:"),
      (..._args) => {
        // Omit logging
      },
    );

    expect(readSettingsWithoutLogging.resume("readFile", () => "Invalid JSON").runSync()).toEqual(
      defaultSettings,
    );
    expect(
      readSettingsWithoutLogging.resume("readFile", () => '{"something": "bar"}').runSync(),
    ).toEqual({ something: "bar" });
  }

  {
    type Result<T, E> = { kind: "ok"; value: T } | { kind: "err"; error: E };

    const ok = <T>(value: T): Result<T, never> => ({ kind: "ok", value });
    const err = <E>(error: E): Result<never, E> => ({ kind: "err", error });

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

    const range2 = (start: number, stop: number) => handleErrorAsResult(range(start, stop));

    const logs: unknown[][] = [];
    expect(
      range2(1, 0)
        .resume("println", (...args) => logs.push(args))
        .runSync(),
    ).toEqual(err({ error: "range", message: "Start must be less than stop" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range2(1.5, 5)
        .resume("println", (...args) => logs.push(args))
        .runSync(),
    ).toEqual(err({ error: "type", message: "Start and stop must be integers" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range2(1, 5)
        .resume("println", (...args) => logs.push(args))
        .runSync(),
    ).toEqual(ok([1, 2, 3, 4]));
    expect(logs).toEqual([["Generating range from 1 to 5"]]);
    logs.length = 0;

    const range3 = (start: number, stop: number) => range(start, stop).with(handleErrorAsResult);

    expect(
      range3(1, 0)
        .resume("println", (...args) => logs.push(args))
        .runSync(),
    ).toEqual(err({ error: "range", message: "Start must be less than stop" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range3(1.5, 5)
        .resume("println", (...args) => logs.push(args))
        .runSync(),
    ).toEqual(err({ error: "type", message: "Start and stop must be integers" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range3(1, 5)
        .resume("println", (...args) => logs.push(args))
        .runSync(),
    ).toEqual(ok([1, 2, 3, 4]));
    expect(logs).toEqual([["Generating range from 1 to 5"]]);
    logs.length = 0;

    const range4 = (start: number, stop: number) =>
      range(start, stop)
        .map((value) => ok(value))
        .catchAll((error, message) => err({ error, message }));

    expect(
      range4(1, 0)
        .resume("println", (...args) => logs.push(args))
        .runSync(),
    ).toEqual(err({ error: "range", message: "Start must be less than stop" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range4(1.5, 5)
        .resume("println", (...args) => logs.push(args))
        .runSync(),
    ).toEqual(err({ error: "type", message: "Start and stop must be integers" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range4(1, 5)
        .resume("println", (...args) => logs.push(args))
        .runSync(),
    ).toEqual(ok([1, 2, 3, 4]));
    expect(logs).toEqual([["Generating range from 1 to 5"]]);
  }
});

test("Handling effects with another effected program", () => {
  {
    type Ask<T> = Effect<"ask", [], T>;
    const ask = <T>(): Generator<Ask<T>, T, unknown> => effect("ask")();

    const double = () =>
      effected(function* () {
        return (yield* ask<number>()) + (yield* ask<number>());
      });

    expect(
      effected(function* () {
        return yield* double();
      })
        .resume("ask", () => 21)
        .runSync(),
    ).toBe(42);

    type Random = Effect<"random", [], number>;
    const random: EffectFactory<Random> = effect("random");

    expect(
      effected(function* () {
        return yield* double();
      })
        .resume("ask", function* () {
          return yield* random();
        })
        .resume("random", () => 42)
        .runSync(),
    ).toBe(84);
  }

  {
    type Emit = Effect<"emit", [msg: string], void>;
    const emit: EffectFactory<Emit> = effect("emit");

    const program = effected(function* () {
      yield* emit("hello");
      yield* emit("world");
    })
      .resume("emit", (msg) => emit(`"${msg}"`))
      .resume("emit", (...args) => console.log(...args));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    program.runSync();
    expect(logSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          ""hello"",
        ],
        [
          ""world"",
        ],
      ]
    `);
  }
});

test("Abstracting handlers", () => {
  {
    type State<T> = Effect<"state.get", [], T> | Effect<"state.set", [value: T], void>;
    const state = {
      get: <T>(): Generator<State<T>, T, unknown> => effect("state.get")<[], T>(),
      set: <T>(value: T): Generator<State<T>, void, unknown> =>
        effect("state.set")<[value: T], void>(value),
    };

    const sumDown = (sum: number = 0): Effected<State<number>, number> =>
      effected(function* () {
        const n = yield* state.get<number>();
        if (n <= 0) return sum;
        yield* state.set(n - 1);
        return yield* sumDown(sum + n);
      });

    let n = 10;
    const program = sumDown()
      .resume("state.get", () => n)
      .resume("state.set", (value) => {
        n = value;
      });

    expect(program.runSync()).toBe(55);

    const stateHandler = <T>({ get, set }: { get: () => T; set: (x: T) => void }) =>
      defineHandlerFor<State<T>>().with((effected) =>
        effected.resume("state.get", get).resume("state.set", set),
      );

    n = 10;
    const program2 = sumDown().with(stateHandler({ get: () => n, set: (x) => (n = x) }));

    expect(program2.runSync()).toBe(55);
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

    const raiseMaybe = defineHandlerFor<Raise>().with((effected) =>
      effected.map((value) => some(value)).terminate("raise", () => none),
    );

    const safeDivide2 = (a: number, b: number) => safeDivide(a, b).with(raiseMaybe);

    expect(safeDivide2(1, 0).runSync()).toEqual(none);
    expect(safeDivide2(1, 2).runSync()).toEqual(some(0.5));
  }
});
