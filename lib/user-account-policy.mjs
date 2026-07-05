export const INTERNAL_ACCOUNT_TYPE = "internal";
export const CUSTOMER_ACCOUNT_TYPE = "customer";

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
      || ["active", "trial_active"].includes(String(normalizedStatus || "").toLowerCase())
    )
  );
}

export function shouldRunCommercialAutomation(user) {
  return !isInternalAccount(user);
}
