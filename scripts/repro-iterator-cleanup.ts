// Ordinary JavaScript protocol controls; these do not exercise tinyeffect.
import assert from "node:assert/strict";

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

console.log(
  JSON.stringify(
    { node: process.version, controls: observations, total: observations.length },
    null,
    2,
  ),
);
