import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Admin expõe limpeza auditada do Plano Fundador com confirmação forte e endpoint restrito", async () => {
  const html = await readFile(new URL("../public/admin.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/admin.js", import.meta.url), "utf8");
  const maintenanceSection = html.slice(
    html.indexOf('<section class="admin-maintenance-card"'),
    html.indexOf('<section class="customer-list-card"'),
  );
  const maintenanceModal = html.slice(
    html.indexOf('<section class="customer-actions-modal maintenance-cleanup-modal"'),
    html.indexOf('<section class="customer-actions-modal" id="acoes-cliente"'),
  );

  assert.match(maintenanceSection, /<span>Manutenção — Plano Fundador<\/span>/);
  assert.match(maintenanceSection, /Remover cadastros de teste do Plano Fundador/);
  assert.match(maintenanceSection, /Remove somente os cadastros de teste previamente auditados que aparecem no Plano Fundador/);
  assert.doesNotMatch(maintenanceSection, /Teste Grátis/);
  assert.match(maintenanceModal, /data-cleanup-confirm/);
  assert.match(maintenanceModal, /data-cleanup-submit disabled/);
  assert.match(maintenanceModal, /data-cleanup-result/);
  assert.doesNotMatch(maintenanceModal, /Teste Grátis/);

  assert.match(js, /const cleanupConfirmation = "REMOVE_AUDITED_TEST_USERS";/);
  assert.match(js, /cleanupConfirmInput\.value !== cleanupConfirmation/);
  assert.match(js, /fetch\("\/admin\/api\/maintenance\/remove-test-users"/);
  assert.match(js, /body: JSON\.stringify\(\{ confirm: cleanupConfirmation \}\)/);
  assert.match(js, /cadastros removidos não aparecem mais no Plano Fundador/);
  assert.doesNotMatch(js, /ADMIN_USER|ADMIN_PASSWORD|Authorization|Basic /);
  assert.doesNotMatch(js, /users\/by-email|account-type-by-email/);
});
