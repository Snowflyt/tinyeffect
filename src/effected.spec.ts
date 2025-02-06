/* eslint-disable @typescript-eslint/ban-ts-comment */
import { describe, expect, it, vi } from "vitest";

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
} from ".";

import type { EffectFactory, Unresumable } from ".";

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
          .catch((error) => {
            terminate(error);
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
        function isRaise(name): name is "raise" {
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
