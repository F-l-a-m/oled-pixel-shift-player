# OLED Pixel Shift Player

A Chrome extension designed for OLED displays when playing videos in the background.

## Idea

OLED panels can suffer from burn-in when the same pixels display static content for a long time.

This extension is not designed for normal video watching.

The main idea is to use videos as background visuals (ambient videos, wallpapers, long playback sessions) while slowly shifting the video position and scale to reduce static pixel usage.

## How it works

During fullscreen playback the extension:

- continuously drifts the video's position and zoom level, driven entirely by CSS animations;
- combines three independently-timed cycles (position X, position Y, scale) whose periods are deliberately incommensurate, so the combined pattern doesn't visibly repeat for hours, without relying on randomness;
- uses slow, smooth easing throughout, with no static pauses;
- automatically pauses the drift while the video is paused/ended or the tab is hidden;
- restores the original state when stopped.

## Installation

The extension is currently in development.

1. Clone or download this repository.

2. Open Chrome:

chrome://extensions

3. Enable Developer mode.

4. Click Load unpacked.

5. Select the project folder.

## Usage

1. Open a website with HTML5 video.
2. Start fullscreen playback.
3. Open the extension popup.
4. Press Start.
5. Leave the video running as a background visual.

## Current status

MVP version.

Planned:

- Settings panel
- Movement profiles
- Custom timing
- More OLED protection strategies
- Better support for different video platforms

## License

MIT