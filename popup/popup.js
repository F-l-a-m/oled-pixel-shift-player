const startButton = document.getElementById("start");
const settingsForm = document.getElementById("settings");
const status = document.getElementById("status");

async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
}

startButton.addEventListener("click", async () => {
    startButton.disabled = true;

    // Request fullscreen directly here, in the click handler itself —
    // the closest point to the actual user gesture, and the only one
    // Chrome reliably treats as gesture-backed for this popup. Relaying
    // it through the background script (like everything else below)
    // loses that recognition: chrome.commands (the keyboard shortcut)
    // carries it through automatically, but a generic runtime message
    // from the popup does not. Fired without awaiting it — entering
    // fullscreen closes this popup, and blocking here risks the popup
    // closing before the relay message below even gets sent.
    const tabId = await getActiveTabId();

    if (tabId) {
        requestFullscreenIfNeeded(tabId).catch(() => {
            // Ignore — the relay below and content.js's own
            // requestFullscreenWithRetry() are still there as fallbacks.
        });
    }

    try {
        // Relayed to the background script rather than doing the rest of
        // the injection here directly: it isn't tied to the popup's
        // lifetime, so it completes even if the popup has already closed
        // by the time it runs — we just might not be around to show the
        // result in that case.
        const response = await chrome.runtime.sendMessage({ action: OLED_ACTIONS.REQUEST });
        status.textContent = response?.ok ? "Done" : (response?.error || "Couldn't run on this page");
    }
    catch (error) {
        console.error("[OLED] Failed to contact the extension:", error);
        status.textContent = "Couldn't run on this page";
    }
    finally {
        startButton.disabled = false;
    }
});

function fillSettingsForm(settings) {
    for (const [key, value] of Object.entries(settings)) {
        const field = settingsForm.elements.namedItem(key);
        if (field) field.value = value;
    }
}

async function loadSettings() {
    const { settings = {} } = await chrome.storage.local.get("settings");
    // Show the values that will actually be applied, not the raw stored
    // ones — keeps the form from ever displaying something out of range.
    fillSettingsForm(clampOledSettings(settings));
}

settingsForm.addEventListener("change", async () => {
    const rawSettings = Object.fromEntries(new FormData(settingsForm).entries());
    for (const key of Object.keys(rawSettings)) rawSettings[key] = Number(rawSettings[key]);

    if (rawSettings.scaleMin > rawSettings.scaleMax) {
        status.textContent = "Minimum scale cannot be larger than maximum scale";
        return;
    }

    const settings = clampOledSettings(rawSettings);
    await chrome.storage.local.set({ settings });
    fillSettingsForm(settings);
    status.textContent = "Settings saved";
});

loadSettings();