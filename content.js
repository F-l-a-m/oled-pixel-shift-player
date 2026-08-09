const DEFAULTS = {
    scaleMin: 0.63,
    scaleMax: 0.70,

    // Percent of the viewport we always keep clear at the screen edges,
    // no matter the scale/offset at any given moment. The max drift
    // amplitude is derived from this and scaleMax entirely in CSS
    // (see content.css) — this is what makes the drift safe on any
    // screen size or aspect ratio without per-screen tuning.
    safetyMarginPct: 3,

    durationXs: 53,
    durationYs: 71,
    durationScaleS: 97
};

const state = {
    video: null,
    running: false,
    starting: false,
    cancelStart: false,
    settings: { ...DEFAULTS },
    originalTransform: "",
    originalTransformOrigin: "",
    videoObserver: null
};

function findVideo() {
    const video = document.querySelector("video");

    if (!video) {
        throw new Error("No HTML5 video found.");
    }

    if (video === state.video) {
        return;
    }

    if (state.video) {
        unbindVideo(state.video);
    }

    state.video = video;
    state.originalTransform = video.style.transform;
    state.originalTransformOrigin = video.style.transformOrigin;

    // If we're already running (e.g. the site swapped the <video> element
    // under us), immediately re-attach the drift effect to the new one.
    if (state.running) {
        bindVideo(video);
    }
}

async function loadSettings() {
    const saved = await chrome.storage.local.get("settings");

    return {
        ...DEFAULTS,
        ...saved.settings
    };
}

function applySettingsToVideo(video, settings) {
    video.style.setProperty("--oled-safety-margin", settings.safetyMarginPct / 100);
    video.style.setProperty("--oled-scale-min", settings.scaleMin);
    video.style.setProperty("--oled-scale-max", settings.scaleMax);
    video.style.setProperty("--oled-duration-x", `${settings.durationXs}s`);
    video.style.setProperty("--oled-duration-y", `${settings.durationYs}s`);
    video.style.setProperty("--oled-duration-scale", `${settings.durationScaleS}s`);
}

function onVideoPause() {
    if (state.video) {
        state.video.classList.add("oled-video-paused");
    }
}

function onVideoPlay() {
    if (state.video) {
        state.video.classList.remove("oled-video-paused");
    }
}

function attachVideoListeners(video) {
    video.addEventListener("pause", onVideoPause);
    video.addEventListener("ended", onVideoPause);
    video.addEventListener("play", onVideoPlay);
    video.addEventListener("playing", onVideoPlay);
}

function detachVideoListeners(video) {
    video.removeEventListener("pause", onVideoPause);
    video.removeEventListener("ended", onVideoPause);
    video.removeEventListener("play", onVideoPlay);
    video.removeEventListener("playing", onVideoPlay);
}

function resetVideoStyles(video) {
    // Unconditionally clear anything a prior run might have left inline,
    // regardless of how that run ended, so every bind starts from an
    // identical clean slate. (--oled-x/-y/-scale don't need clearing
    // here: the drift animations are the only thing that ever touches
    // them, and they override from their own 0% keyframe the instant
    // .oled-drift is added, regardless of any leftover value.)
    video.style.transform = "";
    video.style.transformOrigin = "";
    video.style.willChange = "";
}

function bindVideo(video) {
    resetVideoStyles(video);

    applySettingsToVideo(video, state.settings);
    attachVideoListeners(video);

    video.classList.add("oled-base");
    video.classList.toggle("oled-tab-hidden", document.hidden);
    video.classList.toggle("oled-video-paused", video.paused || video.ended);

    // The infinite drift starts immediately (see content.css) — no JS
    // timer is involved.
    video.classList.add("oled-drift");
}

function unbindVideo(video) {
    detachVideoListeners(video);

    video.classList.remove(
        "oled-base",
        "oled-drift",
        "oled-video-paused",
        "oled-tab-hidden"
    );
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

function onVisibilityChange() {
    if (!state.video) {
        return;
    }

    state.video.classList.toggle("oled-tab-hidden", document.hidden);
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

async function requestFullscreenWithRetry() {
    const maxAttempts = 5;
    const retryDelayMs = 300;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (state.cancelStart) {
            return;
        }

        try {
            await document.documentElement.requestFullscreen({
                navigationUI: "hide"
            });

            return;
        }
        catch (error) {
            // Chrome briefly rejects requestFullscreen() right after
            // exiting fullscreen (anti-flicker/clickjacking cooldown).
            // Retry a few times before giving up.
            if (attempt === maxAttempts) {
                throw error;
            }

            await sleep(retryDelayMs);
        }
    }
}

async function start() {
    if (state.starting) {
        return;
    }

    if (state.running) {
        // A second "start" while already running is a restart request,
        // not a no-op — tear down cleanly first so the sequence below
        // runs exactly as it would on a genuine first launch.
        stop();
    }

    state.starting = true;
    state.cancelStart = false;

    try {
        findVideo();

        const video = state.video;
        const enteringFullscreen = !document.fullscreenElement;

        // Hide the video while Chrome does its own native fullscreen-
        // enter transition — that transition briefly renders the video
        // at its original size regardless of what CSS we apply, and
        // nothing in JS/CSS can shorten or skip it. Hiding it means the
        // first frame the viewer actually sees is already the shrunk,
        // drifting state, whatever the native transition's timing is.
        if (enteringFullscreen) {
            video.style.visibility = "hidden";
        }

        try {
            state.settings = await loadSettings();

            if (enteringFullscreen) {
                await requestFullscreenWithRetry();
            }

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

            bindVideo(video);

            console.log("[OLED] Started");
        }
        finally {
            if (enteringFullscreen) {
                video.style.visibility = "";
            }
        }
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

    document.removeEventListener(
        "fullscreenchange",
        onFullscreenChange
    );

    document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
    );

    disconnectVideoObserver();

    if (state.video) {
        const video = state.video;

        unbindVideo(video);

        // Instantly and fully restore the video — no transition, no
        // delayed cleanup. Exiting fullscreen already changes the
        // video's on-screen size/position abruptly on its own, so
        // easing our own transform back over that same moment only
        // adds jank. (--oled-x/-y/-scale don't need clearing here:
        // unbindVideo() already removed the classes that read them, so
        // they have no effect until the next bind, which starts fresh
        // animations that override them immediately regardless.)
        video.style.transform = state.originalTransform;
        video.style.transformOrigin = state.originalTransformOrigin;
        video.style.willChange = "";
    }

    state.running = false;
}

async function startSafely() {
    try {
        await start();
    }
    catch (error) {
        console.error(error);
        alert(error.message);
    }
}

async function onRuntimeMessage(message) {
    if (message.action === "toggle") {
        if (state.running || state.starting) {
            stop();
        }
        else {
            await startSafely();
        }

        return;
    }

    if (message.action === "stop") {
        stop();
        return;
    }

    if (message.action === "start") {
        await startSafely();
    }
}

chrome.runtime.onMessage.addListener(
    onRuntimeMessage
);

window.OLED = {
    start,
    stop
};