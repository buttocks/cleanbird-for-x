# Cleanbird for X

Cleanbird is a configurable, Nitter-inspired cleanup layer for the logged-in X
website. It keeps X's normal login and posting features while removing clutter
and making the three-column layout use the browser width intelligently.

The built-in visual identity is the electric-blue BR badge. You can replace it
with any image from the BR settings panel.

## Highlights

- Responsive feed, navigation, sidebars, menus, tabs, and post typography
- Adjustable full-width and narrow-reading layouts
- Optional removal of promoted posts, Grok, Chat, Premium, Jobs, trends,
  suggestions, view counts, and footer links
- Following feed selected by default
- Home-tab organizer that can move any detected top-bar tab left or right
- Compact posts, reduced motion, softer metrics, and stopped video autoplay
- BR settings inside X's More menu, plus `Alt+Shift+C`
- Built-in BR logo, custom logo upload, and matching browser-tab icon
- Settings stored locally by the userscript manager

## Install

See `INSTALL.txt`. The direct installer is `Cleanbird-Firefox.user.js`.

For a Greasy Fork release, use the exact listing copy and submission notes in
`GREASY-FORK.md`.

## Privacy

Cleanbird runs only on `x.com` and `twitter.com`. It uses your existing browser
session and never asks for or stores your X password. Its preferences and custom
logo are stored locally through the userscript manager. It does not transmit
analytics or personal data.

## Compatibility

Designed for current Firefox with Violentmonkey or Tampermonkey. X changes its
markup frequently, so individual selectors may require maintenance over time.

## License

MIT. See `LICENSE.txt`.
