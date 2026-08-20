import { randomUUID } from "node:crypto";
import { hash, compare } from "bcryptjs";
import { getAuthDb } from "./db";

export interface User {
  id: string;
  email: string;
  name: string;
  platformRole: "superadmin" | "operator";
  isActive: boolean;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  username?: string;
}

export interface OrgMember {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: "admin" | "expert" | "tester";
}

interface OrgMemberRow {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: string;
}

function mapMembers(rows: OrgMemberRow[]): OrgMember[] {
  return rows.map((r) => ({
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    organizationSlug: r.organization_slug,
    role: r.role as "admin" | "expert" | "tester",
  }));
}

export interface AuthenticatedUser extends User {
  memberships: OrgMember[];
}

export async function createUser(
  email: string,
  password: string,
  name: string,
  platformRole: "superadmin" | "operator" = "operator",
): Promise<User> {
  const db = getAuthDb();
  const passwordHash = await hash(password, 12);
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    "INSERT INTO users (id, email, name, password_hash, platform_role, is_active, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)"
  ).run(id, email, name, passwordHash, platformRole, now, now);

  return { id, email, name, platformRole, isActive: true, emailVerified: true, phoneVerified: false };
}

export async function createUserRegistration(
  email: string,
  password: string,
  name: string,
): Promise<User> {
  const db = getAuthDb();
  const passwordHash = await hash(password, 12);
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    "INSERT INTO users (id, email, name, password_hash, platform_role, is_active, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, 'operator', 0, 0, ?, ?)"
  ).run(id, email, name, passwordHash, now, now);

  return { id, email, name, platformRole: "operator", isActive: false, emailVerified: false, phoneVerified: false };
}

export function getUserByPhone(phone: string): User | null {
  const db = getAuthDb();
  const row = db.prepare(
    "SELECT id, email, phone, username, name, platform_role, is_active, email_verified, phone_verified FROM users WHERE phone = ?"
  ).get(phone) as
    | { id: string; email: string; phone: string | null; username: string | null; name: string; platform_role: string; is_active: number; email_verified: number; phone_verified: number }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    phone: row.phone ?? undefined,
    username: row.username ?? undefined,
    name: row.name,
    platformRole: row.platform_role as "superadmin" | "operator",
    isActive: !!row.is_active,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
  };
}

export async function createUserByPhone(
  phone: string,
  name: string,
): Promise<User> {
  const db = getAuthDb();
  const id = randomUUID();
  const now = Date.now();
  const placeholderEmail = `phone_${id.slice(0, 8)}@placeholder.clausr.ai`;
  const randomHash = await hash(id + now, 12);

  db.prepare(
    "INSERT INTO users (id, email, phone, name, password_hash, platform_role, is_active, email_verified, phone_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'operator', 1, 0, 1, ?, ?)"
  ).run(id, placeholderEmail, phone, name, randomHash, now, now);

  return { id, email: placeholderEmail, phone, name, platformRole: "operator", isActive: true, emailVerified: false, phoneVerified: true };
}

export async function createUserByUsername(
  username: string,
  password: string,
  name: string,
): Promise<User> {
  const db = getAuthDb();
  const passwordHash = await hash(password, 12);
  const id = randomUUID();
  const now = Date.now();
  const placeholderEmail = `user_${id.slice(0, 8)}@placeholder.clausr.ai`;

  db.prepare(
    "INSERT INTO users (id, email, username, name, password_hash, platform_role, is_active, email_verified, phone_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'operator', 1, 0, 0, ?, ?)"
  ).run(id, placeholderEmail, username, name, passwordHash, now, now);

  return { id, email: placeholderEmail, username, name, platformRole: "operator", isActive: true, emailVerified: false, phoneVerified: false };
}

export function getUserByUsername(username: string): User | null {
  const db = getAuthDb();
  const row = db.prepare(
    "SELECT id, email, phone, username, name, platform_role, is_active, email_verified, phone_verified FROM users WHERE username = ?"
  ).get(username) as
    | { id: string; email: string; phone: string | null; username: string | null; name: string; platform_role: string; is_active: number; email_verified: number; phone_verified: number }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    phone: row.phone ?? undefined,
    username: row.username ?? undefined,
    name: row.name,
    platformRole: row.platform_role as "superadmin" | "operator",
    isActive: !!row.is_active,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
  };
}

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const db = getAuthDb();
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("hex");
  const id = randomUUID();
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

  db.prepare(
    "INSERT INTO verification_tokens (id, user_id, token, type, expires_at, created_at) VALUES (?, ?, ?, 'email_verification', ?, ?)"
  ).run(id, userId, token, expiresAt, now);

  return token;
}

export async function verifyEmailWithToken(token: string): Promise<User | null> {
  const db = getAuthDb();
  const now = Date.now();

  const row = db.prepare(
    "SELECT vt.user_id, vt.expires_at, vt.used_at FROM verification_tokens vt WHERE vt.token = ? AND vt.type = 'email_verification'"
  ).get(token) as { user_id: string; expires_at: number; used_at: number | null } | undefined;

  if (!row) return null;
  if (row.used_at) return null;
  if (now > row.expires_at) return null;

  db.prepare("UPDATE verification_tokens SET used_at = ? WHERE token = ?").run(now, token);
  db.prepare("UPDATE users SET is_active = 1, email_verified = 1, updated_at = ? WHERE id = ?").run(now, row.user_id);

  const user = getUserById(row.user_id);
  return user;
}

export function getUserByEmail(email: string): User | null {
  const db = getAuthDb();
  const row = db.prepare(
    "SELECT id, email, phone, username, name, platform_role, is_active, email_verified, phone_verified FROM users WHERE email = ?"
  ).get(email) as
    | { id: string; email: string; phone: string | null; username: string | null; name: string; platform_role: string; is_active: number; email_verified: number; phone_verified: number }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    phone: row.phone ?? undefined,
    username: row.username ?? undefined,
    name: row.name,
    platformRole: row.platform_role as "superadmin" | "operator",
    isActive: !!row.is_active,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
  };
}

function queryUserWithPassword(
  field: string,
  value: string,
): { id: string; email: string; phone: string | null; username: string | null; name: string; password_hash: string; platform_role: string; is_active: number; email_verified: number; phone_verified: number } | undefined {
  const db = getAuthDb();
  const row = db.prepare(
    `SELECT id, email, phone, username, name, password_hash, platform_role, is_active, email_verified, phone_verified FROM users WHERE ${field} = ?`
  ).get(value) as any;
  return row;
}

export async function verifyCredentials(
  emailOrPhone: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const isEmail = emailOrPhone.includes("@");
  const row = isEmail
    ? queryUserWithPassword("email", emailOrPhone)
    : queryUserWithPassword("phone", emailOrPhone);

  if (!row) return null;
  if (!row.is_active) return null;
  if (isEmail && !row.email_verified) return null;

  const valid = await compare(password, row.password_hash);
  if (!valid) return null;

  const memberships = mapMembers(
    getAuthDb().prepare(
      `SELECT om.organization_id, o.name as organization_name, o.slug as organization_slug, om.role
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = ?`
    ).all(row.id) as OrgMemberRow[],
  );

  return {
    id: row.id,
    email: row.email,
    phone: row.phone ?? undefined,
    username: row.username ?? undefined,
    name: row.name,
    platformRole: row.platform_role as "superadmin" | "operator",
    isActive: !!row.is_active,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
    memberships,
  };
}

export async function verifyCredentialsByUsername(
  username: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const row = queryUserWithPassword("username", username);
  if (!row) return null;
  if (!row.is_active) return null;

  const valid = await compare(password, row.password_hash);
  if (!valid) return null;

  const memberships = mapMembers(
    getAuthDb().prepare(
      `SELECT om.organization_id, o.name as organization_name, o.slug as organization_slug, om.role
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = ?`
    ).all(row.id) as OrgMemberRow[],
  );

  return {
    id: row.id,
    email: row.email,
    phone: row.phone ?? undefined,
    username: row.username ?? undefined,
    name: row.name,
    platformRole: row.platform_role as "superadmin" | "operator",
    isActive: !!row.is_active,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
    memberships,
  };
}

export function getUserById(id: string): AuthenticatedUser | null {
  const db = getAuthDb();
  const row = db.prepare(
    "SELECT id, email, phone, username, name, platform_role, is_active, email_verified, phone_verified FROM users WHERE id = ?"
  ).get(id) as
    | { id: string; email: string; phone: string | null; username: string | null; name: string; platform_role: string; is_active: number; email_verified: number; phone_verified: number }
    | undefined;

  if (!row) return null;

  const memberships = mapMembers(
    db.prepare(
      `SELECT om.organization_id, o.name as organization_name, o.slug as organization_slug, om.role
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = ?`
    ).all(row.id) as OrgMemberRow[],
  );

  return {
    id: row.id,
    email: row.email,
    phone: row.phone ?? undefined,
    username: row.username ?? undefined,
    name: row.name,
    platformRole: row.platform_role as "superadmin" | "operator",
    isActive: !!row.is_active,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
    memberships,
  };
}

export function listUsers(): User[] {
  const db = getAuthDb();
  const rows = db.prepare(
    "SELECT id, email, phone, username, name, platform_role, is_active, email_verified, phone_verified FROM users ORDER BY created_at DESC"
  ).all() as { id: string; email: string; phone: string | null; username: string | null; name: string; platform_role: string; is_active: number; email_verified: number; phone_verified: number }[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    phone: r.phone ?? undefined,
    username: r.username ?? undefined,
    name: r.name,
    platformRole: r.platform_role as "superadmin" | "operator",
    isActive: !!r.is_active,
    emailVerified: !!r.email_verified,
    phoneVerified: !!r.phone_verified,
  }));
}

export function deleteUser(userId: string): void {
  const db = getAuthDb();
  db.prepare("DELETE FROM organization_members WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function setUserActive(userId: string, active: boolean): void {
  const db = getAuthDb();
  db.prepare("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?").run(
    active ? 1 : 0,
    Date.now(),
    userId,
  );
}

export function updateUserRole(
  userId: string,
  platformRole: "superadmin" | "operator",
): void {
  const db = getAuthDb();
  db.prepare("UPDATE users SET platform_role = ?, updated_at = ? WHERE id = ?").run(
    platformRole,
    Date.now(),
    userId,
  );
}

export function removeMemberFromOrganization(
  userId: string,
  organizationId: string,
): void {
  const db = getAuthDb();
  db.prepare(
    "DELETE FROM organization_members WHERE user_id = ? AND organization_id = ?"
  ).run(userId, organizationId);
}

export function deleteOrganization(orgId: string): void {
  const db = getAuthDb();
  db.prepare("DELETE FROM organization_members WHERE organization_id = ?").run(orgId);
  db.prepare("DELETE FROM organizations WHERE id = ?").run(orgId);
}

export async function createOrganization(
  name: string,
  slug: string,
): Promise<{ id: string; name: string; slug: string }> {
  const db = getAuthDb();
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    "INSERT INTO organizations (id, name, slug, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, name, slug, JSON.stringify({ usageLimit: 20, usageLimitPeriod: "total" }), now, now);

  return { id, name, slug };
}

export function addMemberToOrganization(
  userId: string,
  organizationId: string,
  role: "admin" | "expert" | "tester",
): void {
  const db = getAuthDb();
  db.prepare(
    "INSERT OR REPLACE INTO organization_members (user_id, organization_id, role, created_at) VALUES (?, ?, ?, ?)"
  ).run(userId, organizationId, role, Date.now());
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  member_count: number;
}

export function listOrganizations(): { id: string; name: string; slug: string; memberCount: number }[] {
  const db = getAuthDb();
  const rows = db.prepare(
    `SELECT o.id, o.name, o.slug,
            (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count
     FROM organizations o ORDER BY o.created_at DESC`
  ).all() as OrgRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    memberCount: r.member_count,
  }));
}

export interface OrgConfig {
  llmModel?: string;
  llmProvider?: string;
  temperature?: number;
  maxTokens?: number;
  usageLimit?: number;
  usageLimitPeriod?: "monthly" | "total";
  tokenPrice?: number;
  expertLimit?: number;
  /** Per-event-type input/output pricing (¥ per 1K tokens). Overrides tokenPrice. */
  pricing?: Record<string, { input: number; output: number }>;
}

export function getEventPrice(
  eventType: string,
  orgConfig: OrgConfig,
): { input: number; output: number } {
  const specific = orgConfig.pricing?.[eventType];
  if (specific) return specific;
  const flat = orgConfig.tokenPrice ?? 0.025;
  return { input: flat, output: flat };
}

export function getOrgConfig(orgId: string): OrgConfig {
  const db = getAuthDb();
  const row = db.prepare("SELECT config FROM organizations WHERE id = ?").get(orgId) as
    | { config: string }
    | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.config) as OrgConfig;
  } catch {
    return {};
  }
}

export function updateOrgConfig(orgId: string, config: OrgConfig): void {
  const db = getAuthDb();
  const existing = getOrgConfig(orgId);
  const merged = { ...existing, ...config };
  db.prepare("UPDATE organizations SET config = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(merged),
    Date.now(),
    orgId,
  );
}

export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const db = getAuthDb();
  const row = db.prepare(
    "SELECT id, password_hash FROM users WHERE id = ?"
  ).get(userId) as { id: string; password_hash: string } | undefined;

  if (!row) throw new Error("User not found");

  const valid = await compare(currentPassword, row.password_hash);
  if (!valid) throw new Error("Current password is incorrect");

  const newHash = await hash(newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    newHash,
    Date.now(),
    userId,
  );
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const db = getAuthDb();
  const passwordHash = await hash(newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    passwordHash, Date.now(), userId,
  );
}

export async function seedSuperadmin(): Promise<User> {
  const email = process.env.SUPERADMIN_EMAIL ?? "admin@clausr.ai";
  const username = process.env.SUPERADMIN_USERNAME ?? "superadmin";
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!password) {
    throw new Error("SUPERADMIN_PASSWORD environment variable is required");
  }
  const existingByUsername = getUserByUsername(username);
  if (existingByUsername) return existingByUsername;
  const db = getAuthDb();
  const existingByEmail = getUserByEmail(email);
  if (existingByEmail) {
    const passwordHash = await hash(password, 12);
    db.prepare("UPDATE users SET username = ?, password_hash = ?, updated_at = ? WHERE id = ?").run(
      username, passwordHash, Date.now(), existingByEmail.id,
    );
    return { ...existingByEmail, username };
  }
  const user = await createUser(email, password, "Superadmin", "superadmin");
  db.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, user.id);
  return { ...user, username };
}

// ── Admin helpers (encapsulated SQL) ──

export interface UserWithMemberships extends User {
  memberships: { orgId: string; orgName: string; role: string }[];
}

export function listUsersWithMemberships(orgFilter?: string[]): UserWithMemberships[] {
  const db = getAuthDb();
  const base = `SELECT u.id, u.email, u.phone, u.username, u.name, u.platform_role, u.is_active, u.email_verified, u.phone_verified,
    COALESCE(json_group_array(
      json_object('org_id', om.organization_id, 'org_name', o.name, 'role', om.role)
    ) FILTER (WHERE om.organization_id IS NOT NULL), '[]') as memberships
    FROM users u
    LEFT JOIN organization_members om ON om.user_id = u.id
    LEFT JOIN organizations o ON o.id = om.organization_id`;

  let rows: { id: string; email: string; phone: string | null; username: string | null; name: string; platform_role: string; is_active: number; email_verified: number; phone_verified: number; memberships: string }[];

  if (orgFilter && orgFilter.length > 0) {
    const placeholders = orgFilter.map(() => "?").join(",");
    rows = db.prepare(
      `${base} WHERE om.organization_id IN (${placeholders}) GROUP BY u.id ORDER BY u.created_at DESC`
    ).all(...orgFilter) as typeof rows;
  } else {
    rows = db.prepare(
      `${base} GROUP BY u.id ORDER BY u.created_at DESC`
    ).all() as typeof rows;
  }

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    phone: r.phone ?? undefined,
    username: r.username ?? undefined,
    name: r.name,
    platformRole: r.platform_role as "superadmin" | "operator",
    isActive: !!r.is_active,
    emailVerified: !!r.email_verified,
    phoneVerified: !!r.phone_verified,
    memberships: JSON.parse(r.memberships) as { orgId: string; orgName: string; role: string }[],
  }));
}

export function listOrganizationsForAdmin(orgIds: string[]): { id: string; name: string; slug: string; memberCount: number; createdAt: number }[] {
  const db = getAuthDb();
  if (orgIds.length === 0) return [];
  const placeholders = orgIds.map(() => "?").join(",");
  return db.prepare(
    `SELECT o.id, o.name, o.slug, o.created_at,
            COUNT(om.user_id) as member_count
     FROM organizations o
     LEFT JOIN organization_members om ON om.organization_id = o.id
     WHERE o.id IN (${placeholders})
     GROUP BY o.id
     ORDER BY o.created_at DESC`
  ).all(...orgIds) as { id: string; name: string; slug: string; memberCount: number; createdAt: number }[];
}

export function getOrgById(orgId: string): { id: string; name: string; slug: string; createdAt: number } | null {
  const db = getAuthDb();
  const row = db.prepare("SELECT id, name, slug, created_at FROM organizations WHERE id = ?").get(orgId) as
    { id: string; name: string; slug: string; created_at: number } | undefined;
  if (!row) return null;
  return { id: row.id, name: row.name, slug: row.slug, createdAt: row.created_at };
}

export function getOrgBySlug(slug: string): { id: string; name: string; slug: string; createdAt: number } | null {
  const db = getAuthDb();
  const row = db.prepare("SELECT id, name, slug, created_at FROM organizations WHERE slug = ?").get(slug) as
    { id: string; name: string; slug: string; created_at: number } | undefined;
  if (!row) return null;
  return { id: row.id, name: row.name, slug: row.slug, createdAt: row.created_at };
}

export interface OrgMemberInfo {
  id: string;
  email: string;
  name: string;
  platformRole: string;
  isActive: boolean;
  role: string;
}

export function getOrgMembers(orgId: string): OrgMemberInfo[] {
  const db = getAuthDb();
  const rows = db.prepare(
    `SELECT u.id, u.email, u.username, u.name, u.platform_role, u.is_active, om.role
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = ?
     ORDER BY om.created_at DESC`
  ).all(orgId) as { id: string; email: string; username: string | null; name: string; platform_role: string; is_active: number; role: string }[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    username: r.username ?? undefined,
    name: r.name,
    platformRole: r.platform_role,
    isActive: !!r.is_active,
    role: r.role,
  }));
}

export function countOrgMembersByRole(orgId: string, role: string): number {
  const row = getAuthDb().prepare(
    "SELECT COUNT(*) as cnt FROM organization_members WHERE organization_id = ? AND role = ?"
  ).get(orgId, role) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export function isUserInSameOrg(targetUserId: string, callerUserId: string): boolean {
  const db = getAuthDb();
  const row = db.prepare(
    "SELECT 1 FROM organization_members om1 JOIN organization_members om2 ON om1.organization_id = om2.organization_id WHERE om1.user_id = ? AND om2.user_id = ? LIMIT 1"
  ).get(targetUserId, callerUserId) as { '1': number } | undefined;
  return !!row;
}

export function getMemberRole(userId: string, orgId: string): string | null {
  const row = getAuthDb().prepare(
    "SELECT role FROM organization_members WHERE user_id = ? AND organization_id = ?"
  ).get(userId, orgId) as { role: string } | undefined;
  return row?.role ?? null;
}
