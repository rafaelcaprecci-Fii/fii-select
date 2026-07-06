export const INTERNAL_ACCOUNT_TYPE = "internal";
export const CUSTOMER_ACCOUNT_TYPE = "customer";

export function isEmailVerified(user) {
  return user?.emailVerified !== false;
}

export function isInternalAccount(user) {
  return String(user?.accountType || "").trim().toLowerCase() === INTERNAL_ACCOUNT_TYPE;
}

export function accountTypeForPublicRegistration() {
  return CUSTOMER_ACCOUNT_TYPE;
}

export function canAccountAccessTool(user, normalizedStatus) {
  return Boolean(
    user
    && (
      isInternalAccount(user)
      || (
        isEmailVerified(user)
        && ["active", "trial_active"].includes(String(normalizedStatus || "").toLowerCase())
      )
    )
  );
}

export function shouldRunCommercialAutomation(user) {
  return !isInternalAccount(user) && isEmailVerified(user);
}

export function normalizeAdministrativeAccountType(value) {
  const accountType = String(value || "").trim().toLowerCase();
  return accountType === INTERNAL_ACCOUNT_TYPE ? accountType : "";
}

export function normalizeAdministrativeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function findUniqueUserByEmail(users, email) {
  const normalizedEmail = normalizeAdministrativeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, status: 400, error: "Informe o e-mail do usuário." };
  }

  const matches = users.filter(
    (user) => normalizeAdministrativeEmail(user?.email) === normalizedEmail,
  );
  if (matches.length === 0) {
    return { ok: false, status: 404, error: "Usuário não encontrado." };
  }
  if (matches.length > 1) {
    return { ok: false, status: 409, error: "Mais de um usuário possui este e-mail." };
  }

  return { ok: true, user: matches[0] };
}
