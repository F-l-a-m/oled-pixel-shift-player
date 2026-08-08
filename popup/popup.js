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

    await chrome.tabs.sendMessage(tab.id, {
        action: "start"
    });

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

    startLabel.textContent = "Подождите\u2026";

    setTimeout(() => {
        cooldownActive = false;

        startButton.disabled = false;
        startButton.classList.remove("cooldown");

        startLabel.textContent = DEFAULT_LABEL;
    }, COOLDOWN_MS);
}