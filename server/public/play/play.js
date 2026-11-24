const game = document.querySelector("#game");
const stage = document.querySelector("#game-stage");
const message = document.querySelector("#game-message");
const status = document.querySelector("#status");
const retry = document.querySelector("#retry-game");
const quality = document.querySelector("#graphics-quality");
const fullscreen = document.querySelector("#fullscreen");
const QUALITY_PREFERENCE = "bymr-graphics-quality";

let engine;
let player;
let chatSocket;
let generation = 0;

try {
  if (localStorage.getItem(QUALITY_PREFERENCE) === "performance") quality.value = "performance";
} catch {
  // The page can still run without local storage.
}

function fitStage() {
  const { clientWidth: width, clientHeight: height } = game;
  if (!width || !height) return;

  const gameScale = Math.min(2, Math.max(1, 1 / window.devicePixelRatio));
  const performanceScale = quality.value === "performance" ? Math.sqrt(width * height / 900_000) : 1;
  const maxWidth = Math.round(1440 * gameScale);
  const maxHeight = Math.round(1080 * gameScale);
  const availableWidth = Math.min(width, maxWidth);
  const availableHeight = Math.min(height, maxHeight);
  const scale = Math.min(
    availableWidth / (760 * gameScale),
    availableHeight / (600 * gameScale),
    Math.max(1, performanceScale),
  );
  const stageWidth = Math.round(availableWidth / scale);
  const stageHeight = Math.round(availableHeight / scale);
  const displayScale = Math.min(availableWidth / stageWidth, availableHeight / stageHeight);
  if (displayScale === 1) {
    stage.style.left = Math.round((width - stageWidth) / 2) + "px";
    stage.style.top = Math.round((height - stageHeight) / 2) + "px";
    stage.style.transform = "none";
  } else {
    stage.style.left = "50%";
    stage.style.top = "50%";
    stage.style.transform = "translate(-50%, -50%) scale(" + displayScale + ")";
  }
  stage.style.width = stageWidth + "px";
  stage.style.height = stageHeight + "px";
  player?.ruffle().callExternalInterface("bymrGameScale", gameScale);
  return gameScale;
}

new ResizeObserver(fitStage).observe(game);
window.addEventListener("resize", fitStage);
quality.addEventListener("change", () => {
  fitStage();
  try {
    localStorage.setItem(QUALITY_PREFERENCE, quality.value);
  } catch {
    // The current page still uses the chosen quality.
  }
});

if (document.fullscreenEnabled && document.querySelector("#site").requestFullscreen) {
  fullscreen.hidden = false;
  fullscreen.addEventListener("click", async () => {
    const note = document.querySelector("#fullscreen-status");
    note.hidden = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector("#site").requestFullscreen();
    } catch {
      note.textContent = "A tela cheia está indisponível.";
      note.hidden = false;
    }
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreen.textContent = document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia";
    fitStage();
  });
}

function loadEngine() {
  engine ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/play/ruffle/ruffle.js";
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      engine = undefined;
      reject(new Error("O player não pôde ser carregado."));
    };
    document.head.append(script);
  });
  return engine;
}

function showStatus(text, action) {
  status.textContent = text;
  retry.hidden = !action;
  retry.onclick = action ?? null;
  message.hidden = false;
}

window.bymrChatDisconnect = () => {
  const current = chatSocket;
  chatSocket = undefined;
  current?.close();
};

window.bymrChatConnect = (port) => {
  window.bymrChatDisconnect();
  const ruffle = player?.ruffle();
  if (!ruffle) return;
  const address = new URL("/play/chat", location.origin);
  if (address.protocol === "https:") {
    address.protocol = "wss:";
  } else {
    address.protocol = "ws:";
    address.port = port;
    address.pathname = "/";
  }
  const socket = new WebSocket(address);
  chatSocket = socket;
  socket.onopen = () => {
    if (chatSocket === socket) ruffle.callExternalInterface("bymrChatOpen");
  };
  socket.onmessage = ({ data }) => {
    if (chatSocket === socket) ruffle.callExternalInterface("bymrChatMessage", data);
  };
  socket.onclose = () => {
    if (chatSocket !== socket) return;
    chatSocket = undefined;
    ruffle.callExternalInterface("bymrChatClose", "Chat connection closed");
  };
};

window.bymrChatSend = (payload) => {
  if (chatSocket?.readyState === WebSocket.OPEN) chatSocket.send(payload);
};

export function stopGame() {
  ++generation;
  window.bymrChatDisconnect();
  player?.remove();
  player = undefined;
}

export function showGameEntry(options) {
  stopGame();
  showStatus("Sua conta está conectada.", () => void startGame(options));
}

export async function startGame({ requestPlayer, unauthorized }) {
  stopGame();
  const current = generation;
  const restart = () => void startGame({ requestPlayer, unauthorized });
  showStatus("Carregando o jogo…");
  try {
    await loadEngine();
    if (current !== generation) return;
    const { player: info, language } = await requestPlayer();
    if (current !== generation) return;
    player = window.RufflePlayer.newest().createPlayer();
    stage.append(player);
    window.bymrGameUnauthorized = () => queueMicrotask(async () => {
      if (current !== generation) return;
      stopGame();
      const stopped = generation;
      if (await unauthorized() && stopped === generation) {
        showStatus("A sessão do jogo foi encerrada. Abra o jogo para continuar.", restart);
      }
    });
    const gameScale = fitStage();
    await player.ruffle().load({
      url: location.origin + "/play/game.swf?v=4",
      parameters: { serverUrl: location.origin + "/", webClient: "true", language, player: JSON.stringify(info), gameScale },
      allowScriptAccess: true,
      autoplay: "on",
      unmuteOverlay: "hidden",
    });
    if (current === generation) message.hidden = true;
  } catch (error) {
    if (current !== generation) return;
    if (error.status === 401 && !(await unauthorized())) return;
    if (current !== generation) return;
    stopGame();
    showStatus(error.status === 403 ? error.message : "Não foi possível carregar o jogo.", restart);
    console.error("Falha ao iniciar o jogo no navegador.", error);
  }
}
