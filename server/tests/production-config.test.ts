import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { publicServerUrl } from "../src/config/publicServerUrl.js";
import { ResetPasswordSchema, UserLoginSchema, UserRegistrationSchema } from "../src/schemas/AuthSchemas.js";

describe("public game origin", () => {
  const variables = ["SERVER_URL", "BASE_URL", "PORT"] as const;
  const original = variables.map((key) => process.env[key]);

  beforeEach(() => {
    for (const key of variables) delete process.env[key];
  });

  afterEach(() => {
    variables.forEach((key, index) => {
      const value = original[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  test("uses the proxy origin instead of the Bun listener", () => {
    process.env.SERVER_URL = "https://jogo.example.test/";
    process.env.PORT = "3001";
    expect(publicServerUrl()).toBe("https://jogo.example.test");
  });

  test("keeps a configured public HTTPS port", () => {
    process.env.SERVER_URL = "https://localhost:3443";
    expect(publicServerUrl()).toBe("https://localhost:3443");
  });

  test("keeps the direct HTTP listener for older installations", () => {
    process.env.BASE_URL = "http://localhost";
    process.env.PORT = "3002";
    expect(publicServerUrl()).toBe("http://localhost:3002");
  });
});

describe("password validation", () => {
  test("requires a password at registration and reset", () => {
    expect(UserRegistrationSchema.safeParse({ username: "Player", email: "player@example.test" }).success).toBe(false);
    expect(ResetPasswordSchema.safeParse({ token: "reset-token", password: "" }).success).toBe(false);
  });

  test("preserves token login", () => {
    expect(UserLoginSchema.safeParse({ token: "session-token" }).success).toBe(true);
  });

  test("enforces bcrypt's byte limit on new passwords", () => {
    const body = { token: "reset-token", password: `${"a".repeat(71)}!` };
    expect(ResetPasswordSchema.safeParse(body).success).toBe(true);
    expect(ResetPasswordSchema.safeParse({ ...body, password: `${body.password}é` }).success).toBe(false);
  });
});
