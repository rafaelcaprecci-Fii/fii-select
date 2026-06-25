const loginForm = document.querySelector("[data-login-form]");

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  window.location.href = "/assinar.html";
});
