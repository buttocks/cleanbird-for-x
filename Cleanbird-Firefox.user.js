// ==UserScript==
// @name         Cleanbird for X
// @namespace    cleanbird.local
// @version      1.1.0
// @description  A configurable, responsive cleanup interface for X in Firefox.
// @license      MIT
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const BR_LOGO = `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="edge" x1="12" y1="8" x2="116" y2="120" gradientUnits="userSpaceOnUse">
          <stop stop-color="#20d5ff"/>
          <stop offset=".52" stop-color="#2f80ff"/>
          <stop offset="1" stop-color="#9b4dff"/>
        </linearGradient>
        <linearGradient id="letters" x1="34" y1="38" x2="96" y2="94" gradientUnits="userSpaceOnUse">
          <stop stop-color="#ffffff"/>
          <stop offset=".58" stop-color="#d8f7ff"/>
          <stop offset="1" stop-color="#65cfff"/>
        </linearGradient>
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect x="7" y="7" width="114" height="114" rx="31" fill="#070a11" stroke="url(#edge)" stroke-width="7"/>
      <path d="M25 99 102 22" stroke="url(#edge)" stroke-width="5" stroke-linecap="round" opacity=".72"/>
      <text x="61" y="83" text-anchor="middle" fill="url(#letters)" stroke="#07101c" stroke-width="2"
            paint-order="stroke" font-family="Arial Black,Arial,sans-serif" font-size="55" font-style="italic"
            font-weight="900" letter-spacing="-7" filter="url(#glow)">BR</text>
      <path d="M27 104h74" stroke="url(#edge)" stroke-width="4" stroke-linecap="round"/>
    </svg>`)}`;

  const DEFAULTS = {
    hideAds: true,
    hideRightSidebar: true,
    hideGrok: true,
    hideChat: true,
    hidePremium: true,
    hideJobs: true,
    hideCommunities: false,
    hideWhoToFollow: true,
    hideTopics: true,
    hideViewCounts: false,
    hideFooter: true,
    adaptiveWidth: true,
    compactSidebars: true,
    stackAccount: true,
    compactPosts: true,
    narrowFeed: false,
    softenMetrics: true,
    reduceMotion: true,
    stopAutoplay: true,
    autoFollowing: true,
    floatingSettings: false
  };

  const LABELS = {
    hideAds: 'Hide ads and promoted posts',
    hideRightSidebar: 'Hide trends/right sidebar',
    hideGrok: 'Hide Grok',
    hideChat: 'Hide Chat and message drawer',
    hidePremium: 'Hide Premium nags',
    hideJobs: 'Hide Jobs',
    hideCommunities: 'Hide Communities',
    hideWhoToFollow: 'Hide Who to follow',
    hideTopics: 'Hide topic suggestions',
    hideViewCounts: 'Hide view counts',
    hideFooter: 'Hide footer links',
    adaptiveWidth: 'Use full browser width',
    compactSidebars: 'Use compact sidebars',
    stackAccount: 'Keep account beneath navigation',
    compactPosts: 'Compact posts',
    narrowFeed: 'Use narrow reading column',
    softenMetrics: 'Dim reply/repost/like counts',
    reduceMotion: 'Reduce animations',
    stopAutoplay: 'Stop video autoplay',
    autoFollowing: 'Default to Following feed',
    floatingSettings: 'Show quick settings button'
  };

  const NAV_RULES = {
    hideGrok: ['/i/grok'],
    hideChat: ['/i/chat', '/messages'],
    hidePremium: ['/i/premium', '/i/premium_sign_up', '/i/verified-orgs-signup'],
    hideJobs: ['/jobs'],
    hideCommunities: ['/communities']
  };

  const SETTINGS_VERSION = 3;
  let settings = loadSettings();
  let tabOrder = loadTabOrder();
  let styleNode;
  let panel;
  let settingsButton;
  let tabEditorSignature = '';
  let nativeTabOrder = [];
  let nativeTabRoute = '';
  let scanQueued = false;
  let lastRoute = '';
  let followingAttemptedFor = '';
  let customLogo = loadCustomLogo();

  migrateSettings();

  function loadSettings() {
    const saved = {};
    for (const key of Object.keys(DEFAULTS)) {
      try {
        const value = typeof GM_getValue === 'function' ? GM_getValue(key) : undefined;
        saved[key] = typeof value === 'boolean' ? value : DEFAULTS[key];
      } catch (_) {
        saved[key] = DEFAULTS[key];
      }
    }
    return saved;
  }

  function loadCustomLogo() {
    try {
      const value = GM_getValue('customLogo', '');
      return typeof value === 'string' && value ? value : BR_LOGO;
    } catch (_) {
      return BR_LOGO;
    }
  }

  function loadTabOrder() {
    try {
      const value = GM_getValue('tabOrder', '[]');
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed)
        ? parsed.filter(item => typeof item === 'string' && item.trim())
        : [];
    } catch (_) {
      return [];
    }
  }

  function saveTabOrder(order) {
    tabOrder = [...new Set(order.filter(Boolean))];
    try { GM_setValue('tabOrder', JSON.stringify(tabOrder)); } catch (_) {}
  }

  function migrateSettings() {
    let version = 0;
    try {
      version = Number(GM_getValue('cleanbirdSettingsVersion', 0)) || 0;
    } catch (_) {}

    const isExistingInstall = version >= 2;

    if (version < 2) {
      settings.floatingSettings = false;
      try {
        GM_setValue('floatingSettings', false);
      } catch (_) {}
    }

    if (isExistingInstall && version < 3 && !tabOrder.length) {
      saveTabOrder(['following', 'ukraine war', 'canada news', 'for you']);
    }

    if (version < SETTINGS_VERSION) {
      try { GM_setValue('cleanbirdSettingsVersion', SETTINGS_VERSION); } catch (_) {}
    }
  }

  function saveSetting(key, value) {
    settings[key] = value;
    try {
      if (typeof GM_setValue === 'function') GM_setValue(key, value);
    } catch (_) {}
    applySettings();
  }

  function setFlag(key, enabled) {
    document.documentElement.toggleAttribute(`data-cleanbird-${key}`, enabled);
  }

  function applySettings() {
    for (const [key, value] of Object.entries(settings)) setFlag(key, value);
    injectStyles();
    ensureControls();
    queueScan();
  }

  function injectStyles() {
    if (styleNode && styleNode.isConnected) return;
    styleNode = document.createElement('style');
    styleNode.id = 'cleanbird-styles';
    styleNode.textContent = `
      :root {
        --cleanbird-feed-width: 660px;
        --cleanbird-sidebar-width: 350px;
        --cleanbird-left-width: 300px;
        --cleanbird-main-width: 1050px;
        --cleanbird-nav-font: clamp(16px, 1.02vw, 21px);
        --cleanbird-side-font: clamp(13px, .78vw, 16px);
        --cleanbird-side-heading: clamp(18px, 1.05vw, 22px);
        --cleanbird-post-font: clamp(15px, .84vw, 18px);
        --cleanbird-meta-font: clamp(13px, .72vw, 15px);
        --cleanbird-border: rgba(127,127,127,.25);
      }

      html[data-cleanbird-hideRightSidebar] [data-testid="sidebarColumn"] {
        display: none !important;
      }

      html[data-cleanbird-hideGrok] [data-testid="GrokDrawer"],
      html[data-cleanbird-hideGrok] [data-testid*="grok" i],
      html[data-cleanbird-hideGrok] button[aria-label*="grok" i],
      html[data-cleanbird-hideGrok] a[href*="/grok"] {
        display: none !important;
      }

      html[data-cleanbird-hideChat] [data-testid="DMDrawer"],
      html[data-cleanbird-hideChat] [data-testid*="chat-drawer" i],
      html[data-cleanbird-hideChat] button[aria-label="Chat" i],
      html[data-cleanbird-hideChat] a[href="/i/chat"],
      html[data-cleanbird-hideChat] a[href="/messages"] {
        display: none !important;
      }

      html[data-cleanbird-hideFooter] [data-cleanbird-footer="true"],
      html[data-cleanbird-hideFooter] [data-testid="sidebarColumn"] nav[aria-label="Footer" i] {
        display: none !important;
      }

      html[data-cleanbird-adaptiveWidth] header[role="banner"] {
        width: var(--cleanbird-left-width) !important;
        min-width: var(--cleanbird-left-width) !important;
        max-width: var(--cleanbird-left-width) !important;
        flex: 0 0 var(--cleanbird-left-width) !important;
        padding-left: 16px !important;
        box-sizing: border-box !important;
      }

      html[data-cleanbird-adaptiveWidth] header[role="banner"] > div {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      html[data-cleanbird-adaptiveWidth] header[role="banner"] nav a:not([data-testid="SideNav_NewTweet_Button"]),
      html[data-cleanbird-adaptiveWidth] header[role="banner"] [data-testid="AppTabBar_More_Menu"] {
        width: max-content !important;
        max-width: calc(var(--cleanbird-left-width) - 24px) !important;
        flex: 0 0 auto !important;
        align-self: flex-start !important;
      }

      html[data-cleanbird-adaptiveWidth] header[role="banner"] nav a:not([data-testid="SideNav_NewTweet_Button"]) > div,
      html[data-cleanbird-adaptiveWidth] header[role="banner"] [data-testid="AppTabBar_More_Menu"] > div {
        width: auto !important;
        max-width: 100% !important;
        flex: 0 0 auto !important;
      }

      html[data-cleanbird-adaptiveWidth] header[role="banner"] nav span,
      html[data-cleanbird-adaptiveWidth] header[role="banner"] [data-testid="AppTabBar_More_Menu"] span,
      html[data-cleanbird-adaptiveWidth] header[role="banner"] [data-testid="SideNav_AccountSwitcher_Button"] span,
      html[data-cleanbird-adaptiveWidth] header[role="banner"] [data-testid="SideNav_NewTweet_Button"] span {
        font-size: var(--cleanbird-nav-font) !important;
        line-height: 1.2 !important;
      }

      html[data-cleanbird-adaptiveWidth] header[role="banner"] [data-testid="SideNav_NewTweet_Button"] {
        width: calc(var(--cleanbird-left-width) - 48px) !important;
        max-width: 280px !important;
      }

      html[data-cleanbird-stackAccount] [data-cleanbird-nav-stack="true"] {
        justify-content: flex-start !important;
      }

      html[data-cleanbird-stackAccount] header[role="banner"] [data-testid="SideNav_AccountSwitcher_Button"] {
        margin-top: 0 !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      html[data-cleanbird-stackAccount] [data-cleanbird-account-holder="true"] {
        position: static !important;
        inset: auto !important;
        margin-top: 72px !important;
        width: calc(var(--cleanbird-left-width) - 32px) !important;
        min-width: 0 !important;
        max-width: calc(var(--cleanbird-left-width) - 32px) !important;
        transform: none !important;
        box-sizing: border-box !important;
      }

      html[data-cleanbird-adaptiveWidth] main[role="main"] {
        width: var(--cleanbird-main-width) !important;
        min-width: 0 !important;
        max-width: var(--cleanbird-main-width) !important;
        flex: 0 1 var(--cleanbird-main-width) !important;
        margin-left: 0 !important;
        margin-right: 16px !important;
      }

      html[data-cleanbird-adaptiveWidth] main [data-testid="sidebarColumn"] span {
        font-size: var(--cleanbird-side-font) !important;
        line-height: 1.28 !important;
      }

      html[data-cleanbird-adaptiveWidth] main [data-testid="sidebarColumn"] [role="heading"] span,
      html[data-cleanbird-adaptiveWidth] main [data-testid="sidebarColumn"] h1,
      html[data-cleanbird-adaptiveWidth] main [data-testid="sidebarColumn"] h2 {
        font-size: var(--cleanbird-side-heading) !important;
        line-height: 1.18 !important;
      }

      html[data-cleanbird-adaptiveWidth] [data-cleanbird-layout="true"] {
        width: var(--cleanbird-main-width) !important;
        min-width: 0 !important;
        max-width: var(--cleanbird-main-width) !important;
      }

      html[data-cleanbird-adaptiveWidth] main [data-testid="primaryColumn"] {
        width: var(--cleanbird-feed-width) !important;
        min-width: 0 !important;
        max-width: var(--cleanbird-feed-width) !important;
        flex: 0 1 var(--cleanbird-feed-width) !important;
      }

      html[data-cleanbird-adaptiveWidth][data-cleanbird-right-visible] main [data-testid="sidebarColumn"] {
        width: var(--cleanbird-sidebar-width) !important;
        min-width: var(--cleanbird-sidebar-width) !important;
        max-width: var(--cleanbird-sidebar-width) !important;
        flex: 0 0 var(--cleanbird-sidebar-width) !important;
      }

      html[data-cleanbird-adaptiveWidth] main [data-testid="primaryColumn"] > div,
      html[data-cleanbird-adaptiveWidth] main [data-testid="primaryColumn"] article[data-testid="tweet"] {
        max-width: none !important;
      }

      html[data-cleanbird-adaptiveWidth] [data-cleanbird-feed-layer="true"] {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        box-sizing: border-box !important;
      }

      html[data-cleanbird-adaptiveWidth] article[data-testid="tweet"],
      html[data-cleanbird-adaptiveWidth] article[data-testid="tweet"] > div {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        box-sizing: border-box !important;
      }

      html[data-cleanbird-adaptiveWidth] article[data-testid="tweet"] [data-testid="tweetText"],
      html[data-cleanbird-adaptiveWidth] article[data-testid="tweet"] [data-testid="tweetPhoto"],
      html[data-cleanbird-adaptiveWidth] article[data-testid="tweet"] [role="group"] {
        max-width: none !important;
      }

      html[data-cleanbird-adaptiveWidth] article[data-testid="tweet"] [data-testid="tweetText"] {
        font-size: var(--cleanbird-post-font) !important;
        line-height: 1.34 !important;
      }

      html[data-cleanbird-adaptiveWidth] article[data-testid="tweet"] [data-testid="User-Name"] span,
      html[data-cleanbird-adaptiveWidth] article[data-testid="tweet"] [role="group"] span {
        font-size: var(--cleanbird-meta-font) !important;
      }

      html[data-cleanbird-adaptiveWidth] main [role="tab"] span,
      html[data-cleanbird-adaptiveWidth] [role="menu"] span {
        font-size: var(--cleanbird-nav-font) !important;
      }

      html[data-cleanbird-narrowFeed] main [data-testid="primaryColumn"] {
        width: clamp(540px, 55vw, 680px) !important;
        max-width: clamp(540px, 55vw, 680px) !important;
      }

      html[data-cleanbird-compactPosts] article[data-testid="tweet"] {
        padding-top: 2px !important;
        padding-bottom: 2px !important;
      }

      html[data-cleanbird-compactPosts] article[data-testid="tweet"] [data-testid="tweetText"] {
        line-height: 1.28 !important;
      }

      html[data-cleanbird-compactPosts] article[data-testid="tweet"] [data-testid="User-Name"] {
        margin-bottom: 1px !important;
      }

      html[data-cleanbird-softenMetrics] article[data-testid="tweet"] [role="group"] {
        opacity: .68;
        transition: opacity .12s ease;
      }

      html[data-cleanbird-softenMetrics] article[data-testid="tweet"]:hover [role="group"] {
        opacity: 1;
      }

      html[data-cleanbird-hideViewCounts] article[data-testid="tweet"] a[href$="/analytics"] {
        display: none !important;
      }

      html[data-cleanbird-reduceMotion] *,
      html[data-cleanbird-reduceMotion] *::before,
      html[data-cleanbird-reduceMotion] *::after {
        scroll-behavior: auto !important;
        animation-duration: .001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .001ms !important;
      }

      [data-cleanbird-hidden="true"] {
        display: none !important;
      }

      [data-cleanbird-menu-stack="true"] {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        width: 100% !important;
      }

      [data-cleanbird-menu-item="true"] {
        width: 100% !important;
        min-width: 100% !important;
        flex: 0 0 auto !important;
      }

      html[data-cleanbird-custom-logo] header[role="banner"] h1 a[href="/home"] svg {
        display: none !important;
      }

      html[data-cleanbird-custom-logo] header[role="banner"] h1 a[href="/home"]::after {
        content: "";
        display: block;
        width: 32px;
        height: 32px;
        background: var(--cleanbird-custom-logo) center / contain no-repeat;
      }

      #cleanbird-settings-button {
        display: grid;
        place-items: center;
        position: fixed;
        right: 18px;
        top: 50%;
        bottom: auto;
        transform: translateY(-50%);
        z-index: 2147483646;
        width: 50px;
        height: 50px;
        padding: 6px;
        border: 1px solid var(--cleanbird-border);
        border-radius: 15px;
        color: #fff;
        background: #070a11;
        box-shadow: 0 5px 22px rgba(0,0,0,.28);
        opacity: .58;
        transition: opacity .16s ease, box-shadow .16s ease, transform .16s ease;
        cursor: pointer;
      }

      #cleanbird-settings-button[hidden] { display: none !important; }

      #cleanbird-settings-button:hover,
      #cleanbird-settings-button:focus-visible {
        opacity: 1;
        transform: translateY(-50%) scale(1.06);
        outline: none;
        box-shadow: 0 7px 26px rgba(32,213,255,.24);
      }

      #cleanbird-settings-button img {
        display: block;
        width: 36px;
        height: 36px;
        object-fit: contain;
        pointer-events: none;
      }

      html[data-cleanbird-panel-open] [role="menu"] {
        visibility: hidden !important;
      }

      #cleanbird-settings {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(0,0,0,.60);
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      }

      #cleanbird-settings[hidden] { display: none !important; }

      #cleanbird-settings .cleanbird-card {
        width: min(540px, calc(100vw - 28px));
        max-height: min(760px, calc(100vh - 28px));
        overflow: auto;
        color: #e7e9ea;
        background: #15202b;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 18px;
        box-shadow: 0 20px 80px rgba(0,0,0,.48);
      }

      #cleanbird-settings .cleanbird-head {
        position: sticky;
        top: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 20px 14px;
        background: #15202b;
        border-bottom: 1px solid rgba(255,255,255,.10);
      }

      #cleanbird-settings h2 { margin: 0; font-size: 20px; }
      #cleanbird-settings p { margin: 4px 0 0; color: #8b98a5; font-size: 13px; }
      #cleanbird-settings .cleanbird-options { padding: 8px 12px 12px; }

      #cleanbird-settings .cleanbird-branding {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 12px 18px 4px;
        padding: 12px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 12px;
      }

      #cleanbird-settings .cleanbird-logo-preview {
        display: grid;
        flex: 0 0 52px;
        width: 52px;
        height: 52px;
        place-items: center;
        overflow: hidden;
        border-radius: 12px;
        color: #8b98a5;
        background: #000;
        font-size: 11px;
      }

      #cleanbird-settings .cleanbird-logo-preview img {
        width: 42px;
        height: 42px;
        object-fit: contain;
      }

      #cleanbird-settings .cleanbird-branding-copy { flex: 1; min-width: 0; }
      #cleanbird-settings .cleanbird-branding-copy strong { display: block; margin-bottom: 7px; }
      #cleanbird-settings .cleanbird-branding-buttons { display: flex; flex-wrap: wrap; gap: 7px; }

      #cleanbird-settings .cleanbird-tab-order {
        margin: 12px 18px 6px;
        padding: 12px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 12px;
      }

      #cleanbird-settings .cleanbird-tab-order-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 9px;
      }

      #cleanbird-settings .cleanbird-tab-order-head strong { display: block; }
      #cleanbird-settings .cleanbird-tab-order-head span,
      #cleanbird-settings .cleanbird-tab-empty {
        display: block;
        margin-top: 3px;
        color: #8b98a5;
        font-size: 12px;
      }

      #cleanbird-settings .cleanbird-tab-list {
        display: grid;
        gap: 6px;
      }

      #cleanbird-settings .cleanbird-tab-row {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 5px 7px;
        border-radius: 10px;
        background: rgba(255,255,255,.035);
      }

      #cleanbird-settings .cleanbird-tab-position {
        color: #8b98a5;
        text-align: center;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }

      #cleanbird-settings .cleanbird-tab-name {
        overflow: hidden;
        font-weight: 650;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #cleanbird-settings .cleanbird-tab-buttons { display: flex; gap: 5px; }
      #cleanbird-settings .cleanbird-tab-buttons button {
        display: grid;
        width: 34px;
        height: 30px;
        place-items: center;
        padding: 0;
        border-radius: 9px;
        font-size: 17px;
      }

      #cleanbird-settings button:disabled {
        opacity: .28;
        cursor: default;
      }

      #cleanbird-settings label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        min-height: 42px;
        padding: 5px 9px;
        border-radius: 10px;
        cursor: pointer;
      }

      #cleanbird-settings label:hover { background: rgba(255,255,255,.06); }
      #cleanbird-settings input { width: 18px; height: 18px; accent-color: #1d9bf0; }

      #cleanbird-settings button {
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 999px;
        padding: 8px 14px;
        color: #e7e9ea;
        background: transparent;
        font-weight: 700;
        cursor: pointer;
      }

      #cleanbird-settings button:hover { background: rgba(255,255,255,.08); }
      #cleanbird-settings .cleanbird-actions { display: flex; gap: 8px; }
    `;
    (document.head || document.documentElement).appendChild(styleNode);
  }

  function ensureControls() {
    if (!document.body) return;

    if (!settingsButton) {
      settingsButton = document.createElement('button');
      settingsButton.id = 'cleanbird-settings-button';
      settingsButton.type = 'button';
      const settingsLogo = document.createElement('img');
      settingsLogo.src = BR_LOGO;
      settingsLogo.alt = '';
      settingsButton.appendChild(settingsLogo);
      settingsButton.title = 'BR settings';
      settingsButton.setAttribute('aria-label', 'Open BR settings');
      settingsButton.addEventListener('click', openPanel);
      document.body.appendChild(settingsButton);
    }
    settingsButton.hidden = !settings.floatingSettings;

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'cleanbird-settings';
      panel.hidden = true;
      panel.innerHTML = `
        <section class="cleanbird-card" role="dialog" aria-modal="true" aria-label="BR settings">
          <header class="cleanbird-head">
            <div><h2>BR settings</h2><p>Choose what X gets to show you.</p></div>
            <div class="cleanbird-actions">
              <button type="button" data-action="reset">Reset</button>
              <button type="button" data-action="close">Done</button>
            </div>
          </header>
          <div class="cleanbird-branding">
            <div class="cleanbird-logo-preview"><span>Default</span></div>
            <div class="cleanbird-branding-copy">
              <strong>Custom logo</strong>
              <div class="cleanbird-branding-buttons">
                <button type="button" data-action="choose-logo">Choose image</button>
                <button type="button" data-action="clear-logo">Use BR logo</button>
              </div>
              <input type="file" data-logo-file accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
            </div>
          </div>
          <div class="cleanbird-tab-order">
            <div class="cleanbird-tab-order-head">
              <div>
                <strong>Home tab order</strong>
                <span>Move every detected tab left or right.</span>
              </div>
              <button type="button" data-action="reset-tabs">Use X order</button>
            </div>
            <div class="cleanbird-tab-list"></div>
          </div>
          <div class="cleanbird-options"></div>
        </section>`;

      const options = panel.querySelector('.cleanbird-options');
      for (const [key, label] of Object.entries(LABELS)) {
        const row = document.createElement('label');
        const text = document.createElement('span');
        const input = document.createElement('input');
        text.textContent = label;
        input.type = 'checkbox';
        input.dataset.setting = key;
        row.append(text, input);
        options.appendChild(row);
      }

      panel.addEventListener('change', event => {
        const input = event.target.closest('input[data-setting]');
        if (input) saveSetting(input.dataset.setting, input.checked);
        if (event.target.matches('input[data-logo-file]')) importLogo(event.target.files[0]);
      });
      panel.addEventListener('click', event => {
        if (event.target === panel || event.target.closest('[data-action="close"]')) closePanel();
        if (event.target.closest('[data-action="reset"]')) resetSettings();
        if (event.target.closest('[data-action="choose-logo"]')) panel.querySelector('[data-logo-file]').click();
        if (event.target.closest('[data-action="clear-logo"]')) clearLogo();
        if (event.target.closest('[data-action="reset-tabs"]')) resetTabOrder();
        const tabMove = event.target.closest('[data-tab-move]');
        if (tabMove) moveTab(tabMove.dataset.tabKey, Number(tabMove.dataset.tabMove));
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && panel && !panel.hidden) closePanel();
        if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'c') {
          event.preventDefault();
          openPanel();
        }
      });
      document.body.appendChild(panel);
    }
  }

  function openPanel() {
    ensureControls();
    for (const input of panel.querySelectorAll('input[data-setting]')) {
      input.checked = Boolean(settings[input.dataset.setting]);
    }
    updateLogoPreview();
    tabEditorSignature = '';
    renderTabOrderEditor();
    document.documentElement.setAttribute('data-cleanbird-panel-open', 'true');
    panel.hidden = false;
  }

  function closePanel() {
    if (panel) panel.hidden = true;
    document.documentElement.removeAttribute('data-cleanbird-panel-open');
  }

  function resetSettings() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      try { if (typeof GM_setValue === 'function') GM_setValue(key, value); } catch (_) {}
    }
    settings = { ...DEFAULTS };
    resetTabOrder();
    applySettings();
    openPanel();
  }

  function importLogo(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 3 * 1024 * 1024) {
      window.alert('Please choose a logo smaller than 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      customLogo = typeof reader.result === 'string' ? reader.result : '';
      try { GM_setValue('customLogo', customLogo); } catch (_) {}
      updateBranding();
      updateLogoPreview();
    });
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    customLogo = BR_LOGO;
    try { GM_setValue('customLogo', BR_LOGO); } catch (_) {}
    updateBranding();
    updateLogoPreview();
  }

  function updateLogoPreview() {
    if (!panel) return;
    const preview = panel.querySelector('.cleanbird-logo-preview');
    if (!preview) return;
    preview.replaceChildren();
    if (customLogo) {
      const image = document.createElement('img');
      image.src = customLogo;
      image.alt = 'Custom logo';
      preview.appendChild(image);
    } else {
      const text = document.createElement('span');
      text.textContent = 'Default';
      preview.appendChild(text);
    }
  }

  function updateBranding() {
    const root = document.documentElement;
    root.toggleAttribute('data-cleanbird-custom-logo', Boolean(customLogo));
    if (customLogo) {
      root.style.setProperty('--cleanbird-custom-logo', `url("${customLogo}")`);
      let favicon = document.querySelector('link#cleanbird-favicon');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.id = 'cleanbird-favicon';
        favicon.rel = 'icon';
        (document.head || root).appendChild(favicon);
      }
      favicon.href = customLogo;
    } else {
      root.style.removeProperty('--cleanbird-custom-logo');
      document.querySelector('link#cleanbird-favicon')?.remove();
    }
  }

  function hideElement(element) {
    if (element && !element.closest('#cleanbird-settings')) {
      element.dataset.cleanbirdHidden = 'true';
    }
  }

  function showElement(element) {
    if (element && element.dataset.cleanbirdHidden === 'true') {
      delete element.dataset.cleanbirdHidden;
    }
  }

  function updateNavigation() {
    for (const [key, paths] of Object.entries(NAV_RULES)) {
      for (const path of paths) {
        for (const link of document.querySelectorAll(`a[href^="${path}"]`)) {
          const item = link.closest('nav a, header a') || link;
          settings[key] ? hideElement(item) : showElement(item);
        }
      }
    }
  }

  function updateMoreMenu() {
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      if (menu.querySelector('[data-cleanbird-menu-item="true"]')) continue;

      const items = [...menu.querySelectorAll('[role="menuitem"], a[href]')];
      const settingsItem = items.find(item =>
        (item.textContent || '').trim().toLowerCase().includes('settings and privacy')
      );
      if (!settingsItem || !settingsItem.parentNode) continue;

      settingsItem.parentElement.dataset.cleanbirdMenuStack = 'true';

      const item = settingsItem.cloneNode(true);
      item.dataset.cleanbirdMenuItem = 'true';
      item.removeAttribute('href');
      item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '0');

      const label = [...item.querySelectorAll('span, div')]
        .filter(node => (node.textContent || '').trim().toLowerCase() === 'settings and privacy')
        .sort((first, second) => first.children.length - second.children.length)[0];
      if (label) label.textContent = 'BR settings';

      const oldIcon = item.querySelector('svg');
      if (oldIcon) {
        const logo = document.createElement('img');
        logo.src = BR_LOGO;
        logo.alt = '';
        logo.width = 24;
        logo.height = 24;
        logo.style.cssText = 'display:block;width:24px;height:24px;object-fit:contain;margin-right:32px;';
        oldIcon.replaceWith(logo);
      }

      const open = event => {
        event.preventDefault();
        event.stopPropagation();
        openPanel();
      };
      item.addEventListener('click', open);
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') open(event);
      });
      settingsItem.parentNode.insertBefore(item, settingsItem);
    }
  }

  function updatePromotedPosts() {
    if (!settings.hideAds) {
      for (const node of document.querySelectorAll('[data-cleanbird-ad="true"]')) {
        delete node.dataset.cleanbirdHidden;
        delete node.dataset.cleanbirdAd;
      }
      return;
    }

    for (const marker of document.querySelectorAll('[data-testid="placementTracking"]')) {
      const article = marker.closest('article[data-testid="tweet"]') || marker.closest('[data-testid="cellInnerDiv"]');
      if (article) {
        article.dataset.cleanbirdAd = 'true';
        hideElement(article);
      }
    }

    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const labels = [...article.querySelectorAll('span')]
        .map(span => (span.textContent || '').trim().toLowerCase())
        .filter(Boolean);
      if (labels.includes('promoted')) {
        article.dataset.cleanbirdAd = 'true';
        hideElement(article);
      }
    }
  }

  function updateSuggestionModules() {
    const phrases = [];
    if (settings.hideWhoToFollow) phrases.push('who to follow');
    if (settings.hideTopics) phrases.push('topics to follow', 'recommended topics');

    for (const cell of document.querySelectorAll('[data-testid="cellInnerDiv"]')) {
      if (cell.dataset.cleanbirdSuggestion === 'true') {
        showElement(cell);
        delete cell.dataset.cleanbirdSuggestion;
      }
      const text = (cell.textContent || '').trim().toLowerCase();
      if (phrases.some(phrase => text.startsWith(phrase))) {
        cell.dataset.cleanbirdSuggestion = 'true';
        hideElement(cell);
      }
    }
  }

  function updateFeedLayers() {
    const primary = document.querySelector('main [data-testid="primaryColumn"]');
    if (!primary || !settings.adaptiveWidth) return;

    for (const article of primary.querySelectorAll('article[data-testid="tweet"]')) {
      let layer = article;
      while (layer && layer !== primary) {
        layer.dataset.cleanbirdFeedLayer = 'true';
        layer = layer.parentElement;
      }
    }
  }

  function updateNavLayout() {
    for (const oldStack of document.querySelectorAll('[data-cleanbird-nav-stack="true"]')) {
      delete oldStack.dataset.cleanbirdNavStack;
    }
    for (const oldHolder of document.querySelectorAll('[data-cleanbird-account-holder="true"]')) {
      delete oldHolder.dataset.cleanbirdAccountHolder;
    }
    if (!settings.stackAccount) return;

    const header = document.querySelector('header[role="banner"]');
    const postButton = header && header.querySelector('[data-testid="SideNav_NewTweet_Button"]');
    const accountButton = header && header.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (!postButton || !accountButton) return;

    if (accountButton.parentElement) {
      accountButton.parentElement.dataset.cleanbirdAccountHolder = 'true';
    }

    let stack = postButton;
    while (stack && !stack.contains(accountButton)) stack = stack.parentElement;
    if (stack && stack !== document.body && stack !== document.documentElement) {
      stack.dataset.cleanbirdNavStack = 'true';
    }
  }

  function updateFloatingClutter() {
    for (const oldItem of document.querySelectorAll('[data-cleanbird-floating-clutter="true"]')) {
      showElement(oldItem);
      delete oldItem.dataset.cleanbirdFloatingClutter;
    }

    const candidates = document.querySelectorAll('[data-testid], button[aria-label], a[href]');
    for (const item of candidates) {
      const testId = (item.getAttribute('data-testid') || '').toLowerCase();
      const aria = (item.getAttribute('aria-label') || '').toLowerCase();
      const href = (item.getAttribute('href') || '').toLowerCase();
      const isGrok = settings.hideGrok && (
        testId.includes('grok') || aria.includes('grok') || href.includes('/grok')
      );
      const isChat = settings.hideChat && (
        testId === 'dmdrawer' || testId.includes('chat-drawer') ||
        aria === 'chat' || href === '/i/chat' || href === '/messages'
      );
      if (isGrok || isChat) {
        item.dataset.cleanbirdFloatingClutter = 'true';
        hideElement(item);
      }
    }
  }

  function updateFooter() {
    for (const oldFooter of document.querySelectorAll('[data-cleanbird-footer="true"]')) {
      delete oldFooter.dataset.cleanbirdFooter;
    }
    for (const nav of document.querySelectorAll('[data-testid="sidebarColumn"] nav, nav[aria-label="Footer" i]')) {
      const text = (nav.textContent || '').toLowerCase();
      if (text.includes('terms') && text.includes('privacy') && text.includes('cookies')) {
        nav.dataset.cleanbirdFooter = 'true';
      }
    }
  }

  function stopAutoplay() {
    if (!settings.stopAutoplay) return;
    for (const video of document.querySelectorAll('video[autoplay]:not([data-cleanbird-autoplay])')) {
      video.dataset.cleanbirdAutoplay = 'stopped';
      video.autoplay = false;
      video.removeAttribute('autoplay');
      video.pause();
    }
  }

  function updateResponsiveLayout() {
    const root = document.documentElement;
    const primary = document.querySelector('main [data-testid="primaryColumn"]');
    const sidebar = document.querySelector('main [data-testid="sidebarColumn"]');
    const main = primary && primary.closest('main');
    if (!primary || !main) return;

    const commonAncestor = (first, second) => {
      let node = first;
      while (node && second && !node.contains(second)) node = node.parentElement;
      return node;
    };
    const layout = commonAncestor(primary, sidebar);
    if (layout && layout !== document.body && layout !== root) {
      layout.dataset.cleanbirdLayout = 'true';
    }

    const sidebarVisible = Boolean(
      !settings.hideRightSidebar &&
      sidebar &&
      getComputedStyle(sidebar).display !== 'none' &&
      sidebar.getBoundingClientRect().width > 120
    );
    root.toggleAttribute('data-cleanbird-right-visible', sidebarVisible);

    if (!settings.adaptiveWidth) {
      root.style.removeProperty('--cleanbird-feed-width');
      root.style.removeProperty('--cleanbird-sidebar-width');
      root.style.removeProperty('--cleanbird-left-width');
      root.style.removeProperty('--cleanbird-main-width');
      return;
    }

    const viewport = window.innerWidth;
    const scale = (minimum, fluid, maximum) => Math.max(minimum, Math.min(maximum, fluid));
    const viewportGutter = viewport >= 1200 ? scale(12, viewport * 0.012, 28) : 0;
    const leftWidth = viewport < 1050
      ? 88
      : settings.compactSidebars
        ? scale(225, viewport * 0.132, 285)
        : scale(260, viewport * 0.16, 340);
    const availableMain = Math.max(600, window.innerWidth - leftWidth - viewportGutter);
    const columnGap = sidebarVisible ? scale(16, viewport * 0.014, 30) : 0;
    const sidebarWidth = sidebarVisible
      ? (settings.compactSidebars
          ? scale(310, viewport * 0.18, 400)
          : scale(340, viewport * 0.22, 480))
      : 0;
    const feedWidth = sidebarVisible
      ? Math.max(600, availableMain - sidebarWidth - columnGap)
      : Math.max(600, availableMain);
    const mainWidth = feedWidth + sidebarWidth + columnGap;

    root.style.setProperty('--cleanbird-feed-width', `${Math.round(feedWidth)}px`);
    root.style.setProperty('--cleanbird-sidebar-width', `${Math.round(sidebarWidth)}px`);
    root.style.setProperty('--cleanbird-left-width', `${Math.round(leftWidth)}px`);
    root.style.setProperty('--cleanbird-main-width', `${Math.round(mainWidth)}px`);
  }

  function normalizeTabKey(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function getHomeTabState() {
    if (location.pathname !== '/home') return null;

    const groups = [...document.querySelectorAll('[role="tablist"]')]
      .map(container => {
        const tabs = [...container.querySelectorAll('[role="tab"]')]
          .filter(tab => normalizeTabKey(tab.textContent));
        const keys = tabs.map(tab => normalizeTabKey(tab.textContent));
        const score = tabs.length +
          (keys.includes('following') ? 100 : 0) +
          (keys.includes('for you') ? 100 : 0);
        return { container, tabs, score };
      })
      .filter(group => group.tabs.length > 1)
      .sort((first, second) => second.score - first.score);

    let container = groups[0]?.container;
    let tabs = groups[0]?.tabs || [];

    if (!container) {
      tabs = [...document.querySelectorAll('[role="tab"]')]
        .filter(tab => normalizeTabKey(tab.textContent));
      if (tabs.length < 2) return null;
      container = tabs[0].parentElement;
      while (container && !tabs.every(tab => container.contains(tab))) {
        container = container.parentElement;
      }
    } else {
      let common = tabs[0]?.parentElement;
      while (common && !tabs.every(tab => common.contains(tab))) common = common.parentElement;
      if (common && (common === container || container.contains(common))) container = common;
    }

    if (!container || container === document.body || container === document.documentElement) return null;

    const usedKeys = new Set();
    const usedItems = new Set();
    const entries = [];
    for (const tab of tabs) {
      const key = normalizeTabKey(tab.textContent);
      if (!key || usedKeys.has(key)) continue;
      let item = tab;
      while (item.parentElement && item.parentElement !== container) item = item.parentElement;
      if (item.parentElement !== container || usedItems.has(item)) continue;
      usedKeys.add(key);
      usedItems.add(item);
      entries.push({ key, label: String(tab.textContent || '').replace(/\s+/g, ' ').trim(), tab, item });
    }

    if (entries.length < 2) return null;

    const route = `${location.pathname}${location.search}`;
    const currentOrder = entries.map(entry => entry.key);
    if (nativeTabRoute !== route) {
      nativeTabRoute = route;
      nativeTabOrder = currentOrder;
    } else {
      for (const key of currentOrder) {
        if (!nativeTabOrder.includes(key)) nativeTabOrder.push(key);
      }
    }

    return { container, entries, currentOrder };
  }

  function mergeTabOrder(discoveredOrder) {
    const present = new Set(discoveredOrder);
    return [
      ...tabOrder.filter(key => present.has(key)),
      ...discoveredOrder.filter(key => !tabOrder.includes(key))
    ];
  }

  function persistVisibleTabOrder(visibleOrder) {
    const visible = new Set(visibleOrder);
    saveTabOrder([...visibleOrder, ...tabOrder.filter(key => !visible.has(key))]);
  }

  function renderTabOrderEditor() {
    if (!panel) return;
    const list = panel.querySelector('.cleanbird-tab-list');
    if (!list) return;

    const state = getHomeTabState();
    if (!state) {
      const signature = `empty:${location.pathname}`;
      if (tabEditorSignature === signature) return;
      tabEditorSignature = signature;
      const empty = document.createElement('span');
      empty.className = 'cleanbird-tab-empty';
      empty.textContent = 'Open X Home to detect and arrange its current tabs.';
      list.replaceChildren(empty);
      return;
    }

    const order = mergeTabOrder(state.currentOrder);
    const byKey = new Map(state.entries.map(entry => [entry.key, entry]));
    const signature = `${location.pathname}|${order.join('|')}|${state.entries.map(entry => entry.label).join('|')}`;
    if (tabEditorSignature === signature) return;
    tabEditorSignature = signature;

    const rows = order.map((key, index) => {
      const entry = byKey.get(key);
      const row = document.createElement('div');
      row.className = 'cleanbird-tab-row';

      const position = document.createElement('span');
      position.className = 'cleanbird-tab-position';
      position.textContent = String(index + 1);

      const name = document.createElement('span');
      name.className = 'cleanbird-tab-name';
      name.textContent = entry?.label || key;

      const buttons = document.createElement('div');
      buttons.className = 'cleanbird-tab-buttons';
      const left = document.createElement('button');
      const right = document.createElement('button');
      left.type = right.type = 'button';
      left.textContent = '←';
      right.textContent = '→';
      left.title = `Move ${name.textContent} left`;
      right.title = `Move ${name.textContent} right`;
      left.setAttribute('aria-label', left.title);
      right.setAttribute('aria-label', right.title);
      left.dataset.tabKey = right.dataset.tabKey = key;
      left.dataset.tabMove = '-1';
      right.dataset.tabMove = '1';
      left.disabled = index === 0;
      right.disabled = index === order.length - 1;
      buttons.append(left, right);
      row.append(position, name, buttons);
      return row;
    });
    list.replaceChildren(...rows);
  }

  function moveTab(key, direction) {
    const state = getHomeTabState();
    if (!state || ![-1, 1].includes(direction)) return;
    const order = mergeTabOrder(state.currentOrder);
    const index = order.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    persistVisibleTabOrder(order);
    reorderHomeTabs();
    tabEditorSignature = '';
    renderTabOrderEditor();
  }

  function resetTabOrder() {
    const state = getHomeTabState();
    if (state && nativeTabOrder.length) {
      const present = new Set(state.currentOrder);
      const original = [
        ...nativeTabOrder.filter(key => present.has(key)),
        ...state.currentOrder.filter(key => !nativeTabOrder.includes(key))
      ];
      saveTabOrder(original);
      reorderHomeTabs();
    }
    saveTabOrder([]);
    tabEditorSignature = '';
    renderTabOrderEditor();
  }

  function selectFollowing() {
    if (!settings.autoFollowing || location.pathname !== '/home') return;
    const routeKey = `${location.pathname}${location.search}`;
    if (followingAttemptedFor === routeKey) return;

    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const following = tabs.find(tab => (tab.textContent || '').trim().toLowerCase() === 'following');
    if (following && following.getAttribute('aria-selected') !== 'true') {
      followingAttemptedFor = routeKey;
      following.click();
    }
  }

  function reorderHomeTabs() {
    if (!tabOrder.length || location.pathname !== '/home') return;
    const state = getHomeTabState();
    if (!state) return;
    const order = mergeTabOrder(state.currentOrder);
    if (order.every((key, index) => key === state.currentOrder[index])) return;

    const byKey = new Map(state.entries.map(entry => [entry.key, entry.item]));
    const afterTabs = state.entries[state.entries.length - 1].item.nextSibling;
    for (const key of order) {
      const item = byKey.get(key);
      if (item) state.container.insertBefore(item, afterTabs);
    }
  }

  function scan() {
    scanQueued = false;
    const route = `${location.pathname}${location.search}`;
    if (route !== lastRoute) {
      lastRoute = route;
      followingAttemptedFor = '';
    }
    updateNavigation();
    updateMoreMenu();
    updatePromotedPosts();
    updateSuggestionModules();
    updateFeedLayers();
    updateNavLayout();
    updateFloatingClutter();
    updateFooter();
    stopAutoplay();
    selectFollowing();
    reorderHomeTabs();
    if (panel && !panel.hidden) renderTabOrderEditor();
    updateResponsiveLayout();
    updateBranding();
    ensureControls();
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  function start() {
    applySettings();
    const observer = new MutationObserver(queueScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', queueScan);
    window.addEventListener('hashchange', queueScan);
    window.addEventListener('resize', queueScan, { passive: true });
    setInterval(queueScan, 2500);
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Open Cleanbird settings', openPanel);
    GM_registerMenuCommand('Reset Cleanbird settings', resetSettings);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
