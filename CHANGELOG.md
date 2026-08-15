# Changelog

## 1.3.0 — 2026-08-15

- Added optional custom images for the header logo, browser favicon, More-menu
  settings icon, and draggable quick-settings button.
- Added persistent counters for blocked ads, Grok/Chat clutter, and trackers.
- Improved cached-refresh startup reliability and delayed privacy interception
  until X's main interface is ready.
- Preserved native Translate controls while hiding standalone Grok actions.
- Fixed ordinary posts opened from Notifications being mistaken for ads.
- Stopped X-scripted video playback even when a video has no autoplay attribute,
  while preserving playback started directly by the user.
- Improved Back and Close handling across opened posts and other X page layouts.
- Made Cleanbird safer around native menus, dialogs, media viewers, and sort
  overlays without replacing X's own controls.
- Improved compact account popups and expanded Premium cleanup to profile
  verification nags and Premium Business surfaces.

## 1.2.1 — 2026-08-15

- Made the optional quick-settings button draggable with pointer or touch input.
- Snapped the button to the nearest screen edge and remembered its position.
- Set the default and reset position to the lower-right corner.
- Prevented dragging the button from accidentally opening settings.

## 1.2.0 — 2026-08-15

- Added a default-on, best-effort X tracking limiter.
- Blocked known client-event telemetry calls and matching browser beacons.
- Removed common tracking parameters from clicked links and suppressed external referrers.
- Moved For You to the end of the Home tabs by default.
- Allowed manual tab movement or Use X order to override the new default.

## 1.1.1 — 2026-08-15

- Replaced the tab organizer's left/right arrows with up/down controls.
- Removed public custom-logo controls and image replacement.
- Left X's header logo and browser favicon unchanged.
- Replaced BR-specific labels and images with neutral Cleanbird settings controls.

## 1.1.0 — 2026-08-15

- Replaced the Canada-specific For You rule with a general Home tab organizer.
- Added controls to move every detected top-bar tab left or right.
- Preserved new and unknown X tabs instead of hiding or discarding them.
- Added a one-click option to restore X's native tab order.

## 1.0.0 — 2026-08-15

- Added fluid sidebar widths and responsive interface typography.
- Expanded post text, controls, quoted posts, and media with the feed column.
- Added compact and adaptive three-column layouts.
- Added independent Grok, Chat, footer, trend, and suggestion controls.
- Added BR settings to X's More menu and an optional edge shortcut.
- Added built-in BR branding, custom logo upload, and favicon replacement.
- Added Following-first behavior and optional For You tab reordering.
- Fixed account-control overflow and scrollbar overlap.
