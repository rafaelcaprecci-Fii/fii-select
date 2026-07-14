import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Admin expõe limpeza auditada com confirmação forte e endpoint restrito", async () => {
  const html = await readFile(new URL("../public/admin.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/admin.js", import.meta.url), "utf8");

  assert.match(html, /<span>Manutenção<\/span>/);
  assert.match(html, /Remover usuários de teste auditados/);
  assert.match(html, /Remove somente os três cadastros de teste previamente autorizados/);
  assert.match(html, /data-cleanup-confirm/);
  assert.match(html, /data-cleanup-submit disabled/);
  assert.match(html, /data-cleanup-result/);

  assert.match(js, /const cleanupConfirmation = "REMOVE_AUDITED_TEST_USERS";/);
  assert.match(js, /cleanupConfirmInput\.value !== cleanupConfirmation/);
  assert.match(js, /fetch\("\/admin\/api\/maintenance\/remove-test-users"/);
  assert.match(js, /body: JSON\.stringify\(\{ confirm: cleanupConfirmation \}\)/);
  assert.doesNotMatch(js, /ADMIN_USER|ADMIN_PASSWORD|Authorization|Basic /);
  assert.doesNotMatch(js, /users\/by-email|account-type-by-email/);
});
