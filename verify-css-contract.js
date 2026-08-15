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

for (const source of [background, popup]) {
    if (!source.includes("injectAndRun")) {
        throw new Error("background.js and popup.js must delegate injection to shared.js's injectAndRun");
    }
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
