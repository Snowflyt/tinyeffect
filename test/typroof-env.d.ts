import type { Effect, Effected, Unresumable } from "../src";
import type { Serializer, Stringify, Type } from "typroof/plugin";

declare module "typroof/plugin" {
  interface StringifySerializerRegistry {
    Effect: { if: ["extends", Effect]; serializer: EffectSerializer };
    Effected: { if: ["extends", Effected<Effect, unknown>]; serializer: EffectedSerializer };
  }
}

interface EffectSerializer extends Serializer<Effect> {
  return: Type<this> extends Effect.Error<infer Name> ? `Effect.Error<${Stringify<Name>}>`
  : Type<this> extends Effect.Dependency<infer Name, infer T> ?
    `Effect.Dependency<${Stringify<Name>}, ${Stringify<T>}>`
  : Type<this> extends Unresumable<Effect<infer Name, infer Payloads, infer R>> ?
    `Unresumable<Effect<${Stringify<Name>}, ${Stringify<Payloads>}, ${Stringify<R>}>>`
  : Type<this> extends Effect<infer Name, infer Payloads, infer R> ?
    `Effect<${Stringify<Name>}, ${Stringify<Payloads>}, ${Stringify<R>}>`
  : never;
}
interface EffectedSerializer extends Serializer<Effected<Effect, unknown>> {
  return: Type<this> extends Effected<infer E, infer R> ?
    `Effected<${Stringify<E>}, ${Stringify<R>}>`
  : never;
}
