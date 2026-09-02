# OLED Pixel Shift Player

A Chrome extension designed for OLED displays when playing videos in the background.

## Idea

OLED panels can suffer from burn-in when the same pixels display static content for a long time.

This extension is not designed for normal video watching.

The main idea is to use videos as background visuals (ambient videos, wallpapers, long playback sessions) while slowly shifting the video position and scale to reduce static pixel usage.

## How it works

During fullscreen playback the extension:

- immediately shrinks the video and starts drifting its position and zoom level, driven entirely by CSS animations — no intro/hold phase;
- combines three independently-timed cycles (position X, position Y, scale) whose periods are deliberately incommensurate, so the combined pattern doesn't visibly repeat for hours, without relying on randomness;
- keeps a configurable safety margin at the screen edges at all times — the maximum drift amplitude is derived from the zoom range and the margin, so the video never approaches the edge closer than that margin, on any screen size or aspect ratio;
- automatically pauses the drift while the video is paused/ended or the tab is hidden;
- instantly and fully restores the video to its original state when stopped (exiting fullscreen or toggling the extension again).
- injects its code only when you press the button or hotkey; pages are not
  accessed while you browse.

## Installation

The extension is currently in development.

1. Clone or download this repository.

2. Open Chrome:

chrome://extensions

3. Enable Developer mode.

4. Click Load unpacked.

5. Select the project folder.

After changing files, click the reload button for the extension and refresh the
video page.

## Usage

1. Open a website with HTML5 video.
2. Start fullscreen playback.
3. Open the extension popup and press **Start / stop OLED mode**, or use **Alt+Shift+O** (both toggle the effect — rebindable at `chrome://extensions/shortcuts`).
4. You can change scale, margins and timings in **Settings**. They apply next time you start the effect.
5. Leave the video running as a background visual.
6. Press the button/hotkey again (or exit fullscreen) to stop and restore the video.

## Current status

See `manifest.json` for the current version. Requires Chrome 88 or newer
(the extension uses the `chrome.scripting` API, which isn't available
before Chrome 88).

For a quick code check, run `node tests/verify-css-contract.js` from the
project folder.

Planned:

- Movement profiles
- Custom timing
- More OLED protection strategies
- Better support for different video platforms

## License

MIT