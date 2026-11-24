import { createFriendsView } from "./friends.js";
import { showGameEntry, startGame, stopGame } from "./play/play.js?v=4";

const find = (selector) => document.querySelector(selector);
const loginForm = find("#login");
const registerForm = find("#register");
const preferencesForm = find("#preferences");
const recoveryForm = find("#recovery");
const site = find("#site");
const filter = find("#player-filter");
const rows = find("#player-rows");
const dialog = find("#change");
const changeForm = find("#change-form");
const confirm = find("#confirm-change");
const cancel = find("#cancel-change");
const numbers = new Intl.NumberFormat("pt-BR");
let page = 1;
let requestNumber = 0;
let change;
let accountUser;
const friendsView = createFriendsView({ api, button, feedback, showError });
const accountChanges = "BroadcastChannel" in window ? new BroadcastChannel("bymr-account") : null;

for (const select of document.querySelectorAll("[data-game-language]")) {
  select.append(find("#game-languages").content.cloneNode(true));
}

async function api(path, method = "GET", body) {
  const response = await fetch("/account/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Não foi possível concluir a operação.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function feedback(message = "", error = false) {
  const note = find("#feedback");
  note.textContent = message;
  note.hidden = !message;
  note.classList.toggle("error", error);
}

async function renderSession(user, openGame = true) {
  const accountChanged = accountUser?.id !== user?.id;
  if (accountChanged) {
    ++requestNumber;
    page = 1;
    rows.replaceChildren();
    friendsView.reset();
    if (dialog.open) dialog.close();
  }
  accountUser = user;
  find("#guest").hidden = Boolean(user);
  find("#account").hidden = !user;
  find("#game").hidden = !user;
  find("#game-settings").hidden = !user;
  find("#account-role").textContent = user?.role === "moderator" ? "Moderação" : "Jogador";
  find("#account-title").textContent = user?.username ?? "";
  (user ? find("#account-recovery") : find("#guest-recovery")).append(recoveryForm);
  if (user) preferencesForm.elements.language.value = user.language;
  if (accountChanged) {
    if (user) {
      const game = { requestPlayer: () => api("game", "POST"), unauthorized: () => syncSession(false) };
      if (openGame) void startGame(game);
      else showGameEntry(game);
    } else {
      stopGame();
    }
  }
  await showAccountView();
}

async function showAccountView() {
  const hash = location.hash;
  const moderator = accountUser?.role === "moderator";
  const recovery = hash === "#senha";
  const current = accountUser && ["#conta", "#amigos", ...(moderator ? ["#moderacao"] : []), "#senha"].includes(hash) ? hash : "#jogo";
  const open = Boolean(accountUser) && current !== "#jogo";
  site.classList.toggle("playing", Boolean(accountUser));
  site.classList.toggle("panel-open", open);
  site.classList.toggle("wide-panel", current === "#moderacao");
  find("#site-content").hidden = Boolean(accountUser) && !open;
  find("#close-panel").hidden = !open;
  find("#player-home").hidden = current !== "#conta";
  find("#moderation").hidden = current !== "#moderacao";
  find("#friends-panel").hidden = current !== "#amigos";
  loginForm.hidden = recovery || hash === "#cadastro";
  registerForm.hidden = hash !== "#cadastro";
  recoveryForm.hidden = !recovery;
  find("#recovery-back").href = accountUser ? "#conta" : "#jogo";
  find("#recovery-back").textContent = accountUser ? "Voltar à conta" : "Voltar ao login";
  for (const [selector, view] of [["#nav-game", "#jogo"], ["#nav-friends", "#amigos"], ["#nav-account", "#conta"], ["#nav-moderation", "#moderacao"]]) {
    const link = find(selector);
    link.hidden = !accountUser || (view === "#moderacao" && !moderator);
    if (view === current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (!accountUser) return;
  if (current === "#amigos") await friendsView.refresh();
  if (current === "#moderacao") await loadPlayers();
}

function showError(error) {
  if (error.status === 401) void renderSession(null);
  feedback(error.message, true);
}

window.bymrOpenFriends = () => { location.hash = "amigos"; };

function button(label, fn, { disabled = false, danger = false } = {}) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "button" + (danger ? " danger" : "");
  element.disabled = disabled;
  element.textContent = label;
  element.addEventListener("click", fn);
  return element;
}

function addPlayer(player, archived) {
  const row = rows.insertRow();
  const name = row.insertCell();
  const username = document.createElement("strong");
  username.textContent = player.username;
  const id = document.createElement("span");
  id.className = "secondary";
  id.textContent = "#" + player.id;
  name.append(username, id);
  row.insertCell().textContent = player.role === "moderator" ? "Moderação" : player.banned ? "Banida" : "Jogador";
  const balance = row.insertCell();
  balance.className = "credits";
  balance.textContent = player.credits === null ? "Sem quintal" : numbers.format(player.credits);
  if (player.shinyLocked) {
    const locked = document.createElement("span");
    locked.className = "secondary";
    locked.textContent = "Shiny oculto no jogo";
    balance.append(locked);
  }
  const actions = document.createElement("div");
  actions.className = "row-actions";
  row.insertCell().append(actions);
  if (archived) {
    actions.append(button("Restaurar", () => openChange("restore", player)));
    return;
  }
  actions.append(button("Ajustar Shiny", () => openChange("shiny", player), { disabled: player.credits === null }));
  if (player.role !== "moderator") {
    actions.append(button("Arquivar", () => openChange("archive", player), { danger: true }));
  }
}

async function loadPlayers() {
  const currentRequest = ++requestNumber;
  const params = new URLSearchParams(new FormData(filter));
  params.set("page", String(page));
  try {
    const data = await api("players?" + params);
    if (currentRequest !== requestNumber) return;
    const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (page > lastPage) {
      page = lastPage;
      await loadPlayers();
      return;
    }
    rows.replaceChildren();
    for (const player of data.players) addPlayer(player, params.get("status") === "archived");
    if (!data.players.length) {
      const empty = rows.insertRow().insertCell();
      empty.colSpan = 4;
      empty.textContent = "Nenhum jogador encontrado.";
    }
    find("#result-count").textContent = numbers.format(data.total) + (data.total === 1 ? " conta" : " contas");
    find("#pages").hidden = lastPage < 2;
    find("#previous").disabled = page <= 1;
    find("#next").disabled = page >= lastPage;
    find("#page-number").textContent = page + " de " + lastPage;
  } catch (error) {
    if (currentRequest !== requestNumber) return;
    rows.replaceChildren();
    find("#result-count").textContent = "";
    find("#pages").hidden = true;
    if (error.status === 403) find("#moderation").hidden = true;
    showError(error);
  }
}

function openChange(action, player) {
  change = { action, player };
  changeForm.reset();
  const shiny = action === "shiny";
  const label = shiny ? "Ajustar Shiny" : action === "archive" ? "Arquivar conta" : "Restaurar conta";
  find("#change-title").textContent = label;
  confirm.textContent = shiny ? "Aplicar ajuste" : label;
  find("#change-description").textContent = shiny
    ? player.username + " tem " + numbers.format(player.credits) + " Shiny."
    : action === "archive"
      ? player.username + " perderá o acesso ao jogo. Você pode restaurar o cadastro na lista de contas arquivadas."
      : "A conta de " + player.username + " voltará para a lista de contas ativas.";
  find("#shiny-fields").hidden = !shiny;
  find("#quantity").required = shiny;
  find("#change-error").hidden = true;
  dialog.showModal();
  (shiny ? find("#quantity") : cancel).focus();
}

changeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const { action, player } = change;
  const path = "players/" + player.id;
  confirm.disabled = cancel.disabled = true;
  try {
    if (action === "shiny") {
      const delta = find("#quantity").valueAsNumber * (find("#direction").value === "add" ? 1 : -1);
      if (change.delta !== delta) {
        change.delta = delta;
        change.operationId = crypto.randomUUID();
      }
      const { credits } = await api(path + "/shiny", "PATCH", { delta, operationId: change.operationId });
      feedback("Saldo de " + player.username + " atualizado para " + numbers.format(credits) + " Shiny.");
    } else {
      await (action === "archive" ? api(path, "DELETE") : api(path + "/restore", "POST"));
      feedback(action === "archive" ? "Conta arquivada." : "Conta restaurada.");
    }
    dialog.close();
    await loadPlayers();
  } catch (error) {
    if (error.status === 401) {
      dialog.close();
      showError(error);
    } else {
      find("#change-error").textContent = error.message;
      find("#change-error").hidden = false;
    }
  } finally {
    confirm.disabled = cancel.disabled = false;
  }
});

dialog.addEventListener("cancel", (event) => {
  if (confirm.disabled) event.preventDefault();
});
cancel.addEventListener("click", () => dialog.close());

function submitForm(form, path, method, success) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    feedback();
    try {
      await success(await api(path, method, Object.fromEntries(new FormData(form))));
    } catch (error) {
      showError(error);
    } finally {
      submit.disabled = false;
    }
  });
}

async function signedIn({ user, verificationRequired }) {
  if (location.hash === "#cadastro") history.replaceState(null, "", "#jogo");
  loginForm.reset();
  registerForm.reset();
  if (verificationRequired) {
    await renderSession(null);
    feedback("Conta criada. Conclua a verificação no Discord para entrar.");
    return;
  }
  accountChanges?.postMessage("session");
  await renderSession(user);
}

submitForm(loginForm, "login", "POST", signedIn);
submitForm(registerForm, "register", "POST", signedIn);
submitForm(preferencesForm, "preferences", "PATCH", ({ user }) => {
  accountUser = user;
  feedback("Idioma salvo. Ele será usado na próxima abertura do jogo.");
});
submitForm(recoveryForm, "forgot-password", "POST", () => {
  recoveryForm.reset();
  feedback("Se a conta existir, você receberá um link por e-mail.");
});

find("#logout").addEventListener("click", async (event) => {
  const submit = event.currentTarget;
  submit.disabled = true;
  try {
    await api("logout", "POST");
    history.replaceState(null, "", "#jogo");
    accountChanges?.postMessage("session");
    filter.reset();
    page = 1;
    await renderSession(null);
    feedback();
  } catch (error) {
    showError(error);
  } finally {
    submit.disabled = false;
  }
});

filter.addEventListener("submit", (event) => {
  event.preventDefault();
  feedback();
  page = 1;
  void loadPlayers();
});
filter.elements.status.addEventListener("change", () => filter.requestSubmit());
find("#previous").addEventListener("click", () => { --page; void loadPlayers(); });
find("#next").addEventListener("click", () => { ++page; void loadPlayers(); });
window.addEventListener("hashchange", () => {
  feedback();
  void showAccountView();
});

async function syncSession(openGame = true) {
  try {
    const { user } = await api("session");
    if (user.id !== accountUser?.id) await renderSession(user, openGame);
    return true;
  } catch (error) {
    if (error.status === 401 || !accountUser) await renderSession(null);
    if (error.status !== 401) showError(error);
    return Boolean(accountUser);
  }
}

accountChanges?.addEventListener("message", () => void syncSession(false));
await syncSession();
