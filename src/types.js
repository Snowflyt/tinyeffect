/**
 * An algebraic effect.
 */
export class Effect {
  /**
   * @param {string | symbol} name Name of the effect, used to identify the effect.
   *
   * **⚠️ Warning:** This identifier is used to match effects, so be careful with name collisions.
   * @param {unknown[]} payloads Payloads of the effect.
   */
  constructor(name, payloads) {
    /**
     * Name of the effect, used to identify the effect.
     *
     * **⚠️ Warning:** This identifier is used to match effects, so be careful with name collisions.
     */
    this.name = name;
    /**
     * Payloads of the effect.
     */
    this.payloads = payloads;
  }
}
