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

    try {
        await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["shared.js", "content.js"]
        });
        await chrome.tabs.sendMessage(tabId, { action: OLED_ACTIONS.TOGGLE });
        status.textContent = "Done";
    }
    catch (error) {
        console.error("[OLED] Failed to contact the extension:", error);
        status.textContent = "Couldn't run on this page";
    }
});

async function loadSettings() {
    const { settings = {} } = await chrome.storage.local.get("settings");
    for (const [key, value] of Object.entries(settings)) {
        const field = settingsForm.elements.namedItem(key);
        if (field) field.value = value;
    }
}

settingsForm.addEventListener("change", async () => {
    const settings = Object.fromEntries(new FormData(settingsForm).entries());
    for (const key of Object.keys(settings)) settings[key] = Number(settings[key]);
    if (settings.scaleMin > settings.scaleMax) {
        status.textContent = "Minimum scale cannot be larger than maximum scale";
        return;
    }
    await chrome.storage.local.set({ settings });
    status.textContent = "Settings saved";
});

loadSettings();
