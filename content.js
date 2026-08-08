const DEFAULTS = {
    scaleMin: 0.63,
    scaleMax: 0.70,

    shiftFactor: 1.25,

    durationMinMs: 4000,
    durationMaxMs: 8000,

    pauseMinMs: 30000,
    pauseMaxMs: 60000,

    fullscreenDelayMinMs: 3000,
    fullscreenDelayMaxMs: 6000,

    easings: [
        "ease-in-out",
        "cubic-bezier(0.25, 0.1, 0.25, 1)",
        "cubic-bezier(0.4, 0, 0.2, 1)",
        "cubic-bezier(0.22, 1, 0.36, 1)"
    ]
};

const state = {
    video: null,
    running: false,
    starting: false,
    cancelStart: false,
    timerId: null,
    resetTimerId: null,
    lastTransform: null,
    settings: DEFAULTS,
    originalTransform: "",
    originalTransformOrigin: "",
    videoObserver: null
};

function findVideo() {
    const video = document.querySelector("video");

    if (!video) {
        throw new Error("No HTML5 video found.");
    }

    if (video !== state.video) {
        state.video = video;
        state.originalTransform = video.style.transform;
        state.originalTransformOrigin = video.style.transformOrigin;
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

function randomPosition(maxX, maxY) {
    const angle = Math.random() * Math.PI * 2;

    const radius = Math.pow(
        Math.random(),
        0.25
    );

    return {
        x: Math.round(
            Math.cos(angle) *
            maxX *
            radius
        ),

        y: Math.round(
            Math.sin(angle) *
            maxY *
            radius
        )
    };
}

async function loadSettings() {
    const saved = await chrome.storage.local.get("settings");

    return {
        ...DEFAULTS,
        ...saved.settings
    };
}

function createRandomTransform() {
    const maxAttempts = 30;
    let attempts = 0;

    while (true) {
        attempts++;

        const scale = randomFloat(
            state.settings.scaleMin,
            state.settings.scaleMax
        );

        const maxX = Math.round(
            window.innerWidth *
            (1 - scale) *
            0.55
        );

        const maxY = Math.round(
            window.innerHeight *
            (1 - scale) *
            0.55
        );

        const position = randomPosition(
            maxX,
            maxY
        );

        const transform = {
            scale,

            x: position.x,

            y: position.y,

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

        const scaleDifference = Math.abs(
            transform.scale -
            state.lastTransform.scale
        );

        if (
            distance > 500 ||
            scaleDifference > 0.05 ||
            attempts >= maxAttempts
        ) {
            state.lastTransform = transform;
            return transform;
        }
    }
}

function applyTransform(transform) {
    state.video.style.willChange = "transform";

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

function attachVideoObserver() {
    disconnectVideoObserver();

    state.videoObserver = new MutationObserver(function() {
        if (state.video && document.contains(state.video)) {
            return;
        }

        try {
            findVideo();
        }
        catch (error) {
            console.warn("[OLED] Video element lost, stopping.", error);
            stop();
        }
    });

    state.videoObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function disconnectVideoObserver() {
    if (state.videoObserver) {
        state.videoObserver.disconnect();
        state.videoObserver = null;
    }
}

function onVisibilityChange() {
    if (document.hidden) {
        stopTimer();
        return;
    }

    if (state.running) {
        scheduleNextMove();
    }
}

async function start() {
    if (state.running || state.starting) {
        return;
    }

    if (state.resetTimerId !== null) {
        clearTimeout(state.resetTimerId);
        state.resetTimerId = null;
    }

    state.starting = true;
    state.cancelStart = false;

    try {
        findVideo();

        state.settings = await loadSettings();

        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen({
                navigationUI: "hide"
            });
        }

        await sleep(
            randomInt(
                state.settings.fullscreenDelayMinMs,
                state.settings.fullscreenDelayMaxMs
            )
        );

        if (state.cancelStart || !document.fullscreenElement) {
            console.log("[OLED] Start cancelled");
            return;
        }

        document.addEventListener(
            "fullscreenchange",
            onFullscreenChange
        );

        document.addEventListener(
            "visibilitychange",
            onVisibilityChange
        );

        attachVideoObserver();

        state.running = true;

        scheduleNextMove();

        console.log("[OLED] Started");
    }
    finally {
        state.starting = false;
        state.cancelStart = false;
    }
}

function stop() {
    if (state.starting) {
        // Cancel the pending start; start() will notice this
        // once its delay finishes and bail out without activating.
        state.cancelStart = true;
    }

    if (!state.running) {
        return;
    }

    stopTimer();

    document.removeEventListener(
        "fullscreenchange",
        onFullscreenChange
    );

    document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
    );

    disconnectVideoObserver();

    if (state.resetTimerId !== null) {
        clearTimeout(state.resetTimerId);
        state.resetTimerId = null;
    }

    if (state.video) {
        state.video.style.transition =
            "transform 300ms ease";

        state.video.style.transform = state.originalTransform;

        state.resetTimerId = setTimeout(function() {
            state.resetTimerId = null;

            if (!state.video) {
                return;
            }

            state.video.style.transition = "";
            state.video.style.transformOrigin = state.originalTransformOrigin;
            state.video.style.willChange = "";
        }, 350);
    }

    state.running = false;
    state.lastTransform = null;
}

async function onRuntimeMessage(message) {
    if (message.action === "stop") {
        stop();
        return;
    }

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