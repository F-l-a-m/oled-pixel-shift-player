// Lightweight regression check for the JS <-> CSS names.  It needs no test
// framework and can run with: node tests/verify-css-contract.js
const fs = require("fs");
const css = fs.readFileSync("content.css", "utf8");
const js = fs.readFileSync("content.js", "utf8");
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

for (const source of [background, popup]) {
    if (!source.includes("removeCSS") || !source.includes("insertCSS")) {
        throw new Error("Dynamic CSS injection must remove the previous layer first");
    }
}

for (const marker of ["PHASE", "requestFullscreen", "return { ok: true", "MutationObserver"]) {
    if (!js.includes(marker)) {
        throw new Error(`Runtime contract is missing: ${marker}`);
    }
}

console.log("Runtime contract verified");
