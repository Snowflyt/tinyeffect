import type { Effect } from "./types";

/**
 * An error thrown when an unhandled effect is encountered.
 */
export class UnhandledEffectError extends Error {
  constructor(
    /**
     * The unhandled effect.
     */
    public effect: Effect,
    message?: string,
  ) {
    super(message);
  }
}
