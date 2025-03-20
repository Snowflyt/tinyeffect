import { describe, expect, it, vi } from "vitest";

import type { EffectFactory, Unresumable } from "../src";
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

    const raiseOption = defineHandlerFor<Raise>().with((effected) =>
      effected.andThen(some).terminate("raise", () => none),
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
