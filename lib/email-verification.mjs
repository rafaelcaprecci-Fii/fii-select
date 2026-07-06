import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function hashEmailVerificationToken(token) {
  return createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

export function createEmailVerification(now = new Date(), ttlMs = EMAIL_VERIFICATION_TTL_MS) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

function isEmailVerified(user) {
  return user?.emailVerified !== false;
}

export function validateEmailVerificationToken(user, token, now = new Date()) {
  if (!user || isEmailVerified(user) || !user.emailVerificationTokenHash) return false;

  const expiresAt = new Date(user.emailVerificationExpiresAt || "");
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return false;

  const expected = Buffer.from(user.emailVerificationTokenHash, "hex");
  const received = Buffer.from(hashEmailVerificationToken(token), "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function applyEmailVerification(user, now = new Date()) {
  user.emailVerified = true;
  user.emailVerifiedAt = now.toISOString();
  delete user.emailVerificationTokenHash;
  delete user.emailVerificationExpiresAt;
}
