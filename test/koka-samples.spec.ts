/**
 * Examples from Koka documentation
 * https://koka-lang.github.io/koka/doc/book.html
 */

import { expect, test } from "vitest";

import type { Effect, EffectFactory, InferEffect } from "../src";
import { Effected, defineHandlerFor, dependency, effect, effected, effectify } from "../src";

type Println = Effect<"println", unknown[], void>;
const println: EffectFactory<Println> = effect("println");

test("2.3. Effect Handlers", () => {
  type Yield = Effect<"yield", [i: number], boolean>;
  const yield_: EffectFactory<Yield> = effect("yield");

  type List<T> = Cons<T> | Nil;
  type Cons<T> = [T, List<T>];
  type Nil = { _tag: "Nil" };
  const cons = <T>(head: T, tail: List<T>): List<T> => [head, tail];
  const nil: Nil = { _tag: "Nil" };
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const isNil = (xs: List<unknown>): xs is Nil => "_tag" in xs && xs._tag === "Nil";
  const list = <T>(...xs: T[]): List<T> => xs.reduceRight<List<T>>((acc, x) => cons(x, acc), nil);

  const traverse = (xs: List<number>) =>
    effected(function* (): Generator<InferEffect<typeof yield_>, void> {
      if (isNil(xs)) return;
      const [x, xx] = xs;
      if (yield* yield_(x)) yield* traverse(xx);
    });

  const printElements = () =>
    effected(function* () {
      yield* traverse(list(1, 2, 3, 4)).handle("yield", function* ({ resume }, i) {
        yield* println("yielded", i);
        resume(i <= 2);
      });
    });

  const logs: unknown[][] = [];
  printElements()
    .resume("println", (...args) => {
      logs.push(args);
    })
    .runSync();
  expect(logs).toEqual([
    ["yielded", 1],
    ["yielded", 2],
    ["yielded", 3],
  ]);
});

type Raise = Effect<"raise", [msg: string], never>;
const raise: EffectFactory<Raise> = effect("raise");

const safeDivide = (x: number, y: number) =>
  effected(function* () {
    return y === 0 ? yield* raise("Division by zero") : x / y;
  });

type Maybe<T> = { _tag: "Just"; value: T } | { _tag: "Nothing" };
const just = <T>(value: T): Maybe<T> => ({ _tag: "Just", value });
const nothing: Maybe<never> = { _tag: "Nothing" };

const raiseMaybe = defineHandlerFor<Raise>().with((effected) =>
  effected.andThen((r) => just(r)).terminate("raise", () => nothing),
);

test("3.2.3. Polymorphic effects", () => {
  const map = <T, U, E extends Effect = never>(
    xs: readonly T[],
    f: (x: T) => U | Effected<E, U>,
  ): Effected<E, U[]> =>
    effected(function* () {
      const ys: U[] = [];
      for (const x of xs) {
        const y = f(x);
        ys.push(y instanceof Effected ? yield* y : y);
      }
      return ys;
    });

  expect(
    map([1, 21, 0, 2], (n) => safeDivide(42, n))
      .with(raiseMaybe)
      .runSync(),
  ).toEqual(nothing);
  expect(
    map([1, 21, 2], (n) => safeDivide(42, n))
      .with(raiseMaybe)
      .runSync(),
  ).toEqual(just([42, 2, 21]));
});

test("3.4.1. Handling", async () => {
  const raiseConst1 = () =>
    effected(function* () {
      return 8 + (yield* safeDivide(1, 0));
    })
      .terminate("raise", () => 42)
      .runSync();
  expect(raiseConst1()).toEqual(42);

  const raiseConst2 = () =>
    effected(function* () {
      return 8 + (yield* safeDivide(4, 2));
    })
      .terminate("raise", () => 42)
      .runAsync();
  expect(await raiseConst2()).toEqual(10);
});

test("3.4.2. Resuming", () => {
  type Ask<T> = Effect<"ask", [], T>;
  const ask = <T>(): Effected<Ask<T>, T> => effect("ask")();

  const addTwice = () =>
    effected(function* () {
      return (yield* ask<number>()) + (yield* ask<number>());
    });

  const askConst = () =>
    addTwice()
      .handle("ask", ({ resume }) => {
        resume(21);
      })
      .runSync();
  expect(askConst()).toEqual(42);

  const askConst2 = () =>
    addTwice()
      .resume("ask", () => 21)
      .runSync();
  expect(askConst2()).toEqual(42);

  const askOnce = () => {
    let count = 0;
    return addTwice()
      .handle<"ask", number>("ask", ({ resume, terminate }) => {
        count++;
        if (count <= 1) resume(42);
        else terminate(0);
      })
      .runSync();
  };
  expect(askOnce()).toEqual(0);
});

type WidthDependency = Effect.Dependency<"width", number>;
const askWidth: EffectFactory<WidthDependency> = dependency("width");

test("3.4.3. Tail-Resumptive Operations", async () => {
  const prettyInternal = (line: string) =>
    effected(function* () {
      const width = yield* askWidth();
      return line.slice(0, width);
    });

  const prettyThin1 = (d: string) => prettyInternal(d).provide("width", 5).runSync();
  expect(prettyThin1("Hello, world!")).toEqual("Hello");

  const prettyThin2 = (d: string) =>
    prettyInternal(d)
      .provideBy("width", () => 5)
      .runSync();
  expect(prettyThin2("This is a long string")).toEqual("This ");

  const prettyThin3 = (d: string) =>
    prettyInternal(d)
      .provideBy("width", function* () {
        return yield* effectify(new Promise<number>((resolve) => setTimeout(() => resolve(5), 10)));
      })
      .runAsync();
  expect(await prettyThin3("Delayed string")).toEqual("Delay");
});

type Emit = Effect<"emit", [msg: string], void>;
const emit: EffectFactory<Emit> = effect("emit");

test("3.4.4. Abstracting Handlers", () => {
  const eHello = () =>
    effected(function* () {
      yield* emit("hello");
      yield* emit("world");
    });

  const eHelloConsole = () =>
    effected(function* () {
      yield* eHello().resume("emit", println);
    });

  const logs: unknown[][] = [];
  eHelloConsole()
    .resume("println", (...args) => {
      logs.push(args);
    })
    .runSync();
  expect(logs).toEqual([["hello"], ["world"]]);

  const emitConsole2 = defineHandlerFor<Emit>().with((effected) =>
    effected.resume("emit", println),
  );

  const eHelloConsole2 = () =>
    effected(function* () {
      yield* eHello().with(emitConsole2);
    });

  logs.length = 0;
  eHelloConsole2()
    .resume("println", (...args) => {
      logs.push(args);
    })
    .runSync();
  expect(logs).toEqual([["hello"], ["world"]]);
});

type State<T> = Effect<"state.get", [], T> | Effect<"state.set", [T], void>;
const state = {
  get: <T>(): Effected<State<T>, T> => effect("state.get")<[], T>(),
  set: <T>(x: T): Effected<State<T>, void> => effect("state.set")<[T], void>(x),
};
const stateHandler = <T>({ get, set }: { get: () => T; set: (x: T) => void }) =>
  defineHandlerFor<State<T>>().with((effected) =>
    effected.resume("state.get", get).resume("state.set", set),
  );

const pState = <T>(init: T) =>
  defineHandlerFor<State<T>>().with((effected) => {
    let st = init;
    return effected
      .andThen((x) => [x, st] as const)
      .resume("state.get", () => st)
      .resume("state.set", (x) => {
        st = x;
      });
  });

test("3.4.5. Return Operations", () => {
  expect(safeDivide(1, 0).with(raiseMaybe).runSync()).toEqual(nothing);
  expect(safeDivide(42, 2).with(raiseMaybe).runSync()).toEqual(just(21));

  const sumDown = (sum = 0): Effected<State<number>, number> =>
    effected(function* () {
      const i = yield* state.get<number>();
      if (i <= 0) return sum;
      yield* state.set(i - 1);
      return yield* sumDown(sum + i);
    });

  const state_ = <T, R>(init: T, action: () => Effected<State<T>, R>) => {
    let st = init;
    return action()
      .resume("state.get", () => st)
      .resume("state.set", (x) => {
        st = x;
      })
      .runSync();
  };
  expect(state_(10, () => sumDown())).toEqual(55);

  expect(sumDown().with(pState(10)).runSync()).toEqual([55, 0]);
});

test("3.4.6. Combining Handlers", () => {
  const noOdds = (): Effected<Raise | State<number>, number> =>
    effected(function* () {
      const i = yield* state.get<number>();
      if (i % 2 === 1) return yield* raise("no odds");
      yield* state.set(i / 2);
      return i;
    });

  const raiseState1 = (init: number) => noOdds().with(raiseMaybe).with(pState(init));
  expect(raiseState1(42).runSync()).toEqual([just(42), 21]);
  expect(raiseState1(21).runSync()).toEqual([nothing, 21]);

  const raiseState2 = (init: number) =>
    noOdds()
      .with(
        stateHandler({
          get: () => init,
          set: (x) => {
            init = x;
          },
        }),
      )
      .with(raiseMaybe);
  expect(raiseState2(42).runSync()).toEqual(just(42));
  expect(raiseState2(21).runSync()).toEqual(nothing);

  const stateRaise = (init: number) => noOdds().with(pState(init)).with(raiseMaybe);
  expect(stateRaise(42).runSync()).toEqual(just([42, 21]));
  expect(stateRaise(21).runSync()).toEqual(nothing);
});

test("3.4.8. Overriding Handlers", () => {
  const emitQuoted = defineHandlerFor<Emit>().with((effected) =>
    effected.resume("emit", (msg) => emit(`"${msg}"`)),
  );

  const messages: string[] = [];
  effected(function* () {
    yield* emit("hello");
    yield* emit("world");
  })
    .with(emitQuoted)
    .resume("emit", (msg) => {
      messages.push(msg);
    })
    .runSync();
  expect(messages).toEqual(['"hello"', '"world"']);
});
