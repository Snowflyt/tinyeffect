# Route failures through their owners and finish the interleaving

Status: proposed fix for review. This draft contains a design and executable regression oracles.
It changes no library implementation. The proposed oracle currently fails all seven cases on the
baseline. Implementing the contract requires coordinated changes to the runner, iterator wrappers,
handler frames, and `Effected.all`.

Baseline: tinyeffect 0.3.4, commit `0a867fe930c86a2b16432581440468af0da1c129`.
The independent ready-index-zero repair is outside this proposal.

## Intended behavior

An `effectify` rejection resumes its own suspension exceptionally. The enclosing generator can catch
it, including a generator used as a handler. `Effected.all` waits for each child's terminal outcome;
a child that catches its rejection can still succeed. An unhandled child failure requests the other
children to stop, and the interleaving keeps driving them until they reach terminal outcomes.
Only then does the public Promise reject.

This is the direction of Koka's current `interleaved` implementation. A JavaScript adaptation must distinguish reaching a terminal outcome from shielding a finalizer
against cancellation. Native generator results do not identify whether execution is already inside a
`finally` block. A stronger protected-finalizer contract would require an explicit boundary; repeatedly
calling `return()` cannot supply one.

## What fails today

Run the standalone reproducer from the repository root using Node 24.19.0:

```sh
node scripts/repro-failure-and-cleanup.ts --expect current
node scripts/repro-failure-and-cleanup.ts --expect proposed
node scripts/repro-iterator-cleanup.ts
```

`--project /path/to/tinyeffect` selects another checkout. `current` verifies the baseline source hash
and passes when the current observations are reproduced. `proposed` asserts the intended behavior
and exits nonzero on the unchanged implementation. These are standalone diagnostics, outside the
ordinary test suite; a passing characterization run is not a passing fix.

The seven library cases use manually controlled in-memory Promises. They observe event-loop turns,
not network failures or real resource disposal:

1. A rejection inside `try { yield* effectify(input) } catch { return 7 }` rejects the public Promise;
   the local catch and finally do not run.
2. A default generator handler with the same local recovery cannot recover. Its finally is skipped,
   including an explicitly controlled asynchronous cleanup wait.
3. The same happens through explicit `.handle("ask", function* (...) { ... })`.
4. A rejected child of `all` cannot recover locally; a sibling can still finish afterward.
5. A child parks on `effectify`, then its sibling throws on the first advance. Fulfilling the parked
   input afterward produces `TypeError: recover is not a function` on a different Promise.
6. A later child iterator factory throws during `all` construction. `runAsync()` throws synchronously
   before returning a Promise, and an earlier created iterator receives neither `next` nor `return`.
7. After both children park, A resumes and throws. A's synchronous finally runs. The public Promise
   rejects while B remains parked. B later resumes ordinary work and only then runs its asynchronous
   finally. Under the proposal, B would instead begin closing immediately, and rejection would wait
   for B's cleanup gate.

Cases 2 and 3 deliberately use generator handlers. The public handler signatures admit `void`,
`Generator`, and `Effected`; bare `async` handlers return a Promise and are rejected by the recorded
TypeScript 6.0.3 strict check (TS2769 and TS2322). This proposal does not add Promise-returning handlers
or make the runner responsible for arbitrary detached Promises created by user code. In particular,
a README-style `promise.then(resume)` must explicitly bridge its rejection into the execution protocol.

The relevant baseline paths are [`all`, lines 446–555][tiny-all], [`handle`, lines 710–752][tiny-handle],
[`effectify`, lines 2515–2544][tiny-effectify], [`runAsync`, lines 2611–2700][tiny-runner], and
[`handleEffect`, lines 2827–2838][tiny-intercept]. Today the async rejection callback calls the outer
`reject` directly. Most library-owned iterator wrappers expose only `next`.

## Primary reference: Koka

This proposal was derived from the official `koka-lang/koka` development snapshot
`198fc3bbd158246e7604210ee6692ee72c2d9c50` (2026-10-15). The following is source analysis; the Koka
compiler and tests were not run. It is a pinned development implementation, not a claim about every
released Koka version.

- [`interleave.kk`, 106–140, 170–182, 278–301][koka-interleave]: each strand has a distinct terminal
  result. A failing strand cancels outstanding work; the scheduler continues receiving resumptions
  while its outstanding count is nonzero. The receive loop is outside the child cancellation scope.
  Successful results retain input order. For the all-results case, the first observed `Finalized`
  result is retained; it replaces cancellation, and later successful results do not replace it.
- [`channel.kk`, 105–113][koka-channel]: an intercepted await registers a callback that enqueues the
  captured resumption together with its outcome. Completion is retained even if the consumer is not
  currently waiting for it.
- [`async.kk`, 226–256][koka-async] and [`internal.kk`, 52–77][koka-internal]: each outstanding await has
  an owner scope, a result/cancellation/exception outcome, and a disposal function. Cancellation
  targets requests in that scope and its descendants. Setup failures re-enter the callback protocol.
- [`hnd.kk`, 485–499][koka-hnd] and [951–960][koka-unfinalize]: the runtime can distinguish final control transfer from
  resumable suspension, retain that transfer while a finalizer yields, and resume propagation later.
  This capability has no direct counterpart in a plain JavaScript `IteratorResult`. It establishes
  finalization-aware control flow, not blanket cancellation masking for every user finalizer.

The chosen reference is sufficiently close: it uses cooperative, single-shot resumptions, a queue,
owned requests, and a drain loop. Its scheduler can guide `all` directly. There is no need to substitute
Cats Effect 3, ZIO, or Effect as the primary design. Koka's compiler-supported finalization is the part
that requires an explicit JavaScript adaptation. The source also does not establish automatic shielding
for an already-running finalizer: the scope cancellation walks outstanding awaits, while
[`inline/hnd.js`, 267–280][koka-hnd-js] does not extend a final yield. Stronger shielding is a separate
contract, rather than something to assume from the presence of a drain loop.

One source-reading detail matters: the opening comment in this `interleave.kk` snapshot describes a
root-scope/parent-observer arrangement, whereas the executable function uses `cancelation-scope` and
places receiving outside that scope. The mapping above follows the executable function. It does not
infer a parent-cancellation guarantee from the older wording alone.

## Adaptation to tinyeffect

### 1. Preserve the operation, destination, and suspension identity

Replace the success-only wakeup path with a small internal completion record:

```ts
type Step =
  | { kind: "next"; value?: unknown }
  | { kind: "throw"; reason: unknown }
  | { kind: "return"; value?: unknown };

type Wakeup = {
  child: number;
  suspension: number;
  step: Step;
};
```

These are private implementation sketches. The final code can use tuples or direct fields if clearer.
Keep omission versus an explicit `undefined` where the existing iterator contract distinguishes them.
Nested `all` calls must preserve their scope/owner identity as well as the local child index.

A callback enqueues a result for its registered owner; it never calls the public Promise's `reject`
directly. Install the suspension record before registering a callback, since registration can complete
synchronously or throw. Guard it so completion and cancellation consume the registration at most once.
A late success or rejection is observed and ignored after consumption. It must neither revive the
child nor create an unhandled derived rejection. A simple queue removes the requirement that a
`recover` consumer already exist when a result arrives.
Check the suspension generation again when dequeuing a wakeup, not only when its callback enqueues it.
A sibling success may already be queued when another child fails. The proposed exit request invalidates
that queued body wakeup and schedules the child's close instead; cleanup uses fresh registrations.
This is a stronger cancellation choice than the pinned Koka implementation: there, a completed await
is removed from `outstanding` before its continuation is queued, and strand cancellation is checked
at initial start. Scope cancellation therefore does not by itself remove such an already-queued
successful resumption. Keep this adaptation explicit and test it.

The runner's guarded advance operation must cover iterator creation, `next`/`throw`/`return`, handler
invocation, async registration, and resumed execution. Iterators must not be advanced reentrantly;
a callback that fires during a pump adds to the queue for that pump. Normalize construction failure to
a rejected `runAsync` Promise. This fixes settlement boundaries, but does not by itself establish the
cleanup contract below.

### 2. Deliver rejection to the suspended computation

For `effectify(p)`, fulfillment continues with `next(value)` and rejection with `throw(reason)` at the
same await. Preserve the actual rejection value, including a non-Error value.

The leaf iterators created by `effect` and `effectify` must forward `throw` by throwing the same value
and become terminal; their `return` closes them. Every library-owned wrapper between that leaf and the
runner must propagate the operation to its active iterator. Audit `handle`, `resume`, `terminate`,
`map`, `flatMap`, `andThen`, `tap`, `zip`, `allSeq`, and the internal handler-result adapters together.
A `next`-only wrapper can break propagation even if the runner and leaf are correct.

A wrapper must also preserve the reason for completion. Closing a `flatMap` input must not start its
mapper; closing a `resume` adapter must not call `resume` as if the handler had succeeded. Normal
recovery from a thrown rejection can still return through ordinary success mapping. A mechanical
copy of each wrapper's `next` code into `return` would get this wrong.

For handlers, retain the parent frame and the exact performer awaiting that handler. First deliver a
rejection to the active handler generator. If it catches the rejection and calls `resume`, finish the
handler, including its yields in finally, then resume the performer. If it leaves the handler
uncaught, the proposed rule is to throw that failure into the performer's suspended effect call.
This lets an enclosing program catch an unsuccessful operation. Nested handler frames must unwind in
order. This is a compatibility change and depends on the separate handler-parent-frame repair.

### 3. Give `all` explicit child outcomes and keep the drain alive

Each child owns its iterator, its active handler frames, its current await registration, and a terminal
outcome. The interleaving owns the ready queue and a count of nonterminal children. Public Promise
settlement belongs to the enclosing runner.

A child input rejection is not yet an `all` failure: drive the child's `throw` operation first. Its
catch may recover, and its finally may suspend. Only an exception escaping the driven child is a
terminal failure. This also matches Koka's selection point: the first terminal finalized result
observed by the coordinator, rather than necessarily the earliest wall-clock input rejection.

On the first terminal failure:

1. Save the failure object/value as the selected outcome.
2. Request exit for every other nonterminal child and stop starting previously unstarted children.
3. Invalidate their pending body registrations and queued, unconsumed body wakeups. Continue to observe
   the input Promises, but ignore stale results for those registrations.
4. Keep the coordinator's queue and cleanup registrations live. Advance each closing child until
   `done: true` or an exception exits it. Decrement the count exactly once per child.
5. When the count reaches zero, reject with the selected failure. No further child code may execute
   from an old callback after this point.

Use a `closing` flag to prevent duplicate exit requests, not to claim cleanup is complete.
It cannot identify whether code yielded by the iterator after the exit request is cleanup code. The normal
case can remain a compact loop with per-child state; this design does not require a general public
fiber scheduler. Nested interleavings must close recursively and finish their drain before the outer
child is counted terminal.

Match Koka's error precedence initially: retain the first terminal failure, prefer a failure over a
canceled outcome, and never let sibling success overwrite failure. Await all sibling cleanup even
when cleanup also fails. Promise rejection identity stays equal to the selected error when there is
one. Secondary failures must be observed; adding an aggregate rejection or diagnostics hook is a
separate compatibility decision. The original error can already be replaced inside one native
`try/finally`; generic iterator driving cannot reconstruct an exception hidden by user code.

### 4. Adapt cancellation and finalization explicitly

Koka's `discontinue` is a final control effect, separate from ordinary exceptions. For a plain
JavaScript generator, a single `return()` is the closest exit request: it bypasses ordinary catch
clauses and enters applicable finally blocks. Continue a `done: false` result with the ordinary
`next`/`throw` result of the yielded operation. Do not issue `return()` again at each suspension. This is a deliberate adaptation:
Koka's `interleave-strand` calls `cancel-outstanding()` for each `Finalized` child (line 301), so a later
child failure can issue another scope cancellation and affect requests registered during cleanup.
The proposed JavaScript close driver instead requests `return` once per child and keeps driving that
close. It is stronger against repeated cancellation of that close, and must not be presented as an
exact copy of Koka's cancellation behavior.

There are two different cancellation promises:

- **Protocol-level closing:** one `return` request, followed by driving its yielded operations until
  it finishes. This is implementable for supported iterators and covers the proposed sibling-cleanup
  regression, where B was suspended in its body when cancellation arrived.
- **Protected finalization:** once a finalizer has started, external cancellation cannot interrupt it.
  This needs an explicit runtime-visible finalizer boundary, such as an `ensuring(finalizer)`
  combinator or a scoped cleanup registration. The final name/API remains open. The coordinator
  defers exit while that region runs, awaits its completion, then records the canceled outcome.

Native generator finally blocks alone cannot provide the second promise. A generator may naturally
enter finally and yield a cleanup await before another child fails. The _first_ subsequent `return`
can replace the pending completion and skip statements after that yield. The standalone protocol
controls reproduce this, as well as the repeated-return case. Calling `return` once per child solves
only the repeated-request problem.

A further native-generator limit is that finally can override the exit request itself. For example,
`finally { break enclosingLabel; }` can resume ordinary statements after that label even when entered
by `return()`. The protocol control script includes this case: the first `return` executes an
`ordinary-after-finally` marker and yields a new body wait. A generic driver cannot classify that yield
as body versus cleanup, so protocol-level closing means draining the requested exit to its observable
terminal outcome. It cannot guarantee that arbitrary user control flow performs no more ordinary work.
Such an iterator may also keep running indefinitely. Stale pre-cancellation callbacks still must not
resume the consumed body suspension.

Recommendation: implement protocol-level closing for existing generators and document its boundary.
Keep a stronger protected-finalizer API as an explicit follow-on decision if that resource guarantee
is wanted. Do not describe arbitrary native finally as cancellation-shielded. Even a protected finalizer can fail or never
complete; the enclosing Promise waits unless a separate, explicit abandonment policy is designed.

`effectify` accepts an existing Promise, which has no general cancellation operation. Canceling its
await means stopping the owned continuation and keeping late rejection observed. It does not stop
the external request or undo its side effects. Koka's disposer corresponds to a future optional
cancel-aware registration/adapter; do not guess an abort method from an arbitrary Promise.

### 5. Own setup failures and partially created children

Register ownership before advancing a child. Prefer constructing each child iterator when that child
is first scheduled, inside the same guarded path. Koka likewise checks cancellation before starting
another action. A failed factory then becomes that child's failure, prior children are drained, and
later child factories are not invoked merely to cancel them.

This changes the current eager-factory order. If eager construction is retained for compatibility,
`all` instead needs an explicit rollback ledger for every successfully created iterator, and must be
able to drain a custom iterator's asynchronous `return` result even if a later factory failed.
A native generator that has never been started does not execute its body/finally when returned;
resources allocated outside that body need their own disposal contract. Calling every created
iterator's `return` cannot manufacture such a contract.

## Compatibility choices to settle before implementation

1. Adopt local catch/recovery for `effectify` rejection. This changes a formerly terminal rejection
   into a possible successful result and makes previously skipped catch/finally code observable.
2. Adopt exceptional completion of a handler as a throw at the performer's effect call, or keep it as
   a fatal runner failure with a different cleanup-only unwind. The proposal recommends the former;
   a narrow settlement-only patch should not silently decide this.
3. Adopt sibling cancellation and cleanup-before-rejection for `all`. Existing siblings can currently
   continue ordinary work after failure. Slow cleanup will delay the public rejection.
4. Select the protected-finalizer API and its nesting/cancellation mask behavior. The initial
   protocol-level close promise is weaker for ordinary native finally and must remain explicit.
5. Keep Koka-style first observed terminal failure, or deliberately add aggregate errors. Specify how
   secondary cleanup failures remain inspectable if a diagnostic API is wanted.
6. Choose lazy iterator creation or preserve eager creation with rollback. Include custom iterables
   whose enumeration throws, custom factories, and already-completed children in the decision.
7. Decide whether this failure/cancellation work also changes successful `terminate(value)` cleanup.
   Do not conflate its chosen result with an unhandled failure or silently alter it in this patch.
8. Define the supported custom-iterator floor. Missing `throw`/`return` cannot promise the same
   behavior as a native generator or a fully forwarding library iterator.

## Minimal implementation sequence

1. Land independent runner settlement and handler-parent-frame corrections with their own narrow
   regressions. Keep their public claims limited to what they test.
2. Implement `next`/`throw`/`return` forwarding across library leaves and wrappers. Cover direct
   generator recovery, both handler entry points, nested handlers, combinator short-circuiting, and
   cleanup that yields more than once. Check `runSync` behavior when cleanup requests async work.
3. Replace `all`'s success-only wakeup with owned completion records and a queue. Add per-child terminal
   state, construction ownership, duplicate/stale callback guards, and nested scope routing. Re-run
   the independent ready-index-zero cases as preservation tests.
4. Add sibling exit and a surviving drain, following the Koka ownership structure. First establish
   the documented protocol-level close contract. Add protected finalizers only with their complete
   entry, natural completion, exceptional completion, nesting, and masking tests.
5. Convert the agreed proposed-oracle cases into ordinary Vitest regressions. Run the existing runtime
   and type suites, lint, formatting, and supported Node CI matrix. Check the documented success and
   failure semantics before treating this draft as a completed fix.

The implementation acceptance matrix must additionally include two simultaneous failures; A failing
while B already has a successful wakeup queued but unconsumed; failure
while another child is already naturally in finally; async cleanup failure; cleanup that never
settles; duplicate callbacks; late success and late rejection; nested `all`; object-shaped `all`;
empty input; factory and input-iterator failure; omitted values; and user-thrown non-Error values.
The included scripts establish seven current failures and seven ordinary JavaScript protocol controls;
they do not validate an implementation, arbitrary cancellation, or the full existing test suite.

[tiny-all]: https://github.com/Snowflyt/tinyeffect/blob/0a867fe930c86a2b16432581440468af0da1c129/src/effected.ts#L446-L555
[tiny-handle]: https://github.com/Snowflyt/tinyeffect/blob/0a867fe930c86a2b16432581440468af0da1c129/src/effected.ts#L710-L752
[tiny-effectify]: https://github.com/Snowflyt/tinyeffect/blob/0a867fe930c86a2b16432581440468af0da1c129/src/effected.ts#L2515-L2544
[tiny-runner]: https://github.com/Snowflyt/tinyeffect/blob/0a867fe930c86a2b16432581440468af0da1c129/src/effected.ts#L2611-L2700
[tiny-intercept]: https://github.com/Snowflyt/tinyeffect/blob/0a867fe930c86a2b16432581440468af0da1c129/src/effected.ts#L2827-L2838
[koka-interleave]: https://github.com/koka-lang/koka/blob/198fc3bbd158246e7604210ee6692ee72c2d9c50/lib/std/async/interleave.kk#L106-L301
[koka-channel]: https://github.com/koka-lang/koka/blob/198fc3bbd158246e7604210ee6692ee72c2d9c50/lib/std/async/channel.kk#L105-L113
[koka-async]: https://github.com/koka-lang/koka/blob/198fc3bbd158246e7604210ee6692ee72c2d9c50/lib/std/async/async.kk#L226-L256
[koka-internal]: https://github.com/koka-lang/koka/blob/198fc3bbd158246e7604210ee6692ee72c2d9c50/lib/std/async/internal.kk#L52-L77
[koka-hnd]: https://github.com/koka-lang/koka/blob/198fc3bbd158246e7604210ee6692ee72c2d9c50/lib/std/core/hnd.kk#L485-L499
[koka-unfinalize]: https://github.com/koka-lang/koka/blob/198fc3bbd158246e7604210ee6692ee72c2d9c50/lib/std/core/hnd.kk#L951-L960
[koka-hnd-js]: https://github.com/koka-lang/koka/blob/198fc3bbd158246e7604210ee6692ee72c2d9c50/lib/std/core/inline/hnd.js#L267-L280
