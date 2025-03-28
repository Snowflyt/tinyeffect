<h1 align="center">tinyeffect</h1>

<p align="center">
<strong>Algebraic effects</strong>, in <strong>TypeScript</strong>.
</p>

<p align="center">
Handle side effects in a <strong>unified</strong> way, with <strong>type-safety</strong> and elegance.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tinyeffect">
    <img src="https://img.shields.io/npm/v/tinyeffect.svg" alt="npm version" height="18">
  </a>
  <a href="https://bundlephobia.com/package/tinyeffect">
    <img src="https://img.shields.io/bundlephobia/minzip/tinyeffect.svg" alt="minzipped size" height="18">
  </a>
  <a href="https://github.com/Snowflyt/tinyeffect/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/Snowflyt/tinyeffect/ci.yml?label=test" alt="test status" height="18">
  </a>
  <a href="https://coveralls.io/github/Snowflyt/tinyeffect?branch=main">
    <img src="https://coveralls.io/repos/github/Snowflyt/tinyeffect/badge.svg?branch=main" alt="coverage status" height="18">
  </a>
  <a href="https://github.com/Snowflyt/tinyeffect">
    <img src="https://img.shields.io/npm/l/tinyeffect.svg" alt="MIT license" height="18">
  </a>
</p>

![screenshot](./screenshot.svg)

## About

Programming heavily relies on **side effects**. Imagine a program without I/O capabilities (even basic console access) — it would be pretty useless.

There are many kinds of side effects: **I/O operations**, **error handling**, **dependency injection**, **asynchronous operations**, logging, and so on.

However, some effects don’t fit well with TypeScript’s type system — for example, error handling, where try-catch blocks only capture unknown types. Other effects, such as asynchronous operations, come with inherent challenges like asynchronous contagion.

That’s where tinyeffect comes in.

tinyeffect provides a **unified** way to handle _all_ these side effects in a **type-safe** manner. It’s a tiny yet powerful library with its core logic implemented in only around 400 lines of code. The idea is inspired by the effect system from the [Koka](https://koka-lang.github.io/koka/doc/book.html#why-handlers) language. It uses **algebraic effects** to model side effects, which are then handled by effect handlers.

_Don’t worry_ if you are not familiar with these concepts. tinyeffect is designed to be simple and easy to use. You can start using it right away without knowing the underlying theory. Simply start with the [Usage](#usage) section to see it in action.

## Installation

```shell
npm install tinyeffect
```

## Usage

Consider a simple example. Imagine a function that handles `POST /api/users` requests in a backend application. The function needs to:

- Retrieve the current logged-in user from the context.
- Check if the user has permission to create a new user (in this case, only admin users can create new users). If not, an error is thrown.
- If the user has the necessary permission, create a new user in the database.

This example demonstrates three types of side effects: dependency injection (retrieving the current user), error handling (checking permissions), and asynchronous operations (database operations). Here’s how these side effects can be handled using tinyeffect and TypeScript:

```typescript
import { dependency, effect, effected, error } from "tinyeffect";

type User = { id: number; name: string; role: "admin" | "user" };

const println = effect("println")<unknown[], void>;
const executeSQL = effect("executeSQL")<[sql: string, ...params: unknown[]], any>;
const askCurrentUser = dependency("currentUser")<User | null>;
const authenticationError = error("authentication");
const unauthorizedError = error("unauthorized");

const requiresAdmin = () => effected(function* () {
  const currentUser = yield* askCurrentUser();
  if (!currentUser) return yield* authenticationError();
  if (currentUser.role !== "admin")
    return yield* unauthorizedError(`User "${currentUser.name}" is not an admin`);
});

const createUser = (user: Omit<User, "id">) => effected(function* () {
  yield* requiresAdmin();
  const id = yield* executeSQL("INSERT INTO users (name) VALUES (?)", user.name);
  const savedUser: User = { id, ...user };
  yield* println("User created:", savedUser);
  return savedUser;
});
```

The code above defines five effects: `println`, `executeSQL`, `currentUser`, `authentication`, and `unauthorized`. Effects can be defined using `effect`, with `dependency` and `error` as wrappers for specific purposes.

You can define effected programs using the `effected` function together with a generator function. Inside the generator, simply write the program as if it were a normal synchronous one — just add some `yield*` where you perform effects or other effected programs.

Hovering over the `requiresAdmin` and `createUser` functions in your editor reveals their type signatures:

```typescript
const requiresAdmin: () => Effected<
  | Unresumable<Effect<"error:authentication", [message?: string], never>>
  | Effect<"dependency:currentUser", [], User | null>
  | Unresumable<Effect<"error:unauthorized", [message?: string], never>>,
  undefined
>;

const createUser: (
  user: Omit<User, "id">,
) => Effected<
  | Unresumable<Effect<"error:authentication", [message?: string], never>>
  | Effect<"dependency:currentUser", [], User | null>
  | Unresumable<Effect<"error:unauthorized", [message?: string], never>>
  | Effect<"executeSQL", [sql: string, ...params: unknown[]], any>
  | Effect<"println", unknown[], void>,
  User
>;
```

The inferred type signature shows which effects the program can perform and its return value. We’ll dive into the `Effect` type in detail later, but for now, let’s explore handling these effects:

```typescript
const alice: Omit<User, "id"> = { name: "Alice", role: "user" };

const handled = createUser(alice).handle("executeSQL", ({ resume }, sql, ...params) => {
  console.log(`Executing SQL: ${sql}`);
  console.log("Parameters:", params);
  resume(42);
});
```

We can invoke `.handle()` on an effected program to handle its effects. The first argument is the effect name, and the second is a handler function. The handler receives an object with two functions: `resume` and `terminate`, plus any parameters passed to the effect. You can use `resume` to continue the program with a value or `terminate` to halt and return a value immediately as the program’s result.

Since `createUser` is a function that _returns_ an effected program, we first need to invoke `createUser` with `alice` to obtain this program, which then allows us to call `.handle()` on it to handle its effects, such as `executeSQL`. Note that while `alice` is passed to `createUser`, the program itself still won’t execute at this point. Only after handling all effects will we use `.runSync()` or `.runAsync()` to actually execute it, which will be covered later.

Hovering over `handled` in your editor reveals its type signature:

```typescript
const handled: Effected<
  | Unresumable<Effect<"error:authentication", [message?: string], never>>
  | Effect<"dependency:currentUser", [], User | null>
  | Unresumable<Effect<"error:unauthorized", [message?: string], never>>
  | Effect<"println", unknown[], void>,
  User
>;
```

Let’s handle the rest of the effects.

```typescript
const handled = createUser(alice)
  .handle("executeSQL", ({ resume }, sql, ...params) => {
    console.log(`Executing SQL: ${sql}`);
    console.log("Parameters:", params);
    resume(42);
  })
  .handle("println", ({ resume }, ...args) => {
    console.log(...args);
    resume();
  })
  .handle("dependency:currentUser", ({ resume }) => {
    resume({ id: 1, name: "Charlie", role: "admin" });
  })
  .handle<"error:authentication", void>("error:authentication", ({ terminate }) => {
    console.error("Authentication error");
    terminate();
  })
  .handle<"error:unauthorized", void>("error:unauthorized", ({ terminate }) => {
    console.error("Unauthorized error");
    terminate();
  });
```

For error effects, we specify the return type (`void`) with a type argument for `.handle()` since `terminate` can end the program with any value, and TypeScript can’t infer this type automatically.

After handling all effects, the `handled` variable’s type signature becomes:

```typescript
const handled: Effected<never, void | User>;
```

We get `never` as the effect list because all effects have been handled. The return type becomes `void | User` because the program may terminate with `void` (due to terminate in error handlers) or return a `User` value.

Let’s run the program. Since all operations are synchronous in this example, we can use `.runSync()`:

```typescript
handled.runSync();
// Executing SQL: INSERT INTO users (name) VALUES (?)
// Parameters: [ 'Alice' ]
// User created: { id: 42, name: 'Alice', role: 'user' }
```

What happens if we don’t handle all the effects? Let’s remove some handlers, e.g., the `println` and `currentUser` handlers. Now TypeScript will give you an error:

```typescript
handled.runSync();
//      ~~~~~~~
// This expression is not callable.
//   Type 'UnhandledEffect<Effect<"dependency:currentUser", [], User | null> | Effect<"println", unknown[], void>>' has no call signatures.
```

If you ignore this compile-time error, you’ll still encounter a runtime error:

```typescript
handled.runSync();
// UnhandledEffectError: Unhandled effect: dependency:currentUser()
//     at runSync (...)
```

> [!TIP]
>
> You can access the unhandled effect by using the `.effect` property of the error object:
>
> ```typescript
> import { UnhandledEffectError } from "tinyeffect";
>
> try {
>   handled.runSync();
> } catch (e) {
>   if (e instanceof UnhandledEffectError) console.error(`Unhandled effect: ${e.effect.name}`);
> }
> ```

tinyeffect provides concise variants of `.handle()` to streamline effect handling. These include `.resume()` and `.terminate()`, which use the handler’s return value to resume or terminate the program, respectively. Special effects, like errors (names prefixed with `"error:"`) and dependencies (names prefixed with `"dependency:"`), use `.catch()`, `.provide()`, and `.provideBy()` for specialized handling.

Let’s see how we can rewrite the previous example using these variants:

```typescript
const handled = createUser(alice)
  .resume("executeSQL", (sql, ...params) => {
    console.log(`Executing SQL: ${sql}`);
    console.log("Parameters:", params);
    return 42;
  })
  .resume("println", console.log)
  .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
  .catch("authentication", () => console.error("Authentication error"))
  .catch("unauthorized", () => console.error("Unauthorized error"));
```

What about asynchronous operations? Typically, operations like `executeSQL` are asynchronous, as they involve I/O and wait for a result. In tinyeffect, synchronous and asynchronous operations are not distinguished, so you can simply call `resume` or `terminate` inside an asynchronous callback. Here’s how to handle an asynchronous operation:

```typescript
const handled = createUser(alice)
  .handle("executeSQL", ({ resume }, sql, ...params) => {
    console.log(`Executing SQL: ${sql}`);
    console.log("Parameters:", params);
    // Simulate async operation
    setTimeout(() => {
      console.log(`SQL executed`);
      resume(42);
    }, 100);
  })
  .resume("println", console.log)
  .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
  .catch("authentication", () => console.error("Authentication error"))
  .catch("unauthorized", () => console.error("Unauthorized error"));
```

You can then run the program using `.runAsync()`:

```typescript
await handled.runAsync();
// Executing SQL: INSERT INTO users (name) VALUES (?)
// Parameters: [ 'Alice' ]
// SQL executed
// User created: { id: 42, name: 'Alice', role: 'user' }
```

If you run an effected program with asynchronous operations using `.runSync()`, the program will throw an error:

```typescript
handled.runSync();
// Error: Cannot run an asynchronous effected program with `runSync`, use `runAsync` instead
//     at runSync (...)
```

Sadly, synchronous and asynchronous effected programs can’t be distinguished at compile-time, so running an asynchronous program with `.runSync()` won’t raise a compile-time error but may fail at runtime. In most cases, though, this shouldn’t be an issue: if you’re building an application with tinyeffect, you’re likely invoking `.runSync()` or `.runAsync()` only at the entry point, so there should be only a few places where you need to be careful about this.

> [!TIP]
>
> You can use `.runSyncUnsafe()` or `.runAsyncUnsafe()` to run the program without handling all effects. This is useful for testing environments, situations where unhandled effects are not a concern, or cases where you’re certain all effects are handled correctly but TypeScript hasn’t inferred the types as expected.

tinyeffect integrates seamlessly with common APIs that use async/await syntax. For example, say you’re using an API like `db.user.create(user: User): Promise<number>` to create a user in the database. You might want to write code like this:

```typescript
// prettier-ignore
const createUser = (user: Omit<User, "id">) => effected(function* () {
  yield* requiresAdmin();
  const id = await db.user.create(user);
  const savedUser: User = { id, ...user };
  yield* println("User created:", savedUser);
  return savedUser;
});
```

Since `await` cannot be used inside a generator function, you might instead create a special effect (e.g., `createUser`) and handle it later with `db.user.create.then(resume)`, though this approach can be awkward. To address this, tinyeffect provides `effectify`, a helper function that transforms a `Promise` into an effected program, allowing `yield*` in place of `await`:

```typescript
import { effectify } from "tinyeffect";

// prettier-ignore
const createUser = (user: Omit<User, "id">) => effected(function* () {
  yield* requiresAdmin();
  const id = yield* effectify(db.user.create(user));
  const savedUser = { id, ...user };
  yield* println("User created:", savedUser);
  return savedUser;
});
```

This knowledge is enough to get started with tinyeffect in your projects. For more advanced features, refer to the sections below. Now, let’s combine the code snippets above into a complete example to recap:

```typescript
import { dependency, effect, effected, error } from "tinyeffect";

type User = { id: number; name: string; role: "admin" | "user" };

const println = effect("println")<unknown[], void>;
const executeSQL = effect("executeSQL")<[sql: string, ...params: unknown[]], any>;
const askCurrentUser = dependency("currentUser")<User | null>;
const authenticationError = error("authentication");
const unauthorizedError = error("unauthorized");

const requiresAdmin = () =>
  effected(function* () {
    const currentUser = yield* askCurrentUser();
    if (!currentUser) return yield* authenticationError();
    if (currentUser.role !== "admin")
      return yield* unauthorizedError(`User "${currentUser.name}" is not an admin`);
  });

const createUser = (user: Omit<User, "id">) =>
  effected(function* () {
    yield* requiresAdmin();
    const id = yield* executeSQL("INSERT INTO users (name) VALUES (?)", user.name);
    const savedUser: User = { id, ...user };
    yield* println("User created:", savedUser);
    return savedUser;
  });

/* Example */
let sqlId = 1;

const program = effected(function* () {
  yield* createUser({ name: "Alice", role: "user" });
  yield* createUser({ name: "Bob", role: "admin" });
})
  .resume("println", (...args) => {
    console.log(...args);
  })
  .handle("executeSQL", ({ resume }, sql, ...params) => {
    console.log(`[${sqlId}] Executing SQL: ${sql}`);
    console.log(`[${sqlId}] Parameters: ${params.join(", ")}`);
    // Simulate async operation
    setTimeout(() => {
      console.log(`[${sqlId}] SQL executed`);
      sqlId++;
      resume(sqlId);
    }, 100);
  })
  .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
  .catch("authentication", () => {
    console.error("Authentication error");
  })
  .catch("unauthorized", () => {
    console.error("Unauthorized error");
  });

await program.runAsync();
```

After running the program, you should see the following output:

```text
[1] Executing SQL: INSERT INTO users (name) VALUES (?)
[1] Parameters: Alice
[1] SQL executed
User created: { id: 2, name: 'Alice', role: 'user' }
[2] Executing SQL: INSERT INTO users (name) VALUES (?)
[2] Parameters: Bob
[2] SQL executed
User created: { id: 3, name: 'Bob', role: 'admin' }
```

### The `Effect` type

tinyeffect is all around effects. The `Effect` type is the core type that represents an effect. The type itself is straightforward: the first parameter specifies the effect’s name, the second defines its parameters, and the third denotes its return type. Here’s how `Effect` is defined (a simplified version of the actual type signature):

```typescript
export interface Effect<
  out Name extends string | symbol = string | symbol,
  out Payloads extends unknown[] = unknown[],
  out R = unknown,
> {
  readonly name: Name;
  readonly payloads: Payloads;
  readonly __returnType: R;
}
```

At runtime, only `name` and `payloads` are present, while `__returnType` serves purely at the type level to infer the effect’s return type.

Using `yield*` with a factory function created by `effect` (or its variants) yields an `Effect` object. To understand how it works, let’s take a look at a simplified version of the `effect` function (and its variants) in JavaScript:

```typescript
function effect(name) {
  return function* (...payloads) {
    return yield { name, payloads };
  };
}

function error(name) {
  return function* (...payloads) {
    return yield { name: `error:${name}`, payloads, resumable: false };
  };
}

function dependency(name) {
  return function* () {
    return yield { name: `dependency:${name}`, payloads: [] };
  };
}
```

While the actual implementation of `effect` is more complex and returns a factory function that produces an `Effected` instance (instead of a generator function), the fundamental concept remains the same.

The mechanism of `.runSync()` and `.runAsync()` is also straightforward. These methods iterate through the generator function, and when encountering an `Effect` object, invoke the corresponding handler registered by `.handle()`. They then either resume or terminate the generator with the value passed to `resume` or `terminate`. The actual implementation is more complex, but the concept remains consistent.

> [!NOTE]
>
> Effect names are used to distinguish between different effects, so reusing the same name for different effects may cause conflicts:
>
> ```typescript
> const effectA = effect("foo");
> const programA = effected(function* () {
>   return yield* effectA();
> });
>
> const effectB = effect("foo"); // Same name as effectA
> const programB = effected(function* () {
>   return yield* effectB();
> });
>
> effected(function* () {
>   console.log(yield* programA);
>   console.log(yield* programB);
> })
>   .resume("foo", () => 42)
>   .runSync();
> // Will log 42 twice
> ```
>
> However, once an effect is handled, it’s “hidden” from the program, so the same name can be reused in different parts:
>
> ```typescript
> const effectA = effect("foo");
> const programA = effected(function* () {
>   return yield* effectA();
> }).resume("foo", () => 21);
>
> const effectB = effect("foo");
> const programB = effected(function* () {
>   return yield* effectB();
> });
>
> effected(function* () {
>   console.log(yield* programA);
>   console.log(yield* programB);
> })
>   .resume("foo", () => 42)
>   .runSync();
> // Will log 21 and 42 respectively
> ```
>
> You can also use symbols for effect names to avoid conflicts:
>
> ```typescript
> const nameA = Symbol("nameA");
> const effectA = effect(nameA);
> const programA = effected(function* () {
>   return yield* effectA();
> });
>
> const nameB = Symbol("nameB");
> const effectB = effect(nameB);
> const programB = effected(function* () {
>   return yield* effectB();
> });
>
> effected(function* () {
>   console.log(yield* programA);
>   console.log(yield* programB);
> })
>   .resume(nameA, () => 21)
>   .resume(nameB, () => 42)
>   .runSync();
> // Will log 21 and 42 respectively
> ```

#### Unresumable effects

You may notice there’re several kinds of effects: effects that never resume (like errors), effects that only resume (like dependencies and `println`), and effects that can either resume or terminate (we haven’t seen this kind of effect yet, such effects may not be very common, but are useful in some cases).

Apparently, for effects that never resume, you should only handle them with `terminate`. You can declare such effects using the `{ resumable: false }` option in the `effect` function, and TypeScript will enforce handling them with `terminate`. For example:

```typescript
const raise = effect("raise", { resumable: false })<[error: unknown], never>;
```

When you hover over the `raise` variable, you’ll see its `Effect` type is wrapped with `Unresumable`:

```typescript
const raise: (
  error: unknown,
) => Effected<Unresumable<Effect<"raise", [error: unknown], never>>, never>;
```

Attempting to handle an unresumable effect with `.resume()` will result in a TypeScript error:

```typescript
effected(function* () {
  yield* raise("Something went wrong");
}).resume("raise", console.error);
//        ~~~~~~~
// No overload matches this call.
//   ...
```

Ignoring this TypeScript error would still lead to a runtime error:

```typescript
effected(function* () {
  yield* raise("An error occurred");
})
  .resume("raise", console.error)
  .runSync();
// Error: Cannot resume non-resumable effect: raise("An error occurred")
//     at ...
```

#### Provide more readable type information

When an effected program involves multiple effects, its type signature can become lengthy and difficult to read. For example, let’s look again at the type signature of the `createUser` function:

```typescript
const createUser: (
  user: Omit<User, "id">,
) => Effected<
  | Unresumable<Effect<"error:authentication", [message?: string], never>>
  | Effect<"dependency:currentUser", [], User | null>
  | Unresumable<Effect<"error:unauthorized", [message?: string], never>>
  | Effect<"executeSQL", [sql: string, ...params: unknown[]], any>
  | Effect<"println", unknown[], void>,
  User
>;
```

You can make this signature much more readable by assigning names to these effects using the `Effect` type and `EffectFactory` helper type. Here’s how:

```typescript
import { dependency, effect, effected, error } from "tinyeffect";
import type { Effect, EffectFactory } from "tinyeffect";

type Println = Effect<"println", unknown[], void>;
const println: EffectFactory<Println> = effect("println");
type ExecuteSQL = Effect<"executeSQL", [sql: string, ...params: unknown[]], any>;
const executeSQL: EffectFactory<ExecuteSQL> = effect("executeSQL");
type CurrentUserDependency = Effect.Dependency<"currentUser", User | null>;
const askCurrentUser: EffectFactory<CurrentUserDependency> = dependency("currentUser")<User | null>;
type AuthenticationError = Effect.Error<"authentication">;
const authenticationError: EffectFactory<AuthenticationError> = error("authentication");
type UnauthorizedError = Effect.Error<"unauthorized">;
const unauthorizedError: EffectFactory<UnauthorizedError> = error("unauthorized");
```

Now, when you hover over the `createUser` function, you’ll see a much cleaner type signature:

```typescript
const createUser: (
  user: Omit<User, "id">,
) => Effected<
  | Unresumable<AuthenticationError>
  | CurrentUserDependency
  | Unresumable<UnauthorizedError>
  | ExecuteSQL
  | Println,
  User
>;
```

### A deep dive into `resume` and `terminate`

Let’s take a closer look at the `resume` and `terminate` functions. `resume` resumes the program with a given value, while `terminate` stops the program with a value immediately. Use `terminate` when you need to end the program early, such as when an error occurs, while `resume` is typically used to continue normal execution.

The difference might seem obvious, but in real-world cases, the behavior can sometimes surprising you. Consider this example (adapted from the [Koka documentation](https://koka-lang.github.io/koka/doc/book.html#sec-handling)):

```typescript
const raise = effect("raise")<[error: unknown], any>;

const safeDivide = (a: number, b: number) =>
  effected(function* () {
    if (b === 0) return yield* raise("Division by zero");
    return a / b;
  });

const program = effected(function* () {
  return 8 + (yield* safeDivide(1, 0));
}).terminate("raise", () => 42);
```

What would you expect the result of `program.runSync()` to be? The answer is `42` (not `50`). The `terminate` function immediately ends the program, so the `8 + ...` part is never executed.

Until now, we’ve used either `resume` or `terminate` within a handler, but it’s also possible to use both in a single handler. For example:

```typescript
type Iterate<T> = Effect<"iterate", [value: T], void>;
const iterate = <T>(value: T) => effect("iterate")<[value: T], void>(value);

const iterateOver = <T>(iterable: Iterable<T>): Effected<Iterate<T>, void> =>
  effected(function* () {
    for (const value of iterable) {
      yield* iterate(value);
    }
  });

let i = 0;
const program = iterateOver([1, 2, 3, 4, 5]).handle("iterate", ({ resume, terminate }, value) => {
  if (i++ >= 3) {
    // Too many iterations
    terminate();
    return;
  }
  console.log("Iterating over", value);
  resume();
});
```

In this example, `terminate` stops the program after iterating too many times (in this case, more than 3 times), while `resume` continues the loop. Running `program.runSync()` will produce the following output:

```text
Iterating over 1
Iterating over 2
Iterating over 3
```

> [!NOTE]
>
> Each handler should call `resume` or `terminate` exactly once. If a handler calls either function multiple times, only the first invocation will take effect, and subsequent calls will be ignored (a warning will appear in the console). If neither function is called, the program will hang indefinitely.

In this example, we also create a generic effect `Iterate` to iterate over an iterable:

```typescript
type Iterate<T> = Effect<"iterate", [value: T], void>;
const iterate = <T>(value: T) => effect("iterate")<[value: T], void>(value);
```

This might look complex at first, but it simply wraps the `effect` function to make it generic. `effect("iterate")` returns a generic factory function that produces an `Effected` instance, and we pass type arguments to specialize it, then call the function with a value to yield an `Effect` object.

### Handling effects with another effected program

When you’re working with a large application, you’ll soon encounter situations where handling an effect can introduce one or more new effects.

For example, consider the following program:

```typescript
type Ask<T> = Effect<"ask", [], T>;
const ask = <T>(): Effected<Ask<T>, T> => effect("ask")();

const double = (): Effected<Ask<number>, number> =>
  effected(function* () {
    return (yield* ask<number>()) + (yield* ask<number>());
  });
```

What if we want to use a random number to handle the `ask` effect? We could use `Math.random()`, but generating a random number is itself a side effect, so let’s define it as an effect as well:

```typescript
type Random = Effect<"random", [], number>;
const random: EffectFactory<Random> = effect("random");

const program = effected(function* () {
  return yield* double();
}).resume("ask", function* () {
  return yield* random();
});
```

As shown, when handling effects with other effects (or with other effected programs), you can use a _generator function_ as a handler. The `.handle()` method and its variants support generator functions, allowing you to use `yield*` inside handlers to perform additional effects.

Hovering over the `program` variable reveals its type signature:

```typescript
const program: Effected<Random, number>;
```

Here, the `Ask<number>` effect has been handled, but now the program has a new `Random` effect introduced by handling `ask` with `random`.

You can also “override” an effect by yielding the effect itself within the generator function. Consider this example (adapted from the [Koka documentation](https://koka-lang.github.io/koka/doc/book.html#sec-overriding-handlers)):

```typescript
type Emit = Effect<"emit", [msg: string], void>;
const emit: EffectFactory<Emit> = effect("emit");

const program = effected(function* () {
  yield* emit("hello");
  yield* emit("world");
})
  .resume("emit", (msg) => emit(`"${msg}"`))
  .resume("emit", console.log);
```

When you run `program.runSync()`, the output will be:

```text
"hello"
"world"
```

### Default handlers

Having to explicitly handle every effect can become tedious, especially for common effects like `println` or `random`. To address this, tinyeffect allows you to define default handlers that are automatically used when no specific handler is provided:

```typescript
const println = effect<unknown[], void>()("println", {
  defaultHandler: ({ resume }, ...args) => {
    console.log(...args);
    resume();
  },
});

const program = effected(function* () {
  yield* println("Hello, world!");
});
program.runSync(); // No compile-time or runtime error
// Hello, world!
```

Note the syntax difference when defining effects with default handlers. Instead of using `effect(name, options)<Parameters, ReturnType>`, we use `effect<Parameters, ReturnType, TerminatedType = never>()(name, options)`—do not forget the empty parentheses after `effect`. This difference exists because the type arguments are needed to accurately infer the handler’s type.

For better type clarity, you can use the `Effect` type and `EffectFactory` helper:

```typescript
import { type Default, type Effect, type EffectFactory, effect } from "tinyeffect";

type Println = Default<Effect<"println", unknown[], void>>;
const println: EffectFactory<Println> = effect("println", {
  defaultHandler: ({ resume }, ...args) => {
    console.log(...args);
    resume();
  },
});
```

Default handlers don’t prevent you from explicitly handling these effects. When you provide your own handler, it takes precedence over the default:

```typescript
const program = effected(function* () {
  yield* println("Hello, world!");
}).resume("println", () => {
  console.log("This will be logged instead of the default handler");
});

program.runSync();
// This will be logged instead of the default handler
```

Just like regular handlers, default handlers can also be generator functions or return effected programs, letting you handle effects using other effects.

The `dependency` helper also supports default handlers. You can provide a factory function as the second argument, which returns a default value when no explicit provider is given:

```typescript
const askCurrentUser = dependency<User | null>()("currentUser", () => ({
  id: 1,
  name: "Charlie",
  role: "admin",
}));
```

Besides, it is worth noting that the `Default` type signature may appear more complex than expected:

```typescript
type Default<E extends Effect, T = never, F extends Effect = never> = ...
```

Here, `E` represents the effect type, `T` is the terminate type (used if `terminate` is called in the default handler), and `F` represents any additional effects that might be performed by the default handler (when using a generator function or returning another effected program).

> [!NOTE]
>
> Default handlers technically support `terminate`, but this is not recommended since it always terminates the entire effected program (the `Effected` instance) with a specific value, which is usually unexpected behavior. It’s better to use `resume` in default handlers to allow the program to continue executing. If you want to terminate the program, it’s preferable to explicitly handle the effect with `.terminate()` rather than relying on a default handler.

### Chaining effected programs with `.andThen()` and `.tap()`

Sometimes, you may want to transform a program’s return value, or chain another effected program after the current one. Let’s revisit the `safeDivide` example:

```typescript
type Raise = Unresumable<Effect<"raise", [error: unknown], never>>;
const raise: EffectFactory<Raise> = effect("raise", { resumable: false });

const safeDivide = (a: number, b: number): Effected<Raise, number> =>
  effected(function* () {
    if (b === 0) return yield* raise("Division by zero");
    return a / b;
  });
```

Now, suppose we have a type `Option` to represent a value that may or may not exist:

```typescript
type Option<T> = { kind: "some"; value: T } | { kind: "none" };

const some = <T>(value: T): Option<T> => ({ kind: "some", value });
const none: Option<never> = { kind: "none" };
```

We want to transform the return value of `safeDivide` into an `Option` type: if `safeDivide` returns a value normally, we return `some(value)`, otherwise, we return `none` (if the raise effect is triggered). This can be achieved with the `.andThen()` method:

```typescript
const safeDivide2 = (a: number, b: number): Effected<never, Option<number>> =>
  safeDivide(a, b)
    .andThen((value) => some(value))
    .terminate("raise", () => none);
```

Now, running `safeDivide2(1, 0).runSync()` will return `none`, while `safeDivide2(1, 2).runSync()` will return `some(0.5)`.

Similar to most other methods in tinyeffect, `.andThen()` can also be used with a generator function to chain another effected program, which can be incredibly useful in many scenarios. We’ll see many more examples of this in the following sections.

Besides `.andThen(handler)`, the `.tap(handler)` method offers a useful alternative when you want to execute side effects without altering the return value. Unlike `.andThen()`, `.tap()` ignores the return value of the handler function, ensuring the original value is preserved. This makes it ideal for operations like logging, where the action doesn’t modify the main data flow.

For instance, you can use `.tap()` to simulate a `defer` effect similar to Go’s `defer` statement:

```typescript
type Defer = Effect<"defer", [fn: () => void], void>;
const defer: EffectFactory<Defer> = effect("defer");

const deferHandler = defineHandlerFor<Defer>().with((self) => {
  const deferredActions: Array<() => void> = [];

  return self
    .resume("defer", (fn) => {
      deferredActions.push(fn);
    })
    .tap(() => {
      deferredActions.forEach((fn) => fn());
    });
});

const program = effected(function* () {
  yield* defer(() => console.log("Deferred action"));
  console.log("Normal action");
}).with(deferHandler);
```

When you run `program.runSync()`, you’ll see the following output:

```text
Normal action
Deferred action
```

### Handling multiple effects in one handler

Imagine we have the following setup:

```typescript
type Logging =
  | Effect<"logging:log", unknown[], void>
  | Effect<"logging:warn", unknown[], void>
  | Effect<"logging:error", unknown[], void>;
const logger = {
  log: effect("logging:log")<unknown[], void>,
  warn: effect("logging:warn")<unknown[], void>,
  error: effect("logging:error")<unknown[], void>,
};

type ReadFile = Effect<"readFile", [path: string], string>;
const readFile: EffectFactory<ReadFile> = effect("readFile");

interface Settings {
  /* ... */
}

const defaultSettings: Settings = {
  /* ... */
};

const readSettings = (path: string): Effected<Logging | ReadFile, Settings> =>
  effected(function* () {
    const content = yield* readFile(path);
    try {
      const settings = JSON.parse(content);
      yield* logger.log("Settings loaded");
      return settings;
    } catch (e) {
      yield* logger.error("Failed to parse settings file:", e);
      return defaultSettings;
    }
  });
```

The `readSettings` function reads a JSON file, parses it, and returns the settings. If parsing fails, it logs an error and returns the default settings.

If you want to skip logging effects altogether, handling each one individually can be tedious. Instead of specifying an effect name for each `.handle()` method, you can use a type guard function to handle multiple effects at once. For example:

```typescript
const readSettingsWithoutLogging = (path: string) =>
  readSettings(path).resume(
    (name): name is Logging["name"] => name.startsWith("logging:"),
    () => {
      // Omit logging
    },
  );
```

Hovering over `readSettingsWithoutLogging` will show its type signature:

```typescript
const readSettingsWithoutLogging: (path: string) => Effected<ReadFile, Settings>;
```

Another useful case for this approach is wrapping all error effects in a `Result` type, similar to `Result` in Rust or `Either` in Haskell. Here’s how to define a Rust-like `Result` type in TypeScript:

```typescript
type Result<T, E> = { kind: "ok"; value: T } | { kind: "err"; error: E };

const ok = <T>(value: T): Result<T, never> => ({ kind: "ok", value });
const err = <E>(error: E): Result<never, E> => ({ kind: "err", error });
```

Assume you have an effected program that may throw different types of errors:

```typescript
type TypeError = Effect.Error<"type">;
const typeError: EffectFactory<TypeError> = error("type");
type RangeError = Effect.Error<"range">;
const rangeError: EffectFactory<RangeError> = error("range");

type Log = Effect<"println", unknown[], void>;
const log: EffectFactory<Log> = effect("println");

const range = (start: number, stop: number): Effected<TypeError | RangeError | Log, number[]> =>
  effected(function* () {
    if (start >= stop) return yield* rangeError("Start must be less than stop");
    if (!Number.isInteger(start) || !Number.isInteger(stop))
      return yield* typeError("Start and stop must be integers");
    yield* log(`Generating range from ${start} to ${stop}`);
    return Array.from({ length: stop - start }, (_, i) => start + i);
  });
```

Instead of using individual error effects, you can convert them into a `Result` type. A helper function makes this transformation easy:

```typescript
const handleErrorAsResult = <R, E extends Effect, ErrorName extends string>(
  self: Effected<Effect.Error<ErrorName> | E, R>,
): Effected<E, Result<R, { error: ErrorName; message?: string }>> => {
  const isErrorEffect = (name: string | symbol): name is `error:${ErrorName}` => {
    if (typeof name === "symbol") return false;
    return name.startsWith("error:");
  };

  return self
    .andThen((value) => ok(value))
    .handle(isErrorEffect, (({ effect, terminate }: any, message: any) => {
      terminate(err({ error: effect.name.slice("error:".length), message }));
    }) as never) as Effected<E, Result<R, { error: ErrorName; message?: string }>>;
};
```

One detail we haven’t mentioned earlier is that, aside from `resume` and `terminate`, the object passed as the first argument to the `.handle()` method also includes the effect object itself, giving you direct access to the effect’s name and payloads. In the `handleErrorAsResult` function, we use this feature to extract the error name from the effect name.

Then simply wrap the `range` function with `handleErrorAsResult`:

```typescript
const range2 = (start: number, stop: number) => handleErrorAsResult(range(start, stop));
```

Now, when you hover over the `range2` function, you’ll see this type signature:

```typescript
const range2: (
  start: number,
  stop: number,
) => Effected<Log, Result<number[], { error: "type" | "range"; message?: string }>>;
```

The `handleErrorAsResult` helper function shown above is mainly for illustration — tinyeffect actually provides a built-in `.catchAll()` method on `Effected` instances, which lets you handle all error effects at once. Here’s how it works:

```typescript
const range3 = (start: number, stop: number) =>
  range(start, stop)
    .andThen((value) => ok(value))
    .catchAll((error, message) => err({ error, message }));
```

The `.catchAll()` method takes a function that receives the error effect name and message, and returns a new value. `range3` behaves the same as `range2`, with an identical type signature.

### Handling error effects

With side effects, including errors, now handled in a unified way, you may wonder where `try-catch` fits in. The answer is simple: it’s no longer needed. Errors are just effects, so you can handle specific ones with `.catch()` and let others bubble up to higher-level handlers.

For example, suppose your program accepts a JSON string to define settings. You use `JSON.parse` to parse it, but if the JSON is invalid, instead of throwing an error, you want to print a warning and fall back on a default setting. Here’s how to do it:

```typescript
type SyntaxError = Effect.Error<"syntax">;
const syntaxError: EffectFactory<SyntaxError> = error("syntax");
// For other unexpected errors, we use an unresumable effect "raise" to terminate the program
type Raise = Unresumable<Effect<"raise", [error: unknown], never>>;
const raise: EffectFactory<Raise> = effect("raise", { resumable: false });

const parseJSON = <T>(json: string): Effected<SyntaxError | Raise, T> =>
  effected(function* () {
    try {
      return JSON.parse(json);
    } catch (e) {
      if (e instanceof SyntaxError) return yield* syntaxError(e.message);
      return yield* raise(e);
    }
  });

interface Settings {
  /* ... */
}

const defaultSettings: Settings = {
  /* ... */
};

const readSettings = (json: string) =>
  effected(function* () {
    const settings = yield* parseJSON<Settings>(json).catch("syntax", (message) => {
      console.error(`Invalid JSON: ${message}`);
      return defaultSettings;
    });
    /* ... */
  });
```

As shown in the previous section, you can also use `.catchAll()` to catch all error effects at once, which is useful if you want a unified response to all errors. For instance:

```typescript
const tolerantRange = (start: number, stop: number): Effected<Log, number[]> =>
  range(start, stop).catchAll((error, message) => {
    console.warn(`Error(${error}): ${message || ""}`);
    return [];
  });
```

Running `tolerantRange(4, 1).resume("log", console.log).runSync()` will output `[]`, with a warning message printed to the console:

```text
Error(range): Start must be less than stop
```

If you prefer some errors to raise exceptions instead of handling them within your effects system, you can use the `.catchAndThrow(error, message?)` method:

```typescript
// Throws "type" error effect as an exception with its original message
const range2 = (start: number, stop: number) => range(start, stop).catchAndThrow("type");

// Throws "type" error effect with a custom message
const range3 = (start: number, stop: number) =>
  range(start, stop).catchAndThrow("type", "Invalid start or stop value");

// Throws "range" error effect with a customized message based on the error
const range4 = (start: number, stop: number) =>
  range(start, stop).catchAndThrow("range", (message) => `Invalid range: ${message}`);
```

For example, running `range2(1.5, 2).catch("range", () => {}).resume("log", console.log).runSync()` will throw an exception with the message “Start and stop must be integers”.

To throw all error effects as exceptions, you can use `.catchAllAndThrow(message?)`:

```typescript
const range2 = (start: number, stop: number) => range(start, stop).catchAllAndThrow();

const range3 = (start: number, stop: number) =>
  range(start, stop).catchAllAndThrow("An error occurred while generating the range");

const range4 = (start: number, stop: number) =>
  range(start, stop).catchAllAndThrow((error, message) => `Error(${error}): ${message}`);
```

### Abstracting/combining handlers

Not all effects are totally independent from each other; sometimes, you may want to “group” effects that are closely related. A pair of getters and setters for global state is a good example (from the [Koka documentation](https://koka-lang.github.io/koka/doc/book.html#sec-return)):

```typescript
const getState = <T>() => effect("getState")<[], T>();
const setState = <T>(value: T) => effect("setState")<[value: T], void>();
```

To group these together, we could define them as:

```typescript
type State<T> = Effect<"state.get", [], T> | Effect<"state.set", [value: T], void>;
const state = {
  get: <T>(): Effected<State<T>, T> => effect("state.get")<[], T>(),
  set: <T>(value: T): Effected<State<T>, void> => effect("state.set")<[value: T], void>(value),
};
```

Using these state effects looks like this:

```typescript
const sumDown = (sum: number = 0): Effected<State<number>, number> =>
  effected(function* () {
    const n = yield* state.get<number>();
    if (n <= 0) return sum;
    yield* state.set(n - 1);
    return yield* sumDown(sum + n);
  });

let n = 10;
const program = sumDown()
  .resume("state.get", () => n)
  .resume("state.set", (value) => {
    n = value;
  });
```

Running `program.runSync()` returns `55`, which is the sum of the first `10` natural numbers.

Just grouping the effects together is easy, but we still have to handle them one by one. To make it easier, we can create a helper function to abstract out the handlers:

```javascript
const stateHandler =
  ({ get, set }) =>
  (self) =>
    self.resume("state.get", get).resume("state.set", set);

stateHandler({ get: () => n, set: (x) => (n = x) })(sumDown()).runSync();
```

For simplicity, this example is in JavaScript, focusing on the concept. Here, `stateHandler` is a higher-order function that accepts handler methods and returns a function to apply them to an effected program.

The main challenge lies in defining the correct type signature for the `stateHandler` function. Due to certain limitations in TypeScript, it can be tricky to annotate `stateHandler` in a way that reliably covers all edge cases.

Fortunately, tinyeffect performs some type-level magic and provides a helper function, `defineHandlerFor`, which you can use with the `.with()` method to define handlers for one or more effects. Here’s how it works:

```typescript
import { defineHandlerFor } from "tinyeffect";

const stateHandler = <T>({ get, set }: { get: () => T; set: (x: T) => void }) =>
  defineHandlerFor<State<T>>().with((self) =>
    self.resume("state.get", get).resume("state.set", set),
  );

let n = 10;
const program = sumDown().with(stateHandler({ get: () => n, set: (x) => (n = x) }));
```

`defineHandlerFor<...>().with(...)` simply returns your function at runtime, and the `.with(handler)` method applies the handler to the effected program. This keeps the runtime logic identical to previous implementations, while TypeScript infers the correct type signature for the handler.

Hovering over `stateHandler` shows its type signature:

```typescript
const stateHandler: <T>({
  get,
  set,
}: {
  get: () => T;
  set: (x: T) => void;
}) => <R>(self: EffectedDraft<State<T>, State<T>, R>) => EffectedDraft<State<T>, never, R>;
```

The `EffectedDraft` type is used internally by tinyeffect to achieve precise type inference.

Let’s revisit the `safeDivide` example we defined earlier:

```typescript
type Raise = Unresumable<Effect<"raise", [error: unknown], never>>;
const raise: EffectFactory<Raise> = effect("raise", { resumable: false });

const safeDivide = (a: number, b: number): Effected<Raise, number> =>
  effected(function* () {
    if (b === 0) return yield* raise("Division by zero");
    return a / b;
  });
```

and the `Option` type:

```typescript
type Option<T> = { kind: "some"; value: T } | { kind: "none" };

const some = <T>(value: T): Option<T> => ({ kind: "some", value });
const none: Option<never> = { kind: "none" };
```

In previous examples, we used `.andThen()` and `.terminate()` to transform the return value of `safeDivide` to an `Option` type. Now, we can abstract this logic into a reusable handler:

```typescript
const raiseOption = defineHandlerFor<Raise>().with((self) =>
  self.andThen((value) => some(value)).terminate("raise", () => none),
);

const safeDivide2 = (a: number, b: number) => safeDivide(a, b).with(raiseOption);
```

Hovering over `safeDivide2` reveals this type signature:

```typescript
const safeDivide2: (a: number, b: number) => Effected<never, Option<number>>;
```

For more complex cases where `defineHandlerFor` isn’t sufficient, you can still define a function that takes an effected program and returns another one as a custom “handler” function, then pass it to the `.with(handler)` method. A good example of this is the `handleErrorAsResult` function we defined earlier:

```typescript
// Both definitions below are equivalent
const range = (start: number, stop: number) => range(start, stop).with(handleErrorAsResult);
const range = (start: number, stop: number) => handleErrorAsResult(range(start, stop));
```

### Parallel execution with `Effected.all`

When working with asynchronous effects, you frequently need to combine multiple operations. While generator syntax excels at expressing sequential code, it doesn’t provide a native way to run effects in parallel using `yield*`. To address this, tinyeffect offers two complementary methods for handling multiple effected programs:

- `Effected.all()`: Executes effected programs in parallel (concurrently)
- `Effected.allSeq()`: Executes effected programs sequentially (one after another), equivalent to running them individually with `yield*`.

It’s worth noting that when all effected programs are synchronous, `Effected.all()` and `Effected.allSeq()` produce identical results. The difference becomes significant when dealing with time-consuming operations:

```typescript
const fetchUserData = (userId: number) =>
  effected(function* () {
    yield* log(`Fetching user ${userId}`);
    const data = yield* httpGet(`/api/users/${userId}`);
    return data;
  });

// Sequential execution - total time is the sum of all operations
const sequentialFetch = Effected.allSeq([fetchUserData(1), fetchUserData(2), fetchUserData(3)]); // Takes ~300ms if each fetch takes ~100ms

// Parallel execution - total time is close to the slowest operation
const parallelFetch = Effected.all([fetchUserData(1), fetchUserData(2), fetchUserData(3)]); // Takes ~100ms because all fetches run concurrently
```

Both methods accept either an iterable of effected programs or an object with named effected programs:

```typescript
// Iterable syntax - results will be an array
const users = await Effected.all([fetchUser(1), fetchUser(2), fetchUser(3)]).runAsync();
// users: [User, User, User]

// Object syntax - results maintain property names
const userData = await Effected.all({
  user: fetchUser(userId),
  posts: fetchUserPosts(userId),
  settings: fetchUserSettings(userId),
}).runAsync();
// userData: { user: User, posts: Post[], settings: Settings }
```

You can mix synchronous and asynchronous effects, and `Effected.all` will handle them efficiently:

```typescript
const compute = effect("compute")<[label: string, delay: number], number>;
const calculate = effect("calculate")<[a: number, b: number], number>;

// Create a mix of sync and async tasks
const program = effected(function* () {
  const results = yield* Effected.all([
    // Sync task
    calculate(10, 5),
    // Fast async task
    compute("fast task", 50),
    // Slow async task
    compute("slow task", 150),
  ]);
  console.log("Results:", results);
})
  .resume("calculate", (a, b) => a + b)
  .handle("compute", ({ resume }, label, delay) => {
    console.log(`Starting ${label}`);
    setTimeout(() => {
      console.log(`Completed ${label}`);
      resume(delay);
    }, delay);
  });

// Results will be [15, 50, 150]
// Total execution time will be ~150ms (the slowest task)
```

When should you choose sequential execution with `Effected.allSeq`? Consider using it when:

1. Operations must happen in a specific order.
2. Later operations depend on earlier ones.
3. You need to limit resource usage by preventing concurrent operations.

```typescript
// Use sequential execution when operations must happen in order
const processData = Effected.allSeq([
  setupDatabase(),
  migrateSchema(),
  importData(),
  validateData(),
]);

// The equivalent generator syntax
const processData = effected(function* () {
  yield* setupDatabase();
  yield* migrateSchema();
  yield* importData();
  yield* validateData();
});
```

For most other cases, it is recommended to use `Effected.all` over `Effected.allSeq`, since it is more efficient and easier to read.

### Effects without generators (Pipeline syntax)

The fundamental logic of tinyeffect is _not_ dependent on generators. An effected program (represented as an `Effected` instance) is essentially an iterable object that implements a `[Symbol.iterator](): Iterator<Effect>` method.

Although using the `effected` helper function with generators allows you to write more imperative-style code using `yield*` to manage effects, this is not the only approach. tinyeffect offers an alternative pipeline-style API for transforming and combining effected programs. At the heart of this API is the `.andThen()` method, which serves as the primary way to transform and chain effected programs.

While we've covered `.andThen()` in previous sections, we haven’t yet explored how it can be used in a more functional, pipeline-style manner. The `.andThen(handler)` method is quite versatile and can be used in several ways:

While we have covered `.andThen()` in previous sections, we haven’t yet explored how it can be used in a more functional, pipeline-style manner. Actually, `.andThen(handler)` is quite versatile and can be used in a variety of ways:

- Transform a result using a pure function.
- Chain another effected program.
- Work with generators that yield effects.

Let’s rewrite the `createUser` example using the pipeline syntax:

```typescript
const createUser = (user: Omit<User, "id">) =>
  requiresAdmin()
    .andThen(() =>
      executeSQL("INSERT INTO users (name) VALUES (?)", user.name)
        .andThen((id) => ({ id, ...user } as User)),
    )
    .tap((savedUser) => println("User created:", savedUser));
```

A helpful way to understand this code is to think of `Effected` as a container for a delayed computation (or _monad_, if you come from a functional programming background). The `Effected` instance itself doesn’t perform any computation; it only represents a sequence of effects that will be executed when you call `.runSync()` or `.runAsync()`.

You can compare `Effected` with `Promise` in JavaScript. Just like `Promise.prototype.then(handler)` allows you to chain multiple promises together, `Effected.prototype.andThen(handler)` allows you to chain multiple effected programs together. If a handler returns a generator or another effected program, it will be automatically flattened, similar to how `Promise.prototype.then()` works in JavaScript.

To create effects without generators, tinyeffect provides two foundational methods. `Effected.of(value)` creates an effected program that immediately resolves to the given value without performing any effects — similar to `Promise.resolve(value)`. `Effected.from(() => value)` allows you to execute a function lazily when the program is run. These are useful as starting points for pipeline-style code:

```typescript
// Create an effected program that resolves to "Hello, world!"
const program1 = Effected.of("Hello, world!")
  .tap((message) => println(message))
  .andThen((message) => message.toUpperCase());

// Create an effected program that executes the function when run
const program2 = Effected.from(() => {
  console.log("Computing value...");
  return Math.random() * 100;
}).andThen((value) => println(`Random value: ${value}`));
```

When you need more explicit control, tinyeffect offers `.map()` and `.flatMap()`. The `.map()` method transforms a result without introducing new effects, while `.flatMap()` expects the handler to return another effected program:

```typescript
const createUser = (user: Omit<User, "id">) =>
  requiresAdmin()
    .flatMap(() =>
      executeSQL("INSERT INTO users (name) VALUES (?)", user.name)
        .map((id) => ({ id, ...user } as User)),
    )
    .tap((savedUser) => println("User created:", savedUser));
```

For the common case of replacing a result with a constant value, use the `.as(value)` method as a shorthand for `.map(() => value)`:

```typescript
Effected.of(42).as("Hello, world!").runSync(); // => "Hello, world!"
// You can also use `.asVoid()` as a shortcut for `.as(undefined)`
Effected.of(42).asVoid().runSync(); // => undefined
```

In most cases, `.andThen()` is recommended over `.map()` and `.flatMap()` for its versatility and readability. A myth is that `.flatMap()/.map()` may provide better performance than `.andThen()` since they do not need to check if the handler returns a generator or another effected program. However, in practice, the performance difference is negligible, so it’s better to use `.andThen()` directly for simplicity and consistency.

For convenience, tinyeffect also provides a `.zip()` method to combine two effected programs sequentially (unlike `Effected.all()` which runs them in parallel). The `.zip()` method either returns their results as a tuple `[A, B]` or applies a mapper function to transform the combined results:

```typescript
// Get user and settings
const getUserName = askCurrentUser().map((user) => user?.name || "Guest");
const askTheme = dependency("theme")<"light" | "dark">;

// Combine them with zip to create a welcome message with theme info
const welcomeMessage = getUserName
  .zip(askTheme()) // Returns a tuple [username, theme]
  .map(([username, theme]) => `Welcome ${username}! Using ${theme} theme.`);

// You can also provide a mapper function directly to zip:
const welcomeMessage = getUserName.zip(
  askTheme(),
  (username, theme) => `Welcome ${username}! Using ${theme} theme.`,
);

// Both approaches produce the same result when run
```

Just like `.andThen()`, `.zip()` also allows you to use a generator function or another effected program as the handler, which will be flattened automatically.

When built-in methods aren’t sufficient for your needs, you can create custom transformers and chain them with existing effected programs using the `.pipe(...fs)` method. This allows you to apply multiple transformations in a clean, functional style (inspired by [Effect](https://effect.website/docs/getting-started/building-pipelines/#the-pipe-method)):

```typescript
type Sleep = Default<Effect<"sleep", [ms: number], void>>;
const sleep: EffectFactory<Sleep> = effect("sleep", {
  defaultHandler: ({ resume }, ms) => {
    setTimeout(resume, ms);
  },
});

const delay =
  (ms: number) =>
  <E extends Effect, R>(self: Effected<E, R>): Effected<E | Sleep, R> =>
    sleep(ms).andThen(() => self);

const withLog =
  (message: string) =>
  <E extends Effect, R>(self: Effected<E, R>): Effected<E, R> =>
    self.tap((value) => {
      console.log(`${message}: ${String(value)}`);
    });

// Add a delay of 1000ms to the effected program
console.log(await Effected.of(42).pipe(delay(1000)).runAsync());

// You can use multiple transformers in `.pipe()`
await Effected.of(42).pipe(delay(1000), withLog("Result")).runAsync();
// Result: 42
```

### Pipeline Syntax V.S. Generator Syntax

Both pipeline syntax and generator syntax are valid approaches for working with effected programs in tinyeffect. Each approach has distinct advantages:

**Generator Syntax:**

- More familiar to developers used to imperative programming.
- Natural handling of conditionals and loops.
- Simpler debugging with sequential steps.

**Pipeline Syntax:**

- More functional approach with method chaining.
- Reduces nesting for simple transformations.
- Offers better performance in some cases.

While pipeline syntax offers better performance for simple transformations, in reality such advantages are often negligible since IO-bound effects (like HTTP requests or file operations) usually dominate the execution time. Therefore, the choice between the two should primarily be based on readability and maintainability.

Below are several examples where pipeline syntax might seem more straightforward:

```typescript
// Generator syntax
const getUserPosts = (userId: number) =>
  effected(function* () {
    const user = yield* fetchUser(userId);
    if (!user) return null;
    return yield* fetchPosts(user.id);
  });

// Pipeline syntax
const getUserPosts = (userId: number) =>
  fetchUser(userId).andThen((user) => {
    if (!user) return null;
    return fetchPosts(user.id);
  });
```

Another example for error handling:

```typescript
// Generator syntax
const processFile = (path: string) =>
  effected(function* () {
    const content = yield* readFile(path);
    return yield* parseContent(content);
  }).catchAll(function* (error, message) {
    yield* logger.error(`[${error}Error] Error processing ${path}:`, message);
    return null;
  });

// Pipeline syntax
const processFile = (path: string) =>
  readFile(path)
    .andThen((content) => parseContent(content))
    .catchAll((error, message) =>
      logger.error(`[${error}Error] Error processing ${path}:`, message).as(null),
    );
```

However, when dealing with complex control flow, generator syntax might be more readable:

```typescript
// Generator syntax
const submitOrder = (order: Order) =>
  effected(function* () {
    const [config, user] = yield* Effected.all([askConfig(), askCurrentUser()]);
    yield* validateOrder(order, user);
    const result = yield* saveOrder(order, config.apiUrl);
    yield* sendNotification(user.email, "Order submitted");
    return result;
  });

// Pipeline syntax
const submitOrder = (order: Order) =>
  Effected.all([askConfig(), askCurrentUser()]).andThen(([config, user]) =>
    validateOrder(order, user).andThen(() =>
      saveOrder(order, config.apiUrl).tap(() =>
        sendNotification(user.email, "Order submitted").asVoid(),
      ),
    ),
  );
```

While the pipeline syntax shown above is more compact, it may not be as readable as the generator syntax for most developers since it involves more nesting.

Both generator syntax and pipeline syntax are fully supported in tinyeffect — choose whichever approach makes your code most readable and maintainable for you and your team. The best choice often depends on the specific task and your team’s preferences.

### Example: Build a configurable logging system with effects

Let’s walk through a practical example of using algebraic effects to build a flexible logging system similar to what you might use in a real application. We aim to achieve the following goals:

- Support multiple logging levels (debug, info, warn, error).
- Allow setting minimum logging levels for different parts of the application.
- Enable logging to different outputs (console, file, etc.).
- Provide a way to customize the logging format.

In the following example, we’ll achieve this by defining a set of effects for logging, creating default effect handlers that log to the console, and defining several helper functions to manage logging levels and outputs. All of this is implemented in ~60 lines of code.

**Step 1: Define a dependency for logger**

We’ll start by defining a dependency for the logger, which will be used to redirect log messages to different outputs.

```typescript
export interface Logger {
  debug: (...args: unknown[]) => void | Promise<void>;
  info: (...args: unknown[]) => void | Promise<void>;
  warn: (...args: unknown[]) => void | Promise<void>;
  error: (...args: unknown[]) => void | Promise<void>;
}

// Define a dependency for injecting a logger
export type LoggerDependency = Default<Effect.Dependency<"logger", Logger>>;
// Create dependency with console as default implementation
export const askLogger = dependency<Logger>()("logger", () => console);
```

Note that we allow loggers to be asynchronous, so you can implement a logger that writes to a file or sends logs to a remote server. This is one advantage of algebraic effects: you don’t need to distinguish between synchronous and asynchronous effects, as they are all treated uniformly.

**Step 2: Create effects for each log level**

Next, we’ll define effects for each log level. These effects will be used to log messages at different levels.

```typescript
export type Logging =
  | Default<Effect<"logging.debug", unknown[], void>, never, LoggerDependency>
  | Default<Effect<"logging.info", unknown[], void>, never, LoggerDependency>
  | Default<Effect<"logging.warn", unknown[], void>, never, LoggerDependency>
  | Default<Effect<"logging.error", unknown[], void>, never, LoggerDependency>;

export const logLevels = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

// A helper function to create a logging effect for each level
const logEffect = (level: LogLevel): EffectFactory<Logging> =>
  effect(`logging.${level}`, {
    *defaultHandler({ resume }, ...args) {
      const logger = yield* askLogger();
      const result = logger[level](...args);
      // Handle async loggers
      if (result instanceof Promise) result.then(resume);
      else resume();
    },
  });

// Create effect functions for each log level
export const logDebug = logEffect("debug");
export const logInfo = logEffect("info");
export const logWarn = logEffect("warn");
export const logError = logEffect("error");
```

We define a default effect handler that relies on the `Logger` dependency for each log level. This allows us to control which log levels are enabled at runtime.

**Step 3: Define handlers for common logging features**

We’ll define several helper functions to manage logging levels and outputs. The `defineHandlerFor` helper will be used to create these helper functions.

The first helper is `withPrefix(prefixFactory: (level) => string)`, which adds a prefix to each log message based on the log level. This is useful for distinguishing between different log levels in the output.

```typescript
export function withPrefix(prefixFactory: (level: LogLevel) => string) {
  return defineHandlerFor<Logging>().with((self) =>
    self.handle(
      (name): name is Logging["name"] => typeof name === "string" && name.startsWith("logging."),
      function* ({ effect, resume }): Generator<Logging, void> {
        const prefix = prefixFactory(effect.name.slice("logging.".length) as LogLevel);
        // Insert prefix at the beginning of the payloads
        effect.payloads.splice(0, 0, prefix);
        yield effect; // Re-yield the effect with the modified payloads
        resume();
      },
    ),
  );
}
```

The next is `withMinimumLogLevel(level)`, which filters out log messages below a specified minimum level. This allows you to control the verbosity of the logs based on the current logging level.

```typescript
export function withMinimumLogLevel(level: LogLevel | "none") {
  return defineHandlerFor<Logging>().with((self) => {
    const disabledLevels = new Set(
      level === "none" ? logLevels : logLevels.slice(0, logLevels.indexOf(level)),
    );
    return self.handle(
      (name): name is Logging["name"] =>
        typeof name === "string" &&
        name.startsWith("logging.") &&
        disabledLevels.has(name.slice("logging.".length) as LogLevel),
      function* ({ effect, resume }): Generator<Logging, void> {
        // Change default handler of disabled log levels to resume immediately
        effect.defaultHandler = ({ resume }) => resume();
        yield effect; // Re-yield the effect with the modified default handler
        resume();
      },
    );
  });
}
```

**Step 4: Use the logging system!**

Done! We’ve already created a fully functional logging system. But now you might wonder how to use it in practice. Let’s start by creating a simple program that uses the logging system:

```typescript
const program = effected(function* () {
  yield* logDebug("Debug message");
  yield* logInfo("Info message");
  yield* logWarn("Warning!");
  yield* logError("Error occurred!");
});

await program.runAsync();
```

We do not explicitly handle any logging effects, so the default handler will be used, which logs to the console. The output will look like this:

```text
Debug message
Info message
Warning!
Error occurred!
```

By default, all log levels are enabled, so all messages are printed. Now, let’s set the minimum log level to `warn` to disable debug and info messages:

```typescript
const program = effected(function* () {
  // ...
}).pipe(withMinimumLogLevel("warn"));
```

The output will now only show the warning and error messages:

```text
Warning!
Error occurred!
```

For now, it’s not easy to distinguish between different log levels. To add a prefix to each log message, we can use the `withPrefix` helper function:

```typescript
function logPrefix(level: LogLevel) {
  const date = new Date();
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const HH = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padEnd(3, "0");
  const datePart = `[${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}.${ms}]`;
  const levelPart = `[${level}]`;
  return `${datePart} ${levelPart}`;
}

const program = effected(function* () {
  // ...
}).pipe(withMinimumLogLevel("warn"), withPrefix(logPrefix));
```

Now, the output will look like this:

```text
[2025-03-29 21:49:03.633] [warn] Warning!
[2025-03-29 21:49:03.634] [error] Error occurred!
```

What if we want to log to a file instead of the console? We can create a custom logger that writes to a file and provide it as the `Logger` dependency. Here’s an example of how to do this:

```typescript
import fs from "node:fs/promises";
import { show } from "showify";

function fileLogger(path: string) {
  return new Proxy({} as Logger, {
    get() {
      return async (...args: unknown[]) => {
        const message = args
          .map((arg) => (typeof arg === "string" ? arg : show(arg, { indent: 2 })))
          .join(" ");
        await fs.appendFile(path, message + "\n");
      };
    },
  });
}

const program = effected(function* () {
  // ...
})
  .pipe(withMinimumLogLevel("warn"), withPrefix(logPrefix))
  .provide("logger", fileLogger("log.txt"));
```

In this example, we use [showify](https://github.com/Snowflyt/showify) to format the log messages into human-readable strings. The `fileLogger` function accepts a file path and returns a logger object that writes log messages to that file. We use `node:fs/promises` to handle file operations asynchronously.

Now, instead of logging to the console, all log messages will be written to the `log.txt` file. You can customize the logger to write to different outputs, such as a database or a remote server.

You can also create a helper function to combine multiple handlers together:

```typescript
function dualLogger(logger1: Logger, logger2: Logger) {
  return new Proxy({} as Logger, {
    get(_, prop, receiver) {
      return (...args: unknown[]) => {
        const result1 = Reflect.get(logger1, prop, receiver)(...args);
        const result2 = Reflect.get(logger2, prop, receiver)(...args);
        if (result1 instanceof Promise && result2 instanceof Promise)
          return Promise.all([result1, result2]);
        else if (result1 instanceof Promise) return result1;
        else if (result2 instanceof Promise) return result2;
      };
    },
  });
}

const program = effected(function* () {
  // ...
})
  .pipe(withMinimumLogLevel("warn"), withPrefix(logPrefix))
  .provide("logger", dualLogger(console, fileLogger("log.txt")));
```

Now, all log messages will be logged to both the console and the `log.txt` file.

To extend the logging system, you can create additional effects for other log levels, such as `trace`, `fatal`, or a `log` effect that defaults to `info` but can be configured to use any log level. In real applications, you can also redirect log messages to a worker thread and then handle them with a message queue, allowing you to log messages without blocking the main thread.

## FAQ

### What’s the relationship between tinyeffect and Effect?

It is a coincidence that the name “tinyeffect” is similar to [Effect](https://github.com/Effect-TS/effect), a TypeScript ecosystem inspired by the effect ecosystem in Scala. However, “effect” means different things in both libraries. In tinyeffect, “effect” refers to “algebraic effect”, while in Effect, it means “effectful computation”. Both libraries are independent and developed for different purposes.

However, it is not surprising that the two libraries share some similarities, as they both aim to provide a way to handle side effects in a type-safe manner. The `Effect` type in Effect and the `Effected` type in tinyeffect are both monads that abstract effectful computations, and they share similarities in their API design, e.g., `Effect.map()` vs. `Effected.prototype.map()`, `Effect.flatMap()` vs. `Effected.prototype.flatMap()`, `Effect.andThen()` vs. `Effected.prototype.andThen()`, etc.

While sharing some similarities, tinyeffect and Effect are fundamentally different in their design and implementation. tinyeffect is designed to be a lightweight library that focuses on providing a simple and intuitive API for handling side effects, while Effect is designed to be a full-fledged library that provides a comprehensive set of features for building effectful applications. Also, both libraries provide concurrency primitives, but Effect uses a fiber-based concurrency model, whereas tinyeffect uses a simple iterator-based model.

```

```
