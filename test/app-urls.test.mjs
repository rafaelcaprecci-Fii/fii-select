import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_APP_BASE_URL,
  buildAppUrl,
  getAppBaseUrl,
} from "../lib/app-urls.mjs";

test("usa APP_BASE_URL para montar links oficiais", () => {
  const baseUrl = "https://app.fiiselect.com.br/";

  assert.equal(getAppBaseUrl(baseUrl), "https://app.fiiselect.com.br");
  assert.equal(
    buildAppUrl("/login.html", baseUrl),
    "https://app.fiiselect.com.br/login.html",
  );
  assert.equal(
    buildAppUrl("/status-aprovado.html", baseUrl),
    "https://app.fiiselect.com.br/status-aprovado.html",
  );
});

test("mantém o domínio Railway atual como fallback", () => {
  assert.equal(getAppBaseUrl(""), FALLBACK_APP_BASE_URL);
  assert.equal(
    buildAppUrl("/assinar.html", ""),
    `${FALLBACK_APP_BASE_URL}/assinar.html`,
  );
});

test("valor inválido ou protocolo inseguro usa fallback", () => {
  assert.equal(getAppBaseUrl("javascript:alert(1)"), FALLBACK_APP_BASE_URL);
  assert.equal(getAppBaseUrl("domínio inválido"), FALLBACK_APP_BASE_URL);
});
