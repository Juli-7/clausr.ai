export { type PlatformRole, type TenantRole, type UserWithRoles } from "./rbac";

// Auth
export {
  getAuthDb,
  createUser,
  createUserRegistration,
  createEmailVerificationToken,
  verifyEmailWithToken,
  getUserByEmail,
  getUserByPhone,
  getUserByUsername,
  createUserByPhone,
  createUserByUsername,
  verifyCredentials,
  verifyCredentialsByUsername,
  getUserById,
  listUsers,
  setUserActive,
  updateUserRole,
  deleteUser,
  createOrganization,
  deleteOrganization,
  addMemberToOrganization,
  removeMemberFromOrganization,
  listOrganizations,
  seedSuperadmin,
  createSessionToken,
  verifySessionToken,
  getSessionCookieOptions,
  authenticateRequest,
  requireAuth,
  requireRole,
  requireOrgAdmin,
  requireTenantRole,
  AuthError,
  handleAuthError,
  getOrgConfig,
  updateOrgConfig,
  getEventPrice,
  updatePassword,
  resetUserPassword,
  listUsersWithMemberships,
  listOrganizationsForAdmin,
  getOrgById,
  getOrgBySlug,
  getOrgMembers,
  countOrgMembersByRole,
  isUserInSameOrg,
  getMemberRole,
} from "./auth";
export type { User, AuthenticatedUser, OrgMember, OrgConfig, SessionPayload, UserWithMemberships, OrgMemberInfo } from "./auth";

// Usage
export { recordUsage, getUsageByTenant, getUsageSummary, getUsagePerUser, getUserUsage, getAllUsage, getOrgUsageCost } from "./usage";
export type { UsageEvent, UsageRecord } from "./usage";

// Audit
export { logAuditEvent, queryAuditLog } from "./audit";

// Session
export { SESSION_SCHEMA_SQL, createSession, updateSessionName, getSession, listSessions, deleteSession, toggleStar, toggleShare, pruneUnnamedSessions, updateSessionSummary } from "./session";
export type { SessionRow, SessionSummaryData } from "./session";

// Settings
export { SETTINGS_SCHEMA_SQL, getSetting, setSetting } from "./settings";

// Utilities
export { validateOrigin } from "./utils/csrf";
export { checkRateLimit } from "./utils/rate-limit";
export { getClientIp } from "./utils/request";
export { logger } from "./utils/logger";
export { sendVerificationEmail } from "./utils/email";
export { sendSmsVerifyCode, checkSmsVerifyCode, isSmsConfigured } from "./utils/sms";
