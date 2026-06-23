const intent = new URLSearchParams(window.location.search).get("intent") || "general";
const title = document.querySelector("[data-confirmation-title]");
const text = document.querySelector("[data-confirmation-text]");

const confirmations = {
  trial: {
    title: "Cadastro recebido",
    text: "Recebemos sua solicitação para testar o FII Select por 7 dias. Seu cadastro ficará em análise. Se aprovado, você receberá por e-mail as instruções para iniciar o teste gratuito.",
  },
  founder: {
    title: "Solicitação recebida",
    text: "Recebemos sua solicitação para garantir uma vaga no Plano Fundador do FII Select. Sua solicitação ficará em análise. Você receberá as próximas instruções por e-mail.",
  },
  general: {
    title: "Cadastro recebido",
    text: "Recebemos sua solicitação de acesso ao FII Select. Como estamos liberando o MVP gradualmente, seu cadastro ficará em análise. Se aprovado, você receberá por e-mail as próximas instruções.",
  },
};

const content = confirmations[intent] || confirmations.general;
title.textContent = content.title;
text.textContent = content.text;
