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
  <a href="https://github.com/Snowflyt/tinyeffect/actions/workflows/test.yml">
    <img src="https://github.com/Snowflyt/tinyeffect/actions/workflows/test.yml/badge.svg" alt="test status" height="18">
  </a>
  <a href="https://coveralls.io/github/Snowflyt/tinyeffect?branch=main">
    <img src="https://coveralls.io/repos/github/Snowflyt/tinyeffect/badge.svg?branch=main" alt="coverage status" height="18">
  </a>
  <a href="https://github.com/gvergnaud/tinyeffect">
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

// prettier-ignore
const requiresAdmin = () => effected(function* () {
  const currentUser = yield* askCurrentUser();
  if (!currentUser) return yield* authenticationError();
  if (currentUser.role !== "admin")
    return yield* unauthorizedError(`User "${currentUser.name}" is not an admin`);
});

// prettier-ignore
const createUser = (user: Omit<User, "id">) => effected(function* () {
  yield* requiresAdmin();
  const id = yield* executeSQL("INSERT INTO users (name) VALUES (?)", user.name);
  const savedUser: User = { id, ...user };
  yield* println("User created:", savedUser);
  return savedUser;
});
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

Using `yield*` with a factory function created by `effect` (or its variants) yields an `Effect` object. The `effect` function itself can be simplified as follows:

```typescript
function effect<Name extends string | symbol>(
  name: Name,
): <Payloads extends unknown[], R>(
  ...payloads: Payloads
) => Generator<Effect<Name, Payloads, R>, R, unknown> {
  return function* (...payloads) {
    return yield { name: name, payloads };
  };
}

function error<Name extends string>(
  name: Name,
): <Payloads extends unknown[]>(
  message?: string,
) => Generator<Unresumable<Effect<`error:${Name}`, Payloads, never>>, never, unknown> {
  return function* (...payloads) {
    return yield { name: `error:${name}`, payloads, resumable: false };
  };
}

function dependency<Name extends string>(
  name: Name,
): <R>() => Generator<Effect<`dependency:${Name}`, [], R>, R, unknown> {
  return function* () {
    return yield { name: `dependency:${name}`, payloads: [] };
  };
}
```

To keep things simple, let’s remove the type signatures and focus on the structure:

```typescript
function effect(name) {
  return function* (...payloads) {
    return yield { name: name, payloads };
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
) => Generator<Unresumable<Effect<"raise", [error: unknown], never>>, never, unknown>;
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

### Interlude: Where’s “try-catch”?

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

This might look complex at first, but it simply wraps the `effect` function to make it generic. `effect("iterate")` returns a generic generator function, and we pass type arguments to specialize it, then call the function with a value to yield an Effect object.

### Handling return values

Sometimes, you may want to transform a program’s return value. Let’s revisit the `safeDivide` example:

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

We want to transform the return value of `safeDivide` into an `Option` type: if `safeDivide` returns a value normally, we return `some(value)`, otherwise, we return `none` (if the raise effect is triggered). This can be achieved with the map method:

```typescript
const safeDivide2 = (a: number, b: number): Effected<never, Option<number>> =>
  safeDivide(a, b)
    .map((value) => some(value))
    .terminate("raise", () => none);
```

Now, running `safeDivide2(1, 0).runSync()` will return `none`, while `safeDivide2(1, 2).runSync()` will return `some(0.5)`.

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
  effected: Effected<Effect.Error<ErrorName> | E, R>,
): Effected<E, Result<R, { error: ErrorName; message?: string }>> => {
  const isErrorEffect = (name: string | symbol): name is `error:${ErrorName}` => {
    if (typeof name === "symbol") return false;
    return name.startsWith("error:");
  };

  return effected
    .map((value) => ok(value))
    .handle(isErrorEffect, ({ effect, terminate }, message) => {
      terminate(err({ error: effect.name.slice("error:".length), message }));
    });
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
    .map((value) => ok(value))
    .catchAll((error, message) => err({ error, message }));
```

The `.catchAll()` method takes a function that receives the error effect name and message, and returns a new value. `range3` behaves the same as `range2`, with an identical type signature.

### Handling effects with another effected program

When you’re working with a large application, you’ll soon encounter situations where handling an effect can introduce one or more new effects.

For example, consider the following program:

```typescript
type Ask<T> = Effect<"ask", [], T>;
const ask = <T>(): Generator<Ask<T>, T, unknown> => effect("ask")();

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
  get: <T>(): Generator<State<T>, T, unknown> => effect("state.get")<[], T>(),
  set: <T>(value: T): Generator<State<T>, void, unknown> =>
    effect("state.set")<[value: T], void>(value),
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
  (effected) =>
    effected.resume("state.get", get).resume("state.set", set);

stateHandler({ get: () => n, set: (x) => (n = x) })(sumDown()).runSync();
```

For simplicity, this example is in JavaScript, focusing on the concept. Here, `stateHandler` is a higher-order function that accepts handler methods and returns a function to apply them to an effected program.

The main challenge lies in defining the correct type signature for the `stateHandler` function. Due to certain limitations in TypeScript, it can be tricky to annotate `stateHandler` in a way that reliably covers all edge cases.

Fortunately, tinyeffect performs some type-level magic and provides a helper function, `defineHandlerFor`, which you can use with the `.with()` method to define handlers for one or more effects. Here’s how it works:

```typescript
import { defineHandlerFor } from "tinyeffect";

const stateHandler = <T>({ get, set }: { get: () => T; set: (x: T) => void }) =>
  defineHandlerFor<State<T>>().with((effected) =>
    effected.resume("state.get", get).resume("state.set", set),
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
}) => <R>(effected: EffectedDraft<State<T>, State<T>, R>) => EffectedDraft<State<T>, never, R>;
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

In previous examples, we used `.map()` and `.terminate()` to transform the return value of `safeDivide` to an `Option` type. Now, we can abstract this logic into a reusable handler:

```typescript
const raiseMaybe = defineHandlerFor<Raise>().with((effected) =>
  effected.map((value) => some(value)).terminate("raise", () => none),
);

const safeDivide2 = (a: number, b: number) => safeDivide(a, b).with(raiseMaybe);
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
