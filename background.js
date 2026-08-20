importScripts("shared.js");

chrome.runtime.onInstalled.addListener(() => {
    console.log("OLED Pixel Shift Player installed");
});

async function showError(tabId, error) {
    console.error("[OLED] Failed to reach the page:", error);
    await chrome.action.setBadgeText({ tabId, text: "!" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#c62828" });
}

async function toggleActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
        return { ok: false, error: "No active tab" };
    }

    let response;
    try {
        response = await injectAndRun(tab.id, OLED_ACTIONS.TOGGLE);
    }
    catch (error) {
        response = { ok: false, error: error.message };
    }

    // The hotkey has no feedback channel besides this badge (unlike the
    // popup, which also has its own #status text) — a returned
    // {ok:false} (e.g. no video found, couldn't enter fullscreen) needs
    // to show up here just as much as a thrown exception does, or a
    // hotkey press that "does nothing" is indistinguishable from one
    // that quietly failed.
    if (response?.ok) {
        await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    }
    else {
        await showError(tab.id, new Error(response?.error || "Unknown error"));
    }

    return response;
}

// Guards against overlapping command invocations. Pressing the hotkey
// again while a previous press is still mid-flight would fire a second,
// concurrent toggleActiveTab() — both racing to use the same scarce
// transient user activation window for requestFullscreen(), which tends
// to make one or both fail with "API can only be initiated by a user
// gesture."
let handlingCommand = false;

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-oled") return;
    if (handlingCommand) return;

    handlingCommand = true;
    try {
        await toggleActiveTab();
    }
    finally {
        handlingCommand = false;
    }
});

// Popup relay: the popup's own JS context is torn down the instant the
// popup closes, and Chrome closes popups automatically whenever they lose
// focus — notably, the moment the target tab enters fullscreen, which
// injectAndRun() itself triggers as its very first step. If popup.js ran
// injectAndRun() directly, the popup closing (as a *result* of its own
// call entering fullscreen) would abort that same call partway through,
// before content.js ever loaded — fullscreen would open but the effect
// would silently never start. Routing the work through this persistent
// background context instead means it completes regardless of whether
// the popup is still around by the time it finishes; sendResponse simply
// becomes a no-op if the popup's message port is already gone.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== OLED_ACTIONS.REQUEST) {
        return false;
    }

    toggleActiveTab().then(sendResponse);
    return true;
});