const DEFAULTS = {
    scaleMin: 0.74,
    scaleMax: 0.82,

    shiftFactor: 0.80,

    durationMinMs: 500,
    durationMaxMs: 2000,

    pauseMinMs: 500,
    pauseMaxMs: 2000,

    easings: [
        "linear",
        "ease",
        "ease-in",
        "ease-out",
        "ease-in-out"
    ],

    fullscreenDelayMs: 300
};

const state = {
    video: null,
    running: false,
    timerId: null,
    lastTransform: null,
    settings: DEFAULTS
};

function findVideo() {
    state.video = document.querySelector("video");

    if (!state.video) {
        throw new Error("No HTML5 video found.");
    }
}

function randomInt(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function randomItem(items) {
    return items[
        randomInt(0, items.length - 1)
    ];
}

async function loadSettings() {
    const saved = await chrome.storage.local.get("settings");

    return {
        ...DEFAULTS,
        ...saved.settings
    };
}

function createRandomTransform() {
    while (true) {
        const scale = randomFloat(
            state.settings.scaleMin,
            state.settings.scaleMax
        );

        const maxX = Math.round(
            window.innerWidth *
            (1 - scale) / 2 *
            state.settings.shiftFactor
        );

        const maxY = Math.round(
            window.innerHeight *
            (1 - scale) / 2 *
            state.settings.shiftFactor
        );

        const transform = {
            scale,
            x: randomInt(-maxX, maxX),
            y: randomInt(-maxY, maxY),

            durationMs: randomInt(
                state.settings.durationMinMs,
                state.settings.durationMaxMs
            ),

            easing: randomItem(
                state.settings.easings
            ),

            pauseMs: randomInt(
                state.settings.pauseMinMs,
                state.settings.pauseMaxMs
            )
        };

        if (!state.lastTransform) {
            state.lastTransform = transform;
            return transform;
        }

        const distance = Math.hypot(
            transform.x - state.lastTransform.x,
            transform.y - state.lastTransform.y
        );

        if (
            distance > 100 ||
            Math.abs(
                transform.scale -
                state.lastTransform.scale
            ) > 0.03
        ) {
            state.lastTransform = transform;
            return transform;
        }
    }
}

function applyTransform(transform) {
    state.video.style.transition =
        `transform ${transform.durationMs}ms ${transform.easing}`;

    state.video.style.transformOrigin =
        "center center";

    state.video.style.transform =
        `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
}

function scheduleNextMove() {
    if (!state.running) {
        return;
    }

    if (state.video.paused || state.video.ended) {
        state.timerId = setTimeout(
            scheduleNextMove,
            1000
        );

        return;
    }

    const transform = createRandomTransform();

    applyTransform(transform);

    state.timerId = setTimeout(
        scheduleNextMove,
        transform.durationMs + transform.pauseMs
    );
}

function stopTimer() {
    if (state.timerId !== null) {
        clearTimeout(state.timerId);
        state.timerId = null;
    }
}

function sleep(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
}

function onFullscreenChange() {
    if (!document.fullscreenElement) {
        stop();
    }
}

async function start() {
    if (state.running) {
        return;
    }

    findVideo();

    state.settings = await loadSettings();

    if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({
            navigationUI: "hide"
        });
    }

    await sleep(
        state.settings.fullscreenDelayMs
    );

    document.addEventListener(
        "fullscreenchange",
        onFullscreenChange
    );

    state.running = true;

    scheduleNextMove();

    console.log("[OLED] Started");
}

function stop() {
    if (!state.running) {
        return;
    }

    stopTimer();

    document.removeEventListener(
        "fullscreenchange",
        onFullscreenChange
    );

    if (state.video) {
        state.video.style.transition =
            "transform 150ms ease";

        state.video.style.transform = "";

        setTimeout(function() {
            if (!state.video) {
                return;
            }

            state.video.style.transition = "";
            state.video.style.transformOrigin = "";
        }, 200);
    }

    state.running = false;
    state.lastTransform = null;
}

async function onRuntimeMessage(message) {
    if (message.action !== "start") {
        return;
    }

    try {
        await start();
    }
    catch (error) {
        console.error(error);
        alert(error.message);
    }
}

chrome.runtime.onMessage.addListener(
    onRuntimeMessage
);

window.OLED = {
    start,
    stop
};
