// Lightweight regression check for the JS <-> CSS names.  It needs no test
// framework and can run with: node tests/verify-css-contract.js
const fs = require("fs");
const css = fs.readFileSync("content.css", "utf8");
const js = fs.readFileSync("content.js", "utf8");
const sharedConstants = fs.readFileSync("shared-constants.js", "utf8");
const sharedBackground = fs.readFileSync("shared-background.js", "utf8");
const background = fs.readFileSync("background.js", "utf8");
const popup = fs.readFileSync("popup/popup.js", "utf8");
const popupHtml = fs.readFileSync("popup/popup.html", "utf8");

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

// shared.js was split into two files by privilege level: shared-constants.js
// (safe anywhere, including the content script's isolated world, which has
// no chrome.scripting access) and shared-background.js (requires
// chrome.scripting; background script and popup only). shared-constants.js
// must stay free of that dependency, or it would be unsafe to inject into
// a page.
if (sharedConstants.includes("chrome.scripting")) {
    throw new Error("shared-constants.js must not depend on chrome.scripting — it gets injected into the page's isolated world, which doesn't have it. That code belongs in shared-background.js.");
}

if (!background.includes('"shared-constants.js"') || !background.includes('"shared-background.js"')) {
    throw new Error("background.js must load both shared-constants.js and shared-background.js via importScripts");
}

if (!popupHtml.includes("shared-constants.js") || !popupHtml.includes("shared-background.js")) {
    throw new Error("popup.html must load both shared-constants.js and shared-background.js");
}

// injectAndRun() must only ever inject shared-constants.js alongside
// content.js — injecting shared-background.js into the page would be dead,
// guaranteed-to-fail code (no chrome.scripting there) and a confusing false
// suggestion of capability.
const contentInjectionIndex = sharedBackground.indexOf('files: ["shared-constants.js", "content.js"]');
if (contentInjectionIndex === -1) {
    throw new Error('injectAndRun() must inject shared-constants.js (not shared-background.js) alongside content.js, via files: ["shared-constants.js", "content.js"]');
}

// Dynamic CSS injection must remove the previous layer first — that logic
// lives once in shared-background.js; background.js and popup.js must
// delegate to it rather than duplicating (and potentially diverging from) it.
if (!sharedBackground.includes("removeCSS") || !sharedBackground.includes("insertCSS")) {
    throw new Error("shared-background.js must remove the previous CSS layer before inserting a new one");
}

// Only background.js calls injectAndRun directly — its own context isn't
// tied to the popup's lifetime. popup.js must relay through it instead of
// calling injectAndRun itself: Chrome closes the popup automatically the
// instant the target tab enters fullscreen (which injectAndRun's very
// first step triggers), which would abort an in-flight call running in
// the popup's own short-lived context before content.js ever loaded.
if (!background.includes("injectAndRun")) {
    throw new Error("background.js must call shared-background.js's injectAndRun");
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
if (!sharedBackground.includes("requestFullscreenIfNeeded")) {
    throw new Error("shared-background.js must define requestFullscreenIfNeeded so popup.js can call it directly");
}

if (!popup.includes("requestFullscreenIfNeeded")) {
    throw new Error("popup.js must call requestFullscreenIfNeeded directly in its click handler, not only via the background relay");
}

// Settings validation must also live once in shared-constants.js and be
// used by both the runtime (content.js) and the settings form (popup.js),
// so the UI can never show a value that differs from what actually gets
// applied.
if (!sharedConstants.includes("clampOledSettings")) {
    throw new Error("shared-constants.js must define clampOledSettings");
}

for (const source of [js, popup]) {
    if (!source.includes("clampOledSettings")) {
        throw new Error("content.js and popup.js must both use clampOledSettings");
    }
}

// The start/stop state machine's transition table is a pure reducer in
// shared-constants.js (nextOledPhase), not inlined in content.js, so it
// can be unit-tested without any DOM/chrome API mocking.
if (!sharedConstants.includes("nextOledPhase") || !sharedConstants.includes("OLED_PHASE")) {
    throw new Error("shared-constants.js must define OLED_PHASE and the nextOledPhase reducer");
}

if (!js.includes("nextOledPhase")) {
    throw new Error("content.js must use the shared nextOledPhase reducer instead of an inline transition table");
}

for (const marker of ["OLED_PHASE", "requestFullscreen", "return { ok: true", "MutationObserver"]) {
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

// CONTENT_VERSION drives content.js's own re-injection guard (see
// initializeOLED) — it needs to change whenever the extension updates, or
// a stale instance can silently keep running on an already-open tab.
// Reading it from chrome.runtime.getManifest() (available to content
// scripts without any extra permission) makes manifest.json the single
// source of truth instead of a second, hand-maintained copy that can
// drift out of sync — which is exactly what happened before this check
// existed.
if (!js.includes("chrome.runtime.getManifest().version")) {
    throw new Error("content.js's CONTENT_VERSION must be read from chrome.runtime.getManifest().version, not hardcoded — manifest.json is the single source of truth for the version");
}

console.log("Version sourcing verified");

// manifest.json must actually declare icons now that the project has
// some, or Chrome silently falls back to a generic placeholder.
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

if (!manifest.icons || !manifest.action?.default_icon) {
    throw new Error("manifest.json must declare both top-level icons and action.default_icon");
}

console.log("Manifest verified");
