/* eslint-disable @typescript-eslint/ban-ts-comment */

import { beNever, describe, equal, expect, it, error as triggerError } from "typroof";

import { dependency, effect, effected, error } from ".";

import type { Effected } from "./effected";
import type { Effect, EffectFactory, InferEffect, UnhandledEffect, Unresumable } from "./types";

const add42 = effect("add42")<[n: number], number>;
const now = effect("now")<[], Date>;
const log = effect("log")<unknown[], void>;
const raise = effect("raise", { resumable: false })<[error: unknown], never>;

describe("effect", () => {
  it("should create a generator function yielding a single `Effect`", () => {
    expect(add42).to(
      equal<(n: number) => Generator<Effect<"add42", [n: number], number>, number, unknown>>,
    );
    expect(now).to(equal<() => Generator<Effect<"now", [], Date>, Date, unknown>>);
    expect(log).to(
      equal<(...args: unknown[]) => Generator<Effect<"log", unknown[], void>, void, unknown>>,
    );
  });

  it("should create unresumable effects", () => {
    expect(raise).to(
      equal<
        (
          error: unknown,
        ) => Generator<Unresumable<Effect<"raise", [error: unknown], never>>, never, unknown>
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
  it("should create a generator function yielding an unresumable error effect", () => {
    expect(typeError).to(
      equal<
        (
          message?: string,
        ) => Generator<
          Unresumable<Effect<"error:type", [message?: string | undefined], never>>,
          never,
          unknown
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
  it("should create a generator function yielding a single `Effect.Dependency`", () => {
    expect(askNumber).to(
      equal<() => Generator<Effect.Dependency<"number", number>, number, unknown>>,
    );
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
