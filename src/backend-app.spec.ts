/**
 * A simple example of a backend application based on tinyeffect.
 */

import { expect, test, vi } from "vitest";

import type { Effect, EffectFactory, Effected } from ".";
import { dependency, effect, effected, error } from ".";

/******************
 * Implementation *
 ******************/
type EffectedMethods = { [K: string]: ((...args: any[]) => Generator<Effect>) | EffectedMethods };
type TransformEffectedMethods<Methods extends EffectedMethods> = _Id<{
  [K in keyof Methods]: Methods[K] extends (
    (...args: infer A) => Generator<infer E extends Effect, infer R>
  ) ?
    (...args: A) => Effected<E, R>
  : Methods[K] extends EffectedMethods ? TransformEffectedMethods<Methods[K]>
  : never;
}>;
type _Id<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;
const defineEffectedFunctions = <Methods extends EffectedMethods>(
  methods: Methods,
): TransformEffectedMethods<Methods> => {
  const transform = (methods: any): any =>
    Object.fromEntries(
      Object.entries(methods).map(([name, fnOrMethods]) => [
        name,
        typeof fnOrMethods === "function" ?
          (...args: any) => effected(() => fnOrMethods(...args))
        : transform(fnOrMethods),
      ]),
    );
  return transform(methods);
};

const defineRepository = defineEffectedFunctions;
const defineService = defineEffectedFunctions;

const encrypt = (password: string) => `hashed-${password}`;
const verify = (password: string, hashed: string) => hashed === encrypt(password);

/***********
 * Effects *
 ***********/
type Println = Effect<"println", unknown[], void>;
const println: EffectFactory<Println> = effect("println");

type AuthenticationError = Effect.Error<"authentication">;
const authenticationError: EffectFactory<AuthenticationError> = error("authentication");
type UnauthorizedError = Effect.Error<"unauthorized">;
const unauthorizedError: EffectFactory<UnauthorizedError> = error("unauthorized");
type UserNotFoundError = Effect.Error<"userNotFound">;
const userNotFoundError: EffectFactory<UserNotFoundError> = error("userNotFound");

type SetCurrentUser = Effect<"setCurrentUser", [Omit<User, "password"> | null], void>;
const setCurrentUser: EffectFactory<SetCurrentUser> = effect("setCurrentUser");
type CurrentUserDependency = Effect.Dependency<"currentUser", Omit<User, "password"> | null>;
const askCurrentUser: EffectFactory<CurrentUserDependency> = dependency("currentUser");

/****************
 * Repositories *
 ****************/
interface User {
  id: string;
  name: string;
  password: string;
  role: string;
}

const _users: User[] = [{ id: "0", name: "Alice", password: encrypt("password"), role: "admin" }];

const db = defineRepository({
  user: {
    *save(user: Omit<User, "id">) {
      const savedUser: User = {
        id: _users.length.toString(),
        ...user,
        password: encrypt(user.password),
      };
      _users.push(savedUser);
      return savedUser;
    },

    *findByName(name: string) {
      return _users.find((user) => user.name === name) ?? null;
    },
  },
});

/************
 * Services *
 ************/
const userService = defineService({
  *login(username: string, password: string) {
    const user = yield* db.user.findByName(username);
    if (user === null) return yield* userNotFoundError("User not found.");
    if (!verify(password, user.password)) return yield* authenticationError("Invalid password.");
    yield* setCurrentUser(user);
  },

  *createUser(user: Omit<User, "id">) {
    const currentUser = yield* askCurrentUser();
    if (!currentUser) return yield* authenticationError("User not authenticated.");
    if (currentUser.role !== "admin")
      return yield* unauthorizedError("Only admins can create users.");

    yield* println("Creating user:", user);
    return yield* db.user.save(user);
  },
});

/***************
 * Entry point *
 ***************/
test("app", () => {
  let currentUser: Omit<User, "password"> | null = null;

  const program = effected(function* () {
    yield* userService.login("Alice", "password");
    if (!(yield* db.user.findByName("Bob"))) {
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords
      const user = yield* userService.createUser({ name: "Bob", password: "secret", role: "user" });
      yield* println("Created user:", user);
    }
  })
    .provideBy("currentUser", () => currentUser)
    .resume("setCurrentUser", (user) => {
      currentUser = user;
    })
    .catch("authentication", console.error)
    .catch("unauthorized", console.error)
    .catch("userNotFound", console.error)
    .resume("println", (...args) => console.log(...args));

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  program.runSync();
  expect(logSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Creating user:",
        {
          "name": "Bob",
          "password": "secret",
          "role": "user",
        },
      ],
      [
        "Created user:",
        {
          "id": "1",
          "name": "Bob",
          "password": "hashed-secret",
          "role": "user",
        },
      ],
    ]
  `);
  logSpy.mockRestore();

  expect(_users).toEqual([
    { id: "0", name: "Alice", password: encrypt("password"), role: "admin" },
    { id: "1", name: "Bob", password: encrypt("secret"), role: "user" },
  ]);
});
