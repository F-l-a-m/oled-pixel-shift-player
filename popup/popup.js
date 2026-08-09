const startButton = document.getElementById("start");
const startLabel = document.getElementById("startLabel");

const COOLDOWN_MS = 1500;
const DEFAULT_LABEL = startLabel.textContent;

let cooldownActive = false;

startButton.addEventListener("click", async () => {
    if (cooldownActive) {
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
            action: "start"
        });
    }
    catch (error) {
        // Most commonly: no content script on this page (chrome://,
        // the Chrome Web Store, a page open before install/update, etc).
        // Don't show a cooldown for a start that never actually happened.
        console.error("[OLED] Failed to reach the page:", error);
        startLabel.textContent = "Couldn't reach the page";

        setTimeout(() => {
            startLabel.textContent = DEFAULT_LABEL;
        }, COOLDOWN_MS);

        return;
    }

    beginCooldown();
});

function beginCooldown() {
    cooldownActive = true;

    startButton.disabled = true;
    startButton.classList.add("cooldown");
    startButton.style.setProperty(
        "--cooldown-duration",
        `${COOLDOWN_MS}ms`
    );

    startLabel.textContent = "Please wait\u2026";

    setTimeout(() => {
        cooldownActive = false;

        startButton.disabled = false;
        startButton.classList.remove("cooldown");

        startLabel.textContent = DEFAULT_LABEL;
    }, COOLDOWN_MS);
}