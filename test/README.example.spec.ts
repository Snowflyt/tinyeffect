/* eslint-disable sonarjs/no-identical-functions */

import { expect, test, vi } from "vitest";

import type { Default, Effect, EffectFactory, Unresumable } from "../src";
import {
  Effected,
  UnhandledEffectError,
  defineHandlerFor,
  dependency,
  effect,
  effected,
  effectify,
  error,
} from "../src";

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

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  await program.runAsync();
  expect(logSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Fetched data: {"userId":1,"id":1,"title":"delectus aut autem","completed":false}",
      ],
    ]
  `);
  logSpy.mockRestore();
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

test("Handling effects with another effected program", () => {
  {
    type Ask<T> = Effect<"ask", [], T>;
    const ask = <T>(): Effected<Ask<T>, T> => effect("ask")();

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
    logSpy.mockRestore();
  }
});

test("Default handlers", () => {
  const logs: unknown[][] = [];
  const println = effect<unknown[], void>()("println", {
    defaultHandler: ({ resume }, ...args) => {
      logs.push(args);
      resume();
    },
  });

  {
    const program = effected(function* () {
      yield* println("Hello, world!");
    });
    expect(program.runSync).not.toThrow();
    expect(logs).toEqual([["Hello, world!"]]);
    logs.length = 0;

    expect(println("Hello, world!").runSync).not.toThrow();
    expect(logs).toEqual([["Hello, world!"]]);
    logs.length = 0;
  }

  {
    const program = effected(function* () {
      yield* println("Hello, world!");
    }).resume("println", () => {
      logs.push(["This will be logged instead of the default handler"]);
    });
    expect(program.runSync).not.toThrow();
    expect(logs).toEqual([["This will be logged instead of the default handler"]]);
    logs.length = 0;

    expect(
      println("Hello, world!").resume("println", () => {
        logs.push(["This will be logged instead of the default handler"]);
      }).runSync,
    ).not.toThrow();
    expect(logs).toEqual([["This will be logged instead of the default handler"]]);
    logs.length = 0;
  }

  {
    type User = { id: number; name: string; role: "admin" | "user" };

    const askCurrentUser = dependency<User | null>()("currentUser", () => ({
      id: 1,
      name: "Charlie",
      role: "admin",
    }));

    const program = effected(function* () {
      const user = yield* askCurrentUser();
      yield* println("Current user:", user);
    });
    expect(program.runSync).not.toThrow();
    expect(logs).toEqual([["Current user:", { id: 1, name: "Charlie", role: "admin" }]]);
    logs.length = 0;

    expect(
      program.provide("currentUser", { id: 2, name: "Alice", role: "user" }).runSync,
    ).not.toThrow();
    expect(logs).toEqual([["Current user:", { id: 2, name: "Alice", role: "user" }]]);
    logs.length = 0;
  }
});

test("Handling return values", () => {
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

    const safeDivide2 = (a: number, b: number): Effected<never, Option<number>> =>
      safeDivide(a, b)
        .andThen((value) => some(value))
        .terminate("raise", () => none);

    expect(safeDivide2(1, 0).runSync()).toEqual(none);
    expect(safeDivide2(1, 2).runSync()).toEqual(some(0.5));
  }

  {
    type Defer = Effect<"defer", [fn: () => void], void>;
    const defer: EffectFactory<Defer> = effect("defer");

    const deferHandler = defineHandlerFor<Defer>().with((self) => {
      const deferredActions: (() => void)[] = [];

      return self
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

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    program.runSync();
    expect(logSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "Normal action",
        ],
        [
          "Deferred action",
        ],
      ]
    `);
    logSpy.mockRestore();
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
      self: Effected<Effect.Error<ErrorName> | E, R>,
    ): Effected<E, Result<R, { error: ErrorName; message?: string }>> => {
      const isErrorEffect = (name: string | symbol): name is `error:${ErrorName}` => {
        if (typeof name === "symbol") return false;
        return name.startsWith("error:");
      };

      return self
        .andThen((value) => ok(value))
        .handle(isErrorEffect, (({ effect, terminate }: any, message: any) => {
          terminate(err({ error: effect.name.slice("error:".length), message }));
        }) as never) as Effected<E, Result<R, { error: ErrorName; message?: string }>>;
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
        .resume("println", (...args) => {
          logs.push(args);
        })
        .runSync(),
    ).toEqual(err({ error: "range", message: "Start must be less than stop" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range2(1.5, 5)
        .resume("println", (...args) => {
          logs.push(args);
        })
        .runSync(),
    ).toEqual(err({ error: "type", message: "Start and stop must be integers" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range2(1, 5)
        .resume("println", (...args) => {
          logs.push(args);
        })
        .runSync(),
    ).toEqual(ok([1, 2, 3, 4]));
    expect(logs).toEqual([["Generating range from 1 to 5"]]);
    logs.length = 0;

    const range3 = (start: number, stop: number) => range(start, stop).with(handleErrorAsResult);

    expect(
      range3(1, 0)
        .resume("println", (...args) => {
          logs.push(args);
        })
        .runSync(),
    ).toEqual(err({ error: "range", message: "Start must be less than stop" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range3(1.5, 5)
        .resume("println", (...args) => {
          logs.push(args);
        })
        .runSync(),
    ).toEqual(err({ error: "type", message: "Start and stop must be integers" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range3(1, 5)
        .resume("println", (...args) => {
          logs.push(args);
        })
        .runSync(),
    ).toEqual(ok([1, 2, 3, 4]));
    expect(logs).toEqual([["Generating range from 1 to 5"]]);
    logs.length = 0;

    const range4 = (start: number, stop: number) =>
      range(start, stop)
        .andThen((value) => ok(value))
        .catchAll((error, message) => err({ error, message }));

    expect(
      range4(1, 0)
        .resume("println", (...args) => {
          logs.push(args);
        })
        .runSync(),
    ).toEqual(err({ error: "range", message: "Start must be less than stop" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range4(1.5, 5)
        .resume("println", (...args) => {
          logs.push(args);
        })
        .runSync(),
    ).toEqual(err({ error: "type", message: "Start and stop must be integers" }));
    expect(logs).toEqual([]);
    logs.length = 0;

    expect(
      range4(1, 5)
        .resume("println", (...args) => {
          logs.push(args);
        })
        .runSync(),
    ).toEqual(ok([1, 2, 3, 4]));
    expect(logs).toEqual([["Generating range from 1 to 5"]]);
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
    expect(spyError).toHaveBeenCalledOnce();
    expect(spyError.mock.calls[0]!.length).toBe(1);
    expect(spyError.mock.calls[0]![0]).toMatch(/^Invalid JSON: Unexpected token /);
    spyError.mockRestore();

    expect(
      readSettings('{"something": "bar"}')
        .terminate("raise", () => {})
        .runSync(),
    ).toEqual({ something: "bar" });
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

    const spyWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      tolerantRange(4, 1)
        .resume("log", () => {})
        .runSync(),
    ).toEqual([]);
    expect(spyWarn.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "Error(range): Start must be less than stop",
        ],
      ]
    `);
    spyWarn.mockRestore();

    const range2 = (start: number, stop: number) => range(start, stop).catchAndThrow("type");

    let thrown = false;
    try {
      range2(1.5, 2)
        .catch("range", () => {})
        .resume("log", console.log)
        .runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.name).toBe("TypeError");
        expect(e.message).toBe("Start and stop must be integers");
        const errorProto = Object.getPrototypeOf(e);
        expect(errorProto).not.toBe(Error.prototype);
        expect(errorProto).toBeInstanceOf(Error);
        expect(errorProto.name).toBe("TypeError");
        expect(errorProto.constructor.name).toBe("TypeError");
      }
    }
    expect(thrown).toBe(true);

    const range3 = (start: number, stop: number) =>
      range(start, stop).catchAndThrow("type", "Invalid start or stop value");

    thrown = false;
    try {
      range3(1.5, 2)
        .catch("range", () => {})
        .resume("log", console.log)
        .runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.name).toBe("TypeError");
        expect(e.message).toBe("Invalid start or stop value");
        const errorProto = Object.getPrototypeOf(e);
        expect(errorProto).not.toBe(Error.prototype);
        expect(errorProto).toBeInstanceOf(Error);
        expect(errorProto.name).toBe("TypeError");
        expect(errorProto.constructor.name).toBe("TypeError");
      }
    }
    expect(thrown).toBe(true);

    const range4 = (start: number, stop: number) =>
      range(start, stop).catchAndThrow("range", (message) => `Invalid range: ${message}`);

    thrown = false;
    try {
      range4(4, 1)
        .catch("type", () => {})
        .resume("log", console.log)
        .runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.name).toBe("RangeError");
        expect(e.message).toBe("Invalid range: Start must be less than stop");
        const errorProto = Object.getPrototypeOf(e);
        expect(errorProto).not.toBe(Error.prototype);
        expect(errorProto).toBeInstanceOf(Error);
        expect(errorProto.name).toBe("RangeError");
        expect(errorProto.constructor.name).toBe("RangeError");
      }
    }
    expect(thrown).toBe(true);

    const range5 = (start: number, stop: number) => range(start, stop).catchAllAndThrow();

    thrown = false;
    try {
      range5(4, 1).resume("log", console.log).runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.name).toBe("RangeError");
        expect(e.message).toBe("Start must be less than stop");
        const errorProto = Object.getPrototypeOf(e);
        expect(errorProto).not.toBe(Error.prototype);
        expect(errorProto).toBeInstanceOf(Error);
        expect(errorProto.name).toBe("RangeError");
        expect(errorProto.constructor.name).toBe("RangeError");
      }
    }
    expect(thrown).toBe(true);

    const range6 = (start: number, stop: number) =>
      range(start, stop).catchAllAndThrow("An error occurred while generating the range");

    thrown = false;
    try {
      range6(1.5, 2).resume("log", console.log).runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.name).toBe("TypeError");
        expect(e.message).toBe("An error occurred while generating the range");
        const errorProto = Object.getPrototypeOf(e);
        expect(errorProto).not.toBe(Error.prototype);
        expect(errorProto).toBeInstanceOf(Error);
        expect(errorProto.name).toBe("TypeError");
        expect(errorProto.constructor.name).toBe("TypeError");
      }
    }
    expect(thrown).toBe(true);

    const range7 = (start: number, stop: number) =>
      range(start, stop).catchAllAndThrow((error, message) => `Error(${error}): ${message}`);

    thrown = false;
    try {
      range7(1.5, 2).resume("log", console.log).runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.name).toBe("TypeError");
        expect(e.message).toBe("Error(type): Start and stop must be integers");
        const errorProto = Object.getPrototypeOf(e);
        expect(errorProto).not.toBe(Error.prototype);
        expect(errorProto).toBeInstanceOf(Error);
        expect(errorProto.name).toBe("TypeError");
        expect(errorProto.constructor.name).toBe("TypeError");
      }
    }
    expect(thrown).toBe(true);
  }
});

test("Abstracting handlers", () => {
  {
    type State<T> = Effect<"state.get", [], T> | Effect<"state.set", [value: T], void>;
    const state = {
      get: <T>(): Effected<State<T>, T> => effect("state.get")<[], T>(),
      set: <T>(value: T): Effected<State<T>, void> => effect("state.set")<[value: T], void>(value),
    };

    const sumDown = (sum = 0): Effected<State<number>, number> =>
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
      defineHandlerFor<State<T>>().with((self) =>
        self.resume("state.get", get).resume("state.set", set),
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

    const raiseOption = defineHandlerFor<Raise>().with((self) =>
      self.andThen((value) => some(value)).terminate("raise", () => none),
    );

    const safeDivide2 = (a: number, b: number) => safeDivide(a, b).with(raiseOption);

    expect(safeDivide2(1, 0).runSync()).toEqual(none);
    expect(safeDivide2(1, 2).runSync()).toEqual(some(0.5));
  }
});

test("Parallel execution with `Effected.all`", async () => {
  // Test sequential vs parallel behavior
  {
    const log = effect("log")<[message: string], void>;
    const httpGet = effect("httpGet")<[url: string], any>;

    const fetchUserData = (userId: number) =>
      effected(function* () {
        yield* log(`Fetching user ${userId}`);
        const data = yield* httpGet(`/api/users/${userId}`);
        return data;
      });

    const sequentialFetch = Effected.allSeq([fetchUserData(1), fetchUserData(2), fetchUserData(3)]);

    const parallelFetch = Effected.all([fetchUserData(1), fetchUserData(2), fetchUserData(3)]);

    const logMessages: string[] = [];
    const fetchTimes: Record<string, { start: number; end: number }> = {};
    let currentTime = 0;

    // Test sequential execution
    const seqResult = await sequentialFetch
      .resume("log", (message) => {
        logMessages.push(message);
      })
      .handle("httpGet", ({ resume }, url) => {
        const userId = url.split("/").pop();
        const key = `seq-${userId}`;
        fetchTimes[key] = { start: currentTime, end: 0 };

        // Simulate sequential execution with 100ms delay each
        setTimeout(() => {
          currentTime += 100;
          fetchTimes[key]!.end = currentTime;
          resume({ id: Number(userId), name: `User ${userId}` });
        }, 100);
      })
      .runAsync();

    expect(seqResult).toEqual([
      { id: 1, name: "User 1" },
      { id: 2, name: "User 2" },
      { id: 3, name: "User 3" },
    ]);
    expect(logMessages).toEqual(["Fetching user 1", "Fetching user 2", "Fetching user 3"]);

    // Clear state
    logMessages.length = 0;
    currentTime = 0;

    // Test parallel execution
    const parallelResult = await parallelFetch
      .resume("log", (message) => {
        logMessages.push(message);
      })
      .handle("httpGet", ({ resume }, url) => {
        const userId = url.split("/").pop();
        const key = `par-${userId}`;
        fetchTimes[key] = { start: currentTime, end: 0 };

        // All should start at the same time, but take different times to complete
        const delay = Number(userId) * 50;
        setTimeout(() => {
          fetchTimes[key]!.end = currentTime + delay;
          resume({ id: Number(userId), name: `User ${userId}` });
        }, delay);
      })
      .runAsync();

    expect(parallelResult).toEqual([
      { id: 1, name: "User 1" },
      { id: 2, name: "User 2" },
      { id: 3, name: "User 3" },
    ]);
    expect(logMessages).toEqual(["Fetching user 1", "Fetching user 2", "Fetching user 3"]);
  }

  // Test object syntax example
  {
    const fetchUser = (userId: number) => Effected.of({ id: userId, name: `User ${userId}` });
    const fetchUserPosts = (userId: number) =>
      Effected.of([{ id: 1, title: `Post for ${userId}` }]);
    const fetchUserSettings = (_userId: number) =>
      Effected.of({ theme: "dark", notifications: true });

    const userData = await Effected.all({
      user: fetchUser(1),
      posts: fetchUserPosts(1),
      settings: fetchUserSettings(1),
    }).runAsync();

    expect(userData).toEqual({
      user: { id: 1, name: "User 1" },
      posts: [{ id: 1, title: "Post for 1" }],
      settings: { theme: "dark", notifications: true },
    });
  }

  // Test mixed sync and async effects
  {
    const compute = effect("compute")<[label: string, delay: number], number>;
    const calculate = effect("calculate")<[a: number, b: number], number>;

    const computeResults: string[] = [];

    const mixedProgram = effected(function* () {
      const results = yield* Effected.all([
        // Sync task
        calculate(10, 5),
        // Fast async task
        compute("fast task", 50),
        // Slow async task
        compute("slow task", 150),
      ]);
      return results;
    })
      .resume("calculate", (a, b) => a + b)
      .handle("compute", ({ resume }, label, delay) => {
        computeResults.push(`Starting ${label}`);
        setTimeout(() => {
          computeResults.push(`Completed ${label}`);
          resume(delay);
        }, delay);
      });

    const mixedResults = await mixedProgram.runAsync();
    expect(mixedResults).toEqual([15, 50, 150]);
    expect(computeResults).toEqual([
      "Starting fast task",
      "Starting slow task",
      "Completed fast task",
      "Completed slow task",
    ]);
  }
});

test("Effects without generators (Pipeline syntax)", async () => {
  {
    const fib1 = (n: number): Effected<never, number> =>
      effected(function* () {
        if (n <= 1) return n;
        return (yield* fib1(n - 1)) + (yield* fib1(n - 2));
      });

    const fib2 = (n: number): Effected<never, number> => {
      if (n <= 1) return Effected.of(n);
      return fib2(n - 1).andThen((a) => fib2(n - 2).andThen((b) => a + b));
    };

    const fib3 = (n: number): Effected<never, number> => {
      if (n <= 1) return Effected.from(() => n);
      return fib3(n - 1).andThen((a) => fib3(n - 2).andThen((b) => a + b));
    };

    const fib4 = (n: number): Effected<never, number> => {
      if (n <= 1) return Effected.of(n);
      return fib4(n - 1).flatMap((a) => fib4(n - 2).map((b) => a + b));
    };

    expect(fib1(10).runSync()).toBe(55);
    expect(fib2(10).runSync()).toBe(55);
    expect(fib3(10).runSync()).toBe(55);
  }

  {
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

    const alice: Omit<User, "id"> = { name: "Alice", role: "user" };

    const createUser = (user: Omit<User, "id">) =>
      requiresAdmin()
        .andThen(() =>
          executeSQL("INSERT INTO users (name) VALUES (?)", user.name).andThen(
            (id) => ({ id, ...user }) as User,
          ),
        )
        .tap((savedUser) => println("User created:", savedUser));

    const logs: unknown[][] = [];
    let sqlExecuted = false;

    // Test with admin user
    const result = createUser(alice)
      .resume("executeSQL", (sql, ...params) => {
        expect(sql).toBe("INSERT INTO users (name) VALUES (?)");
        expect(params[0]).toBe("Alice");
        sqlExecuted = true;
        return 42;
      })
      .resume("println", (...args) => {
        logs.push(args);
      })
      .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
      .catch("authentication", () => {
        throw new Error("Should not hit this path");
      })
      .catch("unauthorized", () => {
        throw new Error("Should not hit this path");
      })
      .runSync();

    expect(sqlExecuted).toBe(true);
    expect(logs).toEqual([["User created:", { id: 42, name: "Alice", role: "user" }]]);
    expect(result).toEqual({ id: 42, name: "Alice", role: "user" });
  }

  // Test Effected.of and Effected.from examples
  {
    const println = effect("println")<[message: string], void>;

    const printlnLogs: unknown[][] = [];

    const program1 = Effected.of("Hello, world!")
      .tap((message) => println(message))
      .andThen((message) => message.toUpperCase());

    const resultProgram1 = program1
      .resume("println", (...args) => {
        printlnLogs.push(args);
      })
      .runSync();

    expect(printlnLogs).toEqual([["Hello, world!"]]);
    expect(resultProgram1).toBe("HELLO, WORLD!");

    // Test .as and .asVoid methods
    expect(Effected.of(42).as("Hello, world!").runSync()).toBe("Hello, world!");
    expect(Effected.of(42).asVoid().runSync()).toBe(undefined);
  }

  // Test combining effects with zip
  {
    type User = { id: number; name: string; role: "admin" | "user" };
    const askCurrentUser = dependency("currentUser")<User | null>;

    const getUserName = askCurrentUser().map((user) => user?.name || "Guest");
    const askTheme = dependency("theme")<"light" | "dark">;

    const welcomeMessage1 = getUserName
      .zip(askTheme())
      .map(([username, theme]) => `Welcome ${username}! Using ${theme} theme.`);

    expect(
      welcomeMessage1
        .provide("currentUser", { id: 1, name: "Alice", role: "admin" })
        .provide("theme", "dark")
        .runSync(),
    ).toBe("Welcome Alice! Using dark theme.");

    const welcomeMessage2 = getUserName.zip(
      askTheme(),
      (username, theme) => `Welcome ${username}! Using ${theme} theme.`,
    );
    expect(
      welcomeMessage2
        .provide("currentUser", { id: 1, name: "Alice", role: "admin" })
        .provide("theme", "dark")
        .runSync(),
    ).toBe("Welcome Alice! Using dark theme.");
  }

  // Test `.pipe(...fs)`
  {
    type Sleep = Default<Effect<"sleep", [ms: number], void>>;
    const sleep: EffectFactory<Sleep> = effect("sleep", {
      defaultHandler: ({ resume }, ms) => {
        setTimeout(resume, ms);
      },
    });

    const delay =
      (ms: number) =>
      <E extends Effect, R>(self: Effected<E, R>): Effected<E | Sleep, R> =>
        sleep(ms).andThen(() => self);

    const withLog =
      (message: string) =>
      <E extends Effect, R>(self: Effected<E, R>): Effected<E, R> =>
        self.tap((value) => {
          console.log(`${message}: ${String(value)}`);
        });

    expect(await Effected.of(42).pipe(delay(100)).runAsync()).toBe(42);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await Effected.of(42).pipe(delay(100), withLog("Result")).runAsync()).toBe(42);
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0]![0]).toBe("Result: 42");
    logSpy.mockRestore();
  }
});

test("Pipeline Syntax VS Generator Syntax", async () => {
  const fetchUser = effect("fetchUser")<[userId: number], { id: number; name: string } | null>;
  const fetchPosts = effect("fetchPosts")<[userId: number], { id: number; title: string }[]>;
  const readFile = effect("readFile")<[path: string], string>;
  const parseContent = effect("parseContent")<[content: string], any>;
  const logger = {
    error: effect("logger.error")<unknown[], void>,
  };

  // Test generator syntax vs pipeline syntax for getUserPosts
  {
    // Generator syntax
    const getUserPostsGen = (userId: number) =>
      effected(function* () {
        const user = yield* fetchUser(userId);
        if (!user) return null;
        return yield* fetchPosts(user.id);
      });

    // Pipeline syntax
    const getUserPostsPipe = (userId: number) =>
      fetchUser(userId).andThen((user) => {
        if (!user) return null;
        return fetchPosts(user.id);
      });

    // Test getUserPosts - user exists
    const userPostsGen = getUserPostsGen(1)
      .resume("fetchUser", (userId) => {
        expect(userId).toBe(1);
        return { id: 1, name: "Test User" };
      })
      .resume("fetchPosts", (userId) => {
        expect(userId).toBe(1);
        return [{ id: 101, title: "Test Post" }];
      })
      .runSync();

    expect(userPostsGen).toEqual([{ id: 101, title: "Test Post" }]);

    const userPostsPipe = getUserPostsPipe(1)
      .resume("fetchUser", (userId) => {
        expect(userId).toBe(1);
        return { id: 1, name: "Test User" };
      })
      .resume("fetchPosts", (userId) => {
        expect(userId).toBe(1);
        return [{ id: 101, title: "Test Post" }];
      })
      .runSync();

    expect(userPostsPipe).toEqual([{ id: 101, title: "Test Post" }]);

    // Test getUserPosts - user doesn't exist
    const nullUserPostsGen = getUserPostsGen(999)
      .resume("fetchUser", () => null)
      .resume("fetchPosts", () => {
        throw new Error("Should not be called");
      })
      .runSync();

    expect(nullUserPostsGen).toBeNull();

    const nullUserPostsPipe = getUserPostsPipe(999)
      .resume("fetchUser", () => null)
      .resume("fetchPosts", () => {
        throw new Error("Should not be called");
      })
      .runSync();

    expect(nullUserPostsPipe).toBeNull();
  }

  // Test error handling example
  {
    // Generator syntax
    const processFileGen = (path: string) =>
      effected(function* () {
        const content = yield* readFile(path);
        return yield* parseContent(content);
      }).catchAll(function* (error: string, message) {
        yield* logger.error(`[${error}Error] Error processing ${path}:`, message);
        return null;
      });

    // Pipeline syntax
    const processFilePipe = (path: string) =>
      readFile(path)
        .andThen((content) => parseContent(content))
        .catchAll((error: string, message) =>
          logger.error(`[${error}Error] Error processing ${path}:`, message).as(null),
        );

    // Test successful case
    const errorLogs: string[][] = [];

    const processResult = await processFileGen("config.json")
      .resume("readFile", (path) => {
        expect(path).toBe("config.json");
        return '{"key": "value"}';
      })
      .resume("parseContent", (content) => {
        expect(content).toBe('{"key": "value"}');
        return { key: "value" };
      })
      .resume("logger.error", (...args) => {
        errorLogs.push(args.map(String));
      })
      .runAsync();

    expect(processResult).toEqual({ key: "value" });
    expect(errorLogs).toEqual([]);

    // Test error case
    errorLogs.length = 0;
    const errorEffect = error("parse");

    const errorResult = await processFilePipe("bad.json")
      .resume("readFile", () => "invalid-json")
      .resume("parseContent", () => errorEffect("Invalid JSON format"))
      .resume("logger.error", (...args) => {
        errorLogs.push(args.map(String));
      })
      .catch("parse", () => {
        errorLogs.push(["[parseError] Error processing bad.json: Invalid JSON format"]);
        return null;
      })
      .runAsync();

    expect(errorResult).toBeNull();
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0]![0]).toBe("[parseError] Error processing bad.json: Invalid JSON format");
  }

  {
    type Order = { id: string; items: { id: string; quantity: number }[] };

    // Define required effects
    const askConfig = dependency("config")<{ apiUrl: string }>;
    const askCurrentUser = dependency("currentUser")<{ id: number; email: string }>;
    const validateOrder = effect("validateOrder")<[order: Order, user: { id: number }], void>;
    const saveOrder = effect("saveOrder")<[order: Order, apiUrl: string], { orderId: string }>;
    const sendNotification = effect("sendNotification")<[email: string, message: string], void>;

    // Test order
    const testOrder: Order = {
      id: "order-123",
      items: [{ id: "item-1", quantity: 2 }],
    };

    // Implementation with generator syntax
    const submitOrderGen = (order: Order) =>
      effected(function* () {
        const [config, user] = yield* Effected.all([askConfig(), askCurrentUser()]);
        yield* validateOrder(order, user);
        const result = yield* saveOrder(order, config.apiUrl);
        yield* sendNotification(user.email, "Order submitted");
        return result;
      });

    // Implementation with pipeline syntax
    const submitOrderPipe = (order: Order) =>
      Effected.all([askConfig(), askCurrentUser()]).andThen(([config, user]) =>
        validateOrder(order, user).andThen(() =>
          saveOrder(order, config.apiUrl).tap(() =>
            sendNotification(user.email, "Order submitted").asVoid(),
          ),
        ),
      );

    // Test configuration and user
    const testConfig = { apiUrl: "https://api.example.com/orders" };
    const testUser = { id: 42, email: "user@example.com" };
    const orderResult = { orderId: "ORD-123456" };

    // Track effect execution for verification
    const executionLog: string[] = [];

    // Test generator implementation
    const genResult = await submitOrderGen(testOrder)
      .provide("config", testConfig)
      .provide("currentUser", testUser)
      .resume("validateOrder", (order, user) => {
        executionLog.push(`validateOrder: ${order.id}, userId: ${user.id}`);
      })
      .resume("saveOrder", (order, apiUrl) => {
        executionLog.push(`saveOrder: ${order.id}, apiUrl: ${apiUrl}`);
        return orderResult;
      })
      .resume("sendNotification", (email, message) => {
        executionLog.push(`sendNotification: ${email}, message: ${message}`);
      })
      .runAsync();

    // Verify generator implementation results
    expect(genResult).toEqual(orderResult);
    expect(executionLog).toEqual([
      "validateOrder: order-123, userId: 42",
      "saveOrder: order-123, apiUrl: https://api.example.com/orders",
      "sendNotification: user@example.com, message: Order submitted",
    ]);

    // Clear logs and test pipeline implementation
    executionLog.length = 0;

    const pipeResult = await submitOrderPipe(testOrder)
      .provide("config", testConfig)
      .provide("currentUser", testUser)
      .resume("validateOrder", (order, user) => {
        executionLog.push(`validateOrder: ${order.id}, userId: ${user.id}`);
      })
      .resume("saveOrder", (order, apiUrl) => {
        executionLog.push(`saveOrder: ${order.id}, apiUrl: ${apiUrl}`);
        return orderResult;
      })
      .resume("sendNotification", (email, message) => {
        executionLog.push(`sendNotification: ${email}, message: ${message}`);
      })
      .runAsync();

    // Verify pipeline implementation results
    expect(pipeResult).toEqual(orderResult);
    expect(executionLog).toEqual([
      "validateOrder: order-123, userId: 42",
      "saveOrder: order-123, apiUrl: https://api.example.com/orders",
      "sendNotification: user@example.com, message: Order submitted",
    ]);

    // Verify both implementations produce the same results
    expect(pipeResult).toEqual(genResult);
  }
});

test("Example: Build a configurable logging system with effects", async () => {
  const logs: [string, ...unknown[]][] = [];
  const mockConsole = {
    debug: (...args: unknown[]) => void logs.push(["debug", ...args]),
    info: (...args: unknown[]) => void logs.push(["info", ...args]),
    warn: (...args: unknown[]) => void logs.push(["warn", ...args]),
    error: (...args: unknown[]) => void logs.push(["error", ...args]),
  };

  interface Logger {
    debug: (...args: unknown[]) => void | Promise<void>;
    info: (...args: unknown[]) => void | Promise<void>;
    warn: (...args: unknown[]) => void | Promise<void>;
    error: (...args: unknown[]) => void | Promise<void>;
  }
  type LoggerDependency = Default<Effect.Dependency<"logger", Logger>>;
  const askLogger = dependency<Logger>()("logger", () => mockConsole);

  type Logging =
    | Default<Effect<"logging.debug", unknown[], void>, never, LoggerDependency>
    | Default<Effect<"logging.info", unknown[], void>, never, LoggerDependency>
    | Default<Effect<"logging.warn", unknown[], void>, never, LoggerDependency>
    | Default<Effect<"logging.error", unknown[], void>, never, LoggerDependency>;

  const logLevels = ["debug", "info", "warn", "error"] as const;
  type LogLevel = (typeof logLevels)[number];

  const logEffect = (level: LogLevel): EffectFactory<Logging> =>
    effect(`logging.${level}`, {
      *defaultHandler({ resume }, ...args) {
        const logger = yield* askLogger();
        const result = logger[level](...args);
        if (result instanceof Promise) void result.then(resume);
        else resume();
      },
    });

  const logDebug = logEffect("debug");
  const logInfo = logEffect("info");
  const logWarn = logEffect("warn");
  const logError = logEffect("error");

  function withPrefix(prefixFactory: (level: LogLevel) => string) {
    return defineHandlerFor<Logging>().with((self) =>
      self.handle(
        (name): name is Logging["name"] => typeof name === "string" && name.startsWith("logging."),
        function* ({ effect, resume }): Generator<Logging, void> {
          const prefix = prefixFactory(effect.name.slice("logging.".length) as LogLevel);
          effect.payloads.splice(0, 0, prefix);
          yield effect;
          resume();
        },
      ),
    );
  }

  function withMinimumLogLevel(level: LogLevel | "none") {
    return defineHandlerFor<Logging>().with((self) => {
      const disabledLevels = new Set(
        level === "none" ? logLevels : logLevels.slice(0, logLevels.indexOf(level)),
      );
      return self.handle(
        (name): name is Logging["name"] =>
          typeof name === "string" &&
          name.startsWith("logging.") &&
          disabledLevels.has(name.slice("logging.".length) as LogLevel),
        function* ({ effect, resume }): Generator<Logging, void> {
          effect.defaultHandler = ({ resume }) => resume();
          yield effect;
          resume();
        },
      );
    });
  }

  const program1 = effected(function* () {
    yield* logDebug("Debug message");
    yield* logInfo("Info message");
    yield* logWarn("Warning!");
    yield* logError("Error occurred!");
  });
  await program1.runAsync();
  expect(logs).toEqual([
    ["debug", "Debug message"],
    ["info", "Info message"],
    ["warn", "Warning!"],
    ["error", "Error occurred!"],
  ]);
  logs.length = 0;

  const program2 = effected(function* () {
    yield* logDebug("Debug message");
    yield* logInfo("Info message");
    yield* logWarn("Warning!");
    yield* logError("Error occurred!");
  }).pipe(withMinimumLogLevel("warn"));
  await program2.runAsync();
  expect(logs).toEqual([
    ["warn", "Warning!"],
    ["error", "Error occurred!"],
  ]);
  logs.length = 0;

  const date = new Date();
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const HH = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padEnd(3, "0");
  const dateString = `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}.${ms}`;

  function logPrefix(level: LogLevel) {
    const datePart = `[${dateString}]`;
    const levelPart = `[${level}]`;
    return `${datePart} ${levelPart}`;
  }

  const program3 = effected(function* () {
    yield* logDebug("Debug message");
    yield* logInfo("Info message");
    yield* logWarn("Warning!");
    yield* logError("Error occurred!");
  }).pipe(withMinimumLogLevel("warn"), withPrefix(logPrefix));
  await program3.runAsync();
  expect(logs).toEqual([
    ["warn", `[${dateString}] [warn]`, "Warning!"],
    ["error", `[${dateString}] [error]`, "Error occurred!"],
  ]);
  logs.length = 0;

  const fileLogs: unknown[][] = [];
  function fileLogger(path: string) {
    return new Proxy({} as Logger, {
      get(_, prop) {
        // eslint-disable-next-line @typescript-eslint/require-await
        return async (...args: unknown[]) => {
          fileLogs.push([path, prop, ...args]);
        };
      },
    });
  }

  const program4 = effected(function* () {
    yield* logDebug("Debug message");
    yield* logInfo("Info message");
    yield* logWarn("Warning!");
    yield* logError("Error occurred!");
  })
    .pipe(withMinimumLogLevel("warn"), withPrefix(logPrefix))
    .provide("logger", fileLogger("log.txt"));
  await program4.runAsync();
  expect(fileLogs).toEqual([
    ["log.txt", "warn", `[${dateString}] [warn]`, "Warning!"],
    ["log.txt", "error", `[${dateString}] [error]`, "Error occurred!"],
  ]);
  fileLogs.length = 0;

  function dualLogger(logger1: Logger, logger2: Logger) {
    return new Proxy({} as Logger, {
      get(_, prop, receiver) {
        return (...args: unknown[]) => {
          const result1 = Reflect.get(logger1, prop, receiver)(...args);
          const result2 = Reflect.get(logger2, prop, receiver)(...args);
          if (result1 instanceof Promise && result2 instanceof Promise)
            return Promise.all([result1, result2]);
          else if (result1 instanceof Promise) return result1;
          else if (result2 instanceof Promise) return result2;
        };
      },
    });
  }

  const program5 = effected(function* () {
    yield* logDebug("Debug message");
    yield* logInfo("Info message");
    yield* logWarn("Warning!");
    yield* logError("Error occurred!");
  })
    .pipe(withMinimumLogLevel("warn"), withPrefix(logPrefix))
    .provide("logger", dualLogger(mockConsole, fileLogger("log.txt")));
  await program5.runAsync();
  expect(logs).toEqual([
    ["warn", `[${dateString}] [warn]`, "Warning!"],
    ["error", `[${dateString}] [error]`, "Error occurred!"],
  ]);
  expect(fileLogs).toEqual([
    ["log.txt", "warn", `[${dateString}] [warn]`, "Warning!"],
    ["log.txt", "error", `[${dateString}] [error]`, "Error occurred!"],
  ]);
  logs.length = 0;
  fileLogs.length = 0;
});
