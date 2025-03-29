import { UnhandledEffectError } from "./errors";
import type { Default, UnhandledEffect, Unresumable } from "./types";
import { Effect } from "./types";

/**
 * Create a function that returns an {@link Effected} instance (an effected program) which yields a
 * single {@link Effect} instance (algebraic effect) and returns the handled value. The returned
 * function can be utilized with {@link effected} to compose and integrate into a more complex
 * effected program.
 *
 * For special cases, see {@link error} (for non-resumable error effects) and {@link dependency}
 * (for dependency injection).
 * @param name Name of the effect. This identifier is used to match effects, so be careful with name
 * collisions.
 * @param options Options for the effect. Can be used to mark the effect as unresumable.
 * @returns
 *
 * @example
 * ```typescript
 * const println = effect("println")<unknown[], void>;
 * const raise = effect("raise", { resumable: false })<[message?: string], never>;
 * ```
 *
 * @example
 * ```typescript
 * // Provide more readable type information
 * type Println = Effect<"println", unknown[], void>;
 * const println: EffectFactory<Println> = effect("println");
 * type Raise = Effect<"raise", [message?: string], never>;
 * const raise: EffectFactory<Raise> = effect("raise", { resumable: false });
 * ```
 *
 * @see {@link effected}
 */
export function effect<Payloads extends unknown[], R, T = never>(): <
  Name extends string | symbol,
  F extends Effect = never,
  Resumable extends boolean = true,
>(
  name: Name,
  options?: {
    readonly resumable?: Resumable;
    readonly defaultHandler?: [Resumable] extends [false] ?
      (
        {
          effect,
          terminate,
        }: { effect: Effect<Name, Payloads, never>; terminate: (value: T) => void },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : (
        {
          effect,
          resume,
          terminate,
        }: {
          effect: Effect<Name, Payloads, R>;
          resume: (value: R) => void;
          terminate: (value: T) => void;
        },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>;
  },
) => [Resumable] extends [false] ?
  (
    ...payloads: Payloads
  ) => Effected<Default<Unresumable<Effect<Name, Payloads, never>>, R | T, F>, never>
: (...payloads: Payloads) => Effected<Default<Effect<Name, Payloads, R>, T, F>, R>;
export function effect<
  Name extends string | symbol,
  Payloads extends unknown[] = never,
  R = never,
  T = never,
  F extends Effect = never,
  Resumable extends boolean = true,
>(
  name: Name,
  options?: {
    readonly resumable?: Resumable;
    readonly defaultHandler?: [Resumable] extends [false] ?
      (
        {
          effect,
          terminate,
        }: { effect: Effect<Name, Payloads, never>; terminate: (value: T) => void },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : (
        {
          effect,
          resume,
          terminate,
        }: {
          effect: Effect<Name, Payloads, R>;
          resume: (value: R) => void;
          terminate: (value: T) => void;
        },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>;
  },
): [Resumable] extends [false] ?
  [Payloads] extends [never] ?
    <Payloads extends unknown[], R extends never = never>(
      ...payloads: Payloads
    ) => Effected<Unresumable<Effect<Name, Payloads, R>>, R>
  : (
      ...payloads: Payloads
    ) => Effected<Default<Unresumable<Effect<Name, Payloads, never>>, R | T, F>, never>
: [Payloads] extends [never] ?
  <Payloads extends unknown[], R>(...payloads: Payloads) => Effected<Effect<Name, Payloads, R>, R>
: (...payloads: Payloads) => Effected<Default<Effect<Name, Payloads, R>, T, F>, R>;
export function effect(...args: unknown[]): any {
  if (args.length === 0) return effect;
  const [name, options = {}] = args as [
    name: string | symbol,
    options?: {
      resumable?: boolean;
      defaultHandler?: (context: any, ...args: unknown[]) => unknown;
    },
  ];
  const result = (...payloads: unknown[]) => {
    const defaultHandler =
      options.defaultHandler &&
      ((context: any, ...payloads: unknown[]) => options.defaultHandler!(context, ...payloads));
    return effected(() => {
      let state = 0;
      return {
        next: (...args) => {
          switch (state) {
            case 0:
              state++;
              return {
                done: false,
                value: Object.assign(new Effect(name, payloads), {
                  ...(options.resumable === false ? { resumable: false } : {}),
                  ...(defaultHandler ? { defaultHandler } : {}),
                }),
              };
            case 1:
              state++;
              return {
                done: true,
                ...(args.length > 0 ? { value: args[0] } : {}),
              } as IteratorReturnResult<unknown>;
            default:
              return { done: true } as IteratorReturnResult<unknown>;
          }
        },
      };
    });
  };
  if ((options as any)._overrideFunctionName === false) return result as never;
  return renameFunction(
    result,
    typeof name === "string" ? name : name.toString().slice(7, -1) || "",
  ) as never;
}

/**
 * Create a function that returns an {@link Effected} instance (an effected program) which yields a
 * single {@link Effect} instance for typical errors (i.e., non-resumable effect with name prefixed
 * with "error:").
 *
 * It can be seen as an alias of `effect("error:" + name, { resumable: false })`.
 *
 * You can use {@link Effected#catch} as a shortcut for `terminate("error:" + name, ...)` to catch
 * the error effect.
 * @param name Name of the error effect. This identifier is used to match effects, so be careful
 * with name collisions.
 * @returns
 *
 * @example
 * ```typescript
 * const authError = error("auth");
 * const notFoundError = error("notFound");
 * ```
 *
 * @example
 * ```typescript
 * // Provide more readable type information
 * type AuthError = Effect.Error<"auth">;
 * const authError: EffectFactory<AuthError> = error("auth");
 * ```
 *
 * @see {@link effect}
 */
export function error<Name extends string>(
  name: Name,
): (
  message?: string,
) => Effected<Unresumable<Effect<`error:${Name}`, [message?: string], never>>, never> {
  return renameFunction(
    effect(`error:${name}`, { resumable: false, _overrideFunctionName: false } as {
      resumable: false;
    }),
    `throw${capitalize(name)}Error`,
  );
}

type ErrorName<E extends Effect> =
  E extends Unresumable<Effect<`error:${infer Name}`, any, never>> ? Name : never;

/**
 * Create a function that returns an {@link Effected} instance (an effected program) which yields a
 * single {@link Effect} instance for dependency injection.
 *
 * It can be seen as an alias of `effect("dependency:" + name)`.
 *
 * You can use {@link Effected#provide} and its variants as a shortcut for
 * `resume("dependency:" + name, ...)` to provide the value for the dependency.
 * @param name Name of the dependency. This identifier is used to match effects, so be careful
 * with name collisions.
 * @returns
 *
 * @example
 * ```typescript
 * const askConfig = dependency("config")<Config | null>;
 * const askDatabase = dependency("database")<Database>;
 * ```
 *
 * @example
 * ```typescript
 * // Provide more readable type information
 * type ConfigDependency = Effect.Dependency<"config", Config | null>;
 * const askConfig: EffectFactory<ConfigDependency> = dependency("config");
 * ```
 *
 * @see {@link effect}
 */
export function dependency<T>(): <Name extends string, F extends Effect = never>(
  name: Name,
  defaultFactory?: () => T | Generator<F, T, unknown> | Effected<F, T>,
) => () => Effected<Default<Effect<`dependency:${Name}`, [], T>, F>, T>;
export function dependency<Name extends string, D = never>(
  name: Name,
  defaultFactory?: () => D,
): [D] extends [never] ? <R>() => Effected<Effect<`dependency:${Name}`, [], R>, R>
: (
  D extends Generator<Effect, infer R, unknown> ? R
  : D extends Effected<Effect, infer R> ? R
  : D
) extends infer R ?
  () => Effected<
    Default<
      Effect<`dependency:${Name}`, [], R>,
      D extends Generator<infer E extends Effect, unknown, unknown> ? E
      : D extends Effected<infer E, unknown> ? E
      : never
    >,
    R
  >
: never;
export function dependency(...args: unknown[]): any {
  if (args.length === 0) return dependency;
  const [name, defaultFactory] = args as [name: string, defaultFactory?: () => unknown];
  const defaultHandler =
    defaultFactory &&
    (({ resume }: any) => {
      resume(defaultFactory());
    });
  return renameFunction(
    effect(`dependency:${name}`, {
      _overrideFunctionName: false,
      ...(typeof defaultFactory === "function" ? { defaultHandler } : {}),
    } as {}),
    `ask${capitalize(name)}`,
  );
}

type DependencyName<E extends Effect> =
  E extends Effect<`dependency:${infer Name}`, []> ? Name : never;

/**
 * Define a handler that transforms an effected program into another one.
 *
 * It is just a simple wrapper to make TypeScript infer the types correctly, and simply returns the
 * function you pass to it.
 * @returns
 *
 * @example
 * ```typescript
 * type Raise = Unresumable<Effect<"raise", [error: unknown], never>>;
 * const raise: EffectFactory<Raise> = effect("raise", { resumable: false });
 *
 * const safeDivide = (a: number, b: number): Effected<Raise, number> =>
 *   effected(function* () {
 *     if (b === 0) return yield* raise("Division by zero");
 *     return a / b;
 *   });
 *
 * type Option<T> = { kind: "some"; value: T } | { kind: "none" };
 * const some = <T>(value: T): Option<T> => ({ kind: "some", value });
 * const none: Option<never> = { kind: "none" };
 *
 * const raiseOption = defineHandlerFor<Raise>().with((self) =>
 *   self.andThen((value) => some(value)).terminate("raise", () => none),
 * );
 *
 * const safeDivide2 = (a: number, b: number) => safeDivide(a, b).with(raiseOption);
 * //    ^?: (a: number, b: number) => Effected<never, Option<number>>
 * ```
 */
export function defineHandlerFor<E extends Effect, R>(): {
  with: <S extends EffectedDraft<E>, H extends (self: EffectedDraft<E, E, R>) => S>(
    handler: H,
  ) => H;
};
export function defineHandlerFor<E extends Effect>(): {
  with: <S extends EffectedDraft<E>, H extends <R>(self: EffectedDraft<E, E, R>) => S>(
    handler: H,
  ) => H;
};
export function defineHandlerFor() {
  return {
    with: (handler: any) => handler,
  };
}

type ExtractUnhandled<E extends Effect> =
  E extends (
    {
      defaultHandler: (
        context: any,
      ) => void | Generator<infer F, void, unknown> | Effected<infer F, void>;
    }
  ) ?
    ExtractUnhandled<F>
  : E;
type ExtractEffect<E extends Effect, Acc = never> =
  E extends (
    {
      defaultHandler: (
        context: any,
      ) => void | Generator<infer F, void, unknown> | Effected<infer F, void>;
    }
  ) ?
    [F] extends [never] ?
      Acc | E
    : ExtractEffect<F, Acc | E>
  : Acc | E;
type ExcludeEffect<E extends Effect, F extends Effect> =
  E extends F ? never
  : E extends Default<infer G, infer T, infer H> ?
    ExtractEffect<H>["name"] extends ExtractEffect<ExcludeEffect<H, F>>["name"] ?
      // Preserve effect type if no modification is needed to make type information more readable
      E
    : Default<G, T, ExcludeEffect<H, F>>
  : E;
type ExtractDefaultTerminateType<E extends Effect> =
  E extends (
    {
      defaultHandler: (context: { terminate: (value: infer T) => void }) => any;
    }
  ) ?
    T
  : never;

/**
 * An effected program.
 */
export class Effected<out E extends Effect, out R> implements Iterable<E, R, unknown> {
  declare public readonly [Symbol.iterator]: () => Iterator<E, R, unknown>;

  declare public readonly runSync: [ExtractUnhandled<E>] extends [never] ?
    () => ExtractDefaultTerminateType<E> | R
  : UnhandledEffect<ExtractUnhandled<E>>;
  declare public readonly runAsync: [ExtractUnhandled<E>] extends [never] ?
    () => Promise<ExtractDefaultTerminateType<E> | R>
  : UnhandledEffect<ExtractUnhandled<E>>;
  declare public readonly runSyncUnsafe: () => ExtractDefaultTerminateType<E> | R;
  declare public readonly runAsyncUnsafe: () => Promise<ExtractDefaultTerminateType<E> | R>;

  private constructor(fn: () => Iterator<E, R, unknown>, magicWords?: string) {
    if (magicWords !== "Yes, I’m sure I want to call the constructor of Effected directly.")
      logger.warn(
        "You should not call the constructor of `Effected` directly. Use `effected` instead.",
      );

    this[Symbol.iterator] = fn;

    this.runSync = (() => runSync(this as never)) as never;
    this.runAsync = (() => runAsync(this as never)) as never;
    this.runSyncUnsafe = () => runSync(this as never);
    this.runAsyncUnsafe = () => runAsync(this as never);
  }

  /**
   * Create an {@link Effected} instance that just returns the value.
   * @param value The value to return.
   * @returns
   *
   * @since 0.1.2
   */
  static of<R>(value: R): Effected<never, R> {
    return effected(() => ({ next: () => ({ done: true, value }) })) as Effected<never, R>;
  }

  /**
   * Create an {@link Effected} instance that just returns the value from a getter.
   * @param getter The getter to get the value.
   * @returns
   */
  static from<R>(getter: () => R): Effected<never, R> {
    return effected(() => ({ next: () => ({ done: true, value: getter() }) })) as Effected<
      never,
      R
    >;
  }

  /**
   * Combine multiple effected programs into one, running them in parallel and produces a tuple or
   * object with the results.
   * @param effects An iterable of effected programs or an object with effected programs as values.
   * @returns
   *
   * @see {@linkcode Effected.allSeq} for the sequential version.
   *
   * @since 0.3.2
   */
  static all<const ES extends Iterable<Effected<Effect, unknown>>>(
    effects: ES,
  ): Effected<
    ES extends Iterable<infer E> ?
      [E] extends [never] ? never
      : [E] extends [Effected<infer E, unknown>] ? E
      : never
    : never,
    ES extends readonly unknown[] ?
      { -readonly [K in keyof ES]: ES[K] extends Effected<Effect, infer R> ? R : never }
    : ES extends Iterable<infer E> ?
      [E] extends [Effected<Effect, infer R>] ?
        R[]
      : never
    : never
  >;
  static all<const O extends Record<string, Effected<Effect, unknown>>>(
    effects: O,
  ): Effected<
    O[keyof O] extends infer E ?
      [E] extends [never] ? never
      : [E] extends [Effected<infer E, unknown>] ? E
      : never
    : never,
    { -readonly [K in keyof O]: O[K] extends Effected<Effect, infer R> ? R : never }
  >;
  static all(
    effects: Iterable<Effected<Effect, unknown>> | Record<string, Effected<Effect, unknown>>,
  ): Effected<Effect, unknown> {
    return effected(() => {
      const isIterable = Symbol.iterator in effects;
      const keys: (string | number)[] = [];
      const iterators: Iterator<Effect, unknown, unknown>[] = [];
      if (isIterable) {
        for (const e of effects) iterators.push(e[Symbol.iterator]());
        Array.prototype.push.apply(
          keys,
          Array.from({ length: iterators.length }, (_, i) => i),
        );
      } else {
        for (const key in effects) {
          if (!Object.prototype.hasOwnProperty.call(effects, key)) continue;
          keys.push(key);
          iterators.push(effects[key]![Symbol.iterator]());
        }
      }

      if (keys.length === 0) return { next: () => ({ done: true, value: isIterable ? [] : {} }) };

      const label = Symbol();

      const results: any = isIterable ? new Array(keys.length) : {};
      const states = Array.from(
        { length: keys.length },
        () => "idle" as "idle" | "pending" | "done",
      );
      let recover: ((payload: { _effectRecover: symbol; index: number }) => void) | null = null;

      let index = 0;
      const nextIdleIndex = () => {
        let i = index;
        do i = (i + 1) % keys.length;
        while (states[i] !== "idle" && i !== index);
        return i === index ? null : i;
      };

      return {
        next: (...args: [] | [unknown]) => {
          if (states.every((s) => s === "done")) return { done: true, value: results };

          if (args[0] != null && (args[0] as any)._effectInterrupt === label) {
            const currIndex = index;
            states[currIndex] = "pending";
            void ((args[0] as any).with as Promise<unknown>).then((value) => {
              results[keys[currIndex]!] = value;
              states[currIndex] = "idle";
              recover!({ _effectRecover: label, index: currIndex });
            });
            const nextIndex = nextIdleIndex();

            if (!nextIndex)
              return {
                done: false,
                value: {
                  _effectAsync: true,
                  onComplete: (callback: NonNullable<typeof recover>) => {
                    recover = callback;
                  },
                } as never,
              };

            index = nextIndex;
            args = [results[keys[index]!]];
          }

          if (args[0] != null && (args[0] as any)._effectRecover === label) {
            index = (args[0] as any).index;
            args = [results[keys[index]!]];
          }

          let iterator = iterators[index]!;
          let result = iterator.next(...args);

          while (result.done) {
            states[index] = "done";
            results[keys[index]!] = result.value;
            if (states.every((s) => s === "done")) {
              return { done: true, value: results };
            } else {
              const nextIndex = nextIdleIndex();
              if (!nextIndex)
                return {
                  done: false,
                  value: {
                    _effectAsync: true,
                    onComplete: (callback: NonNullable<typeof recover>) => {
                      recover = callback;
                    },
                  } as never,
                };
              index = nextIndex;
              args = [results[keys[index]!]];
              iterator = iterators[index]!;
              result = iterator.next(...args);
            }
          }

          if (
            (result.value instanceof Effect || (result.value as any)._effectAsync) &&
            !("interruptable" in (result.value as any))
          )
            (result.value as any).interruptable = label;

          return result;
        },
      };
    });
  }

  /**
   * Combine multiple effected programs into one, running them sequentially and produces a tuple or
   * object with the results.
   * @param effects An iterable of effected programs or an object with effected programs as values.
   * @returns
   *
   * @see {@linkcode Effected.all} for the parallel version.
   *
   * @since 0.3.2
   */
  static allSeq<const ES extends Iterable<Effected<Effect, unknown>>>(
    effects: ES,
  ): Effected<
    ES extends Iterable<infer E> ?
      [E] extends [never] ? never
      : [E] extends [Effected<infer E, unknown>] ? E
      : never
    : never,
    ES extends readonly unknown[] ?
      { -readonly [K in keyof ES]: ES[K] extends Effected<Effect, infer R> ? R : never }
    : ES extends Iterable<infer E> ?
      [E] extends [Effected<Effect, infer R>] ?
        R[]
      : never
    : never
  >;
  static allSeq<const O extends Record<string, Effected<Effect, unknown>>>(
    effects: O,
  ): Effected<
    O[keyof O] extends infer E ?
      [E] extends [never] ? never
      : E extends Effected<infer E, unknown> ? E
      : never
    : never,
    { -readonly [K in keyof O]: O[K] extends Effected<Effect, infer R> ? R : never }
  >;
  static allSeq(
    effects: Iterable<Effected<Effect, unknown>> | Record<string, Effected<Effect, unknown>>,
  ): Effected<Effect, unknown> {
    return effected(() => {
      const isIterable = Symbol.iterator in effects;
      const keys: (string | number)[] = [];
      const iterators: Iterator<Effect, unknown, unknown>[] = [];
      if (isIterable) {
        for (const e of effects) iterators.push(e[Symbol.iterator]());
        Array.prototype.push.apply(
          keys,
          Array.from({ length: iterators.length }, (_, i) => i),
        );
      } else {
        for (const key in effects) {
          if (!Object.prototype.hasOwnProperty.call(effects, key)) continue;
          keys.push(key);
          iterators.push(effects[key]![Symbol.iterator]());
        }
      }
      const results: any = isIterable ? new Array(keys.length) : {};
      let index = 0;

      return {
        next: (...args: [] | [unknown]) => {
          while (index < keys.length) {
            const key = keys[index]!;
            const iterator = iterators[index]!;
            const result = iterator.next(...args);
            if (!result.done) return result;
            results[key] = result.value;
            index++;
          }
          return { done: true, value: results };
        },
      };
    });
  }

  /**
   * Handle an effect with a handler.
   *
   * For more common use cases, see {@link resume} and {@link terminate}, which provide a more
   * concise syntax.
   * @param effect The effect name or a function to match the effect name.
   * @param handler The handler for the effect. The first argument is an object containing the
   * encountered effect instance, a `resume` function to resume the effect, and a `terminate`
   * function to terminate the effect. The rest of the arguments are the payloads of the effect.
   *
   * `resume` or `terminate` should be called exactly once in the handler. If you call them more
   * than once, a warning will be logged to the console. If neither of them is called, the effected
   * program will hang indefinitely.
   *
   * Calling `resume` or `terminate` in an asynchronous context is also supported. It is _not_
   * required to call them synchronously.
   * @returns
   */
  handle<Name extends ExtractEffect<E>["name"], T = R, F extends Effect = never>(
    effect: Name,
    handler: ExtractEffect<E> extends infer E ?
      Extract<E, Effect<Name>> extends Unresumable<Effect> ?
        (
          {
            effect,
            terminate,
          }: { effect: Extract<E, Effect<Name>>; terminate: (value: T) => void },
          ...payloads: Extract<E, Effect<Name>>["payloads"]
        ) => void | Generator<F, void, unknown> | Effected<F, void>
      : (
          {
            effect,
            resume,
            terminate,
          }: {
            effect: Extract<E, Effect<Name>>;
            resume: (value: Extract<E, Effect<Name>>["__returnType"]) => void;
            terminate: (value: T) => void;
          },
          ...payloads: Extract<E, Effect<Name>>["payloads"]
        ) => void | Generator<F, void, unknown> | Effected<F, void>
    : never,
  ): Effected<ExcludeEffect<E, Effect<Name>> | F, R | T>;
  handle<Name extends string | symbol, T = R, F extends Effect = never>(
    effect: (name: ExtractEffect<E>["name"]) => name is Name,
    handler: ExtractEffect<E> extends infer E ?
      Extract<E, Effect<Name>> extends Unresumable<Effect> ?
        (
          {
            effect,
            terminate,
          }: { effect: Extract<E, Effect<Name>>; terminate: (value: T) => void },
          ...payloads: Extract<E, Effect<Name>>["payloads"]
        ) => void | Generator<F, void, unknown> | Effected<F, void>
      : (
          {
            effect,
            resume,
            terminate,
          }: {
            effect: Extract<E, Effect<Name>>;
            resume: (value: Extract<E, Effect<Name>>["__returnType"]) => void;
            terminate: (value: T) => void;
          },
          ...payloads: Extract<E, Effect<Name>>["payloads"]
        ) => void | Generator<F, void, unknown> | Effected<F, void>
    : never,
  ): Effected<ExcludeEffect<E, Effect<Name>> | F, R | T>;
  handle(
    name: string | symbol | ((name: string | symbol) => boolean),
    handler: (...args: any[]) => unknown,
  ): Effected<any, unknown> {
    const matchEffect = (value: unknown) =>
      value instanceof Effect &&
      (typeof name === "function" ? name(value.name) : value.name === name);

    return effected(() => {
      const iterator = this[Symbol.iterator]();
      const context = {
        interceptIterator: null as typeof iterator | null,

        terminated: false as false | "with-value" | "without-value",
        terminatedValue: undefined as unknown,
      };

      return {
        next: (...args: [] | [unknown]) => {
          if (context.terminated)
            return {
              done: true,
              ...(context.terminated === "with-value" ? { value: context.terminatedValue } : {}),
            } as IteratorReturnResult<unknown>;

          const result = (context.interceptIterator || iterator).next(...args);

          const { done, value } = result;
          if (done) return result;

          if (matchEffect(value)) return handleEffect(context, name, value, handler as never);

          if (value instanceof Effect && typeof (value as any).defaultHandler === "function") {
            const originalDefaultHandler = (value as any).defaultHandler;
            (value as any).defaultHandler = (context: any, ...payloads: unknown[]) => {
              const result = originalDefaultHandler(context, ...payloads);
              if (result instanceof Effected) return result.handle(name as never, handler as never);
              if (isGenerator(result)) {
                return effected(() => result as Generator<Effect, unknown, unknown>).handle(
                  name as never,
                  handler as never,
                );
              }
              return result;
            };
          }

          return result;
        },
      };
    });
  }

  /**
   * Resume an effect with the return value of the handler.
   *
   * It is a shortcut for
   * `handle(effect, ({ resume }, ...payloads) => resume(handler(...payloads)))`.
   * @param effect The effect name or a function to match the effect name.
   * @param handler The handler for the effect. The arguments are the payloads of the effect.
   * @returns
   *
   * @see {@link handle}
   */
  resume<
    Name extends Exclude<ExtractEffect<E>, Unresumable<Effect>>["name"],
    F extends Effect = never,
  >(
    effect: Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads, infer R> ?
        (...payloads: Payloads) => R | Generator<F, R, unknown> | Effected<F, R>
      : never
    : never,
  ): Effected<ExcludeEffect<E, Effect<Name>> | F, R>;
  resume<Name extends string | symbol, F extends Effect = never>(
    effect: (name: Exclude<ExtractEffect<E>, Unresumable<Effect>>["name"]) => name is Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads, infer R> ?
        (...payloads: Payloads) => R | Generator<F, R, unknown> | Effected<F, R>
      : never
    : never,
  ): Effected<ExcludeEffect<E, Effect<Name>> | F, R>;
  resume(effect: any, handler: (...payloads: unknown[]) => unknown) {
    return this.handle(effect, (({ resume }: any, ...payloads: unknown[]) => {
      const it = handler(...payloads);
      if (!(it instanceof Effected) && !isGenerator(it)) return resume(it);
      const iterator = it[Symbol.iterator]();
      return {
        _effectedIterator: true,
        next: (...args: [] | [unknown]) => {
          const result = iterator.next(...args);
          if (result.done) return { done: true, value: resume(result.value) };
          return result;
        },
      };
    }) as never);
  }

  /**
   * Terminate an effect with the return value of the handler.
   *
   * It is a shortcut for
   * `handle(effect, ({ terminate }, ...payloads) => terminate(handler(...payloads)))`.
   * @param effect The effect name or a function to match the effect name.
   * @param handler The handler for the effect. The arguments are the payloads of the effect.
   * @returns
   *
   * @see {@link handle}
   */
  terminate<Name extends ExtractEffect<E>["name"], T, F extends Effect = never>(
    effect: Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads> ?
        (...payloads: Payloads) => Generator<F, T, unknown> | Effected<F, T>
      : never
    : never,
  ): Effected<ExcludeEffect<E, Effect<Name>> | F, R | T>;
  terminate<Name extends string | symbol, T, F extends Effect = never>(
    effect: (name: ExtractEffect<E>["name"]) => name is Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads> ?
        (...payloads: Payloads) => Generator<F, T, unknown> | Effected<F, T>
      : never
    : never,
  ): Effected<ExcludeEffect<E, Effect<Name>> | F, R | T>;
  terminate<Name extends ExtractEffect<E>["name"], T>(
    effect: Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads> ?
        (...payloads: Payloads) => T
      : never
    : never,
  ): Effected<ExcludeEffect<E, Effect<Name>>, R | T>;
  terminate<Name extends string | symbol, T>(
    effect: (name: ExtractEffect<E>["name"]) => name is Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads> ?
        (...payloads: Payloads) => T
      : never
    : never,
  ): Effected<ExcludeEffect<E, Effect<Name>>, R | T>;
  terminate(effect: any, handler: (...payloads: unknown[]) => unknown) {
    return this.handle(effect, (({ terminate }: any, ...payloads: unknown[]) => {
      const it = handler(...payloads);
      if (!(it instanceof Effected) && !isGenerator(it)) return terminate(it);
      const iterator = it[Symbol.iterator]();
      return {
        _effectedIterator: true,
        next: (...args: [] | [unknown]) => {
          const result = iterator.next(...args);
          if (result.done) return { done: true, value: terminate(result.value) };
          return result;
        },
      };
    }) as never);
  }

  /**
   * Overwrite the return value of the effected program with a new value.
   * @param value The new value to return.
   * @returns
   *
   * @since 0.3.2
   */
  as<S>(value: S): Effected<E, S> {
    return this.map(() => value);
  }
  /**
   * Overwrite the return value of the effected program with `void`.
   * @returns
   *
   * @since 0.3.2
   */
  asVoid(): Effected<E, void> {
    return this.as(undefined);
  }

  /**
   * Maps the return value using a pure function without handling effects.
   * Optimized for the simple value transformation case.
   * @param mapper The function to transform the result value.
   * @returns
   *
   * @since 0.3.2
   */
  map<S>(mapper: (value: R) => S): Effected<E, S> {
    return effected(() => {
      const iterator = this[Symbol.iterator]();
      return {
        next: (...args: [] | [unknown]) => {
          const result = iterator.next(...args);
          if (!result.done) return result;
          return { done: true, value: mapper(result.value) };
        },
      };
    });
  }

  /**
   * Chains an effected program after the current one, where the chained effected program will
   * receive the return value of the current one.
   * @param mapper A function that returns an effected program or generator.
   * @returns
   *
   * @since 0.3.2
   */
  flatMap<S, F extends Effect = never>(
    mapper: (value: R) => Generator<F, S, unknown> | Effected<F, S>,
  ): Effected<E | F, S> {
    return effected(() => {
      const iterator = this[Symbol.iterator]();
      let originalDone = false;
      let appendedIterator: Iterator<Effect, unknown, unknown>;
      return {
        next: (...args: [] | [R]) => {
          if (originalDone) return appendedIterator.next(...args);
          const result = iterator.next(...args);
          if (!result.done) return result;
          originalDone = true;
          const it = mapper(result.value);
          appendedIterator = it[Symbol.iterator]();
          return appendedIterator.next();
        },
      };
    }) as never;
  }

  /**
   * Chains another function or effected program after the current one, where the chained function
   * or effected program will receive the return value of the current one.
   * @param handler The function or effected program to chain after the current one.
   * @returns
   *
   * @since 0.3.0
   */
  andThen<S, F extends Effect = never>(
    handler: (value: R) => Generator<F, S, unknown> | Effected<F, S> | S,
  ): Effected<E | F, S>;
  andThen(handler: (value: R) => unknown): Effected<Effect, unknown> {
    return effected(() => {
      const iterator = this[Symbol.iterator]();
      let originalIteratorDone = false;
      let appendedIterator: Iterator<Effect, unknown, unknown>;
      return {
        next: (...args: [] | [R]) => {
          if (originalIteratorDone) return appendedIterator.next(...args);
          const result = iterator.next(...args);
          if (!result.done) return result;
          originalIteratorDone = true;
          const it = handler(result.value);
          if (!(it instanceof Effected) && !isGenerator(it) && !isEffectedIterator(it))
            return { done: true, value: it };
          appendedIterator = Symbol.iterator in it ? it[Symbol.iterator]() : it;
          return appendedIterator.next();
        },
      };
    });
  }

  /**
   * Tap the return value of the effected program.
   * @param handler The function to tap the return value.
   * @returns
   *
   * @since 0.2.1
   */
  tap<F extends Effect = never>(
    handler: (value: R) => void | Generator<F, void, unknown> | Effected<F, void>,
  ): Effected<E | F, R> {
    return this.andThen((value) => {
      const it = handler(value);
      if (!(it instanceof Effected) && !isGenerator(it)) return value;
      const iterator = it[Symbol.iterator]();
      return {
        _effectedIterator: true,
        next: (...args: [] | [unknown]) => {
          const result = iterator.next(...args);
          if (result.done) return { done: true, value };
          return result;
        },
      };
    }) as never;
  }

  /**
   * Combines the return value of the current effected program with another effected program.
   *
   * Note: This method runs the two effected programs sequentially. To run them in parallel, use
   * {@link Effected.all}.
   * @param that The other effected program to combine with.
   * @param mapper A optional function that takes the return value of the current program and the
   * other program and returns a new value.
   * @returns
   */
  zip<S, F extends Effect>(that: Effected<F, S>): Effected<E | F, [R, S]>;
  zip<S, F extends Effect, T, G extends Effect = never>(
    that: Effected<F, S>,
    mapper: (a: R, b: S) => T | Generator<G, T, unknown> | Effected<G, T>,
  ): Effected<E | F | G, T>;
  zip(that: Effected<Effect, unknown>, mapper?: any): Effected<Effect, unknown> {
    return effected(() => {
      const iterator = this[Symbol.iterator]();
      const thatIterator = that[Symbol.iterator]();
      let selfDone = false;
      let selfDoneValue: unknown;
      let thatDone = false;
      let appendedIterator: Iterator<Effect, unknown, unknown>;
      return {
        next: (...args: [] | [unknown]) => {
          if (selfDone && thatDone) return appendedIterator.next(...args);
          if (!selfDone) {
            const result = iterator.next(...args);
            if (!result.done) return result;
            selfDone = true;
            selfDoneValue = result.value;
          }
          const thatResult = thatIterator.next(...args);
          if (!thatResult.done) return thatResult;
          thatDone = true;
          if (mapper) {
            const it = mapper(selfDoneValue, thatResult.value);
            if (!(it instanceof Effected) && !isGenerator(it)) return { done: true, value: it };
            appendedIterator = it[Symbol.iterator]();
            return appendedIterator.next();
          }
          return { done: true, value: [selfDoneValue, thatResult.value] };
        },
      };
    }) as never;
  }

  /**
   * Catch an error effect with a handler.
   *
   * It is a shortcut for `terminate("error:" + name, handler)`.
   * @param name The name of the error effect.
   * @param handler The handler for the error effect. The argument is the message of the error.
   * @returns
   *
   * @see {@link terminate}
   */
  catch<Name extends ErrorName<ExtractEffect<E>>, T, F extends Effect = never>(
    effect: Name,
    handler: (message?: string) => Generator<F, T, unknown> | Effected<F, T>,
  ): Effected<ExcludeEffect<E, Effect.Error<Name>> | F, R | T>;
  catch<Name extends ErrorName<ExtractEffect<E>>, T>(
    effect: Name,
    handler: (message?: string) => T,
  ): Effected<ExcludeEffect<E, Effect.Error<Name>>, R | T>;
  catch(name: string, handler: (message?: string) => unknown): Effected<Effect, unknown> {
    return this.terminate(`error:${name}` as never, handler as never);
  }

  /**
   * Catch all error effects with a handler.
   * @param handler The handler for the error effect. The first argument is the name of the error
   * effect (without the `"error:"` prefix), and the second argument is the message of the error.
   */
  catchAll<T, F extends Effect = never>(
    handler: (
      error: ErrorName<ExtractEffect<E>>,
      message?: string,
    ) => Generator<F, T, unknown> | Effected<F, T>,
  ): Effected<ExcludeEffect<E, Effect.Error> | F, R | T>;
  catchAll<T>(
    handler: (error: ErrorName<ExtractEffect<E>>, message?: string) => T,
  ): Effected<ExcludeEffect<E, Effect.Error>, R | T>;
  catchAll(
    handler: (error: ErrorName<ExtractEffect<E>>, message?: string) => unknown,
  ): Effected<Effect, unknown> {
    return this.handle(
      (name): name is ErrorName<E> => typeof name === "string" && name.startsWith("error:"),
      (({ effect, terminate }: any, ...payloads: [message?: string]) => {
        const error = effect.name.slice(6) as ErrorName<ExtractEffect<E>>;
        const it = handler(error, ...payloads);
        if (!(it instanceof Effected) && !isGenerator(it)) return terminate(it);
        const iterator = it[Symbol.iterator]();
        return {
          _effectedIterator: true,
          next: (...args: [] | [unknown]) => {
            const result = iterator.next(...args);
            if (result.done) return { done: true, value: terminate(result.value) };
            return result;
          },
        };
      }) as never,
    );
  }

  /**
   * Catch an error effect and throw it as an error.
   * @param name The name of the error effect.
   * @param message The message of the error. If it is a function, it will be called with the
   * message of the error effect, and the return value will be used as the message of the error.
   * @returns
   *
   * @since 0.1.1
   */
  catchAndThrow<Name extends ErrorName<ExtractEffect<E>>>(
    name: Name,
    message?: string | ((message?: string) => string | undefined),
  ): Effected<ExcludeEffect<E, Effect.Error<Name>>, R> {
    return this.catch(name, (...args) => {
      throw new (buildErrorClass(name))(
        ...(typeof message === "string" ? [message]
        : typeof message === "function" ? [message(...args)].filter((v) => v !== undefined)
        : args),
      );
    });
  }

  /**
   * Catch all error effects and throw them as an error.
   * @param message The message of the error. If it is a function, it will be called with the name
   * and the message of the error effect, and the return value will be used as the message of the
   * error.
   * @returns
   *
   * @since 0.1.1
   */
  catchAllAndThrow(
    message?: string | ((error: string, message?: string) => string | undefined),
  ): Effected<ExcludeEffect<E, Effect.Error>, R> {
    return this.catchAll((error, ...args) => {
      throw new (buildErrorClass(error))(
        ...(typeof message === "string" ? [message]
        : typeof message === "function" ? [message(error, ...args)].filter((v) => v !== undefined)
        : args),
      );
    });
  }

  /**
   * Provide a value for a dependency effect.
   * @param name The name of the dependency.
   * @param value The value to provide for the dependency.
   * @returns
   */
  provide<Name extends DependencyName<ExtractEffect<E>>>(
    name: Name,
    value: ExtractEffect<E> extends infer E extends Effect ?
      E extends Effect.Dependency<Name, infer R> ?
        R
      : never
    : never,
  ): Effected<ExcludeEffect<E, Effect.Dependency<Name>>, R> {
    return this.resume(`dependency:${name}` as never, (() => value) as never) as never;
  }

  /**
   * Provide a value for a dependency effect with a getter.
   * @param name The name of the dependency.
   * @param getter The getter to provide for the dependency.
   * @returns
   */
  provideBy<Name extends DependencyName<ExtractEffect<E>>, F extends Effect = never>(
    name: Name,
    getter: ExtractEffect<E> extends infer E extends Effect ?
      E extends Effect.Dependency<Name, infer R> ?
        () => R | Generator<F, R, unknown> | Effected<F, R>
      : never
    : never,
  ): Effected<ExcludeEffect<E, Effect.Dependency<Name>> | F, R> {
    return this.resume(`dependency:${name}`, getter as never) as never;
  }

  /**
   * Apply a handler to the effected program.
   * @param handler The handler to apply to the effected program.
   * @returns
   */
  with<F extends Effect, G extends Effect, S>(
    handler: (self: EffectedDraft<never, never, R>) => EffectedDraft<F, G, S>,
  ): Effected<ExcludeEffect<E, F> | G, S>;
  with<F extends Effect, S>(handler: (self: Effected<E, R>) => Effected<F, S>): Effected<F, S>;
  with(handler: (self: any) => unknown) {
    return handler(this);
  }

  /**
   * Pipe the effected program through a series of functions.
   * @returns
   */
  // Generated overloads. See `scripts/generate-pipe-overloads.ts`
  // * 1
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>): Effected<Exclude<E, E1In> | E2Out, R2>;
  // prettier-ignore
  pipe<E2 extends Effect, R2>(a: (self: Effected<E, R>) => Effected<E2, R2>): Effected<E2, R2>;
  // * 2
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>): Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>): Effected<E3, R3>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>): Effected<Exclude<E2, E2In> | E3Out, R3>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>): Effected<E3, R3>;
  // * 3
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>): Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>): Effected<E4, R4>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>): Effected<Exclude<E3, E3In> | E4Out, R4>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>): Effected<E4, R4>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>): Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>): Effected<E4, R4>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>): Effected<Exclude<E3, E3In> | E4Out, R4>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>): Effected<E4, R4>;
  // * 4
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>): Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>): Effected<E5, R5>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>): Effected<Exclude<E4, E4In> | E5Out, R5>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>): Effected<E5, R5>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>): Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>): Effected<E5, R5>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>): Effected<Exclude<E4, E4In> | E5Out, R5>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>): Effected<E5, R5>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>): Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>): Effected<E5, R5>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>): Effected<Exclude<E4, E4In> | E5Out, R5>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>): Effected<E5, R5>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>): Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>): Effected<E5, R5>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>): Effected<Exclude<E4, E4In> | E5Out, R5>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>): Effected<E5, R5>;
  // * 5
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<E5, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<E5, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<E5, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<E5, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<E5, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<E5, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<E5, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>): Effected<Exclude<E5, E5In> | E6Out, R6>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>): Effected<E6, R6>;
  // * 6
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>): Effected<Exclude<E6, E6In> | E7Out, R7>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>): Effected<E7, R7>;
  // * 7
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>): Effected<Exclude<E7, E7In> | E8Out, R8>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>): Effected<E8, R8>;
  // * 8
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<Exclude<E, E1In> | E2Out, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E1In extends Effect, E2Out extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: EffectedDraft<never, never, R>) => EffectedDraft<E1In, E2Out, R2>, b: (self: Effected<Exclude<E, E1In> | E2Out, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<Exclude<E2, E2In> | E3Out, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E2In extends Effect, E3Out extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: EffectedDraft<never, never, R2>) => EffectedDraft<E2In, E3Out, R3>, c: (self: Effected<Exclude<E2, E2In> | E3Out, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<Exclude<E3, E3In> | E4Out, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E3In extends Effect, E4Out extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: EffectedDraft<never, never, R3>) => EffectedDraft<E3In, E4Out, R4>, d: (self: Effected<Exclude<E3, E3In> | E4Out, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<Exclude<E4, E4In> | E5Out, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E4In extends Effect, E5Out extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: EffectedDraft<never, never, R4>) => EffectedDraft<E4In, E5Out, R5>, e: (self: Effected<Exclude<E4, E4In> | E5Out, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<Exclude<E5, E5In> | E6Out, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E5In extends Effect, E6Out extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: EffectedDraft<never, never, R5>) => EffectedDraft<E5In, E6Out, R6>, f: (self: Effected<Exclude<E5, E5In> | E6Out, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<Exclude<E6, E6In> | E7Out, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E6In extends Effect, E7Out extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: EffectedDraft<never, never, R6>) => EffectedDraft<E6In, E7Out, R7>, g: (self: Effected<Exclude<E6, E6In> | E7Out, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<Exclude<E7, E7In> | E8Out, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E7In extends Effect, E8Out extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: EffectedDraft<never, never, R7>) => EffectedDraft<E7In, E8Out, R8>, h: (self: Effected<Exclude<E7, E7In> | E8Out, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E8In extends Effect, E9Out extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: EffectedDraft<never, never, R8>) => EffectedDraft<E8In, E9Out, R9>): Effected<Exclude<E8, E8In> | E9Out, R9>;
  // prettier-ignore
  pipe<E2 extends Effect, R2, E3 extends Effect, R3, E4 extends Effect, R4, E5 extends Effect, R5, E6 extends Effect, R6, E7 extends Effect, R7, E8 extends Effect, R8, E9 extends Effect, R9>(a: (self: Effected<E, R>) => Effected<E2, R2>, b: (self: Effected<E2, R2>) => Effected<E3, R3>, c: (self: Effected<E3, R3>) => Effected<E4, R4>, d: (self: Effected<E4, R4>) => Effected<E5, R5>, e: (self: Effected<E5, R5>) => Effected<E6, R6>, f: (self: Effected<E6, R6>) => Effected<E7, R7>, g: (self: Effected<E7, R7>) => Effected<E8, R8>, h: (self: Effected<E8, R8>) => Effected<E9, R9>): Effected<E9, R9>;
  pipe(...fs: ((value: any) => any)[]): any {
    // Optimization inspired by Effect
    // https://github.com/Effect-TS/effect/blob/f293e97ab2a26f45586de106b85119c5d98ab4c7/packages/effect/src/Pipeable.ts#L491-L524
    switch (fs.length) {
      case 0:
        return this;
      case 1:
        return fs[0]!(this);
      case 2:
        return fs[1]!(fs[0]!(this));
      case 3:
        return fs[2]!(fs[1]!(fs[0]!(this)));
      case 4:
        return fs[3]!(fs[2]!(fs[1]!(fs[0]!(this))));
      case 5:
        return fs[4]!(fs[3]!(fs[2]!(fs[1]!(fs[0]!(this)))));
      case 6:
        return fs[5]!(fs[4]!(fs[3]!(fs[2]!(fs[1]!(fs[0]!(this))))));
      case 7:
        return fs[6]!(fs[5]!(fs[4]!(fs[3]!(fs[2]!(fs[1]!(fs[0]!(this)))))));
      case 8:
        return fs[7]!(fs[6]!(fs[5]!(fs[4]!(fs[3]!(fs[2]!(fs[1]!(fs[0]!(this))))))));
      case 9:
        return fs[8]!(fs[7]!(fs[6]!(fs[5]!(fs[4]!(fs[3]!(fs[2]!(fs[1]!(fs[0]!(this)))))))));
      default: {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let result = this;
        for (let i = 0, len = fs.length; i < len; i++) result = fs[i]!(result);
        return result;
      }
    }
  }
}

export interface EffectedDraft<
  out P extends Effect = Effect,
  out E extends Effect = Effect,
  out R = unknown,
> extends Iterable<E, R, unknown> {
  handle<Name extends ExtractEffect<E>["name"], T = R, F extends Effect = never>(
    effect: Name,
    handler: ExtractEffect<E> extends infer E ?
      Extract<E, Effect<Name>> extends Unresumable<Effect> ?
        (
          {
            effect,
            terminate,
          }: { effect: Extract<E, Effect<Name>>; terminate: (value: T) => void },
          ...payloads: Extract<E, Effect<Name>>["payloads"]
        ) => void | Generator<F, void, unknown> | Effected<F, void>
      : (
          {
            effect,
            resume,
            terminate,
          }: {
            effect: Extract<E, Effect<Name>>;
            resume: (value: Extract<E, Effect<Name>>["__returnType"]) => void;
            terminate: (value: T) => void;
          },
          ...payloads: Extract<E, Effect<Name>>["payloads"]
        ) => void | Generator<F, void, unknown> | Effected<F, void>
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect<Name>> | F, R | T>;
  handle<Name extends string | symbol, T = R, F extends Effect = never>(
    effect: (name: ExtractEffect<E>["name"]) => name is Name,
    handler: ExtractEffect<E> extends infer E ?
      Extract<E, Effect<Name>> extends Unresumable<Effect> ?
        (
          {
            effect,
            terminate,
          }: { effect: Extract<E, Effect<Name>>; terminate: (value: T) => void },
          ...payloads: Extract<E, Effect<Name>>["payloads"]
        ) => void | Generator<F, void, unknown> | Effected<F, void>
      : (
          {
            effect,
            resume,
            terminate,
          }: {
            effect: Extract<E, Effect<Name>>;
            resume: (value: Extract<E, Effect<Name>>["__returnType"]) => void;
            terminate: (value: T) => void;
          },
          ...payloads: Extract<E, Effect<Name>>["payloads"]
        ) => void | Generator<F, void, unknown> | Effected<F, void>
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect<Name>> | F, R | T>;

  resume<Name extends Exclude<E, Unresumable<Effect>>["name"], F extends Effect = never>(
    effect: Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads, infer R> ?
        (...payloads: Payloads) => R | Generator<F, R, unknown> | Effected<F, R>
      : never
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect<Name>> | F, R>;
  resume<Name extends string | symbol, F extends Effect = never>(
    effect: (name: Exclude<E, Unresumable<Effect>>["name"]) => name is Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads, infer R> ?
        (...payloads: Payloads) => R | Generator<F, R, unknown> | Effected<F, R>
      : never
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect<Name>> | F, R>;

  terminate<Name extends ExtractEffect<E>["name"], T, F extends Effect = never>(
    effect: Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads> ?
        (...payloads: Payloads) => Generator<F, T, unknown> | Effected<F, T>
      : never
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect<Name>> | F, R | T>;
  terminate<Name extends string | symbol, T, F extends Effect = never>(
    effect: (name: ExtractEffect<E>["name"]) => name is Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads> ?
        (...payloads: Payloads) => Generator<F, T, unknown> | Effected<F, T>
      : never
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect<Name>> | F, R | T>;
  terminate<Name extends ExtractEffect<E>["name"], T>(
    effect: Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads> ?
        (...payloads: Payloads) => T
      : never
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect<Name>>, R | T>;
  terminate<Name extends string | symbol, T>(
    effect: (name: ExtractEffect<E>["name"]) => name is Name,
    handler: ExtractEffect<E> extends infer E ?
      E extends Effect<Name, infer Payloads> ?
        (...payloads: Payloads) => T
      : never
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect<Name>>, R | T>;

  as<S>(value: S): EffectedDraft<P, E, S>;
  asVoid(): EffectedDraft<P, E, void>;

  map<S>(mapper: (value: R) => S): EffectedDraft<P, E, S>;

  flatMap<S, F extends Effect = never>(
    mapper: (value: R) => Generator<F, S, unknown> | Effected<F, S>,
  ): EffectedDraft<P, E | F, S>;

  andThen<S, F extends Effect = never>(
    handler: (value: R) => Generator<F, S, unknown> | Effected<F, S> | S,
  ): EffectedDraft<P, E | F, S>;

  tap<F extends Effect = never>(
    handler: (value: R) => void | Generator<F, void, unknown> | Effected<F, void>,
  ): EffectedDraft<P, E | F, R>;

  zip<S, F extends Effect>(that: Effected<F, S>): EffectedDraft<P, E | F, [R, S]>;
  zip<S, F extends Effect, T, G extends Effect = never>(
    that: Effected<F, S>,
    mapper: (a: R, b: S) => T | Generator<G, T, unknown> | Effected<G, T>,
  ): EffectedDraft<P, E | F | G, T>;

  catch<Name extends ErrorName<ExtractEffect<E>>, T, F extends Effect = never>(
    effect: Name,
    handler: (message?: string) => Generator<F, T, unknown> | Effected<F, T>,
  ): EffectedDraft<P, ExcludeEffect<E, Effect.Error<Name>> | F, R | T>;
  catch<Name extends ErrorName<ExtractEffect<E>>, T>(
    effect: Name,
    handler: (message?: string) => T,
  ): EffectedDraft<P, ExcludeEffect<E, Effect.Error<Name>>, R | T>;

  catchAll<T, F extends Effect = never>(
    handler: (
      effect: ErrorName<ExtractEffect<E>>,
      message?: string,
    ) => Generator<F, T, unknown> | Effected<F, T>,
  ): Effected<ExcludeEffect<E, Effect.Error> | F, R | T>;
  catchAll<T>(
    handler: (effect: ErrorName<ExtractEffect<E>>, message?: string) => T,
  ): Effected<ExcludeEffect<E, Effect.Error>, R | T>;

  catchAndThrow<Name extends ErrorName<ExtractEffect<E>>>(
    name: Name,
    message?: string | ((message?: string) => string | undefined),
  ): Effected<ExcludeEffect<E, Effect.Error<Name>>, R>;

  catchAllAndThrow(
    message?: string | ((error: string, message?: string) => string | undefined),
  ): Effected<ExcludeEffect<E, Effect.Error>, R>;

  provide<Name extends DependencyName<ExtractEffect<E>>>(
    name: Name,
    value: ExtractEffect<E> extends infer E extends Effect ?
      E extends Effect.Dependency<Name, infer R> ?
        R
      : never
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect.Dependency<Name>>, R>;
  provideBy<Name extends DependencyName<ExtractEffect<E>>, F extends Effect = never>(
    name: Name,
    getter: ExtractEffect<E> extends infer E extends Effect ?
      E extends Effect.Dependency<Name, infer R> ?
        () => R | Generator<F, R, unknown> | Effected<F, R>
      : never
    : never,
  ): EffectedDraft<P, ExcludeEffect<E, Effect.Dependency<Name>> | F, R>;

  with<F extends Effect, G extends Effect, S>(
    handler: (self: EffectedDraft<never, never, R>) => EffectedDraft<F, G, S>,
  ): EffectedDraft<P, ExcludeEffect<E, F> | G, S>;
  with<F extends Effect, S>(
    handler: (self: Effected<E, R>) => Effected<F, S>,
  ): EffectedDraft<P, F, S>;
}

/**
 * Create an effected program.
 * @param fn A function that returns an iterator.
 * @returns
 *
 * @example
 * ```typescript
 * type User = { id: number; name: string; role: "admin" | "user" };
 *
 * // Use `effect` and its variants to define factory functions for effects
 * const println = effect("println")<unknown[], void>;
 * const executeSQL = effect("executeSQL")<[sql: string, ...params: unknown[]], any>;
 * const askCurrentUser = dependency("currentUser")<User | null>;
 * const authenticationError = error("authentication");
 * const unauthorizedError = error("unauthorized");
 *
 * // Use `effected` to define an effected program
 * const requiresAdmin = () => effected(function* () {
 *   const currentUser = yield* askCurrentUser();
 *   if (!currentUser) return yield* authenticationError();
 *   if (currentUser.role !== "admin")
 *     return yield* unauthorizedError(`User "${currentUser.name}" is not an admin`);
 * });
 *
 * // You can yield other effected programs in an effected program
 * const createUser = (user: Omit<User, "id">) => effected(function* () {
 *   yield* requiresAdmin();
 *   const id = yield* executeSQL("INSERT INTO users (name) VALUES (?)", user.name);
 *   const savedUser: User = { id, ...user };
 *   yield* println("User created:", savedUser);
 *   return savedUser;
 * });
 *
 * const program = effected(function* () {
 *   yield* createUser({ name: "Alice", role: "user" });
 *   yield* createUser({ name: "Bob", role: "admin" });
 * })
 *   // Handle effects with the `.handle()` method
 *   .handle("executeSQL", function* ({ resume, terminate }, sql, ...params) {
 *     // You can yield other effects in a handler using a generator function
 *     yield* println("Executing SQL:", sql, ...params);
 *     // Asynchronous effects are supported
 *     db.execute(sql, params, (err, result) => {
 *       if (err) return terminate(err);
 *       resume(result);
 *     });
 *   })
 *   // a shortcut for `.handle()` that resumes the effect with the return value of the handler
 *   .resume("println", (...args) => console.log(...args))
 *   // Other shortcuts for special effects (error effects and dependency effects)
 *   .provide("currentUser", { id: 1, name: "Charlie", role: "admin" })
 *   .catch("authentication", () => console.error("Authentication error"));
 *   .catch("unauthorized", () => console.error("Unauthorized error"));
 *
 * // Run the effected program with `.runSync()` or `.runAsync()`
 * await program.runAsync();
 * ```
 *
 * @see {@link effect}
 */
export function effected<E extends Effect, R>(fn: () => Iterator<E, R, unknown>): Effected<E, R> {
  return new (Effected as any)(
    fn,
    "Yes, I’m sure I want to call the constructor of Effected directly.",
  );
}

/**
 * Convert a {@link Promise} to an effected program containing a single {@link Effect}.
 * @param promise The promise to effectify.
 * @returns
 *
 * ```typescript
 * // Assume we have `db.user.create(user: User): Promise<number>`
 * const createUser = (user: Omit<User, "id">) => effected(function* () {
 *   yield* requiresAdmin();
 *   // Use `yield* effectify(...)` instead of `await ...` in an effected program
 *   const id = yield* effectify(db.user.create(user));
 *   const savedUser = { id, ...user };
 *   yield* println("User created:", savedUser);
 *   return savedUser;
 * });
 * ```
 */
export function effectify<T>(promise: Promise<T>): Effected<never, T> {
  return effected(() => {
    let state = 0;
    return {
      next: (...args) => {
        switch (state) {
          case 0:
            state++;
            return {
              done: false,
              value: {
                _effectAsync: true,
                onComplete: (
                  ...args: [onComplete: (value: T) => void, onThrow?: (value: unknown) => void]
                ) => promise.then(...args),
              } as never,
            };
          case 1:
            state++;
            return {
              done: true,
              ...(args.length > 0 ? { value: args[0] } : {}),
            } as IteratorReturnResult<T>;
          default:
            return { done: true } as IteratorReturnResult<T>;
        }
      },
    };
  });
}

/**
 * Run an effected program synchronously and return its result.
 * @param effected The effected program.
 * @returns
 *
 * @throws {UnhandledEffectError} If an unhandled effect is encountered.
 * @throws {Error} If an asynchronous effect is encountered.
 */
export function runSync<E extends Effected<Effect, unknown>>(
  effected: E extends Effected<infer F extends Effect, unknown> ?
    [ExtractUnhandled<F>] extends [never] ?
      E
    : UnhandledEffect<ExtractUnhandled<F>>
  : never,
): E extends Effected<infer F, infer R> ? ExtractDefaultTerminateType<F> | R : never {
  const iterator = (effected as Iterable<any>)[Symbol.iterator]();
  const context = {
    interceptIterator: null as typeof iterator | null,
    terminated: false as false | "with-value" | "without-value",
    terminatedValue: undefined as unknown,
  };

  let { done, value } = (context.interceptIterator || iterator).next();
  while (!done) {
    if (context.terminated) return context.terminatedValue as never;

    if (!value)
      throw new Error(
        `Invalid effected program: an effected program should yield only effects (received ${stringify(value)})`,
      );
    if (value instanceof Effect) {
      while (value instanceof Effect && typeof (value as any).defaultHandler === "function") {
        value = handleEffect(context, effect.name, value, (value as any).defaultHandler).value;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (context.terminated) return context.terminatedValue as never;
      }
      if (value instanceof Effect)
        throw new UnhandledEffectError(value, `Unhandled effect: ${stringifyEffect(value)}`);
    }
    if (value._effectSync) {
      ({ done, value } = (context.interceptIterator || iterator).next(
        ...("value" in value ? [value.value] : []),
      ));
      continue;
    }
    if (value._effectAsync)
      throw new Error(
        "Cannot run an asynchronous effected program with `runSync`, use `runAsync` instead",
      );

    throw new Error(
      `Invalid effected program: an effected program should yield only effects (received ${stringify(value)})`,
    );
  }
  return value;
}

/**
 * Run a (possibly) asynchronous effected program and return its result as a {@link Promise}.
 * @param effected The effected program.
 * @returns
 *
 * @throws {UnhandledEffectError} If an unhandled effect is encountered.
 */
export function runAsync<E extends Effected<Effect, unknown>>(
  effected: E extends Effected<infer F extends Effect, unknown> ?
    [ExtractUnhandled<F>] extends [never] ?
      E
    : UnhandledEffect<ExtractUnhandled<F>>
  : never,
): Promise<E extends Effected<infer F, infer R> ? ExtractDefaultTerminateType<F> | R : never> {
  const iterator = (effected as Iterable<any>)[Symbol.iterator]();
  const context = {
    interceptIterator: null as typeof iterator | null,
    terminated: false as false | "with-value" | "without-value",
    terminatedValue: undefined as unknown,
  };

  return new Promise((resolve, reject) => {
    const iterate = (...args: [] | [unknown]) => {
      if (context.terminated) return context.terminatedValue;

      let done: boolean | undefined;
      let value: any;
      try {
        ({ done, value } = (context.interceptIterator || iterator).next(...args));
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject(e);
        return;
      }

      // We use a while loop to avoid stack overflow when there are many synchronous effects
      while (!done) {
        if (!value) {
          reject(
            new Error(
              `Invalid effected program: an effected program should yield only effects (received ${stringify(value)})`,
            ),
          );
          return;
        }
        if (value instanceof Effect) {
          while (value instanceof Effect && typeof (value as any).defaultHandler === "function") {
            value = handleEffect(context, effect.name, value, (value as any).defaultHandler).value;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (context.terminated) return context.terminatedValue;
          }
          if (value instanceof Effect) {
            reject(new UnhandledEffectError(value, `Unhandled effect: ${stringifyEffect(value)}`));
            return;
          }
        }
        if (value._effectSync) {
          try {
            ({ done, value } = (context.interceptIterator || iterator).next(
              ...("value" in value ? [value.value] : []),
            ));
          } catch (e) {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(e);
            return;
          }
          continue;
        }
        if (value._effectAsync) {
          if (value.interruptable) {
            let resolve!: (value: unknown) => void;
            const promise = new Promise((_resolve) => (resolve = _resolve));
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            value.onComplete(resolve, (...args: unknown[]) => reject(...args.slice(0, 1)));
            ({ done, value } = (context.interceptIterator || iterator).next({
              _effectInterrupt: value.interruptable,
              with: promise,
            }));
            continue;
          } else {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            value.onComplete(iterate, (...args: unknown[]) => reject(...args.slice(0, 1)));
            return;
          }
        }
        reject(
          new Error(
            `Invalid effected program: an effected program should yield only effects (received ${stringify(value)})`,
          ),
        );
        return;
      }

      resolve(value);
    };

    iterate();
  });
}

/*********************
 * Utility functions *
 *********************/
/**
 * Handle an effect with a handler.
 * @param context The context.
 * @param effect The effect to handle.
 * @param handler The handler for the effect.
 * @returns
 */
const handleEffect = <E extends Effect, R>(
  context: {
    terminated: false | "with-value" | "without-value";
    terminatedValue: R | undefined;
    interceptIterator: Iterator<E, R, unknown> | null;
  },

  effectName: string | symbol | ((...args: never) => unknown),
  effect: E,
  handler: (
    {
      effect,
      resume,
      terminate,
    }: {
      effect: Effect;
      resume: (value: R) => void;
      terminate: (value: R) => void;
    },
    ...payloads: unknown[]
  ) => void | Generator<Effect, void, unknown> | Effected<Effect, void>,
): IteratorResult<E, R> => {
  let resumed: false | "with-value" | "without-value" = false;
  let resumedValue: R;
  let onComplete: ((...args: [] | [R]) => void) | null = null;
  const warnMultipleHandling = (type: "resume" | "terminate", ...args: [] | [R]) => {
    let message = `Effect ${stringifyEffectNameQuoted(effectName)} has been handled multiple times`;
    message += " (received `";
    message += `${type} ${stringifyEffect(effect)}`;
    if (args.length > 0) message += ` with ${stringify(args[0])}`;
    message += "` after it has been ";
    if (resumed) {
      message += "resumed";
      if (resumed === "with-value") message += ` with ${stringify(resumedValue)}`;
    } else if (context.terminated) {
      message += "terminated";
      if (context.terminated === "with-value")
        message += ` with ${stringify(context.terminatedValue)}`;
    }
    message += "). Only the first handler will be used.";
    logger.warn(message);
  };
  const resume = (...args: [] | [R]) => {
    if (resumed || context.terminated) {
      warnMultipleHandling("resume", ...args);
      return;
    }
    resumed = args.length > 0 ? "with-value" : "without-value";
    if (args.length > 0) resumedValue = args[0]!;
    if (onComplete) {
      onComplete(...args);
      onComplete = null;
    }
  };
  const terminate = (...args: [] | [R]) => {
    if (resumed || context.terminated) {
      warnMultipleHandling("terminate", ...args);
      return;
    }
    context.terminated = args.length > 0 ? "with-value" : "without-value";
    if (args.length > 0) context.terminatedValue = args[0];
    if (onComplete) {
      onComplete(...args);
      onComplete = null;
    }
  };

  const constructHandledEffect = ():
    | { _effectSync: true; value?: unknown }
    | {
        _effectAsync: true;
        onComplete: (callback: (...args: [] | [R]) => void) => void;
      } => {
    // For synchronous effects
    if (resumed || context.terminated)
      return {
        _effectSync: true,
        ...(Object.is(resumed, "with-value") ? { value: resumedValue! }
        : Object.is(context.terminated, "with-value") ? { value: context.terminatedValue! }
        : {}),
      };
    // For asynchronous effects
    const handledEffect: ReturnType<typeof constructHandledEffect> = {
      _effectAsync: true,
      onComplete: (callback) => {
        onComplete = callback;
      },
    };
    if ((effect as any).interruptable)
      (handledEffect as any).interruptable = (effect as any).interruptable;
    return handledEffect;
  };

  const handlerResult = handler(
    {
      effect,
      resume:
        (effect as any).resumable === false ?
          () => {
            throw new Error(`Cannot resume non-resumable effect: ${stringifyEffect(effect)}`);
          }
        : resume,
      terminate,
    },
    ...effect.payloads,
  );

  if (
    !(handlerResult instanceof Effected) &&
    !isGenerator(handlerResult) &&
    !isEffectedIterator(handlerResult)
  )
    return { done: false, value: constructHandledEffect() } as never;

  const iter = Symbol.iterator in handlerResult ? handlerResult[Symbol.iterator]() : handlerResult;
  context.interceptIterator = {
    next: (...args: [] | [unknown]) => {
      const result = iter.next(...args);
      if (result.done) {
        context.interceptIterator = null;
        return { done: false, value: constructHandledEffect() } as never;
      }
      return result as never;
    },
  };
  return context.interceptIterator.next();
};

/**
 * Check if a value is a {@link Generator}.
 * @param value The value to check.
 * @returns
 */
const isGenerator = (value: unknown): value is Generator =>
  Object.prototype.toString.call(value) === "[object Generator]";

/**
 * Check if a value is an `EffectedIterator` (i.e., an {@link Iterator} with an `_effectedIterator`
 * property set to `true`).
 *
 * This is only used internally as an alternative to generators to reduce the overhead of creating
 * generator functions.
 * @param value The value to check.
 * @returns
 */
const isEffectedIterator = (
  value: unknown,
): value is Iterator<Effect, unknown, unknown> & { _effectedIterator: true } =>
  typeof value === "object" && value !== null && (value as any)._effectedIterator === true;

/**
 * Capitalize the first letter of a string.
 * @param str The string to capitalize.
 * @returns
 */
const capitalize = (str: string) => {
  if (str.length === 0) return str;
  return str[0]!.toUpperCase() + str.slice(1);
};

/**
 * Change the name of a function for better debugging experience.
 * @param fn The function to rename.
 * @param name The new name of the function.
 * @returns
 */
const renameFunction = <F extends (...args: never) => unknown>(fn: F, name: string): F =>
  Object.defineProperty(fn, "name", {
    value: name,
    writable: false,
    enumerable: false,
    configurable: true,
  });

const buildErrorClass = (name: string) => {
  const ErrorClass = class extends Error {};
  let errorName = capitalize(name);
  if (!errorName.endsWith("Error") && !errorName.endsWith("error")) errorName += "Error";
  Object.defineProperty(ErrorClass, "name", {
    value: errorName,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(ErrorClass.prototype, "name", {
    value: errorName,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return ErrorClass;
};

const stringifyEffectName = (name: string | symbol | ((...args: never) => unknown)) =>
  typeof name === "string" ? name
  : typeof name === "symbol" ? name.toString()
  : "[" + name.name + "]";

const stringifyEffectNameQuoted = (name: string | symbol | ((...args: never) => unknown)) =>
  typeof name === "string" ? `"${name}"` : stringifyEffectName(name);

const stringifyEffect = (effect: Effect) =>
  `${stringifyEffectName(effect.name)}(${effect.payloads.map(stringify).join(", ")})`;

/**
 * Stringify an object to provide better debugging experience, handling common cases that simple
 * `JSON.stringify` does not handle, e.g., `undefined`, `bigint`, `function`, `symbol`, `Date`.
 * Circular references are considered.
 *
 * This is a simple port of the [showify](https://github.com/Snowflyt/showify/blob/7759b8778d54f686c85eba4d88b2dac2afdbcdd6/packages/lite/src/index.ts)
 * package, which is a library for stringifying objects in a human-readable way.
 * @param x The object to stringify.
 * @returns
 */
const stringify = (x: unknown): string => {
  const seen = new WeakSet();
  const identifierRegex = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  const serialize = (value: unknown): string => {
    if (typeof value === "bigint") return `${value as any}n`;
    if (typeof value === "function")
      return value.name ? `[Function: ${value.name}]` : "[Function (anonymous)]";
    if (typeof value === "symbol") return value.toString();
    if (value === undefined) return "undefined";
    if (value === null) return "null";

    if (typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);

      // Handle special object types
      if (value instanceof Date) return value.toISOString();

      if (value instanceof RegExp) return value.toString();

      if (value instanceof Map) {
        const entries = Array.from(value.entries())
          .map(([k, v]) => `${serialize(k)} => ${serialize(v)}`)
          .join(", ");
        return `Map(${value.size}) ` + (entries ? `{ ${entries} }` : "{}");
      }

      if (value instanceof Set) {
        const values = Array.from(value)
          .map((v) => serialize(v))
          .join(", ");
        return `Set(${value.size}) ` + (values ? `{ ${values} }` : "{}");
      }

      // Handle arrays and objects
      const isClassInstance =
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        value.constructor && value.constructor.name && value.constructor.name !== "Object";
      const className = isClassInstance ? value.constructor.name : "";

      if (Array.isArray(value)) {
        const arrayItems = value.map((item) => serialize(item)).join(", ");
        let result = `[${arrayItems}]`;
        if (className !== "Array") result = `${className}(${value.length}) ${result}`;
        return result;
      }

      const objectEntries = Reflect.ownKeys(value)
        .map((key) => {
          const keyDisplay =
            typeof key === "symbol" ? `[${key.toString()}]`
            : identifierRegex.test(key) ? key
            : JSON.stringify(key);
          const val = (value as Record<string, unknown>)[key as any];
          return `${keyDisplay}: ${serialize(val)}`;
        })
        .join(", ");

      return (className ? `${className} ` : "") + (objectEntries ? `{ ${objectEntries} }` : "{}");
    }

    return JSON.stringify(value);
  };

  return serialize(x);
};

// `console` is not standard in JavaScript. Though rare, it is possible that `console` is not
// available in some environments. We use a proxy to handle this case and ignore errors if `console`
// is not available.
const getConsole = (() => {
  let cachedConsole: any = undefined;
  return () => {
    if (cachedConsole !== undefined) return cachedConsole;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      cachedConsole = new Function("return console")();
    } catch {
      cachedConsole = null;
    }
    return cachedConsole;
  };
})();
const logger: {
  debug(...data: unknown[]): void;
  error(...data: unknown[]): void;
  log(...data: unknown[]): void;
  warn(...data: unknown[]): void;
} = new Proxy({} as never, {
  get:
    (_, prop) =>
    (...args: unknown[]) => {
      try {
        getConsole()[prop](...args);
      } catch {
        // Ignore
      }
    },
});
