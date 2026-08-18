// Lightweight regression check for the JS <-> CSS names.  It needs no test
// framework and can run with: node tests/verify-css-contract.js
const fs = require("fs");
const css = fs.readFileSync("content.css", "utf8");
const js = fs.readFileSync("content.js", "utf8");
const shared = fs.readFileSync("shared.js", "utf8");
const background = fs.readFileSync("background.js", "utf8");
const popup = fs.readFileSync("popup/popup.js", "utf8");

const names = [
    "oled-base", "oled-drift", "oled-video-paused", "oled-tab-hidden",
    "--oled-safety-margin", "--oled-scale-min", "--oled-scale-max",
    "--oled-duration-x", "--oled-duration-y", "--oled-duration-scale"
];

for (const name of names) {
    if (!css.includes(name) || !js.includes(name)) {
        throw new Error(`CSS contract is out of sync: ${name}`);
    }
}

console.log("CSS contract verified");

// Dynamic CSS injection must remove the previous layer first — that logic
// lives once in shared.js; background.js and popup.js must delegate to it
// rather than duplicating (and potentially diverging from) it.
if (!shared.includes("removeCSS") || !shared.includes("insertCSS")) {
    throw new Error("shared.js must remove the previous CSS layer before inserting a new one");
}

// Only background.js calls injectAndRun directly — its own context isn't
// tied to the popup's lifetime. popup.js must relay through it instead of
// calling injectAndRun itself: Chrome closes the popup automatically the
// instant the target tab enters fullscreen (which injectAndRun's very
// first step triggers), which would abort an in-flight call running in
// the popup's own short-lived context before content.js ever loaded.
if (!background.includes("injectAndRun")) {
    throw new Error("background.js must call shared.js's injectAndRun");
}

if (popup.includes("injectAndRun")) {
    throw new Error("popup.js must not call injectAndRun directly — the popup can close mid-flight (e.g. on fullscreen entry) and abort it. Relay through the background script instead.");
}

if (!popup.includes("OLED_ACTIONS.REQUEST") || !popup.includes("sendMessage")) {
    throw new Error("popup.js must relay the toggle to the background script via OLED_ACTIONS.REQUEST");
}

if (!background.includes("OLED_ACTIONS.REQUEST")) {
    throw new Error("background.js must handle OLED_ACTIONS.REQUEST from the popup");
}

// The fullscreen request itself must additionally be called directly in
// popup.js, not only via the relay: chrome.commands (the keyboard
// shortcut) carries Chrome's gesture recognition through to the
// background script automatically, but a chrome.runtime.sendMessage
// relay from the popup does not, so popup-triggered fullscreen requests
// need to happen in the popup's own click-handler context to have a
// realistic chance of succeeding.
if (!shared.includes("requestFullscreenIfNeeded")) {
    throw new Error("shared.js must define requestFullscreenIfNeeded so popup.js can call it directly");
}

if (!popup.includes("requestFullscreenIfNeeded")) {
    throw new Error("popup.js must call requestFullscreenIfNeeded directly in its click handler, not only via the background relay");
}

// Settings validation must also live once in shared.js and be used by both
// the runtime (content.js) and the settings form (popup.js), so the UI can
// never show a value that differs from what actually gets applied.
if (!shared.includes("clampOledSettings")) {
    throw new Error("shared.js must define clampOledSettings");
}

for (const source of [js, popup]) {
    if (!source.includes("clampOledSettings")) {
        throw new Error("content.js and popup.js must both use clampOledSettings");
    }
}

for (const marker of ["PHASE", "requestFullscreen", "return { ok: true", "MutationObserver"]) {
    if (!js.includes(marker)) {
        throw new Error(`Runtime contract is missing: ${marker}`);
    }
}

// A blocking alert() in the content script would freeze whoever is
// awaiting the sendMessage response (popup or the command handler) until
// a human dismisses a dialog they may not even see.
if (js.includes("alert(")) {
    throw new Error("content.js must not call alert() — surface errors via the {ok:false, error} response instead");
}

console.log("Runtime contract verified");