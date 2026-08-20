import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  getSessionCookieOptions,
  extractTokenFromRequest,
} from "../session";
import type { AuthenticatedUser } from "../service";

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-123",
    email: "test@test.com",
    name: "Test User",
    platformRole: "operator",
    isActive: true,
    emailVerified: true,
    phoneVerified: false,
    memberships: [],
    ...overrides,
  };
}

describe("createSessionToken / verifySessionToken", () => {
  it("signs and verifies a valid token", async () => {
    const user = makeUser();
    const token = await createSessionToken(user);
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");

    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("user-123");
    expect(payload!.email).toBe("test@test.com");
    expect(payload!.name).toBe("Test User");
    expect(payload!.platformRole).toBe("operator");
  });

  it("includes expiration in payload", async () => {
    const user = makeUser();
    const token = await createSessionToken(user);
    const payload = await verifySessionToken(token);
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("returns null for garbage token", async () => {
    const payload = await verifySessionToken("garbage.token.value");
    expect(payload).toBeNull();
  });

  it("returns null for tampered token", async () => {
    const user = makeUser();
    const token = await createSessionToken(user);
    const [header, body, _] = token.split(".");
    void _;
    const tampered = `${header}.${body}.invalidsig`;
    const payload = await verifySessionToken(tampered);
    expect(payload).toBeNull();
  });
});

describe("getSessionCookieOptions", () => {
  it("returns correct shape", () => {
    const opts = getSessionCookieOptions();
    expect(opts.name).toBe("session");
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(60 * 60 * 24 * 7);
  });

  it("sets secure flag based on NODE_ENV", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    expect(getSessionCookieOptions().secure).toBe(true);
    process.env.NODE_ENV = original ?? "test";
    expect(getSessionCookieOptions().secure).toBe(false);
  });
});

describe("extractTokenFromRequest", () => {
  it("extracts session cookie", () => {
    const request = new Request("http://localhost", {
      headers: { cookie: "session=abc123; other=val" },
    });
    expect(extractTokenFromRequest(request)).toBe("abc123");
  });

  it("returns null when no session cookie", () => {
    const request = new Request("http://localhost", {
      headers: { cookie: "other=val" },
    });
    expect(extractTokenFromRequest(request)).toBeNull();
  });

  it("returns null when no cookies at all", () => {
    const request = new Request("http://localhost");
    expect(extractTokenFromRequest(request)).toBeNull();
  });
});
