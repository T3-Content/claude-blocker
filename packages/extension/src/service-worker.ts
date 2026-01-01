const WS_URL = "ws://localhost:8765/ws";
const KEEPALIVE_INTERVAL = 20_000;
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 30_000;

// The actual state - service worker is single source of truth
interface State {
  serverConnected: boolean;
  sessions: number;
  working: number;
  bypassUntil: number | null;
}

const state: State = {
  serverConnected: false,
  sessions: 0,
  working: 0,
  bypassUntil: null,
};

let websocket: WebSocket | null = null;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;

// Load bypass from storage on startup
chrome.storage.sync.get(["bypassUntil"], (result) => {
  if (result.bypassUntil && result.bypassUntil > Date.now()) {
    state.bypassUntil = result.bypassUntil;
  }
});

// Compute derived state
function getPublicState() {
  const bypassActive = state.bypassUntil !== null && state.bypassUntil > Date.now();
  const shouldBlock = !bypassActive && (state.working === 0 || !state.serverConnected);

  return {
    serverConnected: state.serverConnected,
    sessions: state.sessions,
    working: state.working,
    blocked: shouldBlock,
    bypassActive,
    bypassUntil: state.bypassUntil,
  };
}

// Broadcast current state to all tabs
function broadcast() {
  const publicState = getPublicState();
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "STATE", ...publicState }).catch(() => {});
      }
    }
  });
}

// WebSocket connection management
function connect() {
  if (websocket?.readyState === WebSocket.OPEN) return;
  if (websocket?.readyState === WebSocket.CONNECTING) return;

  try {
    websocket = new WebSocket(WS_URL);

    websocket.onopen = () => {
      console.log("[Claude Blocker] Connected");
      state.serverConnected = true;
      retryCount = 0;
      startKeepalive();
      broadcast();
    };

    websocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "state") {
          state.sessions = msg.sessions;
          state.working = msg.working;
          broadcast();
        }
      } catch {}
    };

    websocket.onclose = () => {
      console.log("[Claude Blocker] Disconnected");
      state.serverConnected = false;
      stopKeepalive();
      broadcast();
      scheduleReconnect();
    };

    websocket.onerror = () => {
      state.serverConnected = false;
      stopKeepalive();
    };
  } catch {
    scheduleReconnect();
  }
}

function startKeepalive() {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: "ping" }));
    }
  }, KEEPALIVE_INTERVAL);
}

function stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, retryCount), RECONNECT_MAX_DELAY);
  retryCount++;
  reconnectTimeout = setTimeout(connect, delay);
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    sendResponse(getPublicState());
    return true;
  }

  if (message.type === "ACTIVATE_BYPASS") {
    const today = new Date().toDateString();
    chrome.storage.sync.get(["lastBypassDate"], (result) => {
      if (result.lastBypassDate === today) {
        sendResponse({ success: false, reason: "Already used today" });
        return;
      }
      state.bypassUntil = Date.now() + 5 * 60 * 1000;
      chrome.storage.sync.set({ bypassUntil: state.bypassUntil, lastBypassDate: today });
      broadcast();
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_BYPASS_STATUS") {
    const today = new Date().toDateString();
    chrome.storage.sync.get(["lastBypassDate"], (result) => {
      sendResponse({
        usedToday: result.lastBypassDate === today,
        bypassActive: state.bypassUntil !== null && state.bypassUntil > Date.now(),
        bypassUntil: state.bypassUntil,
      });
    });
    return true;
  }

  return false;
});

// Check bypass expiry
setInterval(() => {
  if (state.bypassUntil && state.bypassUntil <= Date.now()) {
    state.bypassUntil = null;
    chrome.storage.sync.remove("bypassUntil");
    broadcast();
  }
}, 5000);

// Start
connect();
