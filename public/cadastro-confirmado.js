const title = document.querySelector("[data-confirmation-title]");
const text = document.querySelector("[data-confirmation-text]");

title.textContent = "Cadastro realizado";
text.innerHTML =
  "Seu cadastro no FII Select foi recebido com sucesso.<br><br>Agora você pode acessar sua área pelo login para acompanhar o status da sua liberação.";
