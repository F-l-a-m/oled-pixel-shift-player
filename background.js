importScripts("shared.js");

chrome.runtime.onInstalled.addListener(() => {
    console.log("OLED Pixel Shift Player installed");
});

async function showError(tabId, error) {
    console.error("[OLED] Failed to reach the page:", error);
    await chrome.action.setBadgeText({ tabId, text: "!" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#c62828" });
}

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-oled") return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
        await injectAndRun(tab.id, OLED_ACTIONS.TOGGLE);
        await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    }
    catch (error) {
        await showError(tab.id, error);
    }
});