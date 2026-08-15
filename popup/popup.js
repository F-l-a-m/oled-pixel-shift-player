const startButton = document.getElementById("start");
const settingsForm = document.getElementById("settings");
const status = document.getElementById("status");

async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
}

startButton.addEventListener("click", async () => {
    const tabId = await getActiveTabId();
    if (!tabId) return;

    startButton.disabled = true;
    try {
        const response = await injectAndRun(tabId, OLED_ACTIONS.TOGGLE);
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