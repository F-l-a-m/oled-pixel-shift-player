// Helpers that require chrome.scripting — usable only from the
// background service worker and the popup, both of which have that API.
// Never load this in the injected content script: it runs in the page's
// isolated world, which has no access to chrome.scripting at all, so
// anything defined here would just be dead code that fails if called.
// See shared-constants.js for what's safe to load everywhere, including
// the content script.

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
        // Only shared-constants.js — never shared-background.js, which
        // would be dead weight (and a confusing false suggestion of
        // capability) in the page's isolated world.
        files: ["shared-constants.js", "content.js"]
    });

    return chrome.tabs.sendMessage(tabId, { action });
};
