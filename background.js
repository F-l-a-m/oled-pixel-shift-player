chrome.runtime.onInstalled.addListener(() => {
    console.log("OLED Pixel Shift Player installed");
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-oled") {
        return;
    }

    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!tab?.id) {
        return;
    }

    try {
        await chrome.tabs.sendMessage(tab.id, {
            action: "toggle"
        });
    }
    catch (error) {
        // Most commonly: no content script on this page (chrome://,
        // the Chrome Web Store, a page open before install/update, etc).
        console.error("[OLED] Failed to reach the page:", error);
    }
});