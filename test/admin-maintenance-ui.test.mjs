import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Admin expõe limpeza auditada de um cadastro com confirmação forte e endpoint restrito", async () => {
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

  assert.match(maintenanceSection, /<span>Manutenção — Remover cadastro de teste<\/span>/);
  assert.match(maintenanceSection, /Remover cadastro de teste/);
  assert.match(maintenanceSection, /Remove somente o cadastro de teste previamente auditado: rafael\.curycaprecci@gmail\.com/);
  assert.doesNotMatch(maintenanceSection, /Teste Grátis/);
  assert.match(maintenanceModal, /data-cleanup-confirm/);
  assert.match(maintenanceModal, /data-cleanup-submit disabled/);
  assert.match(maintenanceModal, /data-cleanup-result/);
  assert.doesNotMatch(maintenanceModal, /Teste Grátis/);

  assert.match(maintenanceModal, /REMOVE_RAF_TEST_USER/);
  assert.match(js, /const cleanupConfirmation = "REMOVE_RAF_TEST_USER";/);
  assert.match(js, /cleanupConfirmInput\.value !== cleanupConfirmation/);
  assert.match(js, /fetch\("\/admin\/api\/maintenance\/remove-test-users"/);
  assert.match(js, /body: JSON\.stringify\(\{ confirm: cleanupConfirmation \}\)/);
  assert.match(js, /cadastro de teste removido da base persistida/);
  assert.doesNotMatch(js, /ADMIN_USER|ADMIN_PASSWORD|Authorization|Basic /);
  assert.doesNotMatch(js, /users\/by-email|account-type-by-email/);
});
