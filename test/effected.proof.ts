import { beNever, describe, equal, expect, it, error as triggerError } from "typroof";

import { dependency, effect, effected, error } from "../src";
import { Effected } from "../src/effected";
import type {
  Effect,
  EffectFactory,
  InferEffect,
  UnhandledEffect,
  Unresumable,
} from "../src/types";

const add42 = effect("add42")<[n: number], number>;
const now = effect("now")<[], Date>;
const log = effect("log")<unknown[], void>;
const raise = effect("raise", { resumable: false })<[error: unknown], never>;

describe("effect", () => {
  it("should create a function that returns an `Effected` instance which yields a single `Effect`", () => {
    expect(add42).to(equal<(n: number) => Effected<Effect<"add42", [n: number], number>, number>>);
    expect(now).to(equal<() => Effected<Effect<"now", [], Date>, Date>>);
    expect(log).to(equal<(...args: unknown[]) => Effected<Effect<"log", unknown[], void>, void>>);
  });

  it("should create unresumable effects", () => {
    expect(raise).to(
      equal<
        (error: unknown) => Effected<Unresumable<Effect<"raise", [error: unknown], never>>, never>
      >,
    );
  });

  it("should be inferred as an `Effect` type by the `InferEffect` utility type", () => {
    expect<InferEffect<typeof add42>>().to(equal<Effect<"add42", [n: number], number>>);
    expect<InferEffect<typeof now>>().to(equal<Effect<"now", [], Date>>);
    expect<InferEffect<typeof log>>().to(equal<Effect<"log", unknown[], void>>);
    expect<InferEffect<typeof raise>>().to(
      equal<Unresumable<Effect<"raise", [error: unknown], never>>>,
    );
  });
});

const typeError = error("type");

describe("error", () => {
  it("should create a function that returns an `Effected` instance which yields a single `Effect.Error`", () => {
    expect(typeError).to(
      equal<
        (
          message?: string,
        ) => Effected<
          Unresumable<Effect<"error:type", [message?: string | undefined], never>>,
          never
        >
      >,
    );
    expect<Effect.Error<"type">>().to(
      equal<Unresumable<Effect<"error:type", [message?: string | undefined], never>>>,
    );
  });

  it("should be inferred as an `Effect` type by the `InferEffect` utility type", () => {
    expect<InferEffect<typeof typeError>>().to(equal<Effect.Error<"type">>);
  });
});

const askNumber = dependency("number")<number>;

describe("dependency", () => {
  it("should create a function that returns an `Effected` instance which yields a single `Effect.Dependency`", () => {
    expect(askNumber).to(equal<() => Effected<Effect.Dependency<"number", number>, number>>);
  });

  it("should be inferred as an `Effect` type by the `InferEffect` utility type", () => {
    expect<InferEffect<typeof askNumber>>().to(equal<Effect.Dependency<"number", number>>);
  });
});

describe("effected", () => {
  const program = effected(function* () {
    const n = yield* add42(42);
    const time = yield* now();
    yield* log("n:", n);
    return time;
  });
  const program2 = program.resume("log", console.log);
  const program3 = program2.resume("add42", (n) => n + 42);
  const program4 = program3.resume("now", () => new Date());

  it("should create an `Effected` object with the correct type", () => {
    expect(program).to(
      equal<
        Effected<
          | Effect<"add42", [n: number], number>
          | Effect<"now", [], Date>
          | Effect<"log", unknown[], void>,
          Date
        >
      >,
    );
  });

  it("should exclude handled effects from the type", () => {
    expect(program2).to(
      equal<Effected<Effect<"add42", [n: number], number> | Effect<"now", [], Date>, Date>>,
    );
    expect(program3).to(equal<Effected<Effect<"now", [], Date>, Date>>);
    expect(program4).to(equal<Effected<never, Date>>);
  });

  it("should only be runnable after all effects are handled", () => {
    // @ts-expect-error
    expect(program.runSync()).to(triggerError);
    // @ts-expect-error
    expect(program.runAsync()).to(triggerError);
    // @ts-expect-error
    expect(program3.runSync()).to(triggerError);
    // @ts-expect-error
    expect(program3.runAsync()).to(triggerError);
    expect(program4.runSync()).not.to(triggerError);
    expect(program4.runAsync()).not.to(triggerError);

    expect(program.runSync).to(
      equal<
        UnhandledEffect<
          | Effect<"add42", [n: number], number>
          | Effect<"now", [], Date>
          | Effect<"log", unknown[], void>
        >
      >,
    );
    expect(program.runAsync).to(
      equal<
        UnhandledEffect<
          | Effect<"add42", [n: number], number>
          | Effect<"now", [], Date>
          | Effect<"log", unknown[], void>
        >
      >,
    );

    expect(program2.runSync).to(
      equal<UnhandledEffect<Effect<"add42", [n: number], number> | Effect<"now", [], Date>>>,
    );
    expect(program2.runAsync).to(
      equal<UnhandledEffect<Effect<"add42", [n: number], number> | Effect<"now", [], Date>>>,
    );

    expect(program3.runSync).to(equal<UnhandledEffect<Effect<"now", [], Date>>>);
    expect(program3.runAsync).to(equal<UnhandledEffect<Effect<"now", [], Date>>>);

    expect(program4.runSync).to(equal<() => Date>);
    expect(program4.runAsync).to(equal<() => Promise<Date>>);
  });

  it("should always be runnable by `#runSyncUnsafe` and `#runAsyncUnsafe`", () => {
    expect(program.runSyncUnsafe()).not.to(triggerError);
    expect(program.runSyncUnsafe()).to(equal<Date>);
    expect(program.runAsyncUnsafe()).to(equal<Promise<Date>>);
    expect(program2.runSyncUnsafe()).not.to(triggerError);
    expect(program2.runSyncUnsafe()).to(equal<Date>);
    expect(program2.runAsyncUnsafe()).to(equal<Promise<Date>>);
    expect(program3.runSyncUnsafe()).not.to(triggerError);
    expect(program3.runSyncUnsafe()).to(equal<Date>);
    expect(program3.runAsyncUnsafe()).to(equal<Promise<Date>>);
    expect(program4.runSyncUnsafe()).not.to(triggerError);
    expect(program4.runSyncUnsafe()).to(equal<Date>);
    expect(program4.runAsyncUnsafe()).to(equal<Promise<Date>>);
  });

  it("should be inferred as an `Effect` type by the `InferEffect` utility type", () => {
    expect<InferEffect<typeof program>>().to(
      equal<
        | Effect<"add42", [n: number], number>
        | Effect<"now", [], Date>
        | Effect<"log", unknown[], void>
      >,
    );
    expect<InferEffect<typeof program2>>().to(
      equal<Effect<"add42", [n: number], number> | Effect<"now", [], Date>>,
    );
    expect<InferEffect<typeof program3>>().to(equal<Effect<"now", [], Date>>);
    expect<InferEffect<typeof program4>>().to(beNever);
  });
});

describe("Effected.all(Seq)", () => {
  const log = effect("log")<[message: string], void>;
  const fetch = effect("fetch")<[url: string], string>;

  it("should infer the return type of array of effects", () => {
    const program1 = Effected.all([Effected.of(1), Effected.of(2), Effected.of(3)]);
    expect(program1.runSync()).to(equal<[number, number, number]>);

    const program2 = Effected.all([
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
    expect(program2.resume("log", () => {}).runSync()).to(equal<[number, number, number]>);
  });

  it("should infer the return type of non-array iterable of effects", () => {
    const set = new Set<Effected<never, number>>();
    const program1 = Effected.all(set);
    expect(program1.runSync()).to(equal<number[]>);

    // Custom iterable
    const customIterable = {
      *[Symbol.iterator]() {
        yield Effected.of(42);
        yield Effected.of("foo");
        yield Effected.of("bar");
      },
    };
    const program2 = Effected.all(customIterable);
    expect(program2.runSync()).to(equal<(number | string)[]>);
  });

  it("should infer the return type of object (record) of effects", () => {
    const program1 = Effected.all({
      a: Effected.of(1),
      b: Effected.of(2),
      c: Effected.of(3),
    });
    expect(program1.runSync()).to(equal<{ a: number; b: number; c: number }>);

    const program2 = Effected.all({
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
    expect(program2.resume("log", () => {}).runSync()).to(
      equal<{ a: number; b: number; c: string }>,
    );
  });

  it("should handle complex nested scenarios", async () => {
    const fetchData = (url: string) =>
      effected(function* () {
        const data = yield* fetch(url);
        yield* log(`Fetched ${data} from ${url}`);
        return data;
      });

    const urls = ["api/users", "api/posts", "api/comments"] as const;

    // Combination of array and object
    const program = Effected.all({
      users: fetchData(urls[0]),
      posts: fetchData(urls[1]),
      metadata: Effected.allSeq([Effected.of("v1.0"), fetchData(urls[2])]),
    });

    const result = await program
      .resume("fetch", (url) => `data from ${url}`)
      .resume("log", () => {})
      .runAsync();

    expect(result).to(
      equal<{
        users: string;
        posts: string;
        metadata: [string, string];
      }>,
    );
  });

  it("should infer the return type of empty arrays/objects", () => {
    expect(Effected.all([])).to(equal<Effected<never, []>>);
    expect(Effected.all({})).to(equal<Effected<never, {}>>);
  });
});

describe("Effected#catchAndThrow", () => {
  type TypeError = Effect.Error<"type">;
  const typeError: EffectFactory<TypeError> = error("type");
  type RangeError = Effect.Error<"range">;
  const rangeError: EffectFactory<RangeError> = error("range");

  it("should exclude the specified error effect", () => {
    const program = effected(function* () {
      yield* typeError("foo");
      yield* rangeError("bar");
    });

    expect(program.catchAndThrow("type")).not.to(triggerError);
    expect(program.catchAndThrow("type")).to(equal<Effected<RangeError, void>>);
    expect(program.catchAndThrow("range")).not.to(triggerError);
    expect(program.catchAndThrow("range")).to(equal<Effected<TypeError, void>>);
    expect(program.catchAndThrow("type").catchAndThrow("range")).not.to(triggerError);
    expect(program.catchAndThrow("type").catchAndThrow("range")).to(equal<Effected<never, void>>);

    expect(program.catchAndThrow("type", "custom message")).not.to(triggerError);
    expect(program.catchAndThrow("type", "custom message")).to(equal<Effected<RangeError, void>>);
    expect(program.catchAndThrow("range", "custom message")).not.to(triggerError);
    expect(program.catchAndThrow("range", "custom message")).to(equal<Effected<TypeError, void>>);
    expect(program.catchAndThrow("type", "foo").catchAndThrow("range", "bar")).not.to(triggerError);
    expect(program.catchAndThrow("type", "foo").catchAndThrow("range", "bar")).to(
      equal<Effected<never, void>>,
    );

    program.catchAndThrow("type", (message) => {
      expect<typeof message>().to(equal<string | undefined>);
      return "";
    });
    expect(program.catchAndThrow("type", (message) => `custom ${message}`)).not.to(triggerError);
    expect(program.catchAndThrow("type", (message) => `custom ${message}`)).to(
      equal<Effected<RangeError, void>>,
    );
  });
});

describe("Effected#catchAllAndThrow", () => {
  type TypeError = Effect.Error<"type">;
  const typeError: EffectFactory<TypeError> = error("type");
  type RangeError = Effect.Error<"range">;
  const rangeError: EffectFactory<RangeError> = error("range");

  it("should exclude all error effects", () => {
    const program = effected(function* () {
      yield* typeError("foo");
      yield* rangeError("bar");
    });

    expect(program.catchAllAndThrow()).not.to(triggerError);
    expect(program.catchAllAndThrow()).to(equal<Effected<never, void>>);

    expect(program.catchAllAndThrow("custom message")).not.to(triggerError);
    expect(program.catchAllAndThrow("custom message")).to(equal<Effected<never, void>>);

    program.catchAllAndThrow((error, message) => {
      expect<typeof error>().to(equal<string>);
      expect<typeof message>().to(equal<string | undefined>);
      return "";
    });
    expect(program.catchAllAndThrow((error, message) => `${error}${message}`)).not.to(triggerError);
    expect(program.catchAllAndThrow((error, message) => `${error}${message}`)).to(
      equal<Effected<never, void>>,
    );
  });
});
