interface PopupState {
  blocked: boolean;
  connected: boolean;
  sessions: number;
  working: number;
  bypassActive: boolean;
}

interface BypassStatus {
  usedToday: boolean;
  bypassActive: boolean;
  bypassUntil: number | null;
}

const statusDot = document.getElementById("status-dot") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const sessionsEl = document.getElementById("sessions") as HTMLElement;
const workingEl = document.getElementById("working") as HTMLElement;
const blockedStatusEl = document.getElementById("blocked-status") as HTMLElement;
const bypassBtn = document.getElementById("bypass-btn") as HTMLButtonElement;
const bypassNote = document.getElementById("bypass-note") as HTMLElement;

let bypassCountdown: ReturnType<typeof setInterval> | null = null;

function updateUI(state: PopupState): void {
  // Update status indicator
  if (!state.connected) {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Offline";
  } else if (state.working > 0) {
    statusDot.className = "status-dot working";
    statusText.textContent = "Working";
  } else {
    statusDot.className = "status-dot connected";
    statusText.textContent = "Connected";
  }

  // Update stats
  sessionsEl.textContent = String(state.sessions);
  workingEl.textContent = String(state.working);

  if (state.bypassActive) {
    blockedStatusEl.textContent = "Bypassed";
    blockedStatusEl.style.color = "#22c55e";
  } else if (state.blocked) {
    blockedStatusEl.textContent = "Blocked";
    blockedStatusEl.style.color = "#ef4444";
  } else {
    blockedStatusEl.textContent = "Open";
    blockedStatusEl.style.color = "#22c55e";
  }
}

function updateBypassButton(status: BypassStatus): void {
  if (bypassCountdown) {
    clearInterval(bypassCountdown);
    bypassCountdown = null;
  }

  if (status.bypassActive && status.bypassUntil) {
    bypassBtn.disabled = true;
    bypassBtn.classList.add("active");

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((status.bypassUntil! - Date.now()) / 1000));
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      bypassBtn.textContent = `Bypass Active (${minutes}:${seconds.toString().padStart(2, "0")})`;

      if (remaining <= 0) {
        clearInterval(bypassCountdown!);
        refreshState();
      }
    };

    updateCountdown();
    bypassCountdown = setInterval(updateCountdown, 1000);
    bypassNote.textContent = "Bypass will expire soon";
  } else if (status.usedToday) {
    bypassBtn.disabled = true;
    bypassBtn.classList.remove("active");
    bypassBtn.textContent = "Bypass Used Today";
    bypassNote.textContent = "Resets at midnight";
  } else {
    bypassBtn.disabled = false;
    bypassBtn.classList.remove("active");
    bypassBtn.textContent = "Emergency Bypass (5 min)";
    bypassNote.textContent = "1 bypass per day";
  }
}

function refreshState(): void {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state: PopupState) => {
    if (state) {
      updateUI(state);
    }
  });

  chrome.runtime.sendMessage({ type: "GET_BYPASS_STATUS" }, (status: BypassStatus) => {
    if (status) {
      updateBypassButton(status);
    }
  });
}

bypassBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "ACTIVATE_BYPASS" }, (response) => {
    if (response?.success) {
      refreshState();
    } else if (response?.reason) {
      bypassNote.textContent = response.reason;
    }
  });
});

// Listen for state updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE_UPDATE") {
    updateUI(message);
  }
});

// Initial load
refreshState();

// Refresh every 5 seconds
setInterval(refreshState, 5000);
