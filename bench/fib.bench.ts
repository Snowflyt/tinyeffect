/**
 * Benchmark for overhead of computationally expensive functions.
 *
 * Currently the effected version is around 100x (`fibPipeT`) to 200x (`fibGenT`) slower than the
 * non-effected version.
 *
 * Such overhead should be acceptable for most use-cases, as real-world applications are unlikely to
 * execute computationally expensive logic in an effected function.
 *
 * It is worth noting that tinyeffect’s version using generator syntax is around 20% faster than
 * Effect’s version using `Effect.gen`, but the one using pipeline syntax is around 30%~120% slower
 * than Effect’s version, which is quite surprising. A further investigation is needed to find out
 * why Effect’s version is faster than tinyeffect’s version using pipeline syntax.
 */

import { Effect } from "effect";
import { bench, describe } from "vitest";

import { Effected, effected } from "../src";

const fib = (n: number): number => {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
};

/* tinyeffect */
const fibGenT = (n: number): Effected<never, number> =>
  effected(function* () {
    if (n <= 1) return n;
    return (yield* fibGenT(n - 1)) + (yield* fibGenT(n - 2));
  });

const fibPipeT1 = (n: number): Effected<never, number> => {
  if (n <= 1) return Effected.of(n);
  return fibPipeT2(n - 1).flatMap((a) => fibPipeT1(n - 2).map((b) => a + b));
};

const fibPipeT2 = (n: number): Effected<never, number> => {
  if (n <= 1) return Effected.of(n);
  return fibPipeT2(n - 1).andThen((a) => fibPipeT2(n - 2).andThen((b) => a + b));
};

const fibPipeT3 = (n: number): Effected<never, number> => {
  if (n <= 1) return Effected.of(n);
  return fibPipeT2(n - 1).zip(fibPipeT2(n - 2), (a, b) => a + b);
};

/* Effect */
const fibGenE = (n: number): Effect.Effect<number> =>
  Effect.gen(function* () {
    if (n <= 1) return n;
    return (yield* fibGenE(n - 1)) + (yield* fibGenE(n - 2));
  });

const fibPipeE1 = (n: number): Effect.Effect<number> => {
  if (n <= 1) return Effect.succeed(n);
  return fibPipeE1(n - 1).pipe(
    Effect.flatMap((a) => fibPipeE1(n - 2).pipe(Effect.map((b) => a + b))),
  );
};

const fibPipeE2 = (n: number): Effect.Effect<number> => {
  if (n <= 1) return Effect.succeed(n);
  return fibPipeE2(n - 1).pipe(
    Effect.andThen((a) => fibPipeE2(n - 2).pipe(Effect.andThen((b) => a + b))),
  );
};

const fibPipeE3 = (n: number): Effect.Effect<number> => {
  if (n <= 1) return Effect.succeed(n);
  return fibPipeE2(n - 1).pipe(Effect.zipWith(fibPipeE2(n - 2), (a, b) => a + b));
};

/* Bench */
describe("fib(20)", () => {
  bench("[baseline] fib(20)", () => void fib(20));
  bench("[tinyeffect] fibGen(20)", () => void fibGenT(20).runSync());
  bench("[tinyeffect] fibPipe(20) with map/flatMap", () => void fibPipeT1(20).runSync());
  bench("[tinyeffect] fibPipe(20) with andThen", () => void fibPipeT2(20).runSync());
  bench("[tinyeffect] fibPipe(20) with zip", () => void fibPipeT3(20).runSync());
  bench("[Effect] fibGen(20)", () => void Effect.runSync(fibGenE(20)));
  bench("[Effect] fibPipe(20) with map/flatMap", () => void Effect.runSync(fibPipeE1(20)));
  bench("[Effect] fibPipe(20) with andThen", () => void Effect.runSync(fibPipeE2(20)));
  bench("[Effect] fibPipe(20) with zip", () => void Effect.runSync(fibPipeE3(20)));
});

describe("fib(30)", () => {
  bench("[baseline] fib(30)", () => void fib(30));
  bench("[tinyeffect] fibGen(30)", () => void fibGenT(30).runSync());
  bench("[tinyeffect] fibPipe(30) with map/flatMap", () => void fibPipeT1(30).runSync());
  bench("[tinyeffect] fibPipe(30) with andThen", () => void fibPipeT2(30).runSync());
  bench("[tinyeffect] fibPipe(30) with zip", () => void fibPipeT3(30).runSync());
  bench("[Effect] fibGen(30)", () => void Effect.runSync(fibGenE(30)));
  bench("[Effect] fibPipe(30) with map/flatMap", () => void Effect.runSync(fibPipeE1(30)));
  bench("[Effect] fibPipe(30) with andThen", () => void Effect.runSync(fibPipeE2(30)));
  bench("[Effect] fibPipe(30) with zip", () => void Effect.runSync(fibPipeE3(30)));
});
