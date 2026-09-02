// Constants and pure logic shared across every extension context —
// including the injected content script's isolated world, which has no
// access to that scripting API or any other privileged API. Nothing in
// this file may depend on such an API; see shared-background.js for the
// pieces that do (background script and popup only, never injected into
// a page).

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

globalThis.OLED_PHASE = Object.freeze({
    IDLE: "IDLE",
    STARTING: "STARTING",
    RUNNING: "RUNNING"
});

// Pure reducer for content.js's start/stop state machine: given the
// current phase and an event, returns the next phase, or null if that
// event has no effect in the current phase (e.g. STOP while already
// IDLE). No side effects and no closure over any mutable state — unlike
// content.js's old inline version, which mutated a captured `state.phase`
// directly, making it untestable in isolation from the DOM/chrome APIs
// the rest of content.js depends on. content.js applies the result to
// its own state itself; see its transition() wrapper.
globalThis.nextOledPhase = function nextOledPhase(currentPhase, event) {
    const transitions = {
        START: { [OLED_PHASE.IDLE]: OLED_PHASE.STARTING },
        READY: { [OLED_PHASE.STARTING]: OLED_PHASE.RUNNING },
        // Only fires if start() exits while still STARTING (cancelled or
        // failed before reaching RUNNING). Calling this after a
        // successful start (phase already RUNNING) is a deliberate
        // no-op: RUNNING isn't a key here, so this returns null and the
        // phase is left untouched.
        FINISH: { [OLED_PHASE.STARTING]: OLED_PHASE.IDLE },
        STOP: { [OLED_PHASE.STARTING]: OLED_PHASE.IDLE, [OLED_PHASE.RUNNING]: OLED_PHASE.IDLE }
    };

    return transitions[event]?.[currentPhase] ?? null;
};
