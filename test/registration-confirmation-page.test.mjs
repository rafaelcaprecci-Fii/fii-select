import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("tela pós-cadastro orienta confirmação de e-mail antes do login", async () => {
  const confirmationHtml = await readFile(
    new URL("public/cadastro-confirmado.html", root),
    "utf8",
  );
  const registrationJs = await readFile(
    new URL("public/cadastro.js", root),
    "utf8",
  );

  assert.match(confirmationHtml, /<h1>Verifique seu e-mail<\/h1>/);
  assert.match(
    confirmationHtml,
    /Enviamos um link de confirmação para o e-mail cadastrado\./,
  );
  assert.match(
    confirmationHtml,
    /O link é válido por 24 horas e pode ser usado uma única vez\./,
  );
  assert.match(
    confirmationHtml,
    /O login só funcionará depois da confirmação do e-mail\./,
  );
  assert.match(
    confirmationHtml,
    /<a class="cta cta-gold" href="\/login\.html">Ir para o login<\/a>/,
  );
  assert.doesNotMatch(confirmationHtml, /Faça seu login para continuar/i);
  assert.doesNotMatch(confirmationHtml, /Cadastro em análise/i);

  assert.match(registrationJs, /window\.location\.href = "\/cadastro-confirmado"/);
  assert.doesNotMatch(registrationJs, /window\.location\.href = "\/login\.html"/);
  assert.match(
    registrationJs,
    /Cadastro recebido, mas não foi possível enviar o e-mail de confirmação agora\./,
  );
});
