# NovaMotion Live Tab 2.0.0

NovaMotion is a public-minded Chrome/Chromium New Tab extension built around AmirAction's product ideas, with development assistance from ChatGPT.

## Highlights
- Local image/video wallpaper library in IndexedDB.
- Reliable video loading with explicit `canplay` handling and cleanup of previous Object URLs.
- Larger, animated UI controls.
- Configurable brand/logo visibility.
- Shortcuts live in the bottom rail next to Add, never under the search bar.
- Shortcut metadata is saved to both local storage and Chrome Sync when available, and is restored automatically on extension updates.
- Shortcut icons are loaded from a favicon service with a local fallback.
- Custom dark search-engine picker (not the browser-native white `<select>`).
- Google, Bing, DuckDuckGo, Brave Search, Ecosia, Yahoo, Startpage and Perplexity presets.
- Settings panel has a live preview on the left.
- Context `?` tips explain settings without clutter.
- iPhone-inspired Depth Effect editor for image wallpapers: a manually selected foreground region is layered above the clock. It supports X/Y/width/height, edge rounding, shadow, presets and direct drag editing.
- Extensive clock typography controls.
- Focus Mode, Pomodoro, bookmarks, local ambient audio.
- Idle Saver and visibility-aware video pausing.
- No first-run bottom “add image/video” banner.
- Credits panel for AmirAction + ChatGPT assistance.

## Depth Effect note
Apple's iPhone Lock Screen Depth Effect automatically separates a foreground subject from the background using Apple's on-device processing. NovaMotion does not claim to reproduce Apple's private detector. Instead, this extension provides a lightweight local editor that lets the user select the foreground area; that keeps the extension dependency-free and predictable.

## Install
1. Extract the ZIP.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Choose Load unpacked.
5. Select the folder containing `manifest.json`.
6. Open a new tab.

For the best video compatibility, use MP4/H.264. Very high-resolution or very high-bitrate video can still use substantial GPU resources in any browser.

## 2.1.0
- Fixed Add Shortcut form styling for explicit text/URL inputs.
- Added Save, Cancel and Restore Defaults for Settings.
- Settings edits are previewed live but are not persisted until Save.
- Live Preview now uses the active image or video wallpaper and updates the clock, wallpaper controls and visual settings immediately.
- Shortcut icons use a local generated fallback and can attempt a real favicon, with failure-safe fallback.
- Added dark custom search engine picker and stronger help text.
- Added settings persistence through local storage and Chrome Sync where available. Sync is appropriate for small metadata/settings; Chrome documents a ~100 KB sync quota and 8 KB per item.

## Convenience features
- Favorite wallpapers and randomize from favorites first when favorites exist.
- Settings can be edited in a true live preview, then committed with Save, cancelled, or restored to defaults.

## 2.2.0 changes
- Renamed product to NovaMotion Live Tab.
- Added PNG extension toolbar/Chrome Web Store icons.
- Added one-time automatic search focus on fresh New Tabs, with an opt-out setting.
- Added richer live settings preview with logo/actions/search/dock UI.
- Improved custom Font/Search Engine controls and click-outside behavior.
- Added a clearer Wallpaper launcher and GIF support in the upload flow.
- Added optional wallpaper source suggestions for moewalls.com and 4kwallpapers.com with a chill safety note.

## 2.2.1 fixes
- Mute now applies directly to the active and preview video elements.
- Stop/play pauses the preview video too, preventing residual audio.
- Range controls are styled as sliders and protected from native drag behavior.
- Dedicated Search bar controls: width, height, corner radius and vertical position.
- New Tab search focus retries after page visibility; Chrome still controls address-bar focus when a new tab is created.

## 2.2.2 fixes
- Fixed the malformed service worker source that prevented Chrome from loading the extension.
- Removed the unnecessary custom extension-page CSP.
- Fixed preview icon visibility when the NovaMotion logo is disabled.
- Rebuilt preview search positioning with stage-relative geometry.
- Added independent calendar display with Gregorian, Persian, Islamic, Hebrew, Japanese, Chinese and Indian National calendars using Intl.DateTimeFormat.
- Hardened video stop/mute behavior so pausing forces audio to zero and playback restores the configured volume.
- Prevented range controls from behaving like draggable page/media elements.

## 2.2.4
- Added persistent Quick Notes with animated hide/reopen.
- Added custom Greeting text while preserving automatic greeting behavior.
- Reworked Live Preview to use a stable 16:9 virtual coordinate system and fixed search/date positioning math.
- Explicitly separates Date visibility from Calendar visibility.

### Research notes
Live preview geometry uses a fixed virtual 1440×900 coordinate system and a 16:9 preview stage rather than mixing viewport pixels with preview pixels. The storage design keeps Notes local-first; Chrome documents that extension `storage.local` persists extension data and has a 10 MB default quota that can be increased with `unlimitedStorage`, while `storage.sync` has a much smaller quota. For responsive preview sizing, the implementation avoids experimental iframe resizing and uses ordinary CSS aspect-ratio/percentage coordinates.


## 2.2.5 changes
- Added wallpaper saturation control.
- Isolated top-right actions from the optional brand/logo block using absolute positioning.
- Increased settings typography for readability.
- Hardened range slider interaction with explicit horizontal-drag semantics.
- Removed duplicate Search Width control from Wallpaper & layout; Search bar controls remain in their dedicated section.
