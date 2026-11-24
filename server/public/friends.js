const sections = {
  friends: ["#friend-list", "#friends-count", "Sua lista de amigos está vazia."],
  incoming: ["#friend-incoming", "#incoming-count", "Nenhum pedido recebido."],
  outgoing: ["#friend-outgoing", "#outgoing-count", "Nenhum pedido enviado."],
};

export function createFriendsView({ api, button, feedback, showError }) {
  const form = document.querySelector("#friend-search");
  const results = document.querySelector("#friend-results");
  let term = "";
  let listRequest = 0;
  let searchRequest = 0;
  let session = 0;

  const respond = (player, accept) => ({ request_id: player.request_id, accept });
  const target = (player) => ({ userid: player.user_id });

  function action(label, path, data, message, options = {}) {
    return button(label, async (event) => {
      if (options.confirm && !window.confirm(options.confirm)) return;
      const control = event.currentTarget;
      const activeSession = session;
      control.disabled = true;
      feedback();
      try {
        const result = await api("friends/" + path, "POST", data);
        if (activeSession !== session) return;
        feedback(typeof message === "function" ? message(result) : message);
        await refresh();
      } catch (error) {
        if (activeSession === session) showError(error);
      } finally {
        control.disabled = false;
      }
    }, options);
  }

  function acceptOrDecline(player) {
    return [
      action("Aceitar", "respond", respond(player, true), player.username + " entrou na sua lista de amigos."),
      action("Recusar", "respond", respond(player, false), "Pedido recusado."),
    ];
  }

  const cancelRequest = (player) =>
    action("Cancelar pedido", "remove", target(player), "Pedido cancelado.");

  function playerRow(list, player, actions, state) {
    const row = document.createElement("li");
    row.className = "friend-row";
    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = player.username;
    const details = document.createElement("span");
    details.className = "secondary";
    const level = player.level > 0 ? "Nível " + player.level : "Sem quintal";
    details.textContent = [level, player.online ? "Online" : "Offline", state].filter(Boolean).join(" · ");
    info.append(name, details);
    row.append(info);
    if (actions.length) {
      const controls = document.createElement("div");
      controls.className = "row-actions";
      controls.append(...actions);
      row.append(controls);
    }
    list.append(row);
  }

  function empty(list, message) {
    const row = document.createElement("li");
    row.className = "secondary";
    row.textContent = message;
    list.append(row);
  }

  async function listFriends() {
    const pending = ++listRequest;
    try {
      const data = await api("friends");
      if (pending !== listRequest) return;
      for (const [group, [selector, count, emptyMessage]] of Object.entries(sections)) {
        const list = document.querySelector(selector);
        const players = data[group];
        document.querySelector(count).textContent = players.length;
        list.replaceChildren();
        if (!players.length) empty(list, emptyMessage);
        for (const player of players) {
          const actions = group === "incoming" ? acceptOrDecline(player)
            : group === "outgoing" ? [cancelRequest(player)]
            : [action("Remover amigo", "remove", target(player), player.username + " saiu da sua lista de amigos.", {
              danger: true,
              confirm: "Remover " + player.username + " da sua lista de amigos?",
            })];
          playerRow(list, player, actions);
        }
      }
    } catch (error) {
      if (pending === listRequest) showError(error);
    }
  }

  async function search() {
    if (!term) return;
    const pending = ++searchRequest;
    try {
      const { players } = await api("friends/search?" + new URLSearchParams({ search: term }));
      if (pending !== searchRequest) return;
      results.hidden = false;
      results.replaceChildren();
      if (!players.length) empty(results, "Nenhum jogador encontrado.");
      for (const player of players) {
        if (player.relation === "friends") {
          playerRow(results, player, [], "Amigo");
        } else if (player.relation === "pending_incoming") {
          playerRow(results, player, acceptOrDecline(player), "Pedido recebido");
        } else if (player.relation === "pending_outgoing") {
          playerRow(results, player, [cancelRequest(player)], "Pedido enviado");
        } else {
          playerRow(results, player, [action("Adicionar", "request", target(player),
            ({ status }) => status === "accepted" ? player.username + " entrou na sua lista de amigos."
              : "Pedido enviado a " + player.username + ".")]);
        }
      }
    } catch (error) {
      if (pending === searchRequest) showError(error);
    }
  }

  async function refresh() {
    await Promise.all([listFriends(), search()]);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    feedback();
    const query = form.elements.search.value.trim();
    if (query.length < 2) {
      feedback("Digite pelo menos dois caracteres do nome do jogador.", true);
      return;
    }
    term = query;
    void search();
  });

  document.querySelector("#refresh-friends").addEventListener("click", () => {
    feedback();
    void refresh();
  });

  return {
    refresh,
    reset() {
      ++session;
      ++listRequest;
      ++searchRequest;
      term = "";
      form.reset();
      results.replaceChildren();
      results.hidden = true;
      for (const [list, count] of Object.values(sections)) {
        document.querySelector(list).replaceChildren();
        document.querySelector(count).textContent = "";
      }
    },
  };
}
