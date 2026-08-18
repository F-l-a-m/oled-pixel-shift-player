// Shared message names, default settings, settings validation and the
// injection helper for the popup, service worker and injected content
// script. Single source of truth so the three contexts can't drift apart.

globalThis.OLED_ACTIONS = Object.freeze({
    REQUEST: "oled-request",
    START: "start",
    STOP: "stop",
    TOGGLE: "toggle"
});

globalThis.OLED_DEFAULTS = Object.freeze({
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
});

// Clamps arbitrary/untrusted settings (from chrome.storage, or a settings
// form) into safe ranges. Used by content.js when reading settings and by
// popup.js when displaying/saving them, so the UI never shows a value that
// differs from what actually gets applied.
globalThis.clampOledSettings = function clampOledSettings(rawSettings) {
    const settings = { ...OLED_DEFAULTS, ...rawSettings };

    const inRange = (value, fallback, min, max) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    };

    settings.scaleMin = inRange(settings.scaleMin, OLED_DEFAULTS.scaleMin, 0.1, 1);
    settings.scaleMax = Math.max(settings.scaleMin, inRange(settings.scaleMax, OLED_DEFAULTS.scaleMax, 0.1, 1));
    settings.safetyMarginPct = inRange(settings.safetyMarginPct, OLED_DEFAULTS.safetyMarginPct, 0, 20);

    for (const key of ["durationXs", "durationYs", "durationScaleS"]) {
        settings[key] = inRange(settings[key], OLED_DEFAULTS[key], 1, 3600);
    }

    return settings;
};

// Requests fullscreen on the tab if it isn't already, doing nothing
// otherwise (a cheap stand-in for "is this a start or a stop"). Exposed
// standalone — not just inlined into injectAndRun — because it needs to
// be callable directly from the popup's own click handler, as close to
// the actual user gesture as possible: chrome.commands (the keyboard
// shortcut) carries Chrome's gesture recognition through to the
// background script automatically when injectAndRun runs there, but a
// chrome.runtime.sendMessage relay from the popup does not carry that
// same recognition. Calling this here, before anything is relayed,
// keeps the fullscreen request itself in the most gesture-adjacent
// context available for each entry point.
globalThis.requestFullscreenIfNeeded = function requestFullscreenIfNeeded(tabId) {
    return chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            if (!document.fullscreenElement) {
                return document.documentElement
                    .requestFullscreen({ navigationUI: "hide" })
                    .catch(() => {});
            }
        }
    });
};

// Ensures content.css/content.js are present on the tab and delivers the
// given action. Idempotent — content.js's own version guard absorbs
// repeat injection, and the CSS layer is replaced (not stacked) on every
// call. Shared by the background script's command handler and its popup
// relay so the two entry points can't quietly diverge.
globalThis.injectAndRun = async function injectAndRun(tabId, action) {
    // Request fullscreen as the very first thing we do, before any other
    // async work. Chrome's transient user activation (required by the
    // Fullscreen API) lasts only a few seconds after a click/keypress and
    // can be consumed by other API calls along the way — removeCSS,
    // insertCSS, loading content.js and a message round-trip are all
    // async hops that eat into that budget before content.js would
    // otherwise get a chance to request it itself, especially on a heavy
    // page.
    try {
        await requestFullscreenIfNeeded(tabId);
    }
    catch (error) {
        // Ignore — content.js's own requestFullscreenWithRetry() is a
        // fallback for exactly this case, just with worse odds since it
        // runs further from the original gesture.
    }

    // Replacing the extension stylesheet keeps repeated toggles from
    // accumulating identical CSS layers in the tab.
    try {
        await chrome.scripting.removeCSS({ target: { tabId }, files: ["content.css"] });
    }
    catch (error) {
        // The first run has nothing to remove.
    }

    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ["shared.js", "content.js"]
    });

    return chrome.tabs.sendMessage(tabId, { action });
};