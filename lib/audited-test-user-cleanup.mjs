export const auditedTestUserCleanupConfirmation = "REMOVE_AUDITED_TEST_USERS";
export const auditedTestUserEmails = [
  "rafael.curycaprecci@gmail.com",
  "11111111@gmail.com",
  "rafael.curycaprecci2@gmail.com",
];
export const preservedInternalUserEmail = "rafael.cury@2bold.com";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function safeUserSummary(user) {
  return {
    id: user.id || "",
    name: user.name || "",
    email: user.email || "",
    accountType: user.accountType || "customer",
    intent: user.intent || "general",
    plan: user.plan || "",
    status: user.status || "",
  };
}

function compactTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.\d{3}Z$/, "");
}

function assertSameRemainingUsers(expected, actual) {
  if (actual.length !== expected.length) {
    throw new Error("Validação pós-limpeza falhou: quantidade inesperada de usuários.");
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (JSON.stringify(actual[index]) !== JSON.stringify(expected[index])) {
      throw new Error("Validação pós-limpeza falhou: usuário remanescente foi alterado.");
    }
  }
}

function validateCleanupCandidates(users) {
  const targetIndexes = [];
  const removedUsers = [];
  for (const email of auditedTestUserEmails) {
    const matches = users
      .map((user, index) => ({ user, index }))
      .filter((entry) => normalizeEmail(entry.user?.email) === email);

    if (matches.length !== 1) {
      throw new Error(`Limpeza abortada: ${email} retornou ${matches.length} correspondência(s).`);
    }
    if (String(matches[0].user.accountType || "").trim().toLowerCase() === "internal") {
      throw new Error(`Limpeza abortada: ${email} está marcado como conta interna.`);
    }
    targetIndexes.push(matches[0].index);
    removedUsers.push(safeUserSummary(matches[0].user));
  }

  const preservedMatches = users.filter(
    (user) => normalizeEmail(user?.email) === preservedInternalUserEmail,
  );
  if (preservedMatches.length !== 1) {
    throw new Error(
      `Limpeza abortada: conta preservada ${preservedInternalUserEmail} retornou ${preservedMatches.length} correspondência(s).`,
    );
  }
  if (String(preservedMatches[0].accountType || "").trim().toLowerCase() !== "internal") {
    throw new Error(`Limpeza abortada: conta preservada ${preservedInternalUserEmail} não está internal.`);
  }

  return {
    targetIndexes,
    removedUsers,
    preservedUser: safeUserSummary(preservedMatches[0]),
  };
}

export async function removeAuditedTestUsers({
  readUsers,
  writeUsers,
  createBackup,
  now = new Date(),
  simulatePostWriteFailure = false,
}) {
  const originalUsers = await readUsers();
  if (!Array.isArray(originalUsers)) {
    throw new Error("Limpeza abortada: fonte de usuários inválida.");
  }

  const validation = validateCleanupCandidates(originalUsers);
  const targetIndexSet = new Set(validation.targetIndexes);
  const nextUsers = originalUsers.filter((_, index) => !targetIndexSet.has(index));
  const backupName = `users-before-test-cleanup-${compactTimestamp(now)}.json`;
  const backupPath = await createBackup(backupName, originalUsers);

  await writeUsers(nextUsers);

  try {
    if (simulatePostWriteFailure) {
      throw new Error("Falha pós-escrita simulada.");
    }
    const persistedUsers = await readUsers();
    for (const email of auditedTestUserEmails) {
      if (persistedUsers.some((user) => normalizeEmail(user?.email) === email)) {
        throw new Error(`Validação pós-limpeza falhou: ${email} ainda existe.`);
      }
    }
    const preservedMatches = persistedUsers.filter(
      (user) => normalizeEmail(user?.email) === preservedInternalUserEmail,
    );
    if (
      preservedMatches.length !== 1 ||
      String(preservedMatches[0].accountType || "").trim().toLowerCase() !== "internal"
    ) {
      throw new Error("Validação pós-limpeza falhou: conta interna preservada não está íntegra.");
    }
    assertSameRemainingUsers(nextUsers, persistedUsers);
  } catch (error) {
    await writeUsers(originalUsers);
    error.rollbackExecuted = true;
    throw error;
  }

  return {
    ok: true,
    removedCount: validation.removedUsers.length,
    removedUsers: validation.removedUsers,
    preservedUser: validation.preservedUser,
    backupPath,
  };
}
