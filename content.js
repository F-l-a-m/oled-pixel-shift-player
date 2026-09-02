initializeOLED();

function initializeOLED() {
    const CONTENT_VERSION = chrome.runtime.getManifest().version;

    if (window.OLED?.version === CONTENT_VERSION) {
        return;
    }

    window.OLED?.dispose?.();

    const state = {
        video: null,
        phase: OLED_PHASE.IDLE,
        startCancelled: false,
        settings: { ...OLED_DEFAULTS },
        originalTransform: "",
        originalTransformOrigin: "",
        videoObserver: null,
        videoObserverTimer: null,
        videoObserverRoot: null
    };

    // The transition table itself lives in shared-constants.js as a pure,
    // unit-testable reducer (nextOledPhase); this just applies its result
    // to our own mutable state.
    function transition(event) {
        const next = nextOledPhase(state.phase, event);
        if (!next) return false;
        state.phase = next;
        return true;
    }

    // Marks an error as an expected, self-recoverable condition (the user
    // can just try again) rather than a genuine extension bug. startSafely()
    // uses this to decide whether to log it — logging it at any console
    // level still shows up in chrome://extensions' Errors page, which
    // should stay reserved for things that are actually broken.
    function expected(error) {
        error.expected = true;
        return error;
    }

    async function findVideo() {
        let video = document.querySelector("video");

        if (!video) {
            // Right after entering fullscreen, some sites (YouTube in
            // particular) briefly restructure their player DOM in
            // reaction to the fullscreenchange event — which can make
            // the video element momentarily unavailable exactly when
            // this runs, especially the closer this call is to the
            // fullscreen request itself. Give it a short chance to
            // reappear before giving up. Total worst case: ~800ms.
            const maxAttempts = 5;
            const retryDelayMs = 200;

            for (let attempt = 1; attempt < maxAttempts && !video; attempt++) {
                await sleep(retryDelayMs);
                video = document.querySelector("video");
            }
        }

        if (!video) {
            throw expected(new Error("No HTML5 video found."));
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

        // If we're already running (e.g. the site swapped the <video>
        // element under us), immediately re-attach the drift effect to the
        // new one, and re-scope the observer to its (possibly different)
        // parent so future swaps keep being detected.
        if (state.phase === OLED_PHASE.RUNNING) {
            bindVideo(video);
            attachVideoObserver();
        }
    }

    async function loadSettings() {
        const saved = await chrome.storage.local.get("settings");
        return clampOledSettings(saved.settings || {});
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
            if (state.videoObserverTimer) {
                return;
            }

            // A busy live chat can mutate the page thousands of times.  One
            // detached-video check per quarter second is enough for replacement.
            state.videoObserverTimer = setTimeout(function() {
                state.videoObserverTimer = null;
                if (state.video && document.contains(state.video)) {
                    return;
                }

                findVideo().catch(function(error) {
                    console.warn("[OLED] Video element lost, stopping.", error);
                    stop();
                });
            }, 250);
        });

        state.videoObserverRoot = state.video?.parentElement || document.body;
        state.videoObserver.observe(state.videoObserverRoot, {
            childList: true,
            subtree: true
        });
    }

    function disconnectVideoObserver() {
        if (state.videoObserver) {
            state.videoObserver.disconnect();
            state.videoObserver = null;
            state.videoObserverRoot = null;
        }

        if (state.videoObserverTimer) {
            clearTimeout(state.videoObserverTimer);
            state.videoObserverTimer = null;
        }
    }

    function sleep(ms) {
        return new Promise(function(resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function requestFullscreenWithRetry() {
        // Exactly one retry, with a deliberate pause — not the old
        // aggressive 5-attempt/300ms loop we removed in 0.2.3. That
        // change assumed any retry just burns further into the scarce
        // transient-activation budget with no upside; in practice, real
        // use (exiting fullscreen via Escape, then toggling back on
        // shortly after) hits Chrome's brief anti-flicker cooldown on
        // fullscreen re-entry often enough that a single wait-and-retry
        // is worth it. The exact delay is a best-effort guess — Chrome
        // doesn't document this cooldown's length — and may need tuning.
        const retryDelayMs = 800;

        try {
            await document.documentElement.requestFullscreen({
                navigationUI: "hide"
            });
            return;
        }
        catch (error) {
            if (state.startCancelled) {
                return;
            }

            await sleep(retryDelayMs);

            if (state.startCancelled) {
                return;
            }
        }

        try {
            await document.documentElement.requestFullscreen({
                navigationUI: "hide"
            });
        }
        catch (error) {
            throw expected(new Error("Couldn't enter fullscreen — wait a moment and try again."));
        }
    }

    async function start() {
        if (state.phase === OLED_PHASE.STARTING) {
            return;
        }

        if (state.phase === OLED_PHASE.RUNNING) {
            // A second "start" while already running is a restart request,
            // not a no-op — tear down cleanly first so the sequence below
            // runs exactly as it would on a genuine first launch.
            stop();
        }

        transition("START");
        state.startCancelled = false;

        try {
            await findVideo();

            const video = state.video;
            const enteringFullscreen = !document.fullscreenElement;

            // Hide the video unconditionally — not just when this call is
            // the one requesting fullscreen. shared.js's injectAndRun()
            // already requests fullscreen as early as possible (right
            // after the user gesture, before content.js even loads) to
            // avoid losing transient activation, so by the time we get
            // here document.fullscreenElement is very often already true
            // and enteringFullscreen is false — but Chrome's native
            // fullscreen-enter transition can still be visually playing
            // out. Hiding regardless of who requested fullscreen means
            // the first frame the viewer actually sees is always the
            // shrunk, drifting state.
            video.style.visibility = "hidden";

            try {
                if (enteringFullscreen) {
                    await requestFullscreenWithRetry();
                }

                state.settings = await loadSettings();

                if (state.startCancelled || !document.fullscreenElement) {
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

                transition("READY");

                bindVideo(video);

                console.log("[OLED] Started");
            }
            finally {
                video.style.visibility = "";
            }
        }
        finally {
            transition("FINISH");
            state.startCancelled = false;
        }
    }

    function stop() {
        if (state.phase === OLED_PHASE.STARTING) {
            // Cancel the pending start; start() will notice this
            // once its delay finishes and bail out without activating.
            state.startCancelled = true;
        }

        if (state.phase !== OLED_PHASE.RUNNING) {
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

        transition("STOP");
    }

    async function startSafely() {
        try {
            await start();
            return { ok: true };
        }
        catch (error) {
            // No blocking dialog here: this response is delivered back to
            // whoever sent the message (popup or the command handler),
            // and they already surface {ok:false, error} to the user. A
            // blocking dialog in the page would also freeze the sender's
            // await on sendMessage until someone dismissed it.
            //
            // Only log genuinely unexpected errors. chrome://extensions'
            // Errors page captures console.warn just as much as
            // console.error — severity alone doesn't keep an expected,
            // self-recoverable condition (no video found, couldn't enter
            // fullscreen) out of it, so those are skipped entirely rather
            // than merely downgraded. That page should stay reserved for
            // things that are actually broken.
            if (!error.expected) {
                console.warn(error);
            }
            return { ok: false, error: error.message, expected: Boolean(error.expected) };
        }
    }

    function onRuntimeMessage(message, sender, sendResponse) {
        let operation;

        if (message.action === OLED_ACTIONS.TOGGLE) {
            if (state.phase !== OLED_PHASE.IDLE) {
                stop();
                sendResponse({ ok: true, state: state.phase });
                return false;
            }
            operation = startSafely();
        }

        else if (message.action === OLED_ACTIONS.STOP) {
            stop();
            sendResponse({ ok: true, state: state.phase });
            return false;
        }
        else if (message.action === OLED_ACTIONS.START) {
            operation = startSafely();
        }

        else {
            sendResponse({ ok: false, error: "Unknown action" });
            return false;
        }

        operation.then(sendResponse).catch(function(error) {
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    }

    chrome.runtime.onMessage.addListener(
        onRuntimeMessage
    );

    window.OLED = {
        start,
        stop,
        version: CONTENT_VERSION,
        dispose() {
            stop();
            chrome.runtime.onMessage.removeListener(onRuntimeMessage);
            delete window.OLED;
        }
    };
}