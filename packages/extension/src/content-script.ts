const MODAL_ID = "claude-blocker-modal";
const BLOCKED_DOMAINS = ["x.com", "twitter.com", "t3.gg"];

// State shape from service worker
interface PublicState {
  serverConnected: boolean;
  sessions: number;
  working: number;
  blocked: boolean;
  bypassActive: boolean;
}

// Track current state so we can re-render if modal gets removed
let lastKnownState: PublicState | null = null;
let shouldBeBlocked = false;

function isBlockedDomain(): boolean {
  const hostname = window.location.hostname.replace(/^www\./, "");
  return BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

function getModal(): HTMLElement | null {
  return document.getElementById(MODAL_ID);
}

function getShadow(): ShadowRoot | null {
  return getModal()?.shadowRoot ?? null;
}

function createModal(): void {
  if (getModal()) return;

  const container = document.createElement("div");
  container.id = MODAL_ID;
  const shadow = container.attachShadow({ mode: "open" });

  // Use inline styles with bulletproof Arial font (won't change when page loads custom fonts)
  shadow.innerHTML = `
    <div style="all:initial;position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;z-index:2147483647;-webkit-font-smoothing:antialiased;">
      <div style="all:initial;background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:40px;max-width:480px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;">
        <svg style="width:64px;height:64px;margin-bottom:24px;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="11" width="18" height="11" rx="2" fill="#FFD700" stroke="#B8860B" stroke-width="1"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#888" stroke-width="2" fill="none"/>
        </svg>
        <div style="color:#fff;font-size:24px;font-weight:bold;margin:0 0 16px;line-height:1.2;">Time to Work</div>
        <div id="message" style="color:#888;font-size:16px;line-height:1.5;margin:0 0 24px;font-weight:normal;">Loading...</div>
        <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#2a2a2a;border-radius:20px;font-size:14px;color:#666;line-height:1;">
          <span id="dot" style="width:8px;height:8px;border-radius:50%;background:#666;flex-shrink:0;"></span>
          <span id="status" style="color:#666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">...</span>
        </div>
        <div id="hint" style="margin-top:24px;font-size:13px;color:#555;line-height:1.4;font-family:Arial,Helvetica,sans-serif;"></div>
        <button id="bypass-btn" style="all:initial;margin-top:24px;padding:12px 24px;background:#333;border:1px solid #444;border-radius:8px;color:#888;font-family:Arial,Helvetica,sans-serif;font-size:13px;cursor:pointer;transition:all 0.2s;">
          Give me 5 minutes (1x per day)
        </button>
      </div>
    </div>
  `;

  // Wire up bypass button
  const bypassBtn = shadow.getElementById("bypass-btn");
  if (bypassBtn) {
    // Check if already used today
    chrome.runtime.sendMessage({ type: "GET_BYPASS_STATUS" }, (status) => {
      if (status?.usedToday) {
        bypassBtn.textContent = "Bypass already used today";
        (bypassBtn as HTMLButtonElement).disabled = true;
        bypassBtn.style.opacity = "0.5";
        bypassBtn.style.cursor = "not-allowed";
      }
    });

    bypassBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "ACTIVATE_BYPASS" }, (response) => {
        if (response?.success) {
          removeModal();
        } else if (response?.reason) {
          bypassBtn.textContent = response.reason;
          (bypassBtn as HTMLButtonElement).disabled = true;
          bypassBtn.style.opacity = "0.5";
          bypassBtn.style.cursor = "not-allowed";
        }
      });
    });

    // Hover effect
    bypassBtn.addEventListener("mouseenter", () => {
      if (!(bypassBtn as HTMLButtonElement).disabled) {
        bypassBtn.style.background = "#444";
        bypassBtn.style.color = "#aaa";
      }
    });
    bypassBtn.addEventListener("mouseleave", () => {
      bypassBtn.style.background = "#333";
      bypassBtn.style.color = "#888";
    });
  }

  // Mount to documentElement (html) instead of body - more resilient to React hydration
  document.documentElement.appendChild(container);
}

function removeModal(): void {
  getModal()?.remove();
}

// Watch for our modal being removed by the page and re-add it
function setupMutationObserver(): void {
  const observer = new MutationObserver(() => {
    if (shouldBeBlocked && !getModal()) {
      // Modal was removed but should exist - re-create it
      createModal();
      if (lastKnownState) {
        renderState(lastKnownState);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function setDotColor(dot: HTMLElement, color: "green" | "red" | "gray"): void {
  const colors = {
    green: "background:#22c55e;box-shadow:0 0 8px #22c55e;",
    red: "background:#ef4444;box-shadow:0 0 8px #ef4444;",
    gray: "background:#666;box-shadow:none;",
  };
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;${colors[color]}`;
}

function renderState(state: PublicState): void {
  const shadow = getShadow();
  if (!shadow) return;

  const message = shadow.getElementById("message");
  const dot = shadow.getElementById("dot");
  const status = shadow.getElementById("status");
  const hint = shadow.getElementById("hint");
  if (!message || !dot || !status || !hint) return;

  if (!state.serverConnected) {
    message.textContent = "Server offline. Start the blocker server to continue.";
    setDotColor(dot, "red");
    status.textContent = "Server Offline";
    hint.innerHTML = `Run <span style="background:#2a2a2a;padding:2px 8px;border-radius:4px;font-family:ui-monospace,monospace;font-size:12px;">npx claude-blocker</span> to start`;
  } else if (state.sessions === 0) {
    message.textContent = "No Claude Code sessions detected.";
    setDotColor(dot, "green");
    status.textContent = "Waiting for Claude Code";
    hint.textContent = "Open a terminal and start Claude Code";
  } else {
    message.textContent = `${state.sessions} session${state.sessions > 1 ? "s" : ""} idle. Start a prompt to unblock.`;
    setDotColor(dot, "green");
    status.textContent = `${state.sessions} idle`;
    hint.textContent = "Type a prompt in Claude Code to unblock";
  }
}

function renderError(): void {
  const shadow = getShadow();
  if (!shadow) return;

  const message = shadow.getElementById("message");
  const dot = shadow.getElementById("dot");
  const status = shadow.getElementById("status");
  const hint = shadow.getElementById("hint");
  if (!message || !dot || !status || !hint) return;

  message.textContent = "Cannot connect to extension.";
  setDotColor(dot, "red");
  status.textContent = "Extension Error";
  hint.textContent = "Try reloading the extension";
}

// Handle state updates from service worker
function handleState(state: PublicState): void {
  lastKnownState = state;

  if (!isBlockedDomain()) {
    shouldBeBlocked = false;
    removeModal();
    return;
  }

  if (state.blocked) {
    shouldBeBlocked = true;
    createModal();
    renderState(state);
  } else {
    shouldBeBlocked = false;
    removeModal();
  }
}

// Request state from service worker
function requestState(): void {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      // Service worker not ready, retry
      setTimeout(requestState, 500);
      createModal();
      renderError();
      return;
    }
    handleState(response);
  });
}

// Listen for broadcasts from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE") {
    handleState(message);
  }
});

// Start
if (isBlockedDomain()) {
  setupMutationObserver();
  createModal();
  requestState();
}
