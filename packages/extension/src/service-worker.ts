export {};

const WS_URL = "ws://localhost:8765/ws";
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 30_000;

// Alarm names
const ALARM_KEEPALIVE = "keepalive";
const ALARM_CHECK_BYPASS = "checkBypass";

// The actual state - service worker is single source of truth
interface State {
  serverConnected: boolean;
  sessions: number;
  working: number;
  waitingForInput: number;
  bypassUntil: number | null;
}

const state: State = {
  serverConnected: false,
  sessions: 0,
  working: 0,
  waitingForInput: 0,
  bypassUntil: null,
};

let websocket: WebSocket | null = null;
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
  // Don't block if waiting for input - only block when truly idle
  const isIdle = state.working === 0 && state.waitingForInput === 0;
  const shouldBlock = !bypassActive && (isIdle || !state.serverConnected);

  return {
    serverConnected: state.serverConnected,
    sessions: state.sessions,
    working: state.working,
    waitingForInput: state.waitingForInput,
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
          state.waitingForInput = msg.waitingForInput ?? 0;
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

// Use chrome.alarms for keepalive (survives Firefox Event Page suspension)
function startKeepalive() {
  stopKeepalive();
  // periodInMinutes minimum is ~0.5 in most browsers, so ~30 seconds
  chrome.alarms.create(ALARM_KEEPALIVE, { periodInMinutes: 0.33 });
}

function stopKeepalive() {
  chrome.alarms.clear(ALARM_KEEPALIVE);
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, retryCount), RECONNECT_MAX_DELAY);
  retryCount++;
  reconnectTimeout = setTimeout(connect, delay);
}

// Handle alarm events (works across Firefox Event Page suspension)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_KEEPALIVE) {
    // Send keepalive ping or reconnect if disconnected
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: "ping" }));
    } else if (websocket?.readyState !== WebSocket.CONNECTING) {
      connect();
    }
  }

  if (alarm.name === ALARM_CHECK_BYPASS) {
    // Check if bypass has expired
    if (state.bypassUntil && state.bypassUntil <= Date.now()) {
      state.bypassUntil = null;
      chrome.storage.sync.remove("bypassUntil");
      broadcast();
    }
  }
});

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

// Start bypass expiry check alarm (every ~6 seconds)
chrome.alarms.create(ALARM_CHECK_BYPASS, { periodInMinutes: 0.1 });

// Start connection
connect();
