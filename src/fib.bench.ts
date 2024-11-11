/**
 * Benchmark for overhead of computationally expensive functions.
 *
 * Currently the effected version is around 100x (`fibPipe`) to 200x (`fibGen`) slower than the
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

import { Effected, effected } from ".";

const fib = (n: number): number => {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
};

const fibGen = (n: number): Effected<never, number> =>
  effected(function* () {
    if (n <= 1) return n;
    return (yield* fibGen(n - 1)) + (yield* fibGen(n - 2));
  });

const fibPipe = (n: number): Effected<never, number> => {
  if (n <= 1) return Effected.of(n);
  return fibPipe(n - 1).map((a) => fibPipe(n - 2).map((b) => a + b));
};

const fibEGen = (n: number): Effect.Effect<number, never, never> =>
  Effect.gen(function* () {
    if (n <= 1) return n;
    return (yield* fibEGen(n - 1)) + (yield* fibEGen(n - 2));
  });

const fibEPipe = (n: number): Effect.Effect<number, never, never> => {
  if (n <= 1) return Effect.succeed(n);
  return fibEPipe(n - 1).pipe(
    Effect.flatMap((a) => fibEPipe(n - 2).pipe(Effect.map((b) => a + b))),
  );
};

describe("fib(20)", () => {
  bench("fib(20)", () => void fib(20));
  bench("fibGen(20)", () => void fibGen(20).runSync());
  bench("fibPipe(20)", () => void fibPipe(20).runSync());
  bench("fibEGen(20)", () => void Effect.runSync(fibEGen(20)));
  bench("fibEPipe(20)", () => void Effect.runSync(fibEPipe(20)));
});

describe("fib(30)", () => {
  bench("fib(30)", () => void fib(30));
  bench("fibGen(30)", () => void fibGen(30).runSync());
  bench("fibPipe(30)", () => void fibPipe(30).runSync());
  bench("fibEGen(30)", () => void Effect.runSync(fibEGen(30)));
  bench("fibEPipe(30)", () => void Effect.runSync(fibEPipe(30)));
});
