# Cleanbird for X

Cleanbird is a configurable, Nitter-inspired cleanup layer for the logged-in X
website. It keeps X's normal login and posting features while removing clutter
and making the three-column layout use the browser width intelligently.

## Highlights

- Responsive feed, navigation, sidebars, menus, tabs, and post typography
- Adjustable full-width and narrow-reading layouts
- Optional removal of promoted posts, Grok, Chat, Premium, Jobs, trends,
  suggestions, view counts, and footer links
- Best-effort blocking of X client-event telemetry, tracking beacons, link
  parameters, and outgoing referrers
- Persistent totals for blocked ads, Grok/Chat clutter, and trackers
- Following feed selected by default
- For You moved to the end of the Home tabs by default
- Home-tab organizer with up/down controls for every detected top-bar tab
- Compact posts, reduced motion, softer metrics, and stopped video autoplay
- Cleanbird settings inside X's More menu, plus `Alt+Shift+C`
- Optional draggable quick-settings button that snaps to any screen edge
- Overlay-safe behavior for menus, dialogs, media viewers, and sort controls
- Optional custom images for the header, favicon, More menu, and quick button
- Leaves X's header logo and browser-tab icon unchanged by default
- Settings stored locally by the userscript manager

## Install

See `INSTALL.txt`. The direct installer is `Cleanbird-Firefox.user.js`.

For a Greasy Fork release, use the exact listing copy and submission notes in
`GREASY-FORK.md`.

## Privacy

Cleanbird runs only on `x.com` and `twitter.com`. It uses your existing browser
session and never asks for or stores your X password. Its preferences are stored
locally through the userscript manager. It does not transmit analytics or
personal data. Its optional privacy guard limits known X telemetry but cannot
guarantee that every form of tracking is blocked.

## Compatibility

Designed for current Firefox with Violentmonkey or Tampermonkey. X changes its
markup frequently, so individual selectors may require maintenance over time.
Browser content blockers can also hide native X controls independently of
Cleanbird; disable cosmetic filters when checking a missing X option.

## License

MIT. See `LICENSE.txt`.
