// Characterization and proposed regression oracle for tinyeffect 0.3.4.
// Node 24.19.0; no dependencies, network access, or project writes.
// Run from a tinyeffect checkout:
// node scripts/repro-failure-and-cleanup.ts --expect current
// node scripts/repro-failure-and-cleanup.ts --expect proposed
// The proposed mode intentionally fails on the unmodified implementation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type { Effected as Program } from "../src/effected";
import type { Effect } from "../src/types";

// Ordinary JavaScript protocol controls; these do not exercise tinyeffect.
function runProtocolControls() {
  const original = new Error("original");
  const observations: object[] = [];
  for (const forwardsThrow of [false, true]) {
    let caught: unknown;
    const leaf: IterableIterator<string, undefined, unknown> = {
      next() {
        return { done: false, value: "wait" };
      },
      [Symbol.iterator]() {
        return this;
      },
      ...(forwardsThrow ?
        {
          throw(error: Error) {
            throw error;
          },
        }
      : {}),
    };
    const iterator = (function* () {
      try {
        yield* leaf;
      } catch (error) {
        caught = error;
      }
    })();
    iterator.next();
    iterator.throw(original);
    assert.equal(caught === original, forwardsThrow);
    assert.equal(caught instanceof TypeError, !forwardsThrow);
    observations.push({
      forwardsThrow,
      sameError: caught === original,
      caughtType: caught instanceof Error ? caught.name : typeof caught,
    });
  }

  for (const enteredBy of ["return", "normal-next"]) {
    for (const continuedBy of ["next", "return"]) {
      const events: string[] = [];
      const iterator = (function* (): Generator<string, string, unknown> {
        try {
          yield "body";
          return "body-result";
        } finally {
          events.push("cleanup:start");
          yield "cleanup:wait";
          events.push("cleanup:end");
        }
      })();
      iterator.next();
      const entered = enteredBy === "return" ? iterator.return("first-return") : iterator.next();
      assert.deepEqual(entered, { value: "cleanup:wait", done: false });
      const last = continuedBy === "next" ? iterator.next() : iterator.return("stop");
      assert.deepEqual(last, {
        value:
          continuedBy === "return" ? "stop"
          : enteredBy === "return" ? "first-return"
          : "body-result",
        done: true,
      });
      assert.deepEqual(
        events,
        continuedBy === "next" ? ["cleanup:start", "cleanup:end"] : ["cleanup:start"],
      );
      observations.push({ enteredBy, continuedBy, entered, last, events });
    }
  }
  {
    const events: string[] = [];
    const iterator = (function* (): Generator<string, void, unknown> {
      // eslint-disable-next-line sonarjs/no-labels, sonarjs/label-position -- A labeled break is the protocol case: finally overrides the first return.
      stop: {
        try {
          yield "body";
        } finally {
          // eslint-disable-next-line no-unsafe-finally -- This control deliberately overrides the requested return.
          break stop;
        }
      }
      events.push("ordinary-after-finally");
      yield "new-body-wait";
    })();
    iterator.next();
    const requested = iterator.return();
    assert.deepEqual(requested, { value: "new-body-wait", done: false });
    assert.deepEqual(events, ["ordinary-after-finally"]);
    const completed = iterator.next();
    assert.deepEqual(completed, { value: undefined, done: true });
    observations.push({ control: "finally overrides return", requested, completed, events });
  }
  return { passed: observations.length, total: observations.length, controls: observations };
}

const { values } = parseArgs({
  options: {
    project: { type: "string", default: process.cwd() },
    expect: { type: "string", default: "current" },
  },
});
assert.ok(["current", "proposed"].includes(values.expect));
const proposed = values.expect === "proposed";
const protocolControls = runProtocolControls();
const source = pathToFileURL(resolve(values.project, "src") + "/");
const files = ["effected.ts", "errors.ts", "types.js"];
const digest = (name: string) =>
  createHash("sha256")
    .update(readFileSync(new URL(name, source)))
    .digest("hex");
const before = Object.fromEntries(files.map((name) => [name, digest(name)]));
if (!proposed) {
  assert.equal(
    before["effected.ts"],
    "126944a8ac2810b389098dbc5376d201d5f1496db689911d66ae993d882f3f41",
  );
}
// This diagnostic uses Node 24 synchronous hooks; the repository pins Node 22.13 typings.
// Keep that newer capability local instead of changing the library's supported Node versions.
type ResolveContext = { parentURL?: string };
type ResolveResult = { url: string; format?: string; shortCircuit?: boolean };
type ResolveNext = (specifier: string, context: ResolveContext) => ResolveResult;
type SyncModuleHooks = {
  registerHooks(options: {
    resolve(specifier: string, context: ResolveContext, next: ResolveNext): ResolveResult;
  }): { deregister(): void };
};
const hooks = (nodeModule as unknown as SyncModuleHooks).registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith(source.href)) {
      for (const extension of [".ts", ".js"]) {
        const url = new URL(specifier + extension, context.parentURL);
        if (existsSync(url)) return next(url.href, context);
      }
    }
    return next(specifier, context);
  },
});
const { Effected, effect, effected, effectify } = (await import(
  new URL("effected.ts", source).href
)) as typeof import("../src/effected");
const tick = async () => {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
};
function gate() {
  let resolve!: (value?: unknown) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<unknown>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
type RunState = {
  status: "pending" | "fulfilled" | "rejected" | "synchronous-throw";
  value?: unknown;
  sameError?: boolean;
};

function watch(promise: Promise<unknown>, original: unknown): RunState {
  const state: RunState = { status: "pending" };
  void promise.then(
    (value) => Object.assign(state, { status: "fulfilled", value }),
    (error: unknown) => Object.assign(state, { status: "rejected", sameError: error === original }),
  );
  return state;
}
const unhandled: { reason: unknown; promise: Promise<unknown> }[] = [];
const onUnhandled = (reason: unknown, promise: Promise<unknown>) => {
  unhandled.push({ reason, promise });
};
process.on("unhandledRejection", onUnhandled);
const results: { name: string; passed: boolean; diagnostic?: string }[] = [];

async function check(name: string, action: () => Promise<object>) {
  try {
    const observation = await action();
    results.push({ name, passed: true, ...observation });
  } catch (error) {
    results.push({
      name,
      passed: false,
      diagnostic: error instanceof Error ? error.message : String(error),
    });
  }
}

try {
  await check("effectify rejection reaches the enclosing generator", async () => {
    const input = gate(),
      error = new Error("input"),
      events: string[] = [];
    const program = effected(function* () {
      try {
        return yield* effectify(input.promise);
      } catch (caught) {
        events.push(caught === error ? "catch:original" : "catch:other");
        return 7;
      } finally {
        events.push("finally");
      }
    });
    const state = watch(program.runAsync(), error);
    input.reject(error);
    await tick();
    assert.deepEqual(
      state,
      proposed ? { status: "fulfilled", value: 7 } : { status: "rejected", sameError: true },
    );
    assert.deepEqual(events, proposed ? ["catch:original", "finally"] : []);
    return { state, events };
  });

  for (const entry of ["default", "explicit"]) {
    await check(`${entry} generator handler recovers and awaits its finally`, async () => {
      const input = gate(),
        cleanup = gate(),
        error = new Error(entry),
        events: string[] = [];
      function* handler({ resume }: { resume: (value: unknown) => void }) {
        try {
          resume(yield* effectify(input.promise));
        } catch (caught) {
          events.push(caught === error ? "handler:catch:original" : "handler:catch:other");
          resume(7);
        } finally {
          events.push("handler:finally:start");
          yield* effectify(cleanup.promise);
          events.push("handler:finally:end");
        }
      }
      function programUsing<E extends Effect>(ask: () => Program<E, unknown>) {
        return effected(function* () {
          try {
            return yield* ask();
          } finally {
            events.push("program:finally");
          }
        });
      }
      const defaultAsk = effect<[], unknown>()("ask", { defaultHandler: handler });
      const explicitAsk = effect("ask")<[], unknown>;
      const publicPromise =
        entry === "default" ?
          programUsing(defaultAsk).runAsync()
        : programUsing(explicitAsk).handle("ask", handler).runAsync();
      const state = watch(publicPromise, error);
      input.reject(error);
      await tick();
      const beforeCleanup = { state: { ...state }, events: [...events] };
      cleanup.resolve();
      await tick();
      assert.deepEqual(
        beforeCleanup,
        proposed ?
          {
            state: { status: "pending" },
            events: ["handler:catch:original", "handler:finally:start"],
          }
        : { state: { status: "rejected", sameError: true }, events: [] },
      );
      assert.deepEqual(
        state,
        proposed ? { status: "fulfilled", value: 7 } : { status: "rejected", sameError: true },
      );
      assert.deepEqual(
        events,
        proposed ?
          [
            "handler:catch:original",
            "handler:finally:start",
            "handler:finally:end",
            "program:finally",
          ]
        : [],
      );
      return { beforeCleanup, final: { state, events } };
    });
  }

  await check("all delivers rejection to its owning child before choosing failure", async () => {
    const a = gate(),
      b = gate(),
      error = new Error("A"),
      events: string[] = [];
    const A = effected(function* () {
      try {
        return yield* effectify(a.promise);
      } catch (caught) {
        events.push(caught === error ? "A:catch:original" : "A:catch:other");
        return "recovered";
      } finally {
        events.push("A:finally");
      }
    });
    const B = effected(function* () {
      try {
        return yield* effectify(b.promise);
      } finally {
        events.push("B:finally");
      }
    });
    const state = watch(Effected.all([A, B]).runAsync(), error);
    a.reject(error);
    await tick();
    b.resolve("B");
    await tick();
    assert.deepEqual(
      state,
      proposed ?
        { status: "fulfilled", value: ["recovered", "B"] }
      : { status: "rejected", sameError: true },
    );
    assert.deepEqual(
      events,
      proposed ? ["A:catch:original", "A:finally", "B:finally"] : ["B:finally"],
    );
    return { state, events };
  });

  await check("all owns a callback registered before an initial sibling throw", async () => {
    const input = gate(),
      error = new Error("B initial throw"),
      events: string[] = [];
    const offset = unhandled.length;
    const A = effected(function* () {
      try {
        yield* effectify(input.promise);
        events.push("A:after");
      } finally {
        events.push("A:finally");
      }
    });
    // eslint-disable-next-line require-yield -- This generator deliberately fails on its first advancement.
    const B = effected(function* () {
      throw error;
    });
    const publicPromise = Effected.all([A, B]).runAsync();
    const state = watch(publicPromise, error);
    await tick();
    input.resolve();
    await tick();
    const late = unhandled.slice(offset).map(({ promise, reason }) => ({
      name: reason instanceof Error ? reason.name : typeof reason,
      message: reason instanceof Error ? reason.message : String(reason),
      isPublicPromise: promise === publicPromise,
    }));
    assert.deepEqual(state, { status: "rejected", sameError: true });
    assert.deepEqual(
      late,
      proposed ?
        []
      : [{ name: "TypeError", message: "recover is not a function", isPublicPromise: false }],
    );
    // The proposed cancellation contract also closes A; this assertion is separately exercised below.
    return { state, events, late };
  });

  await check(
    "runAsync returns a rejected Promise when an all iterator factory throws",
    async () => {
      const error = new Error("factory B"),
        events: string[] = [];
      const A = effected<never, string>(() => {
        events.push("A:created");
        return {
          next() {
            events.push("A:next");
            return { done: true, value: "A" };
          },
          return() {
            events.push("A:return");
            return { done: true, value: "closed" };
          },
        };
      });
      const B = effected<never, never>(() => {
        events.push("B:factory");
        throw error;
      });
      let state: RunState;
      try {
        state = watch(Effected.all([A, B]).runAsync(), error);
      } catch (caught) {
        state = { status: "synchronous-throw", sameError: caught === error };
      }
      await tick();
      assert.deepEqual(state, {
        status: proposed ? "rejected" : "synchronous-throw",
        sameError: true,
      });
      // Eager rollback versus lazy creation is a compatibility choice documented in the proposal.
      if (!proposed) assert.deepEqual(events, ["A:created", "B:factory"]);
      return { state, events };
    },
  );

  await check("all cancels siblings and drains cleanup before rejecting", async () => {
    const inputA = gate(),
      inputB = gate(),
      cleanup = gate(),
      error = new Error("A after await"),
      events: string[] = [];
    const A = effected(function* () {
      try {
        yield* effectify(inputA.promise);
        throw error;
      } finally {
        events.push("A:finally");
      }
    });
    const B = effected(function* () {
      try {
        yield* effectify(inputB.promise);
        events.push("B:after");
      } finally {
        events.push("B:finally:start");
        yield* effectify(cleanup.promise);
        events.push("B:finally:end");
      }
    });
    const state = watch(Effected.all([A, B]).runAsync(), error);
    inputA.resolve();
    await tick();
    const beforeCleanup = { state: { ...state }, events: [...events] };
    cleanup.resolve();
    await tick();
    const afterCleanup = { state: { ...state }, events: [...events] };
    inputB.resolve();
    await tick();
    assert.deepEqual(
      beforeCleanup,
      proposed ?
        { state: { status: "pending" }, events: ["A:finally", "B:finally:start"] }
      : { state: { status: "rejected", sameError: true }, events: ["A:finally"] },
    );
    assert.deepEqual(
      afterCleanup,
      proposed ?
        {
          state: { status: "rejected", sameError: true },
          events: ["A:finally", "B:finally:start", "B:finally:end"],
        }
      : { state: { status: "rejected", sameError: true }, events: ["A:finally"] },
    );
    assert.deepEqual(
      events,
      proposed ?
        ["A:finally", "B:finally:start", "B:finally:end"]
      : ["A:finally", "B:after", "B:finally:start", "B:finally:end"],
    );
    return { beforeCleanup, afterCleanup, final: { state, events } };
  });

  await tick();
  assert.deepEqual(Object.fromEntries(files.map((name) => [name, digest(name)])), before);
  console.log(
    JSON.stringify(
      {
        node: process.version,
        expectation: values.expect,
        sourceSha256: before,
        passed: results.filter((result) => result.passed).length,
        total: results.length,
        results,
        protocolControls,
        sourceUnchanged: true,
        unhandledCount: unhandled.length,
      },
      null,
      2,
    ),
  );
  if (results.some((result) => !result.passed)) process.exitCode = 1;
} finally {
  process.removeListener("unhandledRejection", onUnhandled);
  hooks.deregister();
}
