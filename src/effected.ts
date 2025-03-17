import { UnhandledEffectError } from "./errors";
import type { UnhandledEffect, Unresumable } from "./types";
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
export function effect<Name extends string | symbol, Resumable extends boolean = true>(
  name: Name,
  options?: { readonly resumable?: Resumable },
): [Resumable] extends [false] ?
  <Payloads extends unknown[], R extends never = never>(
    ...payloads: Payloads
  ) => Effected<Unresumable<Effect<Name, Payloads, R>>, R>
: <Payloads extends unknown[], R>(...payloads: Payloads) => Effected<Effect<Name, Payloads, R>, R> {
  const result = (...payloads: unknown[]) =>
    effected(() => {
      let state = 0;
      return {
        next: (...args) => {
          switch (state) {
            case 0:
              state++;
              return {
                done: false,
                value:
                  options && options.resumable === false ?
                    Object.assign(new Effect(name, payloads), { resumable: false })
                  : new Effect(name, payloads),
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
  if (options && (options as any)._overrideFunctionName === false) return result as never;
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
export function dependency<Name extends string>(
  name: Name,
): <R>() => Effected<Effect<`dependency:${Name}`, [], R>, R> {
  return renameFunction(
    effect(`dependency:${name}`, { _overrideFunctionName: false } as {}),
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
 * const raiseOption = defineHandlerFor<Raise>().with((effected) =>
 *   effected.andThen((value) => some(value)).terminate("raise", () => none),
 * );
 *
 * const safeDivide2 = (a: number, b: number) => safeDivide(a, b).with(raiseOption);
 * //    ^?: (a: number, b: number) => Effected<never, Option<number>>
 * ```
 */
export function defineHandlerFor<E extends Effect, R>(): {
  with: <S extends EffectedDraft<E>, H extends (effected: EffectedDraft<E, E, R>) => S>(
    handler: H,
  ) => H;
};
export function defineHandlerFor<E extends Effect>(): {
  with: <S extends EffectedDraft<E>, H extends <R>(effected: EffectedDraft<E, E, R>) => S>(
    handler: H,
  ) => H;
};
export function defineHandlerFor() {
  return {
    with: (handler: any) => handler,
  };
}

/**
 * An effected program.
 */
export class Effected<out E extends Effect, out R> implements Iterable<E, R, unknown> {
  declare public readonly [Symbol.iterator]: () => Iterator<E, R, unknown>;

  declare public readonly runSync: [E] extends [never] ? () => R : UnhandledEffect<E>;
  declare public readonly runAsync: [E] extends [never] ? () => Promise<R> : UnhandledEffect<E>;
  declare public readonly runSyncUnsafe: () => R;
  declare public readonly runAsyncUnsafe: () => Promise<R>;

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
  handle<Name extends E["name"], T = R, F extends Effect = never>(
    effect: Name,
    handler: E extends Unresumable<Effect<Name, infer Payloads>> ?
      (
        { effect, terminate }: { effect: Extract<E, Effect<Name>>; terminate: (value: T) => void },
        ...payloads: Payloads
        // TODO: Define a type alias to reduce repetition
        // eslint-disable-next-line sonarjs/use-type-alias
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : E extends Effect<Name, infer Payloads, infer R> ?
      (
        {
          effect,
          resume,
          terminate,
        }: {
          effect: Extract<E, Effect<Name>>;
          resume: (value: R) => void;
          terminate: (value: T) => void;
        },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : never,
  ): Effected<Exclude<E, Effect<Name>> | F, R | T>;
  handle<Name extends string | symbol, T = R, F extends Effect = never>(
    effect: (name: E["name"]) => name is Name,
    handler: E extends Unresumable<Effect<Name, infer Payloads>> ?
      (
        { effect, terminate }: { effect: Extract<E, Effect<Name>>; terminate: (value: T) => void },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : E extends Effect<Name, infer Payloads, infer R> ?
      (
        {
          effect,
          resume,
          terminate,
        }: {
          effect: Extract<E, Effect<Name>>;
          resume: (value: R) => void;
          terminate: (value: T) => void;
        },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : never,
  ): Effected<Exclude<E, Effect<Name>> | F, R | T>;
  handle(
    name: string | symbol | ((name: string | symbol) => boolean),
    handler: (...args: any[]) => unknown,
  ): Effected<any, unknown> {
    const matchEffect = (value: unknown) =>
      value instanceof Effect &&
      (typeof name === "function" ? name(value.name) : value.name === name);

    return effected(() => {
      const iterator = this[Symbol.iterator]();
      let interceptIterator: typeof iterator | null = null;
      let terminated: false | "with-value" | "without-value" = false;
      let terminatedValue: unknown;

      return {
        next: (...args: [] | [unknown]) => {
          if (terminated)
            return {
              done: true,
              ...(terminated === "with-value" ? { value: terminatedValue } : {}),
            } as IteratorReturnResult<unknown>;

          const result = (interceptIterator || iterator).next(...args);

          const { done, value } = result;
          if (done) return result;

          if (matchEffect(value)) {
            const effect = value;

            let resumed: false | "with-value" | "without-value" = false;
            let resumedValue: R;
            let onComplete: ((...args: [] | [R]) => void) | null = null;
            const warnMultipleHandling = (type: "resume" | "terminate", ...args: [] | [R]) => {
              let message = `Effect ${stringifyEffectNameQuoted(name)} has been handled multiple times`;
              message += " (received `";
              message += `${type} ${stringifyEffect(effect)}`;
              if (args.length > 0) message += ` with ${stringify(args[0])}`;
              message += "` after it has been ";
              if (resumed) {
                message += "resumed";
                if (resumed === "with-value") message += ` with ${stringify(resumedValue)}`;
              } else if (terminated) {
                message += "terminated";
                if (terminated === "with-value") message += ` with ${stringify(terminatedValue)}`;
              }
              message += "). Only the first handler will be used.";
              logger.warn(message);
            };
            const resume = (...args: [] | [R]) => {
              if (resumed || terminated) {
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
              if (resumed || terminated) {
                warnMultipleHandling("terminate", ...args);
                return;
              }
              terminated = args.length > 0 ? "with-value" : "without-value";
              if (args.length > 0) terminatedValue = args[0];
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
              if (resumed || terminated)
                return {
                  _effectSync: true,
                  ...(Object.is(resumed, "with-value") ? { value: resumedValue! }
                  : Object.is(terminated, "with-value") ? { value: terminatedValue! }
                  : {}),
                };
              // For asynchronous effects
              return {
                _effectAsync: true,
                onComplete: (callback) => {
                  onComplete = callback;
                },
              };
            };

            const handlerResult = handler(
              {
                effect,
                resume:
                  (effect as any).resumable === false ?
                    () => {
                      throw new Error(
                        `Cannot resume non-resumable effect: ${stringifyEffect(effect)}`,
                      );
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

            const iter =
              Symbol.iterator in handlerResult ? handlerResult[Symbol.iterator]() : handlerResult;
            interceptIterator = {
              next: (...args: [] | [unknown]) => {
                const result = iter.next(...args);
                if (result.done) {
                  interceptIterator = null;
                  return { done: false, value: constructHandledEffect() } as never;
                }
                return result as never;
              },
            };
            return interceptIterator.next();
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
  resume<Name extends Exclude<E, Unresumable<Effect>>["name"], F extends Effect = never>(
    effect: Name,
    handler: E extends Effect<Name, infer Payloads, infer R> ?
      // TODO: Define a type alias to reduce repetition
      // eslint-disable-next-line sonarjs/use-type-alias
      (...payloads: Payloads) => R | Generator<F, R, unknown> | Effected<F, R>
    : never,
  ): Effected<Exclude<E, Effect<Name>> | F, R>;
  resume<Name extends string | symbol, F extends Effect = never>(
    effect: (name: Exclude<E, Unresumable<Effect>>["name"]) => name is Name,
    handler: E extends Effect<Name, infer Payloads, infer R> ?
      (...payloads: Payloads) => R | Generator<F, R, unknown> | Effected<F, R>
    : never,
  ): Effected<Exclude<E, Effect<Name>> | F, R>;
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
  terminate<Name extends E["name"], T, F extends Effect = never>(
    effect: Name,
    handler: E extends Effect<Name, infer Payloads> ?
      (...payloads: Payloads) => Generator<F, T, unknown> | Effected<F, T>
    : never,
  ): Effected<Exclude<E, Effect<Name>> | F, R | T>;
  terminate<Name extends string | symbol, T, F extends Effect = never>(
    effect: (name: E["name"]) => name is Name,
    handler: E extends Effect<Name, infer Payloads> ?
      (...payloads: Payloads) => Generator<F, T, unknown> | Effected<F, T>
    : never,
  ): Effected<Exclude<E, Effect<Name>> | F, R | T>;
  terminate<Name extends E["name"], T>(
    effect: Name,
    handler: E extends Effect<Name, infer Payloads> ? (...payloads: Payloads) => T : never,
  ): Effected<Exclude<E, Effect<Name>>, R | T>;
  terminate<Name extends string | symbol, T>(
    effect: (name: E["name"]) => name is Name,
    handler: E extends Effect<Name, infer Payloads> ? (...payloads: Payloads) => T : never,
  ): Effected<Exclude<E, Effect<Name>>, R | T>;
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
   * Chains another function or effected program after the current one, where the chained function
   * or effected program will receive the return value of the current one.
   * @param handler The function or effected program to chain after the current one.
   * @returns
   */
  andThen<S, F extends Effect = never>(
    handler: (value: R) => Generator<F, S, unknown> | Effected<F, S>,
  ): Effected<E | F, S>;
  andThen<S>(handler: (value: R) => S): Effected<E, S>;
  andThen(handler: (value: R) => unknown): Effected<Effect, unknown> {
    const iterator = this[Symbol.iterator]();

    return effected(() => {
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
   * Catch an error effect with a handler.
   *
   * It is a shortcut for `terminate("error:" + name, handler)`.
   * @param name The name of the error effect.
   * @param handler The handler for the error effect. The argument is the message of the error.
   * @returns
   *
   * @see {@link terminate}
   */
  catch<Name extends ErrorName<E>, T, F extends Effect = never>(
    effect: Name,
    handler: (message?: string) => Generator<F, T, unknown> | Effected<F, T>,
  ): Effected<Exclude<E, Effect.Error<Name>> | F, R | T>;
  catch<Name extends ErrorName<E>, T>(
    effect: Name,
    handler: (message?: string) => T,
  ): Effected<Exclude<E, Effect.Error<Name>>, R | T>;
  catch(name: string, handler: (message?: string) => unknown): Effected<Effect, unknown> {
    return this.terminate(`error:${name}` as never, handler as never);
  }

  /**
   * Catch all error effects with a handler.
   * @param handler The handler for the error effect. The first argument is the name of the error
   * effect (without the `"error:"` prefix), and the second argument is the message of the error.
   */
  catchAll<T, F extends Effect = never>(
    handler: (error: ErrorName<E>, message?: string) => Generator<F, T, unknown> | Effected<F, T>,
  ): Effected<Exclude<E, Effect.Error> | F, R | T>;
  catchAll<T>(
    handler: (error: ErrorName<E>, message?: string) => T,
  ): Effected<Exclude<E, Effect.Error>, R | T>;
  catchAll(handler: (error: ErrorName<E>, message?: string) => unknown): Effected<Effect, unknown> {
    return this.handle(
      (name): name is ErrorName<E> => typeof name === "string" && name.startsWith("error:"),
      (({ effect, terminate }: any, ...payloads: [message?: string]) => {
        const error = effect.name.slice(6) as ErrorName<E>;
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
  catchAndThrow<Name extends ErrorName<E>>(
    name: Name,
    message?: string | ((message?: string) => string | undefined),
  ): Effected<Exclude<E, Effect.Error<Name>>, R> {
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
  ): Effected<Exclude<E, Effect.Error>, R> {
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
  provide<Name extends DependencyName<E>>(
    name: Name,
    value: E extends Effect.Dependency<Name, infer R> ? R : never,
  ): Effected<Exclude<E, Effect.Dependency<Name>>, R> {
    return this.resume(`dependency:${name}` as never, (() => value) as never) as never;
  }

  /**
   * Provide a value for a dependency effect with a getter.
   * @param name The name of the dependency.
   * @param getter The getter to provide for the dependency.
   * @returns
   */
  provideBy<Name extends DependencyName<E>, F extends Effect = never>(
    name: Name,
    getter: E extends Effect.Dependency<Name, infer R> ?
      () => R | Generator<F, R, unknown> | Effected<F, R>
    : never,
  ): Effected<Exclude<E, Effect.Dependency<Name>> | F, R> {
    return this.resume(`dependency:${name}`, getter as never) as never;
  }

  /**
   * Apply a handler to the effected program.
   * @param handler The handler to apply to the effected program.
   * @returns
   */
  with<F extends Effect, G extends Effect, S>(
    handler: (effected: EffectedDraft<never, never, R>) => EffectedDraft<F, G, S>,
  ): Effected<Exclude<E, F> | G, S>;
  with<F extends Effect, S>(handler: (effected: Effected<E, R>) => Effected<F, S>): Effected<F, S>;
  with(handler: (effected: any) => unknown) {
    return handler(this);
  }
}

interface EffectedDraft<
  out P extends Effect = Effect,
  out E extends Effect = Effect,
  out R = unknown,
> extends Iterable<E, R, unknown> {
  handle<Name extends E["name"], T = R, F extends Effect = never>(
    effect: Name,
    handler: E extends Unresumable<Effect<Name, infer Payloads>> ?
      (
        { effect, terminate }: { effect: Extract<E, Effect<Name>>; terminate: (value: T) => void },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : E extends Effect<Name, infer Payloads, infer R> ?
      (
        {
          effect,
          resume,
          terminate,
        }: {
          effect: Extract<E, Effect<Name>>;
          resume: (value: R) => void;
          terminate: (value: T) => void;
        },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : never,
  ): EffectedDraft<P, Exclude<E, Effect<Name>> | F, R | T>;
  handle<Name extends string | symbol, T = R, F extends Effect = never>(
    effect: (name: E["name"]) => name is Name,
    handler: E extends Unresumable<Effect<Name, infer Payloads>> ?
      (
        { effect, terminate }: { effect: Extract<E, Effect<Name>>; terminate: (value: T) => void },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : E extends Effect<Name, infer Payloads, infer R> ?
      (
        {
          effect,
          resume,
          terminate,
        }: {
          effect: Extract<E, Effect<Name>>;
          resume: (value: R) => void;
          terminate: (value: T) => void;
        },
        ...payloads: Payloads
      ) => void | Generator<F, void, unknown> | Effected<F, void>
    : never,
  ): EffectedDraft<P, Exclude<E, Effect<Name>> | F, R | T>;

  resume<Name extends Exclude<E, Unresumable<Effect>>["name"], F extends Effect = never>(
    effect: Name,
    handler: E extends Effect<Name, infer Payloads, infer R> ?
      (...payloads: Payloads) => R | Generator<F, R, unknown> | Effected<F, R>
    : never,
  ): EffectedDraft<P, Exclude<E, Effect<Name>> | F, R>;
  resume<Name extends string | symbol, F extends Effect = never>(
    effect: (name: Exclude<E, Unresumable<Effect>>["name"]) => name is Name,
    handler: E extends Effect<Name, infer Payloads, infer R> ?
      (...payloads: Payloads) => R | Generator<F, R, unknown> | Effected<F, R>
    : never,
  ): EffectedDraft<P, Exclude<E, Effect<Name>> | F, R>;

  terminate<Name extends E["name"], T, F extends Effect = never>(
    effect: Name,
    handler: E extends Effect<Name, infer Payloads> ?
      (...payloads: Payloads) => Generator<F, T, unknown> | Effected<F, T>
    : never,
  ): EffectedDraft<P, Exclude<E, Effect<Name>> | F, R | T>;
  terminate<Name extends string | symbol, T, F extends Effect = never>(
    effect: (name: E["name"]) => name is Name,
    handler: E extends Effect<Name, infer Payloads> ?
      (...payloads: Payloads) => Generator<F, T, unknown> | Effected<F, T>
    : never,
  ): EffectedDraft<P, Exclude<E, Effect<Name>> | F, R | T>;
  terminate<Name extends E["name"], T>(
    effect: Name,
    handler: E extends Effect<Name, infer Payloads> ? (...payloads: Payloads) => T : never,
  ): EffectedDraft<P, Exclude<E, Effect<Name>>, R | T>;
  terminate<Name extends string | symbol, T>(
    effect: (name: E["name"]) => name is Name,
    handler: E extends Effect<Name, infer Payloads> ? (...payloads: Payloads) => T : never,
  ): EffectedDraft<P, Exclude<E, Effect<Name>>, R | T>;

  andThen<S, F extends Effect = never>(
    handler: (value: R) => Generator<F, S, unknown> | Effected<F, S>,
  ): EffectedDraft<P, E | F, S>;
  andThen<S>(handler: (value: R) => S): EffectedDraft<P, E, S>;

  tap<F extends Effect = never>(
    handler: (value: R) => void | Generator<F, void, unknown> | Effected<F, void>,
  ): EffectedDraft<P, E | F, R>;

  catch<Name extends ErrorName<E>, T, F extends Effect = never>(
    effect: Name,
    handler: (message?: string) => Generator<F, T, unknown> | Effected<F, T>,
  ): EffectedDraft<P, Exclude<E, Effect.Error<Name>> | F, R | T>;
  catch<Name extends ErrorName<E>, T>(
    effect: Name,
    handler: (message?: string) => T,
  ): EffectedDraft<P, Exclude<E, Effect.Error<Name>>, R | T>;

  catchAll<T, F extends Effect = never>(
    handler: (effect: ErrorName<E>, message?: string) => Generator<F, T, unknown> | Effected<F, T>,
  ): Effected<Exclude<E, Effect.Error> | F, R | T>;
  catchAll<T>(
    handler: (effect: ErrorName<E>, message?: string) => T,
  ): Effected<Exclude<E, Effect.Error>, R | T>;

  readonly catchAndThrow: <Name extends ErrorName<E>>(
    name: Name,
    message?: string | ((message?: string) => string | undefined),
  ) => Effected<Exclude<E, Effect.Error<Name>>, R>;

  readonly catchAllAndThrow: (
    message?: string | ((error: string, message?: string) => string | undefined),
  ) => Effected<Exclude<E, Effect.Error>, R>;

  readonly provide: <Name extends DependencyName<E>>(
    name: Name,
    value: E extends Effect.Dependency<Name, infer R> ? R : never,
  ) => EffectedDraft<P, Exclude<E, Effect.Dependency<Name>>, R>;
  provideBy<Name extends DependencyName<E>, F extends Effect = never>(
    name: Name,
    getter: E extends Effect.Dependency<Name, infer R> ?
      () => R | Generator<F, R, unknown> | Effected<F, R>
    : never,
  ): EffectedDraft<P, Exclude<E, Effect.Dependency<Name>> | F, R>;

  with<F extends Effect, G extends Effect, S>(
    handler: (effected: EffectedDraft<never, never, R>) => EffectedDraft<F, G, S>,
  ): EffectedDraft<P, Exclude<E, F> | G, S>;
  with<F extends Effect, S>(
    handler: (effected: Effected<E, R>) => Effected<F, S>,
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
    [F] extends [never] ?
      E
    : UnhandledEffect<F>
  : never,
): E extends Effected<Effect, infer R> ? R : never {
  const iterator = (effected as Iterable<any>)[Symbol.iterator]();
  let { done, value } = iterator.next();
  while (!done) {
    if (!value)
      throw new Error(
        `Invalid effected program: an effected program should yield only effects (received ${stringify(value)})`,
      );
    if (value._effectSync) {
      ({ done, value } = iterator.next(...("value" in value ? [value.value] : [])));
      continue;
    }
    if (value._effectAsync)
      throw new Error(
        "Cannot run an asynchronous effected program with `runSync`, use `runAsync` instead",
      );
    if (value instanceof Effect)
      throw new UnhandledEffectError(value, `Unhandled effect: ${stringifyEffect(value)}`);
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
    [F] extends [never] ?
      E
    : UnhandledEffect<F>
  : never,
): Promise<E extends Effected<Effect, infer R> ? R : never> {
  const iterator = (effected as Iterable<any>)[Symbol.iterator]();

  return new Promise((resolve, reject) => {
    const iterate = (...args: [] | [unknown]) => {
      let done: boolean | undefined;
      let value: any;
      try {
        ({ done, value } = iterator.next(...args));
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
        if (value._effectSync) {
          try {
            ({ done, value } = iterator.next(...("value" in value ? [value.value] : [])));
          } catch (e) {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(e);
            return;
          }
          continue;
        }
        if (value._effectAsync) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          value.onComplete(iterate, (...args: unknown[]) => reject(...args.slice(0, 1)));
          return;
        }
        if (value instanceof Effect) {
          reject(new UnhandledEffectError(value, `Unhandled effect: ${stringifyEffect(value)}`));
          return;
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
 * Stringify an object, handling common cases that simple `JSON.stringify` does not handle, e.g.,
 * `undefined`, `bigint`, `function`, `symbol`. Circular references are considered.
 * @param x The object to stringify.
 * @param space The number of spaces to use for indentation.
 * @returns
 */
const stringify = (x: unknown, space = 0): string => {
  const seen = new WeakSet();
  const identifierRegex = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  const indent = (level: number): string => (space > 0 ? " ".repeat(level * space) : "");

  const serialize = (value: unknown, level: number): string => {
    if (typeof value === "bigint") return `${value as any}n`;
    if (typeof value === "function")
      return value.name ? `[Function: ${value.name}]` : "[Function (anonymous)]";
    if (typeof value === "symbol") return value.toString();
    if (value === undefined) return "undefined";
    if (value === null) return "null";

    if (typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);

      const nextLevel = level + 1;
      const isClassInstance =
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        value.constructor && value.constructor.name && value.constructor.name !== "Object";
      const className = isClassInstance ? `${value.constructor.name} ` : "";

      if (Array.isArray(value)) {
        const arrayItems = value
          .map((item) => serialize(item, nextLevel))
          .join(space > 0 ? `,\n${indent(nextLevel)}` : ", ");
        let result = `[${space > 0 ? "\n" + indent(nextLevel) : ""}${arrayItems}${space > 0 ? "\n" + indent(level) : ""}]`;
        if (className !== "Array ") result = `${className.trim()}(${value.length}) ${result}`;
        return result;
      }

      const objectEntries = Reflect.ownKeys(value)
        .map((key) => {
          const keyDisplay =
            typeof key === "symbol" ? `[${key.toString()}]`
            : identifierRegex.test(key) ? key
            : JSON.stringify(key);
          const val = (value as Record<string, unknown>)[key as any];
          return `${space > 0 ? indent(nextLevel) : ""}${keyDisplay}: ${serialize(val, nextLevel)}`;
        })
        .join(space > 0 ? `,\n` : ", ");

      return `${className}{${space > 0 ? "\n" : " "}${objectEntries}${space > 0 ? "\n" + indent(level) : " "}}`;
    }

    return JSON.stringify(value);
  };

  return serialize(x, 0);
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
