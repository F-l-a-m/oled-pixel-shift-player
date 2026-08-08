const DEFAULTS = {
    scaleMin: 0.63,
    scaleMax: 0.70,

    // Percent of the viewport we always keep clear at the screen edges,
    // no matter the scale/offset at any given moment (see content.css
    // header comment for the math). This is what makes the drift safe
    // on any screen size or aspect ratio without per-screen tuning.
    safetyMarginPct: 3,

    durationXs: 53,
    durationYs: 71,
    durationScaleS: 97,

    introDurationMs: 2500,
    introDelayMs: 500,

    fullscreenDelayMs: 4000
};

const state = {
    video: null,
    running: false,
    starting: false,
    cancelStart: false,
    introTimerId: null,
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

// Maximum safe drift amplitude, as a percent of the viewport, given the
// worst case: scale at its largest (least shrink) and offset at its
// maximum simultaneously. Guarantees the video element's box — and
// therefore whatever picture is letterboxed inside it — never comes
// closer than settings.safetyMarginPct to the screen edge.
function computeMaxShiftPct(settings) {
    const naturalHalfMarginPct = (1 - settings.scaleMax) * 50;

    return Math.max(0, naturalHalfMarginPct - settings.safetyMarginPct);
}

function applySettingsToVideo(video, settings) {
    const maxShiftPct = computeMaxShiftPct(settings);

    video.style.setProperty("--oled-shift-x", `${maxShiftPct}vw`);
    video.style.setProperty("--oled-shift-y", `${maxShiftPct}vh`);
    video.style.setProperty("--oled-scale-min", settings.scaleMin);
    video.style.setProperty("--oled-scale-max", settings.scaleMax);
    video.style.setProperty("--oled-duration-x", `${settings.durationXs}s`);
    video.style.setProperty("--oled-duration-y", `${settings.durationYs}s`);
    video.style.setProperty("--oled-duration-scale", `${settings.durationScaleS}s`);
    video.style.setProperty("--oled-intro-duration", `${settings.introDurationMs}ms`);
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
    // Unconditionally clear anything a prior run might have left inline —
    // transition/transform/willChange/transformOrigin — regardless of
    // how that run ended. This is what makes every start() deterministic:
    // bindVideo() never trusts prior state, it enforces a clean slate.
    video.style.transition = "none";
    video.style.transform = "";
    video.style.transformOrigin = "";
    video.style.willChange = "";
    video.style.removeProperty("--oled-x");
    video.style.removeProperty("--oled-y");
    video.style.removeProperty("--oled-scale");

    // Force a reflow so the "none" transition above is committed before
    // .oled-intro's transition rule gets armed right after this call —
    // otherwise the browser could coalesce this reset with the very
    // first property change and skip animating it.
    void video.offsetWidth;
}

function bindVideo(video) {
    resetVideoStyles(video);

    applySettingsToVideo(video, state.settings);
    attachVideoListeners(video);

    video.classList.add("oled-base");
    video.classList.toggle("oled-tab-hidden", document.hidden);
    video.classList.toggle("oled-video-paused", video.paused || video.ended);

    // Start from the video's normal framing (identity transform), still
    // under transition:none from the reset above so this jump is instant
    // and overwrites any leftover values from a prior run.
    video.style.setProperty("--oled-x", "0");
    video.style.setProperty("--oled-y", "0");
    video.style.setProperty("--oled-scale", "1");

    // Release the inline transition:none now that the instant jump above
    // is committed, so .oled-intro's CSS transition rule (added next) is
    // free to actually apply instead of being masked by it.
    video.style.transition = "";

    video.classList.add("oled-intro");

    state.introTimerId = setTimeout(function() {
        state.introTimerId = null;

        if (!state.video || state.video !== video) {
            return;
        }

        // Force a reflow so the transition armed above is guaranteed to
        // pick up this change as an animated step, rather than being
        // coalesced with the identity values set when we bound the video.
        void video.offsetWidth;

        // Ease toward the drift path's starting point. Once this
        // transition finishes, swap in .oled-drift: the custom
        // properties are already at the keyframe-0% values, so the
        // animation picks up seamlessly with no visible jump.
        video.style.setProperty("--oled-x", "-1");
        video.style.setProperty("--oled-y", "1");
        video.style.setProperty("--oled-scale", String(state.settings.scaleMin));

        state.introTimerId = setTimeout(function() {
            state.introTimerId = null;

            if (!state.video || state.video !== video) {
                return;
            }

            video.classList.remove("oled-intro");
            video.classList.add("oled-drift");
        }, state.settings.introDurationMs);
    }, state.settings.introDelayMs);
}

function unbindVideo(video) {
    if (state.introTimerId !== null) {
        clearTimeout(state.introTimerId);
        state.introTimerId = null;
    }

    detachVideoListeners(video);

    video.classList.remove(
        "oled-base",
        "oled-drift",
        "oled-intro",
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

        state.settings = await loadSettings();

        if (!document.fullscreenElement) {
            await requestFullscreenWithRetry();
        }

        if (state.cancelStart) {
            console.log("[OLED] Start cancelled");
            return;
        }

        await sleep(state.settings.fullscreenDelayMs);

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

        bindVideo(state.video);

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

        // unbindVideo() also cancels any pending intro timer.
        unbindVideo(video);

        // Instantly and fully restore the video — no transition, no
        // delayed cleanup. Exiting fullscreen already changes the
        // video's on-screen size/position abruptly on its own (the
        // browser handles that), so easing our own transform back over
        // that same moment only adds jank. This also means there's no
        // leftover timer/state of any kind for the next start() to
        // trip over — every start is guaranteed a genuinely clean slate.
        video.style.transition = "";
        video.style.transform = state.originalTransform;
        video.style.transformOrigin = state.originalTransformOrigin;
        video.style.willChange = "";

        video.style.removeProperty("--oled-x");
        video.style.removeProperty("--oled-y");
        video.style.removeProperty("--oled-scale");
    }

    state.running = false;
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