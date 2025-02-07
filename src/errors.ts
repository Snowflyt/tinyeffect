import type { Effect } from "./types";

/**
 * An error thrown when an unhandled effect is encountered.
 */
export class UnhandledEffectError extends Error {
  declare public effect: Effect;

  constructor(
    /**
     * The unhandled effect.
     */
    effect: Effect,
    message?: string,
  ) {
    super(message);
    this.effect = effect;
  }
}
