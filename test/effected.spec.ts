import { describe, expect, it, vi } from "vitest";

import type { EffectFactory, InferEffect, Unresumable } from "../src";
import {
  Effect,
  Effected,
  UnhandledEffectError,
  defineHandlerFor,
  dependency,
  effect,
  effected,
  effectify,
  error,
  runAsync,
  runSync,
} from "../src";

const add42 = effect("add42")<[n: number], number>;
const now = dependency("now")<Date>;
const log = effect("log")<unknown[], void>;
const raise = effect("raise", { resumable: false })<[error: unknown], never>;

describe("effect", () => {
  it("should create a function that returns an `Effected` instance which yields a single `Effect`", () => {
    {
      const it = add42(42)[Symbol.iterator]();
      const result = it.next();
      expect(result).toEqual({ value: { name: "add42", payloads: [42] }, done: false });
      expect(result.value).toBeInstanceOf(Effect);
      expect(it.next(84)).toEqual({ value: 84, done: true });
      expect(it.next()).toEqual({ done: true });
    }

    {
      const it = now()[Symbol.iterator]();
      const result = it.next();
      expect(result).toEqual({ value: { name: "dependency:now", payloads: [] }, done: false });
      expect(result.value).toBeInstanceOf(Effect);
      const time = new Date();
      expect(it.next(time)).toEqual({ value: time, done: true });
      expect(it.next()).toEqual({ done: true });
    }

    {
      const it = log("hello", "world", 42)[Symbol.iterator]();
      const result = it.next();
      expect(result).toEqual({
        value: { name: "log", payloads: ["hello", "world", 42] },
        done: false,
      });
      expect(result.value).toBeInstanceOf(Effect);
      expect(it.next()).toEqual({ value: undefined, done: true });
      expect(it.next()).toEqual({ done: true });
    }
  });

  it("should create unresumable effects", () => {
    const it = raise("error")[Symbol.iterator]();
    const result = it.next();
    expect(result).toEqual({
      value: { name: "raise", payloads: ["error"], resumable: false },
      done: false,
    });
    expect(result.value).toBeInstanceOf(Effect);
  });
});

const typeError = error("type");

describe("error", () => {
  it("should create a function that returns an `Effected` instance which yields a single `Effect.Error`", () => {
    const it = typeError("type error")[Symbol.iterator]();
    const result = it.next();
    expect(result).toEqual({
      value: { name: "error:type", payloads: ["type error"], resumable: false },
      done: false,
    });
    expect(result.value).toBeInstanceOf(Effect);
  });
});

const askNumber = dependency("number")<number>;

describe("dependency", () => {
  it("should create a function that returns an `Effected` instance which yields a single `Effect.Dependency`", () => {
    const it = askNumber()[Symbol.iterator]();
    const result = it.next();
    expect(result).toEqual({
      value: { name: "dependency:number", payloads: [] },
      done: false,
    });
    expect(result.value).toBeInstanceOf(Effect);
    expect(it.next(42)).toEqual({ value: 42, done: true });
    expect(it.next()).toEqual({ done: true });
  });
});

describe("effectify", () => {
  it("should transform a promise into an `Effected` instance", () => {
    const effected = effectify(Promise.resolve(42));
    expect(effected).toBeInstanceOf(Effected);
    const it = effected[Symbol.iterator]();
    const result = it.next();
    expect(result).toEqual({
      value: { _effectAsync: true, onComplete: expect.any(Function) },
      done: false,
    });
    expect(it.next(42)).toEqual({ value: 42, done: true });
    expect(it.next()).toEqual({ done: true });
  });
});

describe("effected", () => {
  const mockNow = new Date();

  {
    const program = effected(function* () {
      const n = yield* add42(42);
      const time = yield* now();
      yield* log("n:", n);
      return time;
    });
    const program2 = program.resume("add42", (n) => n + 42);
    const program3 = program2.provide("now", mockNow);
    const program4 = program3.resume("log", () => {});

    it("should throw `UnhandledEffectError` if not all effects are handled", async () => {
      {
        let error!: UnhandledEffectError;
        try {
          program.runSyncUnsafe();
        } catch (e) {
          error = e as UnhandledEffectError;
        }
        expect(error).toBeInstanceOf(UnhandledEffectError);
        expect(error.effect).toBeInstanceOf(Effect);
        expect(error.effect).toEqual({ name: "add42", payloads: [42] });
        expect(error.message).toEqual("Unhandled effect: add42(42)");
      }

      {
        let error!: UnhandledEffectError;
        try {
          program.runSyncUnsafe();
        } catch (e) {
          error = e as UnhandledEffectError;
        }
        expect(error).toBeInstanceOf(UnhandledEffectError);
        expect(error.effect).toBeInstanceOf(Effect);
        expect(error.effect).toEqual({ name: "add42", payloads: [42] });
        expect(error.message).toEqual("Unhandled effect: add42(42)");
      }

      {
        let error!: UnhandledEffectError;
        try {
          program2.runSyncUnsafe();
        } catch (e) {
          error = e as UnhandledEffectError;
        }
        expect(error).toBeInstanceOf(UnhandledEffectError);
        expect(error.effect).toBeInstanceOf(Effect);
        expect(error.effect).toEqual({ name: "dependency:now", payloads: [] });
        expect(error.message).toEqual("Unhandled effect: dependency:now()");
      }

      {
        let error!: UnhandledEffectError;
        try {
          program3.runSyncUnsafe();
        } catch (e) {
          error = e as UnhandledEffectError;
        }
        expect(error).toBeInstanceOf(UnhandledEffectError);
        expect(error.effect).toBeInstanceOf(Effect);
        expect(error.effect).toEqual({ name: "log", payloads: ["n:", 84] });
        expect(error.message).toEqual('Unhandled effect: log("n:", 84)');
      }

      {
        let error!: UnhandledEffectError;
        try {
          await program3.runAsyncUnsafe();
        } catch (e) {
          error = e as UnhandledEffectError;
        }
        expect(error).toBeInstanceOf(UnhandledEffectError);
        expect(error.effect).toBeInstanceOf(Effect);
        expect(error.effect).toEqual({ name: "log", payloads: ["n:", 84] });
        expect(error.message).toEqual('Unhandled effect: log("n:", 84)');
      }
    });

    it("should run a synchronous program", () => {
      {
        expect(program4.runSync).not.toThrow();
        const time = program4.runSync();
        expect(time).toEqual(mockNow);
      }

      {
        expect(program4.runSyncUnsafe).not.toThrow();
        const time = program4.runSyncUnsafe();
        expect(time).toEqual(mockNow);
      }

      {
        expect(() => runSync(program4)).not.toThrow();
        const time = runSync(program4);
        expect(time).toEqual(mockNow);
      }
    });
  }

  {
    const wait = effect("wait")<[ms: number], void>;
    const now = effect("now")<[], Date>;

    const program = effected(function* () {
      const time = yield* now();
      yield* wait(100);
      return time;
    })
      .resume("now", () => mockNow)
      .handle("wait", ({ resume }, ms) => {
        setTimeout(resume, ms);
      });

    const read = effect("read")<[], string>;

    const mockReader = (content: string, type: "resolve" | "reject") => () =>
      new Promise<string>((resolve, reject) =>
        setTimeout(() => (type === "resolve" ? resolve(content) : reject(new Error("error"))), 0),
      );

    const readIt = (reader: () => Promise<string>) =>
      effected(function* () {
        return yield* read();
      }).handle("read", ({ resume, terminate }) => {
        reader()
          .then((value) => {
            resume(value);
          })
          .catch((error: unknown) => {
            terminate(error as string);
          });
      });

    it("should run an asynchronous program", async () => {
      {
        expect(program.runAsync).not.toThrow();
        const time = await program.runAsync();
        expect(time).toEqual(mockNow);
      }

      {
        const program = readIt(mockReader("hello", "resolve"));
        expect(program.runAsyncUnsafe).not.toThrow();
        const content = await program.runAsyncUnsafe();
        expect(content).toBe("hello");
      }

      {
        const program = readIt(mockReader("hello", "reject"));
        expect(() => runAsync(program)).not.toThrow();
        const content = await runAsync(program);
        expect(content).toEqual(new Error("error"));
      }
    });
  }

  it("should handle effects with other effected programs", async () => {
    const askNumber = dependency("number")<number>;
    const random = effect("random")<[], number>;

    const program = effected(function* () {
      return 8 + (yield* askNumber());
    });

    expect(
      program
        .provideBy("number", function* () {
          return yield* random();
        })
        .resume("random", () => 42)
        .runSync(),
    ).toBe(50);

    expect(
      program
        .provideBy("number", function* () {
          return yield* random();
        })
        .terminate("random", () => 42)
        .runSync(),
    ).toBe(42);

    expect(
      await program
        .provideBy("number", function* () {
          return yield* random();
        })
        .terminate("random", function* () {
          return yield* effectify(
            new Promise<number>((resolve) => setTimeout(() => resolve(42), 0)),
          );
        })
        .runAsync(),
    ).toBe(42);
  });

  it("should transform the return value of the program", async () => {
    const myError = error("myError");
    const random = effect("random")<[], number>;

    type Option<T> = { type: "Some"; value: T } | { type: "None" };
    const some = <T>(value: T): Option<T> => ({ type: "Some", value });
    const none: Option<never> = { type: "None" };

    const raise42 = (n: number) =>
      effected(function* () {
        if (n === 42) yield* myError("42 is not allowed");
        return n;
      });

    expect(
      raise42(42)
        .andThen(some)
        .catch("myError", () => none)
        .runSync(),
    ).toEqual(none);
    expect(
      raise42(21)
        .andThen(some)
        .catch("myError", () => none)
        .runSync(),
    ).toEqual(some(21));

    expect(
      raise42(42)
        .andThen(function* () {
          return yield* random();
        })
        .catchAll((name, msg) => ({ name, msg }))
        .resume("random", () => 42)
        .runSync(),
    ).toEqual({ name: "myError", msg: "42 is not allowed" });
    expect(
      raise42(21)
        .andThen(function* () {
          return yield* random();
        })
        .catch("myError", () => none)
        .resume("random", () => 42)
        .runSync(),
    ).toEqual(42);

    expect(
      await raise42(42)
        .andThen(function* (n) {
          return yield* effectify(new Promise((resolve) => setTimeout(() => resolve(some(n)), 0)));
        })
        .catchAll(function* (name, msg) {
          return yield* effectify(
            new Promise((resolve) => setTimeout(() => resolve({ name, msg }), 0)),
          );
        })
        .runAsync(),
    ).toEqual({ name: "myError", msg: "42 is not allowed" });
    expect(
      await raise42(21)
        .andThen(function* (n) {
          return yield* effectify(new Promise((resolve) => setTimeout(() => resolve(some(n)), 0)));
        })
        .catch("myError", () => none)
        .runAsync(),
    ).toEqual(some(21));
  });

  it("should use other handlers with `.with()`", () => {
    type Raise = Unresumable<Effect<"raise", [error: unknown], never>>;
    const raise: EffectFactory<Raise> = effect("raise", { resumable: false });

    type Option<T> = { type: "Some"; value: T } | { type: "None" };
    const some = <T>(value: T): Option<T> => ({ type: "Some", value });
    const none: Option<never> = { type: "None" };

    const raiseOption = defineHandlerFor<Raise>().with((self) =>
      self.andThen(some).terminate("raise", () => none),
    );

    const raise42 = (n: number) =>
      effected(function* () {
        if (n === 42) yield* raise("42 is not allowed");
        return n;
      });

    expect(raise42(42).with(raiseOption).runSync()).toEqual(none);
    expect(raise42(21).with(raiseOption).runSync()).toEqual(some(21));
  });

  it("should throw error when attempting to resume unresumable effect", () => {
    const raise = effect("raise", { resumable: false })<[error: unknown], never>;

    const program = effected(function* () {
      yield* raise("error");
    });

    expect(
      program.handle(
        "raise",
        ({
          // @ts-expect-error
          resume,
        }) => {
          resume();
        },
      ).runSync,
    ).toThrowError('Cannot resume non-resumable effect: raise("error")');
    expect(
      program.resume(
        // @ts-expect-error
        "raise",
        () => {},
      ).runSync,
    ).toThrowError('Cannot resume non-resumable effect: raise("error")');
  });

  it("should log a warning if using `new Effected` instead of `effected`", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // eslint-disable-next-line sonarjs/constructor-for-side-effects
    new (Effected as any)(function* () {});
    expect(warnSpy).toHaveBeenCalledWith(
      "You should not call the constructor of `Effected` directly. Use `effected` instead.",
    );
    warnSpy.mockRestore();
  });

  it("should log a warning if `resume` or `terminate` is called multiple times", () => {
    const raise = effect("raise");
    const raiseName = Symbol("raise");
    const raise2 = effect(raiseName);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    effected(function* () {
      yield* raise();
    })
      .handle("raise", ({ resume }) => {
        resume("foo");
        resume("bar");
      })
      .runSync();
    expect(warnSpy).toHaveBeenCalledWith(
      'Effect "raise" has been handled multiple times (received `resume raise() with "bar"` after it has been resumed with "foo"). Only the first handler will be used.',
    );
    warnSpy.mockClear();

    effected(function* () {
      yield* raise();
    })
      .handle<"raise", string>("raise", ({ resume, terminate }) => {
        resume("foo");
        terminate("bar");
      })
      .runSync();
    expect(warnSpy).toHaveBeenCalledWith(
      'Effect "raise" has been handled multiple times (received `terminate raise() with "bar"` after it has been resumed with "foo"). Only the first handler will be used.',
    );
    warnSpy.mockClear();

    effected(function* () {
      yield* raise();
    })
      .handle<"raise", string>("raise", ({ terminate }) => {
        (terminate as unknown as (value: void) => void)();
        terminate("bar");
      })
      .runSync();
    expect(warnSpy).toHaveBeenCalledWith(
      'Effect "raise" has been handled multiple times (received `terminate raise() with "bar"` after it has been terminated). Only the first handler will be used.',
    );
    warnSpy.mockClear();

    effected(function* () {
      yield* raise();
    })
      .handle<"raise", string>("raise", ({ resume, terminate }) => {
        terminate("foo");
        resume("bar");
      })
      .runSync();
    expect(warnSpy).toHaveBeenCalledWith(
      'Effect "raise" has been handled multiple times (received `resume raise() with "bar"` after it has been terminated with "foo"). Only the first handler will be used.',
    );
    warnSpy.mockClear();

    effected(function* () {
      yield* raise2();
    })
      .handle(raiseName, ({ resume }) => {
        resume("foo");
        resume("bar");
      })
      .runSync();
    expect(warnSpy).toHaveBeenCalledWith(
      'Effect Symbol(raise) has been handled multiple times (received `resume Symbol(raise)() with "bar"` after it has been resumed with "foo"). Only the first handler will be used.',
    );
    warnSpy.mockClear();

    effected(function* () {
      yield* raise();
    })
      .handle(
        function isRaise(name: string): name is "raise" {
          return name === "raise";
        },
        ({ resume }) => {
          resume("foo");
          resume("bar");
        },
      )
      .runSync();
    expect(warnSpy).toHaveBeenCalledWith(
      'Effect [isRaise] has been handled multiple times (received `resume raise() with "bar"` after it has been resumed with "foo"). Only the first handler will be used.',
    );
    warnSpy.mockClear();
  });

  it("should throw error if trying to run asynchronous program synchronously", () => {
    const program = effected(function* () {
      yield* effectify(new Promise((resolve) => setTimeout(resolve, 0)));
    });

    expect(program.runSync).toThrowError(
      "Cannot run an asynchronous effected program with `runSync`, use `runAsync` instead",
    );
  });

  it("should throw error if yielding non-effect value", async () => {
    expect(
      effected(
        // @ts-expect-error
        function* () {
          yield null;
        },
      ).runSync,
    ).toThrowError(
      "Invalid effected program: an effected program should yield only effects (received null)",
    );
    await expect(
      effected(
        // @ts-expect-error
        function* () {
          yield null;
        },
      ).runAsync,
    ).rejects.toThrowError(
      "Invalid effected program: an effected program should yield only effects (received null)",
    );

    expect(
      effected(
        // @ts-expect-error
        function* () {
          yield { foo: "bar" };
        },
      ).runSync,
    ).toThrowError(
      'Invalid effected program: an effected program should yield only effects (received { foo: "bar" })',
    );
    await expect(
      effected(
        // @ts-expect-error
        function* () {
          yield { foo: "bar" };
        },
      ).runAsync,
    ).rejects.toThrowError(
      'Invalid effected program: an effected program should yield only effects (received { foo: "bar" })',
    );
  });

  it("should catch errors thrown when running an asynchronous program", async () => {
    const emit = effect("emit")<[msg: string], void>;
    const emit2 = effect("emit2")<[msg: string], void>;

    await expect(
      effected(function* () {
        throw new Error("error");
        yield* effectify(new Promise((resolve) => setTimeout(resolve, 0)));
      }).runAsync,
    ).rejects.toThrowError("error");

    await expect(
      effected(function* () {
        yield* emit("hello");
      }).resume("emit", () => {
        throw new Error("error");
      }).runAsync,
    ).rejects.toThrowError("error");

    await expect(
      effected(function* () {
        yield* emit("hello");
        yield* emit2("world");
      })
        .resume("emit", () => {})
        .resume("emit2", () => {
          throw new Error("error");
        }).runAsync,
    ).rejects.toThrowError("error");

    await expect(
      effected(function* () {
        yield* effectify(
          new Promise((_, reject) => setTimeout(() => reject(new Error("error")), 0)),
        );
      }).runAsync,
    ).rejects.toThrowError("error");
  });
});

describe("Default handlers", () => {
  it("should apply default handlers when no explicit handler is provided", () => {
    const logs: string[] = [];

    const println = effect<"println", [message: string], void>("println", {
      defaultHandler: ({ resume }, message) => {
        logs.push(message);
        resume();
      },
    });

    const program = effected(function* () {
      yield* println("Hello, world!");
      yield* println("Another message");
      return "Done";
    });

    // Should run without errors using default handler
    expect(program.runSync()).toBe("Done");
    expect(logs).toEqual(["Hello, world!", "Another message"]);
  });

  it("should allow explicit handlers to override default handlers", () => {
    const logs: string[] = [];

    const println = effect<"println", [message: string], void>("println", {
      defaultHandler: ({ resume }, message) => {
        logs.push(`Default: ${message}`);
        resume();
      },
    });

    const program = effected(function* () {
      yield* println("First message");
      yield* println("Second message");
      return "Done";
    });

    // Override with explicit handler
    const result = program
      .resume("println", (message) => {
        logs.push(`Custom: ${message}`);
      })
      .runSync();

    expect(result).toBe("Done");
    expect(logs).toEqual(["Custom: First message", "Custom: Second message"]);

    // Run with default handler again
    logs.length = 0;
    expect(program.runSync()).toBe("Done");
    expect(logs).toEqual(["Default: First message", "Default: Second message"]);
  });

  it("should support default handlers that are generator functions", () => {
    const logs: string[] = [];
    const innerLog = effect("innerLog")<[message: string], void>;

    const println = effect<[message: string], void>()("println", {
      *defaultHandler({ resume }, message) {
        yield* innerLog(`Processing: ${message}`);
        logs.push(`Println: ${message}`);
        resume();
      },
    });

    const program = effected(function* () {
      yield* println("Hello, world!");
      return "Done";
    });

    const result = program
      .resume("innerLog", (message) => {
        logs.push(`Inner: ${message}`);
      })
      .runSync();

    expect(result).toBe("Done");
    expect(logs).toEqual(["Inner: Processing: Hello, world!", "Println: Hello, world!"]);
  });

  it("should support default handlers that return effected programs", () => {
    const logs: string[] = [];
    const innerLog = effect("innerLog")<[message: string], void>;

    const println = effect<[message: string], void>()("println", {
      defaultHandler: ({ resume }, message) => {
        return effected(function* () {
          yield* innerLog(`Processing: ${message}`);
          logs.push(`Println: ${message}`);
          resume();
        });
      },
    });

    const program = effected(function* () {
      yield* println("Hello, world!");
      return "Done";
    });

    const result = program
      .resume("innerLog", (message) => {
        logs.push(`Inner: ${message}`);
      })
      .runSync();

    expect(result).toBe("Done");
    expect(logs).toEqual(["Inner: Processing: Hello, world!", "Println: Hello, world!"]);
  });

  it("should support default handlers for dependencies", () => {
    type Config = { apiUrl: string; timeout: number };
    const defaultConfig: Config = { apiUrl: "https://default-api.example.com", timeout: 5000 };

    const getConfig = dependency<"config", Config>("config", () => defaultConfig);

    const program = effected(function* () {
      const config = yield* getConfig();
      return config;
    });

    // Using default handler
    expect(program.runSync()).toEqual(defaultConfig);

    // Using explicit provider
    const customConfig: Config = { apiUrl: "https://custom-api.example.com", timeout: 3000 };
    expect(program.provide("config", customConfig).runSync()).toEqual(customConfig);
  });

  it("should support default handlers that use terminate (though not recommended)", () => {
    const safeDivide = effect<[a: number, b: number], number, string>()("safeDivide", {
      defaultHandler: ({ resume, terminate }, a, b) => {
        if (b === 0) {
          terminate("Cannot divide by zero");
          return;
        }
        resume(a / b);
      },
    });

    const goodProgram = effected(function* () {
      const result = yield* safeDivide(10, 2);
      return `Result: ${result}`;
    });

    const badProgram = effected(function* () {
      const result = yield* safeDivide(10, 0);
      return `Result: ${result}`;
    });

    expect(goodProgram.runSync()).toBe("Result: 5");
    expect(badProgram.runSync()).toBe("Cannot divide by zero");
  });

  it("should handle async operations in default handlers", async () => {
    const fetchData = effect<[url: string], any>()("fetchData", {
      defaultHandler: ({ resume }, url) => {
        setTimeout(() => {
          resume({ url, data: "Sample data" });
        }, 10);
      },
    });

    const program = effected(function* () {
      const data = yield* fetchData("https://api.example.com/data");
      return data;
    });

    const result = await program.runAsync();
    expect(result).toEqual({ url: "https://api.example.com/data", data: "Sample data" });
  });

  it("should properly handle chained effects with default handlers", () => {
    const logs: string[] = [];

    const log = effect<[message: string], void>()("log", {
      defaultHandler: ({ resume }, message) => {
        logs.push(message);
        resume();
      },
    });

    const greet = effect<[name: string], string>()("greet", {
      defaultHandler: ({ resume }, name) => {
        resume(`Hello, ${name}!`);
      },
    });

    const program = effected(function* () {
      yield* log("Starting program");
      const greeting = yield* greet("World");
      yield* log(greeting);
      return greeting;
    });

    expect(program.runSync()).toBe("Hello, World!");
    expect(logs).toEqual(["Starting program", "Hello, World!"]);
  });

  it("should properly propagate effects from default handlers", () => {
    const innerLog = effect("innerLog")<[message: string], void>;
    const logs: string[] = [];

    // Effect with a default handler that yields another effect
    const logTwice = effect<[message: string], void>()("logTwice", {
      *defaultHandler({ resume }, message) {
        yield* innerLog(`First: ${message}`);
        yield* innerLog(`Second: ${message}`);
        resume();
      },
    });

    const program = effected(function* () {
      yield* logTwice("Hello");
      return "Done";
    });

    // We need to handle the inner effect
    const result = program
      .resume("innerLog", (message) => {
        logs.push(message);
      })
      .runSync();

    expect(result).toBe("Done");
    expect(logs).toEqual(["First: Hello", "Second: Hello"]);
  });

  it("should throw UnhandledEffectError when effects from default handlers are not handled", () => {
    const innerLog = effect("innerLog")<[message: string], void>;

    // Effect with a default handler that yields another effect
    const logWithEffect = effect<[message: string], void>()("logWithEffect", {
      *defaultHandler({ resume }, message) {
        yield* innerLog(message); // This effect is not handled
        resume();
      },
    });

    const program = effected(function* () {
      yield* logWithEffect("Test message");
      return "Done";
    });

    // Should throw because innerLog is not handled
    expect(() => program.runSyncUnsafe()).toThrow(UnhandledEffectError);
    expect(() => program.runSyncUnsafe()).toThrow(/innerLog/);
  });
});

describe("Effected.all", () => {
  const delay = effect("delay")<[ms: number, label: string], string>;

  it("should run effects in parallel rather than sequentially", async () => {
    const executeOrder: string[] = [];
    const startTime = Date.now();

    // Create three effects with different delays
    const effect1 = effected(function* () {
      const result = yield* delay(100, "effect1");
      return result;
    });

    const effect2 = effected(function* () {
      const result = yield* delay(50, "effect2");
      return result;
    });

    const effect3 = effected(function* () {
      const result = yield* delay(75, "effect3");
      return result;
    });

    // Run them in parallel
    const parallelResult = await Effected.all([effect1, effect2, effect3])
      .handle("delay", ({ resume }, ms, label) => {
        executeOrder.push(`${label} start`);
        setTimeout(() => {
          executeOrder.push(`${label} end`);
          resume(label);
        }, ms);
      })
      .runAsync();

    const parallelTime = Date.now() - startTime;

    // Clear execution order and restart timer
    executeOrder.length = 0;
    const seqStartTime = Date.now();

    // Run the same effects in sequence
    const sequentialResult = await Effected.allSeq([effect1, effect2, effect3])
      .handle("delay", ({ resume }, ms, label) => {
        executeOrder.push(`${label} start`);
        setTimeout(() => {
          executeOrder.push(`${label} end`);
          resume(label);
        }, ms);
      })
      .runAsync();

    const sequentialTime = Date.now() - seqStartTime;

    // Check results are the same
    expect(parallelResult).toEqual(sequentialResult);

    // Verify parallel behavior
    // 1. Time check: parallel should be closer to max time than sum time
    const sumTime = 100 + 50 + 75; // 225ms

    // Parallel time should be closer to maxTime (with some tolerance)
    expect(parallelTime).toBeLessThan(sumTime * 0.7); // Less than 70% of sequential time

    // Sequential time should be close to sumTime
    expect(sequentialTime).toBeGreaterThanOrEqual(sumTime * 0.9); // At least 90% of expected sum

    // 2. Execution order check for sequential
    // In sequential execution, each effect should complete before the next starts
    expect(executeOrder).toEqual([
      "effect1 start",
      "effect1 end",
      "effect2 start",
      "effect2 end",
      "effect3 start",
      "effect3 end",
    ]);
  });

  it("should run effects in parallel for default handlers", async () => {
    const delay = effect<"delay", [ms: number, label: string], string>("delay", {
      defaultHandler: ({ resume }, ms, label) => {
        executeOrder.push(`${label} start`);
        setTimeout(() => {
          executeOrder.push(`${label} end`);
          resume(label);
        }, ms);
      },
    });

    const executeOrder: string[] = [];
    const startTime = Date.now();

    // Create three effects with different delays
    const effect1 = effected(function* () {
      const result = yield* delay(100, "effect1");
      return result;
    });

    const effect2 = effected(function* () {
      const result = yield* delay(50, "effect2");
      return result;
    });

    const effect3 = effected(function* () {
      const result = yield* delay(75, "effect3");
      return result;
    });

    // Run them in parallel
    const parallelResult = await Effected.all([effect1, effect2, effect3]).runAsync();

    const parallelTime = Date.now() - startTime;

    // Clear execution order and restart timer
    executeOrder.length = 0;
    const seqStartTime = Date.now();

    // Run the same effects in sequence
    const sequentialResult = await Effected.allSeq([effect1, effect2, effect3])
      .handle("delay", ({ resume }, ms, label) => {
        executeOrder.push(`${label} start`);
        setTimeout(() => {
          executeOrder.push(`${label} end`);
          resume(label);
        }, ms);
      })
      .runAsync();

    const sequentialTime = Date.now() - seqStartTime;

    // Check results are the same
    expect(parallelResult).toEqual(sequentialResult);

    // Verify parallel behavior
    // 1. Time check: parallel should be closer to max time than sum time
    const sumTime = 100 + 50 + 75; // 225ms

    // Parallel time should be closer to maxTime (with some tolerance)
    expect(parallelTime).toBeLessThan(sumTime * 0.7); // Less than 70% of sequential time

    // Sequential time should be close to sumTime
    expect(sequentialTime).toBeGreaterThanOrEqual(sumTime * 0.9); // At least 90% of expected sum

    // 2. Execution order check for sequential
    // In sequential execution, each effect should complete before the next starts
    expect(executeOrder).toEqual([
      "effect1 start",
      "effect1 end",
      "effect2 start",
      "effect2 end",
      "effect3 start",
      "effect3 end",
    ]);
  });

  it("should handle concurrent async effects with dependencies", async () => {
    vi.useFakeTimers();
    const timeline: string[] = [];

    const processData = effect("processData")<[id: string, delay: number], string>;
    const log = effect("log")<[message: string], void>;

    // Create an effected program that processes multiple items
    const processItem = (id: string, delayTime: number) =>
      effected(function* () {
        yield* log(`Starting ${id}`);
        const result = yield* processData(id, delayTime);
        yield* log(`Finished ${id}`);
        return result;
      });

    // Set up the test case
    const program = Effected.all({
      item1: processItem("item1", 100),
      item2: processItem("item2", 50),
      item3: processItem("item3", 150),
    })
      .handle("processData", ({ resume }, id, delay) => {
        timeline.push(`${id} processing started at ${Date.now()}`);
        setTimeout(() => {
          timeline.push(`${id} processing completed at ${Date.now()}`);
          resume(`Processed ${id}`);
        }, delay);
      })
      .resume("log", (message) => {
        timeline.push(`Log: ${message} at ${Date.now()}`);
      });

    // Create a promise that will resolve when the program completes
    const resultPromise = program.runAsync();

    // Fast-forward time and await the result
    vi.advanceTimersByTime(10); // Start all processes
    expect(timeline.length).toBeGreaterThan(3); // Should have started all items

    vi.advanceTimersByTime(50); // item2 should complete
    expect(timeline.some((entry) => entry.includes("item2 processing completed"))).toBe(true);
    expect(timeline.some((entry) => entry.includes("item1 processing completed"))).toBe(false);

    vi.advanceTimersByTime(50); // item1 should complete
    expect(timeline.some((entry) => entry.includes("item1 processing completed"))).toBe(true);

    vi.advanceTimersByTime(50); // item3 should complete and program should finish

    const result = await resultPromise;
    expect(result).toEqual({
      item1: "Processed item1",
      item2: "Processed item2",
      item3: "Processed item3",
    });

    // Verify that the items were indeed processed in parallel
    // by checking timeline order - we should see items started
    // before earlier ones completed
    const item2Started = timeline.findIndex((e) => e.includes("item2 processing started"));
    const item3Started = timeline.findIndex((e) => e.includes("item3 processing started"));
    const item1Completed = timeline.findIndex((e) => e.includes("item1 processing completed"));

    // Item2 and item3 should have started before item1 completed
    expect(item2Started).toBeLessThan(item1Completed);
    expect(item3Started).toBeLessThan(item1Completed);

    vi.useRealTimers();
  });

  it("should correctly handle purely synchronous effects", () => {
    const add = effect("add")<[a: number, b: number], number>;
    const multiply = effect("multiply")<[a: number, b: number], number>;
    const operations: string[] = [];

    // Create three programs with only synchronous effects
    const calc1 = effected(function* () {
      operations.push("calc1 start");
      const result = yield* add(10, 5);
      operations.push("calc1 end");
      return result;
    });

    const calc2 = effected(function* () {
      operations.push("calc2 start");
      const result = yield* multiply(6, 7);
      operations.push("calc2 end");
      return result;
    });

    const calc3 = effected(function* () {
      operations.push("calc3 start");
      const sum = yield* add(8, 8);
      const product = yield* multiply(sum, 2);
      operations.push("calc3 end");
      return product;
    });

    // Execute in parallel
    const result = Effected.all([calc1, calc2, calc3])
      .resume("add", (a, b) => a + b)
      .resume("multiply", (a, b) => a * b)
      .runSync();

    expect(result).toEqual([15, 42, 32]);

    // Even with synchronous effects, we should see some operations interleaving
    expect(operations.length).toBe(6);

    // Clear operations and compare with sequential execution
    operations.length = 0;
    const seqResult = Effected.allSeq([calc1, calc2, calc3])
      .resume("add", (a, b) => a + b)
      .resume("multiply", (a, b) => a * b)
      .runSync();

    expect(seqResult).toEqual(result);
    // Sequential execution should show a clear ordering pattern
    expect(operations).toEqual([
      "calc1 start",
      "calc1 end",
      "calc2 start",
      "calc2 end",
      "calc3 start",
      "calc3 end",
    ]);
  });

  it("should handle mixed synchronous and asynchronous effects", async () => {
    const add = effect("add")<[a: number, b: number], number>;
    const asyncMultiply = effect("asyncMultiply")<[a: number, b: number], number>;
    const operations: string[] = [];
    const startTime = Date.now();

    // Synchronous effect
    const syncCalc = effected(function* () {
      operations.push(`syncCalc started at ${Date.now() - startTime}ms`);
      const result = yield* add(10, 15);
      operations.push(`syncCalc completed at ${Date.now() - startTime}ms`);
      return result;
    });

    // Fast async effect
    const fastAsync = effected(function* () {
      operations.push(`fastAsync started at ${Date.now() - startTime}ms`);
      const result = yield* asyncMultiply(5, 5);
      operations.push(`fastAsync completed at ${Date.now() - startTime}ms`);
      return result;
    });

    // Slow async effect
    const slowAsync = effected(function* () {
      operations.push(`slowAsync started at ${Date.now() - startTime}ms`);
      const result = yield* asyncMultiply(7, 7);
      operations.push(`slowAsync completed at ${Date.now() - startTime}ms`);
      return result;
    });

    // Mixed effect (both sync and async)
    const mixedCalc = effected(function* () {
      operations.push(`mixedCalc started at ${Date.now() - startTime}ms`);
      const syncResult = yield* add(3, 4);
      const asyncResult = yield* asyncMultiply(syncResult, 2);
      operations.push(`mixedCalc completed at ${Date.now() - startTime}ms`);
      return asyncResult;
    });

    // Run all effects in parallel
    const result = await Effected.all([syncCalc, fastAsync, slowAsync, mixedCalc])
      .resume("add", (a, b) => a + b)
      .handle("asyncMultiply", ({ resume }, a, b) => {
        const delay = a === 7 ? 100 : 30; // slowAsync gets longer delay
        setTimeout(() => {
          resume(a * b);
        }, delay);
      })
      .runAsync();

    expect(result).toEqual([25, 25, 49, 14]);

    // Verify true parallel execution:
    // 1. Synchronous effects should complete almost immediately
    // 2. Fast async effects should complete quickly
    // 3. Slow async effects should complete last
    // 4. Mixed effects should wait for their async portions

    // Check timing through timestamps
    const startEvents = operations.filter((op) => op.includes("started"));
    const completeEvents = operations.filter((op) => op.includes("completed"));

    // All effects should start at nearly the same time
    expect(startEvents.length).toBe(4);

    // syncCalc should complete quickly
    const syncCompleteTime = parseInt(
      /completed at (\d+)ms/.exec(completeEvents.find((e) => e.includes("syncCalc"))!)![1]!,
    );

    // slowAsync should complete last
    const slowCompleteTime = parseInt(
      /completed at (\d+)ms/.exec(completeEvents.find((e) => e.includes("slowAsync"))!)![1]!,
    );

    // The slow async effect should complete much later than sync effects
    expect(slowCompleteTime).toBeGreaterThan(syncCompleteTime + 50);
  });

  it("should correctly propagate unhandled effects", async () => {
    const handled = effect("handled")<[value: number], number>;
    const unhandled = effect("unhandled")<[value: string], string>;

    // Program with only handled effects
    const program1 = effected(function* () {
      return yield* handled(10);
    });

    // Program with unhandled effects
    const program2 = effected(function* () {
      return yield* unhandled("test");
    });

    // Program with both handled and unhandled effects
    const program3 = effected(function* () {
      const num = yield* handled(5);
      // The unhandled effect here should cause the test to fail
      return yield* unhandled(num.toString());
    });

    // Test single unhandled effect
    const test1 = Effected.all([program1, program2]).resume("handled", (value) => value * 2);

    await expect(test1.runAsyncUnsafe()).rejects.toThrow(UnhandledEffectError);
    await expect(test1.runAsyncUnsafe()).rejects.toThrow(/unhandled/);

    // Test nested unhandled effect
    const test2 = Effected.all([program1, program3]).resume("handled", (value) => value * 2);

    await expect(test2.runAsyncUnsafe()).rejects.toThrow(UnhandledEffectError);
    await expect(test2.runAsyncUnsafe()).rejects.toThrow(/unhandled/);

    // Ensure that one unhandled effect causes the whole execution to fail
    let handledExecuted = false;
    const test3 = Effected.all([program1, program2]).resume("handled", (value) => {
      handledExecuted = true;
      return value * 2;
    });

    await expect(test3.runAsyncUnsafe()).rejects.toThrow(UnhandledEffectError);
    // program1 should still have executed
    expect(handledExecuted).toBe(true);
  });

  it("should handle nested Effected.all calls with parallel execution", async () => {
    const compute = effect("compute")<[id: string, delay: number], number>;
    const timeline: string[] = [];
    const startTime = Date.now();

    // Create some basic effects with different delays
    const slow = (id: string, delay: number) =>
      effected(function* () {
        const result = yield* compute(id, delay);
        return result;
      });

    // Create nested structure:
    // outer = [
    //   effect1,
    //   [nested1, nested2, nested3], <- inner Effected.all
    //   effect2
    // ]
    const effect1 = slow("effect1", 70);
    const effect2 = slow("effect2", 50);

    const nested1 = slow("nested1", 40);
    const nested2 = slow("nested2", 60);
    const nested3 = slow("nested3", 30);

    // Use Effected.all for the inner group
    const innerGroup = Effected.all([nested1, nested2, nested3]);

    // Use Effected.all for the outer group
    const outerProgram = Effected.all([effect1, innerGroup, effect2]);

    // Run with handlers
    const result = await outerProgram
      .handle("compute", ({ resume }, id, delay) => {
        timeline.push(`${id} started at ${Date.now() - startTime}ms`);
        setTimeout(() => {
          timeline.push(`${id} completed at ${Date.now() - startTime}ms`);
          resume(delay);
        }, delay);
      })
      .runAsync();

    const totalTime = Date.now() - startTime;

    // Verify results structure: [effect1Result, [nested1Result, nested2Result, nested3Result], effect2Result]
    expect(result[0]).toBe(70); // effect1 result
    expect(Array.isArray(result[1])).toBe(true); // nested results should be an array
    expect(result[1]).toEqual([40, 60, 30]); // nested results
    expect(result[2]).toBe(50); // effect2 result

    // Verify true parallel execution by time analysis
    // Max time should be close to the longest task (effect1 = 70ms)
    expect(totalTime).toBeLessThan(100); // Allow some overhead

    // Check that all tasks started around the same time
    const startTimes = timeline
      .filter((entry) => entry.includes("started"))
      .map((entry) => parseInt(/at (\d+)ms/.exec(entry)![1]!));

    // All tasks should start within a small window
    const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes);
    expect(maxStartDiff).toBeLessThan(20); // Should be quite close together

    // Verify that inner nested calls complete in parallel with outer calls
    const completionOrder = timeline
      .filter((entry) => entry.includes("completed"))
      .map((entry) => entry.split(" ")[0]); // Extract just the ID

    // nested3 (30ms) should complete before effect2 (50ms)
    const nested3CompletedIndex = completionOrder.indexOf("nested3");
    const effect2CompletedIndex = completionOrder.indexOf("effect2");
    expect(nested3CompletedIndex).toBeLessThan(effect2CompletedIndex);

    // nested1 (40ms) should complete before effect1 (70ms)
    const nested1CompletedIndex = completionOrder.indexOf("nested1");
    const effect1CompletedIndex = completionOrder.indexOf("effect1");
    expect(nested1CompletedIndex).toBeLessThan(effect1CompletedIndex);

    // For comparison, run the same structure with allSeq
    timeline.length = 0;
    const seqStartTime = Date.now();

    const innerGroupSeq = Effected.allSeq([nested1, nested2, nested3]);
    const outerProgramSeq = Effected.allSeq([effect1, innerGroupSeq, effect2]);

    const seqResult = await outerProgramSeq
      .handle("compute", ({ resume }, id, delay) => {
        timeline.push(`${id} started at ${Date.now() - seqStartTime}ms`);
        setTimeout(() => {
          timeline.push(`${id} completed at ${Date.now() - seqStartTime}ms`);
          resume(delay);
        }, delay);
      })
      .runAsync();

    const seqTotalTime = Date.now() - seqStartTime;

    // Sequential time should be approximately the sum of all delays
    // effect1 + nested1 + nested2 + nested3 + effect2 = 70 + 40 + 60 + 30 + 50 = 250ms
    expect(seqTotalTime).toBeGreaterThanOrEqual(230); // Allow some wiggle room

    // Results should match regardless of execution strategy
    expect(seqResult).toEqual(result);
  });

  it("should handle empty input correctly", () => {
    expect(Effected.all([]).runSync()).toEqual([]);
    expect(Effected.all({}).runSync()).toEqual({});
  });
});

describe("Effected.allSeq", () => {
  const log = effect("log")<[message: string], void>;
  const someError = error("some");
  const fetch = effect("fetch")<[url: string], string>;

  it("should handle arrays of effected values", () => {
    const program = Effected.allSeq([Effected.of(1), Effected.of(2), Effected.of(3)]);
    expect(program.runSync()).toEqual([1, 2, 3]);
  });

  it("should handle arrays with effects", () => {
    const logs: string[] = [];

    const program = Effected.allSeq([
      effected(function* () {
        yield* log("first");
        return 1;
      }),
      effected(function* () {
        yield* log("second");
        return 2;
      }),
      Effected.of(3),
    ]);

    const result = program
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toEqual([1, 2, 3]);
    expect(logs).toEqual(["first", "second"]);
  });

  it("should handle non-array iterables", () => {
    const set = new Set<Effected<never, number>>();
    set.add(Effected.of(1));
    set.add(Effected.of(2));
    set.add(Effected.of(3));

    const program1 = Effected.allSeq(set);
    expect(program1.runSync()).toEqual([1, 2, 3]);

    // Custom iterable
    const customIterable = {
      *[Symbol.iterator]() {
        yield Effected.of(42);
        yield Effected.of("foo");
        yield Effected.of("bar");
      },
    };

    const program2 = Effected.allSeq(customIterable);
    expect(program2.runSync()).toEqual([42, "foo", "bar"]);
  });

  it("should handle plain objects (records)", () => {
    const program = Effected.allSeq({
      a: Effected.of(1),
      b: Effected.of(2),
      c: Effected.of(3),
    });

    expect(program.runSync()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("should handle objects with effects", () => {
    const logs: string[] = [];

    const program = Effected.allSeq({
      a: effected(function* () {
        yield* log("processing a");
        return 1;
      }),
      b: effected(function* () {
        yield* log("processing b");
        return 2;
      }),
      c: Effected.of("foobar"),
    });

    const result = program
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toEqual({ a: 1, b: 2, c: "foobar" });
    expect(logs).toEqual(["processing a", "processing b"]);
  });

  it("should propagate errors from array items", () => {
    const program = Effected.allSeq([
      Effected.of(1),
      effected(function* () {
        yield* someError("Something went wrong");
        return 2;
      }),
      Effected.of(3),
    ]);

    let error: string | undefined;
    const result = program
      .catch("some", (msg) => {
        error = msg;
        return [-1, -1, -1];
      })
      .runSync();

    expect(error).toBe("Something went wrong");
    expect(result).toEqual([-1, -1, -1]);
  });

  it("should propagate errors from object values", () => {
    const program = Effected.allSeq({
      a: Effected.of(1),
      b: effected(function* () {
        yield* someError("Failed in b");
        return 2;
      }),
      c: Effected.of(3),
    });

    let error: string | undefined;
    const result = program
      .catch("some", (msg) => {
        error = msg;
        return { failed: true };
      })
      .runSync();

    expect(error).toBe("Failed in b");
    expect(result).toEqual({ failed: true });
  });

  it("should handle complex nested scenarios", async () => {
    const fetchData = (url: string) =>
      effected(function* () {
        const data = yield* fetch(url);
        yield* log(`Fetched ${data} from ${url}`);
        return data;
      });

    const logs: string[] = [];
    const urls = ["api/users", "api/posts", "api/comments"] as const;

    // Combination of array and object
    const program = Effected.allSeq({
      users: fetchData(urls[0]),
      posts: fetchData(urls[1]),
      metadata: Effected.allSeq([Effected.of("v1.0"), fetchData(urls[2])]),
    });

    const result = await program
      .resume("fetch", (url) => `data from ${url}`)
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runAsync();

    expect(result).toEqual({
      users: "data from api/users",
      posts: "data from api/posts",
      metadata: ["v1.0", "data from api/comments"],
    });

    expect(logs).toEqual([
      "Fetched data from api/users from api/users",
      "Fetched data from api/posts from api/posts",
      "Fetched data from api/comments from api/comments",
    ]);
  });

  it("should process array items in order", () => {
    const order: number[] = [];

    const program = Effected.allSeq([
      effected(function* () {
        yield* log("first");
        order.push(1);
        return "a";
      }),
      effected(function* () {
        yield* log("second");
        order.push(2);
        return "b";
      }),
      effected(function* () {
        yield* log("third");
        order.push(3);
        return "c";
      }),
    ]);

    const logs: string[] = [];
    program
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(order).toEqual([1, 2, 3]);
    expect(logs).toEqual(["first", "second", "third"]);
  });

  it("should process object values in key order", () => {
    const order: string[] = [];

    const program = Effected.allSeq({
      b: effected(function* () {
        order.push("b");
        return 2;
      }),
      a: effected(function* () {
        order.push("a");
        return 1;
      }),
      c: effected(function* () {
        order.push("c");
        return 3;
      }),
    });

    program.runSync();

    // Object keys should be processed in the order they're enumerated by Object.keys
    // which is usually insertion order for modern JS engines
    expect(order).toEqual(["b", "a", "c"]);
  });

  it("should handle empty input correctly", () => {
    expect(Effected.allSeq([]).runSync()).toEqual([]);
    expect(Effected.allSeq({}).runSync()).toEqual({});
  });
});

describe("Effected#as", () => {
  it("should replace the return value with a constant value", () => {
    const program = Effected.of(42).as("replaced");
    expect(program.runSync()).toBe("replaced");
  });

  it("should work regardless of the original return value", () => {
    const program1 = Effected.of(42).as("same");
    const program2 = Effected.of("different").as("same");
    const program3 = Effected.of(null).as("same");

    expect(program1.runSync()).toBe("same");
    expect(program2.runSync()).toBe("same");
    expect(program3.runSync()).toBe("same");
  });

  it("should preserve effects from the original program", () => {
    const log = effect("log")<[message: string], void>;
    const logs: string[] = [];

    const program = effected(function* () {
      yield* log("effect before as");
      return 42;
    }).as("replaced value");

    const result = program
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toBe("replaced value");
    expect(logs).toEqual(["effect before as"]);
  });

  it("should work with other transformations in a chain", () => {
    const program = Effected.of(10)
      .map((x) => x + 5)
      .as("fixed value")
      .map((s) => s.toUpperCase());

    expect(program.runSync()).toBe("FIXED VALUE");

    const log = effect("log")<[message: string], void>;
    const logs: string[] = [];

    const complexProgram = effected(function* () {
      yield* log("start");
      return 100;
    })
      .map((x) => x * 2)
      .as({ status: "success" })
      .tap(function* (result) {
        yield* log(`got result: ${JSON.stringify(result)}`);
      });

    const result = complexProgram
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toEqual({ status: "success" });
    expect(logs).toEqual(["start", 'got result: {"status":"success"}']);
  });
});

describe("Effected#asVoid", () => {
  it("should replace the return value with undefined", () => {
    const program = Effected.of(42).asVoid();
    expect(program.runSync()).toBe(undefined);

    // It should work with any original value type
    expect(Effected.of("string").asVoid().runSync()).toBe(undefined);
    expect(Effected.of(null).asVoid().runSync()).toBe(undefined);
    expect(Effected.of({ complex: "object" }).asVoid().runSync()).toBe(undefined);
  });

  it("should preserve effects while replacing result with undefined", () => {
    const log = effect("log")<[message: string], void>;
    const logs: string[] = [];

    const program = effected(function* () {
      yield* log("processing");
      return { result: "data" };
    }).asVoid();

    const result = program
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toBe(undefined);
    expect(logs).toEqual(["processing"]);
  });

  it("should work with other transformations in a pipeline", () => {
    const logs: string[] = [];

    const program = Effected.of(42)
      .map((n) => n * 2)
      .tap((n) => {
        logs.push(`Value: ${n}`);
      })
      .asVoid()
      .tap(() => {
        logs.push("After asVoid");
      });

    const result = program.runSync();

    expect(result).toBe(undefined);
    expect(logs).toEqual(["Value: 84", "After asVoid"]);

    // Should be able to chain after asVoid with proper type inference
    const program2 = program.andThen(() => "new value");
    expect(program2.runSync()).toBe("new value");
  });
});

describe("Effected#map", () => {
  it("should transform the return value using a pure function", () => {
    const program = Effected.of(42).map((x) => x * 2);
    expect(program.runSync()).toBe(84);
  });

  it("should allow multiple executions with consistent results", () => {
    const program = Effected.of(21).map((x) => x * 2);
    expect(program.runSync()).toBe(42);
    expect(program.runSync()).toBe(42);
  });

  it("should allow chaining multiple map operations", () => {
    const program = Effected.of(5)
      .map((x) => x * 2)
      .map((x) => x + 10);
    expect(program.runSync()).toBe(20);
  });

  it("should maintain independence between executions with stateful transformations", () => {
    let counter = 0;
    const program = Effected.of(10).map((x) => {
      counter++;
      return x + counter;
    });

    expect(program.runSync()).toBe(11); // 10 + 1
    expect(counter).toBe(1);

    expect(program.runSync()).toBe(12); // 10 + 2
    expect(counter).toBe(2);
  });

  it("should pass through effects from the source program before applying transformation", () => {
    const log = effect("log")<[message: string], void>;
    const logs: string[] = [];

    const program = effected(function* () {
      yield* log("before");
      return 42;
    }).map((x) => x * 2);

    const result = program
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toBe(84);
    expect(logs).toEqual(["before"]);
  });

  it("should handle multiple yielded effects correctly", () => {
    const log = effect("log")<[message: string], void>;
    const logs: string[] = [];

    const program = effected(function* () {
      yield* log("first");
      yield* log("second");
      return 10;
    }).map((x) => x.toString());

    const result = program
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toBe("10");
    expect(logs).toEqual(["first", "second"]);
  });

  it("should only apply the transformation to the final result", () => {
    const getData = effect("getData")<[], number>;
    const log = effect("log")<[message: string], void>;
    const logs: string[] = [];

    const program = effected(function* () {
      const data = yield* getData();
      yield* log(`Got data: ${data}`);
      return data;
    }).map((x) => x * 2);

    const result = program
      .resume("getData", () => 21)
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toBe(42);
    expect(logs).toEqual(["Got data: 21"]);
  });
});

describe("Effected#flatMap", () => {
  it("should chain effectful computations", () => {
    const program = Effected.of(42).flatMap((x) => Effected.of(x * 2));
    expect(program.runSync()).toBe(84);
  });

  it("should allow multiple executions with consistent results", () => {
    const program = Effected.of(21).flatMap((x) => Effected.of(x * 2));
    expect(program.runSync()).toBe(42);
    expect(program.runSync()).toBe(42);
  });

  it("should work with generator functions", () => {
    const add = effect("add")<[a: number, b: number], number>;

    const program = Effected.of(10).flatMap(function* (x) {
      const result = yield* add(x, 5);
      return result;
    });

    expect(program.resume("add", (a, b) => a + b).runSync()).toBe(15);
  });

  it("should handle effects correctly when run multiple times", () => {
    const add = effect("add")<[a: number, b: number], number>;
    const logs: string[] = [];

    const program = Effected.of(10)
      .flatMap(function* (x) {
        const result = yield* add(x, 5);
        return result;
      })
      .resume("add", (a, b) => {
        logs.push(`Adding ${a} + ${b}`);
        return a + b;
      });

    expect(program.runSync()).toBe(15);
    expect(logs).toEqual(["Adding 10 + 5"]);

    // Second execution should be independent
    logs.length = 0;
    expect(program.runSync()).toBe(15);
    expect(logs).toEqual(["Adding 10 + 5"]);
  });

  it("should pass through effects from the source program before invoking mapper", () => {
    const log = effect("log")<[message: string], void>;
    const logs: string[] = [];

    const program = effected(function* () {
      yield* log("before flatMap");
      return 10;
    }).flatMap((value) =>
      effected(function* () {
        yield* log("in mapper");
        return value * 2;
      }),
    );

    const result = program
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toBe(20);
    expect(logs).toEqual(["before flatMap", "in mapper"]);
  });

  it("should handle complex patterns of yielded effects in both source and mapper", () => {
    const getA = effect("getA")<[], number>;
    const getB = effect("getB")<[], number>;
    const log = effect("log")<[message: string], void>;
    const logs: string[] = [];

    const program = effected(function* () {
      const a = yield* getA();
      yield* log(`a = ${a}`);
      return a;
    }).flatMap((a) =>
      effected(function* () {
        const b = yield* getB();
        yield* log(`b = ${b}`);
        return a + b;
      }),
    );

    const result = program
      .resume("getA", () => 10)
      .resume("getB", () => 20)
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .runSync();

    expect(result).toBe(30);
    expect(logs).toEqual(["a = 10", "b = 20"]);
  });

  it("should seamlessly transition between source and mapper programs", () => {
    const step = effect("step")<[stage: string], number>;
    const values: string[] = [];

    const program = effected(function* () {
      const a = yield* step("source-begin");
      const b = yield* step("source-end");
      return a + b;
    }).flatMap((sum) =>
      effected(function* () {
        const c = yield* step("mapper-begin");
        const d = yield* step("mapper-end");
        return sum + c + d;
      }),
    );

    const result = program
      .resume("step", (stage) => {
        values.push(stage);
        return values.length * 10;
      })
      .runSync();

    expect(result).toBe(100); // 10 + 20 + 30 + 40
    expect(values).toEqual(["source-begin", "source-end", "mapper-begin", "mapper-end"]);
  });
});

describe("Effected#andThen", () => {
  it("should transform values using a pure function", () => {
    const program = Effected.of(42).andThen((x) => x * 2);
    expect(program.runSync()).toBe(84);
  });

  it("should chain effectful computations", () => {
    const program = Effected.of(42).andThen((x) => Effected.of(x * 2));
    expect(program.runSync()).toBe(84);
  });

  it("should allow multiple executions with consistent results", () => {
    const program = Effected.of(21).andThen((x) => x * 2);
    expect(program.runSync()).toBe(42);
    expect(program.runSync()).toBe(42);

    const program2 = Effected.of(21).andThen((x) => Effected.of(x * 2));
    expect(program2.runSync()).toBe(42);
    expect(program2.runSync()).toBe(42);
  });

  it("should work with generator functions", () => {
    const add = effect("add")<[a: number, b: number], number>;

    const program = Effected.of(10).andThen(function* (x) {
      const result = yield* add(x, 5);
      return result;
    });

    expect(program.resume("add", (a, b) => a + b).runSync()).toBe(15);
  });

  it("should handle errors independently across executions", () => {
    const myError = error("myError");
    const errorCounts: { [key: string]: number } = {};

    const program = Effected.of(42)
      .andThen(function* (x) {
        if (x === 42) yield* myError("Error on 42");
        return x * 2;
      })
      .catch("myError", (msg) => {
        errorCounts[msg || "unknown"] = (errorCounts[msg || "unknown"] || 0) + 1;
        return -1;
      });

    expect(program.runSync()).toBe(-1);
    expect(errorCounts["Error on 42"]).toBe(1);

    expect(program.runSync()).toBe(-1);
    expect(errorCounts["Error on 42"]).toBe(2);
  });

  it("should handle yielded effects when chaining with a pure function", () => {
    const fetchNumber = effect("fetchNumber")<[], number>;

    const program = effected(function* () {
      const value = yield* fetchNumber();
      return value;
    }).andThen((x) => x * 2);

    expect(program.resume("fetchNumber", () => 21).runSync()).toBe(42);
  });

  it("should handle yielded effects when chaining with an effectful computation", () => {
    const fetchNumber = effect("fetchNumber")<[], number>;
    const processNumber = effect("processNumber")<[n: number], number>;

    const program = effected(function* () {
      const value = yield* fetchNumber();
      return value;
    }).andThen(function* (x) {
      const processed = yield* processNumber(x);
      return processed;
    });

    expect(
      program
        .resume("fetchNumber", () => 10)
        .resume("processNumber", (n) => n * 2)
        .runSync(),
    ).toBe(20);
  });

  it("should preserve handler context when chaining multiple operations with effects", () => {
    const read = effect("read")<[key: string], string>;
    const write = effect("write")<[key: string, value: string], void>;
    const logs: string[] = [];

    const program = effected(function* () {
      const value = yield* read("name");
      yield* write("greeting", `Hello, ${value}!`);
      return "done-1";
    }).andThen(function* (result) {
      logs.push(`First stage: ${result}`);
      const greeting = yield* read("greeting");
      return greeting;
    });

    const data: Record<string, string> = {};

    const result = program
      .resume("read", (key) => data[key] || "")
      .resume("write", (key, value) => {
        data[key] = value;
      })
      .runSync();

    expect(result).toBe("Hello, !");
    expect(logs).toEqual(["First stage: done-1"]);
    expect(data).toEqual({ greeting: "Hello, !" });

    // Run again with different data
    data.name = "World";
    logs.length = 0;

    const result2 = program
      .resume("read", (key) => data[key] || "")
      .resume("write", (key, value) => {
        data[key] = value;
      })
      .runSync();

    expect(result2).toBe("Hello, World!");
    expect(logs).toEqual(["First stage: done-1"]);
    expect(data).toEqual({ name: "World", greeting: "Hello, World!" });
  });
});

describe("Effected#tap", () => {
  it("should run a side effect and return the original value", () => {
    const logs: unknown[][] = [];
    expect(
      Effected.of(42)
        .tap((value) => {
          logs.push(["tap", value]);
          return (value + 1) as unknown as void;
        })
        .runSync(),
    ).toBe(42);
    expect(logs).toEqual([["tap", 42]]);
  });

  it("should run a side effect with other effects", () => {
    const logs: unknown[][] = [];
    expect(
      Effected.of(42)
        .tap(function* (value) {
          yield* log("tap", value);
          return (value + 1) as unknown as void;
        })
        .resume("log", (...args) => {
          Array.prototype.push.apply(logs, args);
        })
        .runSync(),
    ).toBe(42);
    expect(logs).toEqual(["tap", 42]);

    logs.length = 0;
    expect(
      Effected.of(42)
        .tap((value) =>
          effected(function* () {
            yield* log("tap", value);
            return (value + 1) as unknown as void;
          }),
        )
        .resume("log", (...args) => {
          Array.prototype.push.apply(logs, args);
        })
        .runSync(),
    ).toBe(42);
    expect(logs).toEqual(["tap", 42]);
  });
});

describe("Effected#zip", () => {
  const log = effect("log")<[message: string], void>;
  const fetchData = effect("fetchData")<[id: string], string>;
  const compute = effect("compute")<[value: number], number>;
  const customError = error("custom");

  it("should combine two effected programs sequentially and return a tuple", () => {
    const program1 = Effected.of(42);
    const program2 = Effected.of("hello");

    const combined = program1.zip(program2);
    expect(combined.runSync()).toEqual([42, "hello"]);
  });

  it("should run effects from both programs in sequence", () => {
    const logs: string[] = [];

    const program1 = effected(function* () {
      yield* log("program1");
      return 1;
    });

    const program2 = effected(function* () {
      yield* log("program2");
      return 2;
    });

    const combined = program1.zip(program2);
    const result = combined
      .resume("log", (message) => {
        logs.push(message);
      })
      .runSync();

    expect(result).toEqual([1, 2]);
    expect(logs).toEqual(["program1", "program2"]);
  });

  it("should apply a mapper function to transform the results", () => {
    const program1 = Effected.of(5);
    const program2 = Effected.of(10);

    const combined = program1.zip(program2, (a, b) => a + b);
    expect(combined.runSync()).toEqual(15);

    // More complex transformation
    const objCombined = program1.zip(program2, (a, b) => ({ sum: a + b, product: a * b }));
    expect(objCombined.runSync()).toEqual({ sum: 15, product: 50 });
  });

  it("should support mapper functions that return generators", () => {
    const program1 = Effected.of(5);
    const program2 = Effected.of(10);
    const logs: string[] = [];

    const combined = program1.zip(program2, function* (a, b) {
      yield* log(`Combining ${a} and ${b}`);
      return a * b;
    });

    const result = combined
      .resume("log", (message) => {
        logs.push(message);
      })
      .runSync();

    expect(result).toEqual(50);
    expect(logs).toEqual(["Combining 5 and 10"]);
  });

  it("should support mapper functions that return effected programs", () => {
    const program1 = Effected.of(5);
    const program2 = Effected.of(10);

    const combined = program1.zip(program2, (a, b) =>
      effected(function* () {
        const computed = yield* compute(a + b);
        return computed;
      }),
    );

    const result = combined.resume("compute", (value) => value * 2).runSync();
    expect(result).toEqual(30); // (5 + 10) * 2
  });

  it("should handle errors in the first program", () => {
    const errorProgram = effected(function* () {
      yield* customError("Error in first program");
      return 1;
    });

    const goodProgram = Effected.of(2);

    const combined = errorProgram.zip(goodProgram);

    let errorMessage: string | undefined;
    const result = combined
      .catch("custom", (message) => {
        errorMessage = message;
        return "error-result";
      })
      .runSync();

    expect(result).toBe("error-result");
    expect(errorMessage).toBe("Error in first program");
  });

  it("should handle errors in the second program", () => {
    const goodProgram = Effected.of(1);

    const errorProgram = effected(function* () {
      yield* customError("Error in second program");
      return 2;
    });

    const combined = goodProgram.zip(errorProgram);

    let errorMessage: string | undefined;
    const result = combined
      .catch("custom", (message) => {
        errorMessage = message;
        return "error-result";
      })
      .runSync();

    expect(result).toBe("error-result");
    expect(errorMessage).toBe("Error in second program");
  });

  it("should handle errors in the mapper function", () => {
    const program1 = Effected.of(1);
    const program2 = Effected.of(2);

    const combined = program1.zip(program2, function* (a, b) {
      yield* customError(`Error in mapper with ${a} and ${b}`);
      return a + b;
    });

    let errorMessage: string | undefined;
    const result = combined
      .catch("custom", (message) => {
        errorMessage = message;
        return "error-result";
      })
      .runSync();

    expect(result).toBe("error-result");
    expect(errorMessage).toBe("Error in mapper with 1 and 2");
  });

  it("should support async operations", async () => {
    const asyncProgram1 = effected(function* () {
      const data = yield* fetchData("user");
      return data;
    });

    const asyncProgram2 = effected(function* () {
      const data = yield* fetchData("settings");
      return data;
    });

    const combined = asyncProgram1.zip(asyncProgram2, (user, settings) => ({
      user,
      settings,
      combined: `${user}-${settings}`,
    }));

    const result = await combined
      .handle("fetchData", ({ resume }, id) => {
        setTimeout(() => {
          resume(`data-for-${id}`);
        }, 10);
      })
      .runAsync();

    expect(result).toEqual({
      user: "data-for-user",
      settings: "data-for-settings",
      combined: "data-for-user-data-for-settings",
    });
  });

  it("should chain multiple zip operations", () => {
    const program1 = Effected.of("Hello");
    const program2 = Effected.of("World");
    const program3 = Effected.of("!");

    const result = program1
      .zip(program2, (a, b) => `${a} ${b}`)
      .zip(program3, (greeting, punctuation) => `${greeting}${punctuation}`)
      .runSync();

    expect(result).toBe("Hello World!");
  });

  it("should maintain independence across multiple executions", () => {
    let count1 = 0;
    let count2 = 0;

    const program1 = Effected.from(() => {
      count1++;
      return `execution-${count1}`;
    });

    const program2 = Effected.from(() => {
      count2++;
      return count2;
    });

    const combined = program1.zip(program2);

    // First execution
    expect(combined.runSync()).toEqual(["execution-1", 1]);

    // Second execution
    expect(combined.runSync()).toEqual(["execution-2", 2]);

    // Third execution
    expect(combined.runSync()).toEqual(["execution-3", 3]);
  });

  it("should work with different types in the two programs", () => {
    // Testing with various types
    const types = [
      [42, "string"],
      [true, { complex: "object" }],
      [null, undefined],
      [[1, 2, 3], new Map([["key", "value"]])],
      [new Date(), /regex/],
    ];

    for (const [value1, value2] of types) {
      const program1 = Effected.of(value1);
      const program2 = Effected.of(value2);
      const combined = program1.zip(program2);

      expect(combined.runSync()).toEqual([value1, value2]);
    }
  });
});

describe("Effected transformation methods composition", () => {
  const add = effect("add")<[a: number, b: number], number>;
  const multiply = effect("multiply")<[a: number, b: number], number>;
  const log = effect("log")<[message: string], void>;

  it("should correctly compose map, flatMap, tap and andThen", () => {
    const logs: string[] = [];
    const sideEffectValues: number[] = [];

    const program = Effected.of(5)
      .map((x) => x + 10)
      .tap((x) => {
        sideEffectValues.push(x);
      })
      .flatMap(function* (x) {
        yield* log(`Value is now ${x}`);
        const sum = yield* add(x, 5);
        return sum;
      })
      .tap(function* (x) {
        yield* log(`After adding: ${x}`);
        sideEffectValues.push(x);
      })
      .andThen(function* (x) {
        const product = yield* multiply(x, 2);
        return product;
      });

    const handledProgram = program
      .resume("log", (msg) => {
        logs.push(msg);
      })
      .resume("add", (a, b) => a + b)
      .resume("multiply", (a, b) => a * b);

    expect(handledProgram.runSync()).toBe(40); // (5 + 10 + 5) * 2 = 40
    expect(logs).toEqual(["Value is now 15", "After adding: 20"]);
    expect(sideEffectValues).toEqual([15, 20]);

    // Run again to ensure consistent results
    logs.length = 0;
    sideEffectValues.length = 0;
    expect(handledProgram.runSync()).toBe(40);
    expect(logs).toEqual(["Value is now 15", "After adding: 20"]);
    expect(sideEffectValues).toEqual([15, 20]);
  });
});

describe("Effected#catchAndThrow", () => {
  const typeError = error("type");

  it("should catch error effects and throw them", () => {
    let thrown = false;
    try {
      effected(function* () {
        yield* typeError("foo");
      })
        .catchAndThrow("type")
        .runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.name).toBe("TypeError");
        expect(e.message).toBe("foo");
        const errorProto = Object.getPrototypeOf(e);
        expect(errorProto).not.toBe(Error.prototype);
        expect(errorProto).toBeInstanceOf(Error);
        expect(errorProto.name).toBe("TypeError");
        expect(errorProto.constructor.name).toBe("TypeError");
      }
    }
    expect(thrown).toBe(true);
  });

  it("should catch error effects and throw them with custom error message", () => {
    let thrown = false;
    try {
      effected(function* () {
        yield* typeError("foo");
      })
        .catchAndThrow("type", "custom message")
        .runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.name).toBe("TypeError");
        expect(e.message).toBe("custom message");
      }
    }
    expect(thrown).toBe(true);

    thrown = false;
    try {
      effected(function* () {
        yield* typeError("foo");
      })
        .catchAndThrow("type", (message) => `custom ${message}`)
        .runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        expect(e.name).toBe("TypeError");
        expect(e.message).toBe("custom foo");
      }
    }
    expect(thrown).toBe(true);
  });
});

describe("Effected#catchAllAndThrow", () => {
  const typeError = error("type");
  const rangeError = error("range");

  it("should catch all error effects and throw them", () => {
    let thrown = false;
    try {
      effected(function* () {
        yield* typeError("foo");
        yield* rangeError("bar");
      })
        .catchAllAndThrow()
        .runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        const errorName = e.name;
        expect(errorName).toEqual(expect.stringMatching(/TypeError|RangeError/));
        expect(e.message).toBe(errorName === "TypeError" ? "foo" : "bar");
        const errorProto = Object.getPrototypeOf(e);
        expect(errorProto).not.toBe(Error.prototype);
        expect(errorProto).toBeInstanceOf(Error);
        expect(errorProto.name).toBe(errorName);
        expect(errorProto.constructor.name).toBe(errorName);
      }
    }
    expect(thrown).toBe(true);
  });

  it("should catch all error effects and throw them with custom error message", () => {
    let thrown = false;
    try {
      effected(function* () {
        yield* typeError("foo");
        yield* rangeError("bar");
      })
        .catchAllAndThrow("custom message")
        .runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        const errorName = e.name;
        expect(errorName).toEqual(expect.stringMatching(/TypeError|RangeError/));
        expect(e.message).toBe("custom message");
      }
    }
    expect(thrown).toBe(true);

    thrown = false;
    try {
      effected(function* () {
        yield* typeError("foo");
        yield* rangeError("bar");
      })
        .catchAllAndThrow((error, message) => `custom ${error} ${message}`)
        .runSync();
    } catch (e) {
      thrown = true;
      expect(e).toBeInstanceOf(Error);
      if (e instanceof Error) {
        const errorName = e.name;
        expect(errorName).toEqual(expect.stringMatching(/TypeError|RangeError/));
        expect(e.message).toBe(`custom ${errorName === "TypeError" ? "type foo" : "range bar"}`);
      }
    }
    expect(thrown).toBe(true);
  });
});

describe("Effected.of", () => {
  it("should create an effected program with a single value", () => {
    const program = Effected.of(42);
    expect(program.runSync()).toBe(42);
  });
});

describe("Effected.from", () => {
  it("should create an effected program from a getter", () => {
    const program = Effected.from(() => 42);
    expect(program.runSync()).toBe(42);
  });

  it("should only run the getter once", () => {
    let count = 0;
    const program = Effected.from(() => {
      count++;
      return 42;
    });
    expect(program.runSync()).toBe(42);
    expect(count).toBe(1);
    expect(program.runSync()).toBe(42);
    expect(count).toBe(2);
  });
});

describe("Effected#pipe", () => {
  // Create helper functions for piping
  const addOne = <E extends Effect>(self: Effected<E, number>): Effected<E, number> =>
    self.map((x) => x + 1);

  const double = <E extends Effect>(self: Effected<E, number>): Effected<E, number> =>
    self.map((x) => x * 2);

  const toString = <E extends Effect, T>(self: Effected<E, T>): Effected<E, string> =>
    self.map((x) => String(x));

  const log = effect("log")<[message: string], void>;

  const withLog =
    <T>(message: string) =>
    <E extends Effect>(self: Effected<E, T>): Effected<E | InferEffect<typeof log>, T> =>
      self.tap(function* (value) {
        yield* log(`${message}: ${String(value)}`);
      });

  const sleep = effect("sleep")<[ms: number], void>;
  const delay =
    (ms: number) =>
    <E extends Effect, T>(self: Effected<E, T>): Effected<E | InferEffect<typeof sleep>, T> => {
      return self.andThen(function* (value) {
        yield* sleep(ms);
        return value;
      });
    };

  it("should return the original effected when called with no arguments", () => {
    const program = Effected.of(42);
    const result = (program as any).pipe();
    expect(result).toBe(program); // Should be the same instance
    expect(result.runSync()).toBe(42);
  });

  it("should apply a single function correctly", () => {
    const program = Effected.of(10);
    const result = program.pipe(addOne);
    expect(result.runSync()).toBe(11);
  });

  it("should apply two functions in the correct order", () => {
    const program = Effected.of(5);
    const result = program.pipe(addOne, double);
    expect(result.runSync()).toBe(12); // (5 + 1) * 2 = 12

    // Test with a different order
    const result2 = program.pipe(double, addOne);
    expect(result2.runSync()).toBe(11); // (5 * 2) + 1 = 11
  });

  it("should apply multiple functions in sequence", () => {
    const program = Effected.of(5);
    const result = program.pipe(
      addOne, // 6
      double, // 12
      addOne, // 13
      toString, // "13"
      (e) => e.map((s) => s + "!"), // "13!"
    );
    expect(result.runSync()).toBe("13!");
  });

  it("should work with functions that add effects", () => {
    const logs: string[] = [];

    const program = Effected.of(5);
    const result = program.pipe(
      withLog("Initial"),
      addOne,
      withLog("After adding"),
      double,
      withLog("After doubling"),
    );

    const finalResult = result
      .resume("log", (message) => {
        logs.push(message);
      })
      .runSync();

    expect(finalResult).toBe(12); // (5 + 1) * 2 = 12
    expect(logs).toEqual(["Initial: 5", "After adding: 6", "After doubling: 12"]);
  });

  it("should work with async effects", async () => {
    vi.useFakeTimers();

    const logs: string[] = [];
    const timestamps: number[] = [];
    const recordTime =
      <T>(label: string) =>
      <E extends Effect>(self: Effected<E, T>): Effected<E, T> =>
        self.tap(() => {
          timestamps.push(Date.now());
          logs.push(`${label} at ${Date.now()}ms`);
        });

    const program = Effected.of(10);
    const result = program.pipe(
      recordTime("Start"),
      delay(100),
      recordTime("After delay"),
      addOne,
      delay(50),
      recordTime("Final"),
      double,
    );

    const promise = result
      .handle("sleep", ({ resume }, ms) => {
        setTimeout(() => resume(), ms);
      })
      .runAsync();

    // Fast-forward time and check results
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(50);

    const finalResult = await promise;
    expect(finalResult).toBe(22); // (10 + 1) * 2 = 22

    // Check that operations happened in the right order with delays
    expect(logs.length).toBe(3);
    expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(100);
    expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(50);

    vi.useRealTimers();
  });

  it("should handle fallback case with many functions", () => {
    const program = Effected.of(1);

    for (let i = 1; i <= 12; i++) {
      const fs = Array.from(
        { length: i },
        (_, j) =>
          <E extends Effect>(e: Effected<E, number>) =>
            e.map((x) => x + j + 1),
      );
      const expected = Array.from({ length: i }, (_, j) => j + 1).reduce((a, b) => a + b, 1);
      expect((program as any).pipe(...fs).runSync()).toBe(expected);
    }
  });
});

describe("stringify (internal implementation)", () => {
  // This helper function extracts the result of `stringify` by triggering an `UnhandledEffectError`
  // and extracting the formatted payload from the error message
  function stringify(value: unknown): string {
    // Create an effect with our test value as its payload
    const testStringify = effect("testStringify")<[value: unknown], void>;

    try {
      // Running this will throw an `UnhandledEffectError` with our value stringified in the message
      effected(function* () {
        yield* testStringify(value);
      }).runSyncUnsafe();
      throw new Error("Expected UnhandledEffectError to be thrown");
    } catch (error) {
      if (!(error instanceof UnhandledEffectError)) {
        throw error;
      }

      // Extract just the stringified part from: "Unhandled effect: testStringify(<stringified value>)"
      return error.message.replace("Unhandled effect: testStringify(", "").slice(0, -1);
    }
  }

  it("should handle primitive values correctly", () => {
    expect(stringify(42)).toBe("42");
    expect(stringify("hello")).toBe('"hello"');
    expect(stringify(true)).toBe("true");
    expect(stringify(null)).toBe("null");
    expect(stringify(undefined)).toBe("undefined");
    expect(stringify(123n)).toBe("123n");
    expect(stringify(Symbol("test"))).toBe("Symbol(test)");
  });

  it("should handle arrays correctly", () => {
    expect(stringify([1, 2, 3])).toBe("[1, 2, 3]");
    expect(stringify(["a", "b", true])).toBe('["a", "b", true]');
    expect(stringify([])).toBe("[]");
  });

  it("should handle arrays subclasses correctly", () => {
    class MyArray<T> extends Array<T> {
      // eslint-disable-next-line @typescript-eslint/no-useless-constructor
      constructor(...args: T[]) {
        super(...args);
      }
    }

    expect(stringify(new MyArray(1, 2, 3))).toBe("MyArray(3) [1, 2, 3]");
  });

  it("should handle objects correctly", () => {
    expect(stringify({ a: 1, b: "test" })).toBe('{ a: 1, b: "test" }');
    expect(stringify({})).toBe("{}");
  });

  it("should handle different key types in objects", () => {
    // Symbol keys
    const symbolKey = Symbol("test");
    const objWithSymbol = { [symbolKey]: "value" };
    expect(stringify(objWithSymbol)).toBe('{ [Symbol(test)]: "value" }');

    // Valid identifier keys
    const objWithValidIds = { abc: 1, $valid: 2, _key123: 3 };
    expect(stringify(objWithValidIds)).toBe("{ abc: 1, $valid: 2, _key123: 3 }");

    // Keys that aren't valid identifiers
    const objWithInvalidIds = { "not-valid": 1, "123": 2, "a b": 3 };
    expect(stringify(objWithInvalidIds)).toBe('{ "123": 2, "not-valid": 1, "a b": 3 }');

    // Mixed keys
    const mixedObj = {
      validId: 1,
      "invalid-id": 2,
      [Symbol("sym")]: 3,
    };
    expect(stringify(mixedObj)).toBe('{ validId: 1, "invalid-id": 2, [Symbol(sym)]: 3 }');
  });

  it("should handle Date objects correctly", () => {
    const date = new Date("2023-01-01T00:00:00.000Z");
    expect(stringify(date)).toBe(date.toISOString());
  });

  it("should handle RegExp objects correctly", () => {
    expect(stringify(/test/g)).toBe("/test/g");
  });

  it("should handle Map and Set correctly", () => {
    expect(stringify(new Map())).toBe("Map(0) {}");
    expect(stringify(new Set())).toBe("Set(0) {}");

    const map = new Map<any, any>([
      ["key", "value"],
      [1, 2],
    ]);
    expect(stringify(map)).toBe('Map(2) { "key" => "value", 1 => 2 }');

    const set = new Set([1, "test", true]);
    expect(stringify(set)).toBe('Set(3) { 1, "test", true }');
  });

  it("should handle functions correctly", () => {
    function namedFunction() {
      return 42;
    }
    expect(stringify(namedFunction)).toBe("[Function: namedFunction]");

    const anonymousFunction = (() => () => {})();
    expect(stringify(anonymousFunction)).toBe("[Function (anonymous)]");
  });

  it("should handle circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(stringify(obj)).toBe("{ a: 1, self: [Circular] }");
  });

  it("should handle class instances correctly", () => {
    class TestClass {
      value = 42;
    }
    expect(stringify(new TestClass())).toBe("TestClass { value: 42 }");

    class EmptyClass {}
    expect(stringify(new EmptyClass())).toBe("EmptyClass {}");
  });

  it("should handle nested complex structures", () => {
    const date = new Date("2023-01-01T00:00:00.000Z");
    const complex = {
      array: [1, { nested: true }],
      map: new Map([["key", { deep: new Set([1, 2]) }]]),
      date,
    };
    complex.map.set("self", complex as never);

    expect(stringify(complex)).toBe(
      `{ array: [1, { nested: true }], ` +
        `map: Map(2) { "key" => { deep: Set(2) { 1, 2 } }, "self" => [Circular] }, ` +
        `date: ${date.toISOString()} }`,
    );
  });
});
