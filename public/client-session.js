document.querySelectorAll(".logout").forEach((logout) => {
  logout.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await fetch("/api/users/logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  });
});
