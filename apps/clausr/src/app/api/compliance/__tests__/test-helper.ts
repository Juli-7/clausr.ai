import { NextRequest } from "next/server";
import { createSessionToken, getAuthDb, createOrganization, addMemberToOrganization } from "@clausr/platform-core";

interface SeedUserOpts {
  email?: string;
  name?: string;
  platformRole?: "superadmin" | "operator";
  org?: { name: string; slug: string; role: "admin" | "expert" | "tester" };
}

let cachedToken: string | null = null;
let seedCount = 0;

export async function getAuthToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const db = getAuthDb();

  const existing = db.prepare("SELECT id, email, name, platform_role FROM users WHERE email = ?").get("admin@clausr.ai") as
    { id: string; email: string; name: string; platform_role: string } | undefined;

  const user: {
    id: string; email: string; name: string;
    platformRole: string; username: string;
    isActive: boolean; emailVerified: boolean;
    phoneVerified: boolean; memberships: string[];
  } = existing
    ? { ...existing, platformRole: existing.platform_role, username: "", isActive: true, emailVerified: true, phoneVerified: false, memberships: [] }
    : {
        id: "b179a131-8629-46cd-8d8a-19ecd1326d1c",
        email: "admin@clausr.ai",
        name: "Superadmin",
        platformRole: "superadmin",
        username: "superadmin",
        isActive: true,
        emailVerified: true,
        phoneVerified: false,
        memberships: [],
      };

  if (!existing) {
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, platform_role, is_active, email_verified, phone_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, 0, ?, ?)`
    ).run(user.id, user.email, user.name, "test-hash", user.platformRole, Date.now(), Date.now());
  }

  cachedToken = await createSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    platformRole: user.platformRole as "superadmin" | "operator",
    isActive: true,
    emailVerified: true,
    phoneVerified: false,
    memberships: [],
  });
  return cachedToken;
}

export async function seedUser(opts: SeedUserOpts = {}): Promise<{
  user: { id: string; email: string; name: string; platformRole: string };
  token: string;
  org?: { id: string; name: string; slug: string };
}> {
  seedCount++;
  const db = getAuthDb();
  const email = opts.email ?? `test-user-${seedCount}-${Date.now()}@test.ai`;
  const name = opts.name ?? "Test User";
  const platformRole = opts.platformRole ?? "operator";
  const id = `test-${seedCount}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, platform_role, is_active, email_verified, phone_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, 0, ?, ?)`
  ).run(id, email, name, "test-hash", platformRole, Date.now(), Date.now());

  let orgResult: { id: string; name: string; slug: string } | undefined;
  const memberships: { organizationId: string; organizationName: string; organizationSlug: string; role: "admin" | "expert" | "tester" }[] = [];

  if (opts.org) {
    orgResult = await createOrganization(opts.org.name, opts.org.slug);
    addMemberToOrganization(id, orgResult.id, opts.org.role);
    memberships.push({
      organizationId: orgResult.id,
      organizationName: opts.org.name,
      organizationSlug: opts.org.slug,
      role: opts.org.role,
    });
  }

  const token = await createSessionToken({
    id,
    email,
    name,
    username: "",
    platformRole: platformRole as "superadmin" | "operator",
    isActive: true,
    emailVerified: true,
    phoneVerified: false,
    memberships,
  });

  return { user: { id, email, name, platformRole }, token, org: orgResult };
}

export async function createAuthRequest(
  url: string,
  init?: RequestInit
): Promise<NextRequest> {
  const token = await getAuthToken();
  const headers = new Headers(init?.headers);
  headers.set("Cookie", `session=${token}`);
  const isFormData = init?.body instanceof FormData;
  if (!isFormData) {
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  }
  const { signal, ...restInit } = init ?? {};
  return new NextRequest(url, { ...restInit, headers, signal: signal ?? undefined });
}

export function createAuthRequestWithToken(
  url: string,
  token: string,
  init?: RequestInit
): NextRequest {
  const headers = new Headers(init?.headers);
  headers.set("Cookie", `session=${token}`);
  const isFormData = init?.body instanceof FormData;
  if (!isFormData) {
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  }
  const { signal, ...restInit } = init ?? {};
  return new NextRequest(url, { ...restInit, headers, signal: signal ?? undefined });
}
