# Greasy Fork listing

## Script name

Cleanbird for X

## Short description

A configurable, responsive cleanup interface for X and Twitter in Firefox.

## Additional information

Cleanbird for X is a configurable, responsive cleanup layer for the logged-in
X website. It keeps normal X features—including posting, replies,
notifications, and your existing login—while removing clutter and making
better use of wide screens. It runs on both `x.com` and `twitter.com`.

### Features

- Responsive feed, navigation, sidebars, menus, and text
- Full-width and narrow-reading layouts
- Optional, independent centering of feed-post text and feed-post images
- Home-tab organizer with up/down controls for every detected top-bar tab
- For You placed last by default, with manual ordering still available
- Optional removal of promoted posts, Grok, Chat, Premium, Jobs, trends,
  suggestions, view counts, and footer links
- Best-effort blocking of known X telemetry, tracking beacons, link parameters,
  and outgoing referrers
- Persistent counters for blocked ads, Grok/Chat clutter, and trackers
- Compact posts, reduced motion, softer engagement metrics, and disabled video
  autoplay
- Optional viewport-height fitting for oversized timeline videos
- Following feed selected automatically when available
- Optional quick-settings button that drags and snaps around the screen edges
- Overlay-safe menus, dialogs, media viewers, and Recent/Popular sorting
- Optional independent custom images for the header, favicon, More-menu icon,
  and quick-settings button
- Leaves X's header logo and browser-tab icon unchanged by default

### Settings

Open **More → Cleanbird settings** on X, or press **Alt+Shift+C**. Every cleanup,
layout, and tab-order option can be changed independently.

### Privacy

Cleanbird uses your existing X browser session. It never asks for or stores
your X password and does not send analytics or personal information anywhere.
Preferences are stored locally by the userscript manager.
The privacy guard is intentionally conservative and cannot guarantee that every
form of tracking is blocked.

### Compatibility

Designed for Firefox with Violentmonkey or Tampermonkey. Because X frequently
changes its interface, occasional selector updates may be required.

### Source and support

https://github.com/buttocks/cleanbird-for-x

## Code to submit

Submit the complete contents of `Cleanbird-for-X-Greasy-Fork-v1.5.13.user.js`.
Its public namespace is deliberately different from the older local build, so
it installs as a separate userscript instead of replacing that copy. Keep only
one Cleanbird script enabled at a time. Do not add a Greasy Fork `@downloadURL`
or `@updateURL`; Greasy Fork generates those fields.
