function isTrialUser(user) {
  const plan = String(user?.plan || "").trim().toLowerCase();
  return (
    user?.intent === "trial" ||
    ["pending_trial", "trial_active", "trial_finished"].includes(user?.status) ||
    plan.includes("teste")
  );
}

export function isFounderUser(user) {
  const plan = String(user?.plan || "").trim().toLowerCase();
  return !isTrialUser(user) && (user?.intent === "founder" || plan.includes("fundador"));
}

export function calculateFounderMetrics(users = []) {
  const founders = users.filter(isFounderUser);
  return {
    total: founders.length,
    approved: founders.filter((user) =>
      ["active", "approved"].includes(String(user.status || "").toLowerCase()),
    ).length,
    active: founders.filter(
      (user) => String(user.status || "").toLowerCase() === "active",
    ).length,
    inactiveOrArchived: founders.filter((user) =>
      ["inactive", "archived"].includes(String(user.status || "").toLowerCase()),
    ).length,
  };
}
