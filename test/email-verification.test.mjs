import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEmailVerification,
  createEmailVerification,
  validateEmailVerificationToken,
} from "../lib/email-verification.mjs";
import { isEmailVerified } from "../lib/user-account-policy.mjs";

test("token de confirmação é armazenado como hash e confirma uma única vez", () => {
  const now = new Date("2026-07-06T12:00:00.000Z");
  const verification = createEmailVerification(now);
  const user = {
    emailVerified: false,
    emailVerificationTokenHash: verification.tokenHash,
    emailVerificationExpiresAt: verification.expiresAt,
  };

  assert.notEqual(verification.token, verification.tokenHash);
  assert.equal(validateEmailVerificationToken(user, verification.token, now), true);
  assert.equal(validateEmailVerificationToken(user, "token-inválido", now), false);

  applyEmailVerification(user, now);
  assert.equal(isEmailVerified(user), true);
  assert.equal(user.emailVerificationTokenHash, undefined);
  assert.equal(validateEmailVerificationToken(user, verification.token, now), false);
});

test("token expirado é rejeitado", () => {
  const issuedAt = new Date("2026-07-06T12:00:00.000Z");
  const verification = createEmailVerification(issuedAt, 1_000);
  const user = {
    emailVerified: false,
    emailVerificationTokenHash: verification.tokenHash,
    emailVerificationExpiresAt: verification.expiresAt,
  };

  assert.equal(
    validateEmailVerificationToken(
      user,
      verification.token,
      new Date("2026-07-06T12:00:02.000Z"),
    ),
    false,
  );
});

test("usuários legados permanecem verificados por compatibilidade", () => {
  assert.equal(isEmailVerified({}), true);
  assert.equal(isEmailVerified({ emailVerified: false }), false);
});
