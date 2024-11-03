import type { Effected, effect } from "./effected";

/**
 * An algebraic effect.
 */
export class Effect<
  out Name extends string | symbol = string | symbol,
  out Payloads extends unknown[] = unknown[],
  out R = unknown,
> {
  /**
   * Name of the effect, used to identify the effect.
   *
   * **⚠️ Warning:** This identifier is used to match effects, so be careful with name collisions.
   */
  public readonly name: Name;
  /**
   * Payloads of the effect.
   */
  public readonly payloads: Payloads;
  /**
   * This property only exists at type level and is used to infer the return type of the effect.
   */
  public readonly __returnType: R;

  constructor(
    /**
     * Name of the effect, used to identify the effect.
     *
     * **⚠️ Warning:** This identifier is used to match effects, so be careful with name collisions.
     */
    name: Name,
    /**
     * Payloads of the effect.
     */
    payloads: Payloads,
  );
}

export namespace Effect {
  /**
   * A special variant of {@link Effect} that represents an error.
   */
  export type Error<Name extends string = string> = Unresumable<
    Effect<`error:${Name}`, [message?: string], never>
  >;

  /**
   * A special variant of {@link Effect} that represents a dependency.
   */
  export type Dependency<out Name extends string = string, out T = unknown> = Effect<
    `dependency:${Name}`,
    [],
    T
  >;
}

/**
 * Mark an {@link Effect} as unresumable.
 */
export type Unresumable<E extends Effect> = E & {
  readonly resumable: false;
};

declare const unhandledEffect: unique symbol;
/**
 * A type representing unhandled effects.
 */
export interface UnhandledEffect<out E extends Effect> {
  readonly [unhandledEffect]: E;
}

/*****************
 * Utility types *
 *****************/
/**
 * Infer the {@link Effect} type from an {@link Effected} instance or an {@link EffectFactory}
 * defined with {@link effect}.
 *
 * @example
 * ```typescript
 * const println = effect("println")<unknown[], void>;
 * type Println = InferEffect<typeof println>;
 * //   ^?: Effect<"println", unknown[], void>
 * ```
 *
 * @example
 * ```typescript
 * declare const program: Effected<Println | Raise, void>;
 * type E = InferEffect<typeof program>;
 * //   ^?: Println | Raise
 * ```
 */
export type InferEffect<E extends Iterable<Effect> | ((...args: any) => Iterable<Effect>)> =
  E extends Iterable<infer E> ? E
  : E extends (...args: any) => Iterable<infer E> ? E
  : never;

/**
 * A factory function for an {@link Effect}.
 */
export type EffectFactory<E extends Effect> = (
  ...payloads: E["payloads"]
) => Generator<E, E["__returnType"], unknown>;
