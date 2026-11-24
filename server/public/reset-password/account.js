const requestForm = document.querySelector("#request");
const resetForm = document.querySelector("#reset");
const feedback = document.querySelector("#feedback");
let token;

function showResetForm() {
  const url = new URL(window.location.href);
  const resetToken = new URLSearchParams(url.hash.slice(1)).get("token") || url.searchParams.get("token");
  if (resetToken) {
    token = resetToken;
    window.history.replaceState(null, "", url.pathname);
    requestForm.hidden = true;
    resetForm.hidden = false;
    feedback.textContent = "";
  }
}

showResetForm();
window.addEventListener("hashchange", showResetForm);

async function submit(form, endpoint, body, successMessage, errorMessage) {
  const button = form.querySelector("button");
  button.disabled = true;
  feedback.textContent = "Enviando…";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 429) {
      feedback.textContent = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    } else if (response.ok) {
      feedback.textContent = successMessage;
      form.reset();
      if (form === resetForm) form.hidden = true;
    } else {
      feedback.textContent = errorMessage;
    }
  } catch {
    feedback.textContent = "A conexão com o servidor falhou. Tente novamente.";
  } finally {
    button.disabled = false;
  }
}

requestForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submit(requestForm, "/account/forgot-password", { email: requestForm.email.value },
    "Se a conta existir, você receberá um link por e-mail.", "Confira o e-mail e tente novamente.");
});

resetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submit(resetForm, "/account/reset-password", { token, password: resetForm.password.value },
    "Senha alterada. Você já pode voltar ao jogo.", "Confira a senha ou solicite um novo link.");
});
