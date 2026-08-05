document.getElementById("start").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!tab?.id) {
        return;
    }

    await chrome.tabs.sendMessage(tab.id, {
        action: "start"
    });

    window.close();
});
