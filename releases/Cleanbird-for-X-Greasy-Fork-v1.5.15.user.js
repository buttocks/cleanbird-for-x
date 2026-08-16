// ==UserScript==
// @name         Cleanbird for X
// @namespace    https://github.com/buttocks/cleanbird-for-x/greasy-fork
// @version      1.5.15
// @description  A configurable, responsive cleanup interface for X in Firefox.
// @license      MIT
// @homepageURL  https://github.com/buttocks/cleanbird-for-x
// @supportURL   https://github.com/buttocks/cleanbird-for-x/issues
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULTS = {
    limitTracking: true,
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
    centerFeedTweets: false,
    centerFeedImages: false,
    narrowFeed: false,
    softenMetrics: true,
    reduceMotion: true,
    stopAutoplay: true,
    fitVideos: true,
    autoFollowing: true,
    forYouLast: true,
    floatingSettings: false
  };

  const LABELS = {
    limitTracking: 'Limit X tracking (best effort)',
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
    centerFeedTweets: 'Center-align text in feed posts',
    centerFeedImages: 'Center images in tweets',
    narrowFeed: 'Use narrow reading column',
    softenMetrics: 'Dim reply/repost/like counts',
    reduceMotion: 'Reduce animations',
    stopAutoplay: 'Stop video autoplay',
    fitVideos: 'Fit videos to browser height',
    autoFollowing: 'Default to Following feed',
    forYouLast: 'Keep For You tab last',
    floatingSettings: 'Show quick settings button'
  };

  const NAV_RULES = {
    hideGrok: ['/i/grok', '/grok'],
    hideChat: ['/i/chat', '/messages'],
    hidePremium: ['/i/premium', '/i/premium-business', '/i/premium_sign_up', '/i/verified-orgs-signup'],
    hideJobs: ['/jobs'],
    hideCommunities: ['/communities']
  };

  const TRACKING_PATHS = [
    /\/(?:i\/api\/)?1\.1\/jot\/client_event\.json(?:[?#]|$)/i,
    /\/i\/api\/1\.1\/live_pipeline\/events(?:[?#]|$)/i,
    /\/i\/(?:adsct|adsct\?)/i
  ];
  const TRACKING_HOSTS = /^(?:analytics|ads-api|ads)\.(?:twitter|x)\.com$/i;

  const SETTINGS_VERSION = 6;
  const QUICK_BUTTON_DEFAULT = Object.freeze({ edge: 'right', ratio: 1 });
  const QUICK_BUTTON_INSET = 18;
  const CUSTOM_IMAGE_FIELDS = Object.freeze([
    { key: 'headerLogo', label: 'Header/Home logo', help: 'Replaces the X logo above the left navigation.' },
    { key: 'favicon', label: 'Browser tab / bookmark icon', help: 'Changes the favicon used by this X tab.' },
    { key: 'menuIcon', label: 'More-menu settings icon', help: 'Changes the icon beside Cleanbird settings.' },
    { key: 'quickIcon', label: 'Quick-settings button', help: 'Changes the draggable edge button image.' }
  ]);
  const BLOCK_COUNTER_TYPES = Object.freeze(['ads', 'clutter', 'trackers']);
  let settings = loadSettings();
  let tabOrder = loadTabOrder();
  let quickButtonPosition = loadQuickButtonPosition();
  let customImages = loadCustomImages();
  let blockedCounts = loadBlockedCounts();
  let blockedCountsSaveTimer;
  const countedBlockedElements = {
    ads: new WeakSet(),
    clutter: new WeakSet()
  };
  let styleNode;
  let panel;
  let settingsButton;
  let suppressQuickButtonClick = false;
  let tabEditorSignature = '';
  let nativeTabOrder = [];
  let nativeTabRoute = '';
  let scanQueued = false;
  let started = false;
  let responsiveLayoutSignature = '';
  let lastRoute = '';
  let followingAttemptedFor = '';
  let backNavigationTimer;
  const userStartedVideos = new WeakSet();
  const LAST_NON_POST_ROUTE_KEY = 'cleanbird.lastNonPostRoute';

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

  function loadQuickButtonPosition() {
    try {
      const value = GM_getValue('quickButtonPosition', '');
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (
        parsed &&
        ['left', 'right', 'top', 'bottom'].includes(parsed.edge) &&
        Number.isFinite(Number(parsed.ratio))
      ) {
        return {
          edge: parsed.edge,
          ratio: Math.max(0, Math.min(1, Number(parsed.ratio)))
        };
      }
    } catch (_) {}
    return { ...QUICK_BUTTON_DEFAULT };
  }

  function saveQuickButtonPosition(position) {
    quickButtonPosition = {
      edge: position.edge,
      ratio: Math.max(0, Math.min(1, Number(position.ratio) || 0))
    };
    try { GM_setValue('quickButtonPosition', JSON.stringify(quickButtonPosition)); } catch (_) {}
  }

  function loadCustomImages() {
    const images = {};
    for (const field of CUSTOM_IMAGE_FIELDS) {
      try {
        const value = GM_getValue(`customImage.${field.key}`, '');
        images[field.key] = typeof value === 'string' && value.startsWith('data:image/') ? value : '';
      } catch (_) {
        images[field.key] = '';
      }
    }
    return images;
  }

  function loadBlockedCounts() {
    try {
      const value = GM_getValue('blockedCounts', '{}');
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Object.fromEntries(BLOCK_COUNTER_TYPES.map(type => [
        type,
        Math.max(0, Math.floor(Number(parsed?.[type]) || 0))
      ]));
    } catch (_) {
      return Object.fromEntries(BLOCK_COUNTER_TYPES.map(type => [type, 0]));
    }
  }

  function saveBlockedCountsSoon() {
    if (blockedCountsSaveTimer) return;
    blockedCountsSaveTimer = setTimeout(() => {
      blockedCountsSaveTimer = undefined;
      try { GM_setValue('blockedCounts', JSON.stringify(blockedCounts)); } catch (_) {}
    }, 400);
  }

  function recordBlocked(type, amount = 1) {
    if (!BLOCK_COUNTER_TYPES.includes(type) || amount <= 0) return;
    blockedCounts[type] += amount;
    saveBlockedCountsSoon();
    renderBlockedCounts();
  }

  function recordBlockedElement(type, element) {
    const seen = countedBlockedElements[type];
    if (!seen || !element || seen.has(element)) return;
    seen.add(element);
    recordBlocked(type);
  }

  function resetBlockedCounts() {
    blockedCounts = Object.fromEntries(BLOCK_COUNTER_TYPES.map(type => [type, 0]));
    try { GM_setValue('blockedCounts', JSON.stringify(blockedCounts)); } catch (_) {}
    renderBlockedCounts();
  }

  function renderBlockedCounts() {
    if (!panel) return;
    for (const type of BLOCK_COUNTER_TYPES) {
      const output = panel.querySelector(`[data-blocked-count="${type}"]`);
      if (output) output.textContent = blockedCounts[type].toLocaleString();
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
    if (key === 'forYouLast' && !value && !tabOrder.length) restoreNativeTabOrder();
    applySettings();
  }

  function isTrackingRequest(input) {
    if (!input) return false;
    try {
      const raw = typeof input === 'string' ? input : input.url;
      const url = new URL(raw, location.href);
      return TRACKING_HOSTS.test(url.hostname) || TRACKING_PATHS.some(pattern => pattern.test(url.pathname + url.search));
    } catch (_) {
      return false;
    }
  }

  function isPrivacyBlockingReady() {
    return document.readyState === 'complete' &&
      Boolean(document.querySelector('main, [role="main"], [data-testid="primaryColumn"]'));
  }

  function cleanClickedLink(link) {
    if (!settings.limitTracking || !link?.href) return;
    try {
      const url = new URL(link.href, location.href);
      const isX = /^(?:[^.]+\.)?(?:x|twitter)\.com$/i.test(url.hostname);
      for (const key of [...url.searchParams.keys()]) {
        if (/^utm_/i.test(key) || ['twclid', 'ref_src', 'ref_url'].includes(key.toLowerCase())) {
          url.searchParams.delete(key);
        }
      }
      if (isX) {
        url.searchParams.delete('s');
        url.searchParams.delete('t');
      } else if (/^https?:$/.test(url.protocol)) {
        link.relList.add('noreferrer', 'noopener');
      }
      if (url.href !== link.href) link.href = url.href;
    } catch (_) {}
  }

  function installPrivacyGuards() {
    const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    try {
      const nativeFetch = page.fetch;
      if (typeof nativeFetch === 'function' && !nativeFetch.__cleanbirdPrivacyGuard) {
        const guardedFetch = function (...args) {
          if (settings.limitTracking && isPrivacyBlockingReady() && isTrackingRequest(args[0])) {
            recordBlocked('trackers');
            const ResponseCtor = page.Response || Response;
            return page.Promise.resolve(new ResponseCtor('{}', {
              status: 200,
              statusText: 'OK',
              headers: { 'Content-Type': 'application/json' }
            }));
          }
          return nativeFetch.apply(this, args);
        };
        guardedFetch.__cleanbirdPrivacyGuard = true;
        page.fetch = guardedFetch;
      }
    } catch (_) {}

    try {
      const navigatorPrototype = page.Navigator?.prototype;
      const nativeBeacon = navigatorPrototype?.sendBeacon;
      if (typeof nativeBeacon === 'function' && !nativeBeacon.__cleanbirdPrivacyGuard) {
        const guardedBeacon = function (url, data) {
          if (settings.limitTracking && isPrivacyBlockingReady() && isTrackingRequest(url)) {
            recordBlocked('trackers');
            return true;
          }
          return nativeBeacon.call(this, url, data);
        };
        guardedBeacon.__cleanbirdPrivacyGuard = true;
        navigatorPrototype.sendBeacon = guardedBeacon;
      }
    } catch (_) {}

    document.addEventListener('click', event => {
      const link = event.target?.closest?.('a[href]');
      if (link) cleanClickedLink(link);
    }, true);
  }

  function setFlag(key, enabled) {
    document.documentElement.toggleAttribute(`data-cleanbird-${key}`, enabled);
  }

  function applySettings() {
    for (const [key, value] of Object.entries(settings)) setFlag(key, value);
    injectStyles();
    ensureControls();
    applyCustomAppearance();
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
      html[data-cleanbird-hideGrok] button[aria-label="Grok" i],
      html[data-cleanbird-hideGrok] header[role="banner"] [data-testid*="grok" i],
      html[data-cleanbird-hideGrok] header[role="banner"] a[href^="/i/grok"],
      html[data-cleanbird-hideGrok] header[role="banner"] a[href^="/grok"] {
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

      html[data-cleanbird-compactSidebars] [data-cleanbird-account-holder="true"] {
        width: 108px !important;
        max-width: 108px !important;
      }

      html[data-cleanbird-compactSidebars] header[role="banner"] [data-testid="SideNav_AccountSwitcher_Button"] {
        width: 108px !important;
        max-width: 108px !important;
        justify-content: space-between !important;
      }

      html[data-cleanbird-compactSidebars] header[role="banner"] [data-testid="SideNav_AccountSwitcher_Button"] span {
        display: none !important;
      }

      @media (min-width: 1050px) {
        html[data-cleanbird-adaptiveWidth] [data-cleanbird-account-menu="true"] {
          width: min(360px, calc(var(--cleanbird-left-width) - 34px)) !important;
          min-width: 0 !important;
          max-width: calc(var(--cleanbird-left-width) - 34px) !important;
          box-sizing: border-box !important;
        }

        html[data-cleanbird-adaptiveWidth] [data-cleanbird-account-menu="true"] span {
          white-space: normal !important;
          overflow-wrap: anywhere !important;
        }
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
        box-sizing: border-box !important;
      }

      html[data-cleanbird-adaptiveWidth][data-cleanbird-right-visible] main [data-testid="sidebarColumn"] > div,
      html[data-cleanbird-adaptiveWidth][data-cleanbird-right-visible] main [data-testid="sidebarColumn"] > div > div,
      html[data-cleanbird-adaptiveWidth][data-cleanbird-right-visible] main [data-testid="sidebarColumn"] > div > div > div,
      html[data-cleanbird-adaptiveWidth][data-cleanbird-right-visible] main [data-testid="sidebarColumn"] > div > div > div > div,
      html[data-cleanbird-adaptiveWidth][data-cleanbird-right-visible] main [data-testid="sidebarColumn"] form[role="search"],
      html[data-cleanbird-adaptiveWidth][data-cleanbird-right-visible] main [data-testid="sidebarColumn"] section,
      html[data-cleanbird-adaptiveWidth][data-cleanbird-right-visible] main [data-testid="sidebarColumn"] aside {
        width: 100% !important;
        min-width: 0 !important;
        max-width: var(--cleanbird-sidebar-width) !important;
        box-sizing: border-box !important;
      }

      html[data-cleanbird-adaptiveWidth][data-cleanbird-right-visible] main [data-testid="sidebarColumn"] div {
        min-width: 0 !important;
        max-width: var(--cleanbird-sidebar-width) !important;
        box-sizing: border-box !important;
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

      html[data-cleanbird-adaptiveWidth] main [role="tablist"] [role="tab"] span {
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

      html[data-cleanbird-centerFeedTweets] [data-cleanbird-feed-tweet="true"] [data-testid="tweetText"] {
        text-align: center !important;
      }

      html[data-cleanbird-centerFeedImages] article[data-testid="tweet"] [data-cleanbird-centered-media="true"] {
        margin-left: auto !important;
        margin-right: auto !important;
        align-self: center !important;
      }

      html[data-cleanbird-centerFeedImages] article[data-testid="tweet"] [data-cleanbird-centered-media-parent="true"] {
        justify-content: center !important;
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

      html[data-cleanbird-fitVideos] article[data-testid="tweet"] [data-cleanbird-fit-video="true"] {
        height: var(--cleanbird-fit-video-height) !important;
        min-height: 0 !important;
        max-height: var(--cleanbird-fit-video-height) !important;
        padding-bottom: 0 !important;
        overflow: hidden !important;
        background: #000 !important;
      }

      html[data-cleanbird-fitVideos] article[data-testid="tweet"] [data-cleanbird-fit-video="true"] video {
        width: 100% !important;
        height: 100% !important;
        max-height: 100% !important;
        object-fit: contain !important;
        background: #000 !important;
      }

      html[data-cleanbird-reduceMotion] {
        scroll-behavior: auto !important;
      }

      html[data-cleanbird-reduceMotion] header[role="banner"] nav *,
      html[data-cleanbird-reduceMotion] header[role="banner"] nav *::before,
      html[data-cleanbird-reduceMotion] header[role="banner"] nav *::after,
      html[data-cleanbird-reduceMotion] article[data-testid="tweet"] *,
      html[data-cleanbird-reduceMotion] article[data-testid="tweet"] *::before,
      html[data-cleanbird-reduceMotion] article[data-testid="tweet"] *::after {
        animation-duration: .001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .001ms !important;
      }

      [data-cleanbird-hidden="true"] {
        display: none !important;
      }

      [data-cleanbird-post-back="true"] {
        border-radius: 9999px !important;
        cursor: pointer !important;
        transition: background-color .15s ease, color .15s ease, box-shadow .15s ease !important;
      }

      [data-cleanbird-post-back="true"]:hover {
        color: rgb(29, 155, 240) !important;
        background-color: rgba(29, 155, 240, .16) !important;
        box-shadow: 0 0 0 5px rgba(29, 155, 240, .08) !important;
      }

      [data-cleanbird-post-back="true"]:focus-visible {
        outline: 2px solid rgb(29, 155, 240) !important;
        outline-offset: 3px !important;
      }

      #cleanbird-post-back-overlay {
        position: fixed;
        z-index: 2147483000;
        width: 44px;
        height: 44px;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 9999px;
        color: transparent;
        background: transparent;
        cursor: pointer;
      }

      #cleanbird-post-back-overlay:hover {
        background-color: rgba(29, 155, 240, .16) !important;
        box-shadow: 0 0 0 5px rgba(29, 155, 240, .08) !important;
      }

      #cleanbird-post-back-overlay:focus-visible {
        outline: 2px solid rgb(29, 155, 240) !important;
        outline-offset: 3px !important;
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

      html[data-cleanbird-custom-header-logo] header[role="banner"] h1 a[href="/home"] svg {
        display: none !important;
      }

      html[data-cleanbird-custom-header-logo] header[role="banner"] h1 a[href="/home"]::after {
        content: "";
        display: block;
        width: 32px;
        height: 32px;
        background: var(--cleanbird-custom-header-logo) center / contain no-repeat;
      }

      #cleanbird-settings-button {
        display: grid;
        place-items: center;
        position: fixed;
        right: auto;
        top: auto;
        bottom: auto;
        left: auto;
        transform: none;
        z-index: 2147483646;
        width: 50px;
        height: 50px;
        padding: 6px;
        border: 1px solid var(--cleanbird-border);
        border-radius: 15px;
        color: #fff;
        background: #070a11;
        box-shadow: 0 5px 22px rgba(0,0,0,.28);
        font-size: 25px;
        line-height: 1;
        opacity: .58;
        transition: opacity .16s ease, box-shadow .16s ease, transform .16s ease, left .16s ease, top .16s ease;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }

      #cleanbird-settings-button[hidden] { display: none !important; }

      html[data-cleanbird-native-overlay] #cleanbird-settings-button {
        display: none !important;
      }

      #cleanbird-settings-button:hover,
      #cleanbird-settings-button:focus-visible {
        opacity: 1;
        transform: scale(1.06);
        outline: none;
        box-shadow: 0 7px 26px rgba(32,213,255,.24);
      }

      #cleanbird-settings-button[data-cleanbird-dragging="true"] {
        opacity: .92;
        transform: scale(1.03);
        transition: none;
        cursor: grabbing;
      }

      #cleanbird-settings-button .cleanbird-quick-icon {
        display: block;
        width: 34px;
        height: 34px;
        object-fit: contain;
        pointer-events: none;
      }

      [data-cleanbird-menu-item="true"] .cleanbird-menu-icon {
        display: block;
        width: 24px;
        height: 24px;
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

      #cleanbird-settings .cleanbird-quick-position-actions {
        padding: 0 20px 18px;
      }

      #cleanbird-settings .cleanbird-blocked-summary {
        margin: 12px 18px 6px;
        padding: 12px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 12px;
      }

      #cleanbird-settings .cleanbird-blocked-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }

      #cleanbird-settings .cleanbird-blocked-head strong,
      #cleanbird-settings .cleanbird-blocked-head span {
        display: block;
      }

      #cleanbird-settings .cleanbird-blocked-head span {
        margin-top: 3px;
        color: #8b98a5;
        font-size: 12px;
      }

      #cleanbird-settings .cleanbird-blocked-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      #cleanbird-settings .cleanbird-blocked-stat {
        padding: 10px 8px;
        border-radius: 10px;
        background: rgba(255,255,255,.035);
        text-align: center;
      }

      #cleanbird-settings .cleanbird-blocked-stat strong {
        display: block;
        overflow: hidden;
        color: #1d9bf0;
        font-size: 20px;
        font-variant-numeric: tabular-nums;
        text-overflow: ellipsis;
      }

      #cleanbird-settings .cleanbird-blocked-stat span {
        display: block;
        margin-top: 2px;
        color: #8b98a5;
        font-size: 11px;
      }

      #cleanbird-settings .cleanbird-appearance {
        margin: 12px 18px 6px;
        padding: 12px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 12px;
      }

      #cleanbird-settings .cleanbird-appearance-head {
        margin-bottom: 9px;
      }

      #cleanbird-settings .cleanbird-appearance-head strong,
      #cleanbird-settings .cleanbird-appearance-copy strong {
        display: block;
      }

      #cleanbird-settings .cleanbird-appearance-head span,
      #cleanbird-settings .cleanbird-appearance-copy span {
        display: block;
        margin-top: 3px;
        color: #8b98a5;
        font-size: 12px;
      }

      #cleanbird-settings .cleanbird-appearance-list {
        display: grid;
        gap: 7px;
      }

      #cleanbird-settings .cleanbird-appearance-row {
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        min-height: 54px;
        padding: 7px;
        border-radius: 10px;
        background: rgba(255,255,255,.035);
      }

      #cleanbird-settings .cleanbird-appearance-preview {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 10px;
        color: #8b98a5;
        background: #070a11;
        font-size: 9px;
      }

      #cleanbird-settings .cleanbird-appearance-preview img {
        display: block;
        width: 34px;
        height: 34px;
        object-fit: contain;
      }

      #cleanbird-settings .cleanbird-appearance-buttons {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
      }

      #cleanbird-settings .cleanbird-appearance-buttons button {
        padding: 6px 10px;
        font-size: 12px;
      }

      @media (max-width: 540px) {
        #cleanbird-settings .cleanbird-appearance-row {
          grid-template-columns: 46px minmax(0, 1fr);
        }

        #cleanbird-settings .cleanbird-appearance-buttons {
          grid-column: 2;
          justify-content: flex-start;
        }
      }

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
      settingsButton.textContent = '⚙';
      settingsButton.title = 'Cleanbird settings';
      settingsButton.setAttribute('aria-label', 'Open Cleanbird settings');
      installQuickButtonDragging(settingsButton);
      document.body.appendChild(settingsButton);
    }
    updateQuickButtonIcon();
    const appReady = Boolean(document.querySelector('main, [data-testid="primaryColumn"]'));
    const nativeOverlayOpen = document.documentElement.hasAttribute('data-cleanbird-native-overlay');
    settingsButton.hidden = !settings.floatingSettings || !appReady || nativeOverlayOpen;
    if (!settingsButton.dataset.cleanbirdDragging) applyQuickButtonPosition();

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'cleanbird-settings';
      panel.hidden = true;
      panel.innerHTML = `
        <section class="cleanbird-card" role="dialog" aria-modal="true" aria-label="Cleanbird settings">
          <header class="cleanbird-head">
            <div><h2>Cleanbird settings</h2><p>Choose what X gets to show you.</p></div>
            <div class="cleanbird-actions">
              <button type="button" data-action="reset">Reset</button>
              <button type="button" data-action="close">Done</button>
            </div>
          </header>
          <section class="cleanbird-blocked-summary">
            <div class="cleanbird-blocked-head">
              <div>
                <strong>Blocked by Cleanbird</strong>
                <span>Totals since the last reset.</span>
              </div>
              <button type="button" data-action="reset-blocked-counts">Reset</button>
            </div>
            <div class="cleanbird-blocked-grid">
              <div class="cleanbird-blocked-stat"><strong data-blocked-count="ads">0</strong><span>Ads</span></div>
              <div class="cleanbird-blocked-stat"><strong data-blocked-count="clutter">0</strong><span>Grok / clutter</span></div>
              <div class="cleanbird-blocked-stat"><strong data-blocked-count="trackers">0</strong><span>Trackers</span></div>
            </div>
          </section>
          <section class="cleanbird-appearance">
            <div class="cleanbird-appearance-head">
              <strong>Custom appearance</strong>
              <span>Optional images stored only in your userscript manager.</span>
            </div>
            <div class="cleanbird-appearance-list"></div>
          </section>
          <div class="cleanbird-tab-order">
            <div class="cleanbird-tab-order-head">
              <div>
                <strong>Home tab order</strong>
                <span>Move every detected tab up or down in this list.</span>
              </div>
              <button type="button" data-action="reset-tabs">Use X order</button>
            </div>
            <div class="cleanbird-tab-list"></div>
          </div>
          <div class="cleanbird-options"></div>
          <div class="cleanbird-quick-position-actions">
            <button type="button" data-action="reset-quick-position">Reset quick button to bottom right</button>
          </div>
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

      const appearanceList = panel.querySelector('.cleanbird-appearance-list');
      for (const field of CUSTOM_IMAGE_FIELDS) {
        const row = document.createElement('div');
        row.className = 'cleanbird-appearance-row';
        row.dataset.appearanceRow = field.key;
        row.innerHTML = `
          <div class="cleanbird-appearance-preview" data-appearance-preview="${field.key}"></div>
          <div class="cleanbird-appearance-copy">
            <strong></strong>
            <span></span>
          </div>
          <div class="cleanbird-appearance-buttons">
            <button type="button" data-choose-image="${field.key}">Choose</button>
            <button type="button" data-clear-image="${field.key}">Use default</button>
          </div>
          <input type="file" data-appearance-file="${field.key}" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>`;
        row.querySelector('strong').textContent = field.label;
        row.querySelector('.cleanbird-appearance-copy span').textContent = field.help;
        appearanceList.appendChild(row);
      }

      panel.addEventListener('change', event => {
        const input = event.target.closest('input[data-setting]');
        if (input) saveSetting(input.dataset.setting, input.checked);
        const imageInput = event.target.closest('input[data-appearance-file]');
        if (imageInput) {
          importCustomImage(imageInput.dataset.appearanceFile, imageInput.files?.[0]);
          imageInput.value = '';
        }
      });
      panel.addEventListener('click', event => {
        if (event.target === panel || event.target.closest('[data-action="close"]')) closePanel();
        if (event.target.closest('[data-action="reset"]')) resetSettings();
        if (event.target.closest('[data-action="reset-blocked-counts"]')) resetBlockedCounts();
        if (event.target.closest('[data-action="reset-tabs"]')) resetTabOrder();
        if (event.target.closest('[data-action="reset-quick-position"]')) resetQuickButtonPosition();
        const chooseImage = event.target.closest('[data-choose-image]');
        if (chooseImage) panel.querySelector(`input[data-appearance-file="${chooseImage.dataset.chooseImage}"]`)?.click();
        const clearImage = event.target.closest('[data-clear-image]');
        if (clearImage) clearCustomImage(clearImage.dataset.clearImage);
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
    renderBlockedCounts();
    renderCustomAppearance();
    tabEditorSignature = '';
    renderTabOrderEditor();
    document.documentElement.setAttribute('data-cleanbird-panel-open', 'true');
    panel.hidden = false;
  }

  function closePanel() {
    if (panel) panel.hidden = true;
    document.documentElement.removeAttribute('data-cleanbird-panel-open');
  }

  function clampQuickButtonPoint(x, y) {
    const width = settingsButton?.offsetWidth || 50;
    const height = settingsButton?.offsetHeight || 50;
    const maxX = Math.max(QUICK_BUTTON_INSET, window.innerWidth - width - QUICK_BUTTON_INSET);
    const maxY = Math.max(QUICK_BUTTON_INSET, window.innerHeight - height - QUICK_BUTTON_INSET);
    return {
      x: Math.max(QUICK_BUTTON_INSET, Math.min(maxX, x)),
      y: Math.max(QUICK_BUTTON_INSET, Math.min(maxY, y)),
      maxX,
      maxY
    };
  }

  function setQuickButtonPoint(x, y) {
    if (!settingsButton) return;
    const point = clampQuickButtonPoint(x, y);
    settingsButton.style.left = `${Math.round(point.x)}px`;
    settingsButton.style.top = `${Math.round(point.y)}px`;
    settingsButton.style.right = 'auto';
    settingsButton.style.bottom = 'auto';
  }

  function applyQuickButtonPosition() {
    if (!settingsButton) return;
    const width = settingsButton.offsetWidth || 50;
    const height = settingsButton.offsetHeight || 50;
    const min = QUICK_BUTTON_INSET;
    const maxX = Math.max(min, window.innerWidth - width - min);
    const maxY = Math.max(min, window.innerHeight - height - min);
    const ratio = Math.max(0, Math.min(1, quickButtonPosition.ratio));
    let x = min + (maxX - min) * ratio;
    let y = min + (maxY - min) * ratio;

    if (quickButtonPosition.edge === 'left') x = min;
    if (quickButtonPosition.edge === 'right') x = maxX;
    if (quickButtonPosition.edge === 'top') y = min;
    if (quickButtonPosition.edge === 'bottom') y = maxY;
    setQuickButtonPoint(x, y);
  }

  function snapQuickButtonToNearestEdge() {
    if (!settingsButton) return;
    const rect = settingsButton.getBoundingClientRect();
    const x = Number.parseFloat(settingsButton.style.left) || rect.left;
    const y = Number.parseFloat(settingsButton.style.top) || rect.top;
    const width = settingsButton.offsetWidth || 50;
    const height = settingsButton.offsetHeight || 50;
    const distances = {
      left: x,
      right: window.innerWidth - x - width,
      top: y,
      bottom: window.innerHeight - y - height
    };
    const edge = Object.keys(distances).reduce((nearest, candidate) =>
      distances[candidate] < distances[nearest] ? candidate : nearest
    );
    const point = clampQuickButtonPoint(x, y);
    const verticalRange = Math.max(1, point.maxY - QUICK_BUTTON_INSET);
    const horizontalRange = Math.max(1, point.maxX - QUICK_BUTTON_INSET);
    const ratio = edge === 'left' || edge === 'right'
      ? (point.y - QUICK_BUTTON_INSET) / verticalRange
      : (point.x - QUICK_BUTTON_INSET) / horizontalRange;
    saveQuickButtonPosition({ edge, ratio });
    applyQuickButtonPosition();
  }

  function installQuickButtonDragging(button) {
    let drag = null;

    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const rect = button.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false
      };
      button.setPointerCapture(event.pointerId);
    });

    button.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
      drag.moved = true;
      button.dataset.cleanbirdDragging = 'true';
      event.preventDefault();
      setQuickButtonPoint(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    });

    const finishDrag = event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const moved = drag.moved;
      drag = null;
      delete button.dataset.cleanbirdDragging;
      try { button.releasePointerCapture(event.pointerId); } catch (_) {}
      if (moved) {
        suppressQuickButtonClick = true;
        snapQuickButtonToNearestEdge();
        setTimeout(() => { suppressQuickButtonClick = false; }, 0);
      }
    };

    button.addEventListener('pointerup', finishDrag);
    button.addEventListener('pointercancel', finishDrag);
    button.addEventListener('click', event => {
      if (suppressQuickButtonClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      openPanel();
    });
  }

  function resetQuickButtonPosition() {
    saveQuickButtonPosition(QUICK_BUTTON_DEFAULT);
    applyQuickButtonPosition();
  }

  function importCustomImage(key, file) {
    if (!CUSTOM_IMAGE_FIELDS.some(field => field.key === key) || !file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      window.alert('Choose a PNG, JPG, WebP, or SVG image.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      window.alert('Choose an image smaller than 3 MB.');
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const value = typeof reader.result === 'string' && reader.result.startsWith('data:image/')
        ? reader.result
        : '';
      if (!value) return;
      customImages[key] = value;
      try { GM_setValue(`customImage.${key}`, value); } catch (_) {}
      applyCustomAppearance();
      refreshCustomMenuItem();
      renderCustomAppearance();
    });
    reader.readAsDataURL(file);
  }

  function clearCustomImage(key) {
    if (!CUSTOM_IMAGE_FIELDS.some(field => field.key === key)) return;
    customImages[key] = '';
    try { GM_setValue(`customImage.${key}`, ''); } catch (_) {}
    applyCustomAppearance();
    refreshCustomMenuItem();
    renderCustomAppearance();
  }

  function renderCustomAppearance() {
    if (!panel) return;
    for (const field of CUSTOM_IMAGE_FIELDS) {
      const preview = panel.querySelector(`[data-appearance-preview="${field.key}"]`);
      const clear = panel.querySelector(`[data-clear-image="${field.key}"]`);
      if (!preview || !clear) continue;
      preview.replaceChildren();
      if (customImages[field.key]) {
        const image = document.createElement('img');
        image.src = customImages[field.key];
        image.alt = '';
        preview.appendChild(image);
        clear.disabled = false;
      } else {
        const text = document.createElement('span');
        text.textContent = 'Default';
        preview.appendChild(text);
        clear.disabled = true;
      }
    }
  }

  function updateQuickButtonIcon() {
    if (!settingsButton) return;
    const source = customImages.quickIcon;
    const current = settingsButton.querySelector('.cleanbird-quick-icon');
    if (source) {
      if (current?.src === source) return;
      const image = document.createElement('img');
      image.className = 'cleanbird-quick-icon';
      image.src = source;
      image.alt = '';
      settingsButton.replaceChildren(image);
    } else if (current || settingsButton.textContent !== '⚙') {
      settingsButton.textContent = '⚙';
    }
  }

  function applyCustomAppearance() {
    const root = document.documentElement;
    const headerLogo = customImages.headerLogo;
    root.toggleAttribute('data-cleanbird-custom-header-logo', Boolean(headerLogo));
    if (headerLogo) {
      root.style.setProperty('--cleanbird-custom-header-logo', `url("${headerLogo}")`);
    } else {
      root.style.removeProperty('--cleanbird-custom-header-logo');
    }

    let favicon = document.querySelector('link#cleanbird-custom-favicon');
    if (customImages.favicon) {
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.id = 'cleanbird-custom-favicon';
        favicon.rel = 'icon';
        (document.head || root).appendChild(favicon);
      }
      favicon.href = customImages.favicon;
    } else {
      favicon?.remove();
    }

    updateQuickButtonIcon();
  }

  function applyCustomMenuIcon(item) {
    if (!customImages.menuIcon || !item) return;
    const oldIcon = item.querySelector('svg');
    if (!oldIcon) return;
    const image = document.createElement('img');
    image.className = 'cleanbird-menu-icon';
    image.src = customImages.menuIcon;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    oldIcon.replaceWith(image);
  }

  function refreshCustomMenuItem() {
    for (const item of document.querySelectorAll('[data-cleanbird-menu-item="true"]')) item.remove();
    updateMoreMenu();
  }

  function resetSettings() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      try { if (typeof GM_setValue === 'function') GM_setValue(key, value); } catch (_) {}
    }
    settings = { ...DEFAULTS };
    saveTabOrder([]);
    resetQuickButtonPosition();
    applySettings();
    openPanel();
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

  function normalizedText(element) {
    return String(element?.textContent || '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isVisibleElement(element) {
    if (!element || !element.isConnected || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function updateOverlayState() {
    const selectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[role="menu"]',
      '[data-testid*="photoViewer" i]',
      '[data-testid*="sheetDialog" i]',
      '[data-testid*="confirmationSheet" i]'
    ];
    const visibleOverlays = [...document.querySelectorAll(selectors.join(','))].filter(element =>
      !element.closest('#cleanbird-settings') && isVisibleElement(element)
    );
    const nativeOverlayOpen = Boolean(document.fullscreenElement) || visibleOverlays.length > 0;
    document.documentElement.toggleAttribute('data-cleanbird-native-overlay', nativeOverlayOpen);
  }

  function updateAccountPopup() {
    for (const oldMenu of document.querySelectorAll('[data-cleanbird-account-menu="true"]')) {
      delete oldMenu.dataset.cleanbirdAccountMenu;
    }

    const candidates = document.querySelectorAll(
      '[role="menu"], [data-testid="Dropdown"], [data-testid*="accountSwitcher" i]'
    );
    for (const candidate of candidates) {
      const text = normalizedText(candidate);
      if (text.includes('add an existing account') && text.includes('log out')) {
        candidate.dataset.cleanbirdAccountMenu = 'true';
      }
    }
  }

  function updatePremiumNags() {
    for (const oldNag of document.querySelectorAll('[data-cleanbird-premium-nag="true"]')) {
      showElement(oldNag);
      delete oldNag.dataset.cleanbirdPremiumNag;
    }
    if (!settings.hidePremium) return;

    const primary = document.querySelector('main [data-testid="primaryColumn"]');
    if (!primary) return;
    const markers = [...primary.querySelectorAll('span, strong, button, [role="button"]')].filter(element => {
      const text = normalizedText(element);
      return text === 'get verified' || (text.includes('verified yet') && (
        text.includes("you aren't") || text.includes('you arent') ||
        text.includes('you aren’t') || text.includes('you are not')
      ));
    });

    for (const marker of markers) {
      let node = marker.parentElement;
      while (node && node !== primary) {
        const text = normalizedText(node);
        const controls = [...node.querySelectorAll('button, [role="button"]')];
        const hasVerificationCopy = text.includes('verified yet') &&
          text.includes('get verified') && text.includes('stand out');
        const hasGetVerifiedControl = controls.some(control => normalizedText(control) === 'get verified');
        const hasCloseControl = controls.some(control => {
          const label = `${control.getAttribute('aria-label') || ''} ${control.getAttribute('title') || ''}`
            .trim()
            .toLowerCase();
          return label.includes('close') || label.includes('dismiss') || normalizedText(control) === '×';
        });
        if (hasVerificationCopy && (hasCloseControl || hasGetVerifiedControl)) {
          node.dataset.cleanbirdPremiumNag = 'true';
          recordBlockedElement('clutter', node);
          hideElement(node);
          break;
        }
        node = node.parentElement;
      }
    }
  }

  function isPostRoute(route) {
    return /\/status\/\d+(?:[/?#]|$)/i.test(String(route || ''));
  }

  function rememberNonPostRoute(route) {
    if (!route || !String(route).startsWith('/') || isPostRoute(route)) return;
    try { sessionStorage.setItem(LAST_NON_POST_ROUTE_KEY, route); } catch (_) {}
  }

  function loadBackFallbackRoute() {
    return loadRememberedNonPostRoute() || '/home';
  }

  function loadRememberedNonPostRoute() {
    try {
      const route = sessionStorage.getItem(LAST_NON_POST_ROUTE_KEY) || '';
      if (route.startsWith('/') && !isPostRoute(route)) return route;
    } catch (_) {}
    return '';
  }

  function isLikelyPostBackControl(control) {
    if (!control || control.closest('[role="dialog"], [aria-modal="true"]')) return false;
    if (control.dataset.cleanbirdPostBack === 'true') return true;
    const aria = (control.getAttribute('aria-label') || '').toLowerCase();
    const testId = (control.getAttribute('data-testid') || '').toLowerCase();
    return aria.includes('back') || testId.includes('back');
  }

  function findPostHeading() {
    const root = document.querySelector('main, [role="main"]') || document.body;
    if (!root) return null;
    const headings = [...root.querySelectorAll('h1, h2, h3, [role="heading"]')]
      .filter(heading => normalizedText(heading) === 'post' && isVisibleElement(heading))
      .sort((first, second) => first.getBoundingClientRect().top - second.getBoundingClientRect().top);
    return headings[0] || null;
  }

  function findTopPageHeading() {
    const root = document.querySelector('main, [role="main"]');
    if (!root) return null;
    return [...root.querySelectorAll('h1, h2, h3, [role="heading"]')]
      .filter(heading => {
        if (!isVisibleElement(heading) || heading.closest('article[data-testid="tweet"]')) return false;
        const rect = heading.getBoundingClientRect();
        return normalizedText(heading) && rect.top < 260;
      })
      .sort((first, second) => {
        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        return firstRect.top - secondRect.top || firstRect.left - secondRect.left;
      })[0] || null;
  }

  function findPostBackArrow(heading) {
    const headingRect = heading.getBoundingClientRect();
    const root = document.querySelector('main, [role="main"]') || document.body;
    return [...root.querySelectorAll('svg')]
      .filter(svg => {
        if (!isVisibleElement(svg)) return false;
        const rect = svg.getBoundingClientRect();
        const verticalDistance = Math.abs(
          (rect.top + rect.height / 2) - (headingRect.top + headingRect.height / 2)
        );
        return rect.width > 0 && rect.height > 0 && rect.width <= 52 && rect.height <= 52 &&
          verticalDistance <= 38 && rect.right <= headingRect.left + 8 &&
          headingRect.left - rect.right <= 180;
      })
      .sort((first, second) => {
        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        return (headingRect.left - firstRect.right) - (headingRect.left - secondRect.right);
      })[0] || null;
  }

  function findNativePageBackControl() {
    return [...document.querySelectorAll('button, a, [role="button"]')]
      .filter(control => {
        if (control.id === 'cleanbird-post-back-overlay' || !isVisibleElement(control) ||
            control.closest('[role="dialog"], [aria-modal="true"]')) return false;
        const aria = (control.getAttribute('aria-label') || '').toLowerCase();
        const testId = (control.getAttribute('data-testid') || '').toLowerCase();
        const rect = control.getBoundingClientRect();
        const isBack = aria.includes('back') || testId.includes('back');
        const isTopLeftClose = aria === 'close' && rect.left < 100;
        return (isBack || isTopLeftClose) && rect.width > 0 && rect.height > 0 &&
          rect.width <= 72 && rect.height <= 72 && rect.top < 260;
      })
      .sort((first, second) => {
        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        return firstRect.top - secondRect.top || firstRect.left - secondRect.left;
      })[0] || null;
  }

  function findCurrentBackTarget() {
    const heading = findPostHeading() || findTopPageHeading();
    const arrow = heading ? findPostBackArrow(heading) : null;
    const nativeControl = arrow?.closest('button, a, [role="button"]') || findNativePageBackControl();
    return { heading, arrow, nativeControl };
  }

  function positionPostBackOverlay(overlay, heading, arrow) {
    const headingRect = heading.getBoundingClientRect();
    const arrowRect = arrow?.getBoundingClientRect();
    const centerX = arrowRect
      ? arrowRect.left + arrowRect.width / 2
      : Math.max(22, headingRect.left - 68);
    const centerY = arrowRect
      ? arrowRect.top + arrowRect.height / 2
      : headingRect.top + headingRect.height / 2;
    overlay.style.left = `${Math.round(centerX - 22)}px`;
    overlay.style.top = `${Math.round(centerY - 22)}px`;
  }

  function positionBackOverlayOverControl(overlay, control) {
    const rect = control.getBoundingClientRect();
    overlay.style.left = `${Math.round(rect.left + rect.width / 2 - 22)}px`;
    overlay.style.top = `${Math.round(rect.top + rect.height / 2 - 22)}px`;
  }

  function ensurePostBackOverlay() {
    let overlay = document.querySelector('#cleanbird-post-back-overlay');
    for (const oldControl of document.querySelectorAll('[data-cleanbird-post-back="true"]:not(#cleanbird-post-back-overlay)')) {
      delete oldControl.dataset.cleanbirdPostBack;
    }
    const { heading, arrow, nativeControl } = findCurrentBackTarget();
    if (!nativeControl && (!heading || !isPostRoute(`${location.pathname}${location.search}`))) {
      overlay?.remove();
      return;
    }

    if (nativeControl) {
      nativeControl.dataset.cleanbirdPostBack = 'true';
      if (!nativeControl.getAttribute('title')) nativeControl.setAttribute('title', 'Back');
    }

    if (!overlay) {
      overlay = document.createElement('button');
      overlay.id = 'cleanbird-post-back-overlay';
      overlay.type = 'button';
      overlay.setAttribute('aria-label', 'Back');
      overlay.setAttribute('title', 'Back');
      overlay.dataset.cleanbirdPostBack = 'true';
      document.body.append(overlay);
    }
    if (nativeControl) positionBackOverlayOverControl(overlay, nativeControl);
    else positionPostBackOverlay(overlay, heading, arrow);
  }

  function updatePostBackControl() {
    ensurePostBackOverlay();
  }

  function installBackNavigationGuard() {
    const clickInternalRoute = route => {
      const link = [...document.querySelectorAll('a[href]')].find(candidate => {
        try {
          const url = new URL(candidate.href, location.href);
          return url.origin === location.origin && `${url.pathname}${url.search}` === route;
        } catch (_) {
          return false;
        }
      });
      if (!link) return false;
      link.click();
      return true;
    };

    document.addEventListener('click', event => {
      const route = `${location.pathname}${location.search}`;
      if (isPostRoute(route)) return;
      const target = event.target;
      const link = target?.closest?.('a[href]');
      const postCard = target?.closest?.('article[data-testid="tweet"]');
      let opensPost = Boolean(postCard);
      if (link) {
        try {
          const url = new URL(link.href, location.href);
          opensPost ||= url.origin === location.origin && isPostRoute(`${url.pathname}${url.search}`);
        } catch (_) {}
      }
      if (opensPost) rememberNonPostRoute(route);
    }, true);

    document.addEventListener('click', event => {
      const control = event.target?.closest?.('button, a, [role="button"]');
      if (!isLikelyPostBackControl(control)) return;

      const onPost = isPostRoute(`${location.pathname}${location.search}`);
      const fallback = loadBackFallbackRoute();
      const rememberedRoute = loadRememberedNonPostRoute();
      const currentRoute = `${location.pathname}${location.search}${location.hash}`;

      clearTimeout(backNavigationTimer);

      if (control.id !== 'cleanbird-post-back-overlay') {
        backNavigationTimer = setTimeout(() => {
          if (`${location.pathname}${location.search}${location.hash}` !== currentRoute) return;
          if (onPost && fallback !== currentRoute && clickInternalRoute(fallback)) return;
          if (history.length > 1) history.back();
        }, 650);
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const { nativeControl } = findCurrentBackTarget();
      if (nativeControl) {
        nativeControl.click();
        return;
      }

      if (history.length > 1) history.back();
      else if (onPost && rememberedRoute) clickInternalRoute(fallback);

      backNavigationTimer = setTimeout(() => {
        const routeAfterAttempt = `${location.pathname}${location.search}${location.hash}`;
        if (routeAfterAttempt !== currentRoute) return;
        if (onPost && fallback !== currentRoute) clickInternalRoute(fallback);
      }, 650);
    }, true);
  }

  function isHomeSortMenuOpen() {
    return [...document.querySelectorAll('[role="menu"]')].some(menu => {
      if (!isVisibleElement(menu)) return false;
      const text = normalizedText(menu);
      return text.includes('sort by');
    });
  }

  function updateNavigation() {
    const header = document.querySelector('header[role="banner"]');
    if (!header) return;
    for (const [key, paths] of Object.entries(NAV_RULES)) {
      for (const path of paths) {
        for (const link of header.querySelectorAll(`a[href^="${path}"]`)) {
          const item = link.closest('nav a, header a') || link;
          if (settings[key]) {
            if (key === 'hideGrok' || key === 'hideChat' || key === 'hidePremium') {
              recordBlockedElement('clutter', item);
            }
            hideElement(item);
          } else {
            showElement(item);
          }
        }
      }
    }
  }

  function updateMoreMenu() {
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      const items = [...menu.querySelectorAll('[role="menuitem"], a[href]')];
      for (const oldItem of menu.querySelectorAll('[data-cleanbird-premium-menu="true"]')) {
        showElement(oldItem);
        delete oldItem.dataset.cleanbirdPremiumMenu;
      }
      if (settings.hidePremium) {
        const menuEntries = [...new Set(items.map(item => item.closest('[role="menuitem"]') || item))];
        for (const item of menuEntries) {
          const link = item.matches('a[href]') ? item : item.querySelector('a[href]');
          const href = link?.getAttribute('href') || '';
          const text = normalizedText(item);
          if (href.startsWith('/i/premium') || href.startsWith('/i/verified-orgs') || text.includes('premium business')) {
            item.dataset.cleanbirdPremiumMenu = 'true';
            recordBlockedElement('clutter', item);
            hideElement(item);
          }
        }
      }

      if (menu.querySelector('[data-cleanbird-menu-item="true"]')) continue;
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
      if (label) label.textContent = 'Cleanbird settings';

      applyCustomMenuIcon(item);

      const open = event => {
        event.preventDefault();
        event.stopPropagation();
        const menu = item.closest('[role="menu"]');
        if (menu) {
          menu.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true
          }));
        }
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

    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const labels = [...article.querySelectorAll('span')]
        .map(span => (span.textContent || '').trim().toLowerCase())
        .filter(Boolean);
      const hasPromotedIndicator = Boolean(article.querySelector('[data-testid*="promoted" i]')) ||
        labels.some(label => label === 'promoted' || label === 'sponsored' || label === 'ad');
      if (hasPromotedIndicator) {
        article.dataset.cleanbirdAd = 'true';
        recordBlockedElement('ads', article);
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

  function updateCenteredFeedTweets() {
    for (const article of document.querySelectorAll('[data-cleanbird-feed-tweet="true"]')) {
      delete article.dataset.cleanbirdFeedTweet;
    }
    if (isPostRoute(`${location.pathname}${location.search}`)) return;

    const primary = document.querySelector('main [data-testid="primaryColumn"]');
    if (!primary) return;
    for (const article of primary.querySelectorAll('article[data-testid="tweet"]')) {
      article.dataset.cleanbirdFeedTweet = 'true';
    }
  }

  function updateCenteredFeedMedia() {
    const centeredMedia = new Set();
    const centeredParents = new Set();

    const commonAncestor = elements => {
      let common = elements[0] || null;
      while (common && !elements.every(element => common.contains(element))) {
        common = common.parentElement;
      }
      return common;
    };

    if (settings.centerFeedImages) {
      const primary = document.querySelector('main [data-testid="primaryColumn"]');
      for (const article of primary?.querySelectorAll('article[data-testid="tweet"]') || []) {
        const photos = [...article.querySelectorAll('[data-testid="tweetPhoto"]')]
          .filter(photo => photo.closest('article[data-testid="tweet"]') === article);
        let candidate = commonAncestor(photos);
        if (!candidate || candidate === article) continue;

        let node = candidate;
        let widerParent;
        for (let depth = 0; depth < 8; depth += 1) {
          const parent = node.parentElement;
          if (!parent || parent === article || parent.closest('article[data-testid="tweet"]') !== article) break;

          const nodeWidth = node.getBoundingClientRect().width;
          const parentWidth = parent.getBoundingClientRect().width;
          const containsPostContent = Boolean(parent.querySelector(
            '[data-testid="tweetText"], [data-testid="User-Name"], [role="group"]'
          ));
          if (nodeWidth > 0 && parentWidth > nodeWidth + 8) {
            widerParent = parent;
            if (!containsPostContent) centeredParents.add(parent);
            break;
          }

          if (containsPostContent) break;

          candidate = parent;
          node = parent;
        }

        if (!widerParent) continue;
        candidate.dataset.cleanbirdCenteredMedia = 'true';
        if (centeredParents.has(widerParent)) widerParent.dataset.cleanbirdCenteredMediaParent = 'true';
        centeredMedia.add(candidate);
      }
    }

    for (const oldMedia of document.querySelectorAll('[data-cleanbird-centered-media="true"]')) {
      if (!centeredMedia.has(oldMedia)) delete oldMedia.dataset.cleanbirdCenteredMedia;
    }
    for (const oldParent of document.querySelectorAll('[data-cleanbird-centered-media-parent="true"]')) {
      if (!centeredParents.has(oldParent)) delete oldParent.dataset.cleanbirdCenteredMediaParent;
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
      const isTranslateControl = testId.includes('translate') || aria.includes('translate') ||
        normalizedText(item).includes('translate');
      const isGrok = settings.hideGrok && !isTranslateControl && (
        testId.includes('grok') || aria.includes('grok') || href.includes('/grok')
      );
      const isChat = settings.hideChat && (
        testId === 'dmdrawer' || testId.includes('chat-drawer') ||
        aria === 'chat' || href === '/i/chat' || href === '/messages'
      );
      if (isGrok || isChat) {
        item.dataset.cleanbirdFloatingClutter = 'true';
        recordBlockedElement('clutter', item);
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

  function installAutoplayGuard() {
    document.addEventListener('click', event => {
      if (!settings.stopAutoplay) return;
      for (const video of document.querySelectorAll('video')) {
        const rect = video.getBoundingClientRect();
        if (
          event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom
        ) {
          userStartedVideos.add(video);
          break;
        }
      }
    }, true);

    document.addEventListener('keydown', event => {
      if (!settings.stopAutoplay || !['Enter', ' '].includes(event.key)) return;
      const target = event.target;
      const player = target?.closest?.('[data-testid="videoPlayer"], [data-testid="videoComponent"]');
      const video = target?.tagName === 'VIDEO' ? target : player?.querySelector('video');
      if (video) userStartedVideos.add(video);
    }, true);

    document.addEventListener('play', event => {
      const video = event.target;
      if (!settings.stopAutoplay || video?.tagName !== 'VIDEO' || userStartedVideos.has(video)) return;
      video.autoplay = false;
      video.removeAttribute('autoplay');
      video.pause();
    }, true);

    document.addEventListener('pause', event => {
      if (event.target?.tagName === 'VIDEO') userStartedVideos.delete(event.target);
    }, true);
  }

  function stopAutoplay() {
    if (!settings.stopAutoplay) return;
    for (const video of document.querySelectorAll('video')) {
      if (userStartedVideos.has(video)) continue;
      video.autoplay = false;
      video.removeAttribute('autoplay');
      if (!video.paused) video.pause();
    }
  }

  function fitVideosToViewport() {
    const activePlayers = new Set();
    const maximumHeight = Math.max(320, window.innerHeight - 220);

    if (settings.fitVideos) {
      for (const video of document.querySelectorAll('article[data-testid="tweet"] video')) {
        const player = video.closest('[data-testid="videoPlayer"]') || video.parentElement;
        if (!player) continue;

        if (!video.dataset.cleanbirdFitListener) {
          video.dataset.cleanbirdFitListener = 'true';
          video.addEventListener('loadedmetadata', queueScan, { once: true });
        }

        const bounds = player.getBoundingClientRect();
        const ratio = video.videoWidth > 0 && video.videoHeight > 0
          ? video.videoWidth / video.videoHeight
          : Number(player.dataset.cleanbirdVideoRatio) || 0;
        if (ratio) player.dataset.cleanbirdVideoRatio = String(ratio);

        const naturalHeight = ratio ? bounds.width / ratio : bounds.height;
        const shouldFit = naturalHeight > maximumHeight + 1 ||
          (!ratio && player.dataset.cleanbirdFitVideo === 'true');
        if (!shouldFit) continue;

        activePlayers.add(player);
        player.dataset.cleanbirdFitVideo = 'true';
        player.style.setProperty('--cleanbird-fit-video-height', `${Math.round(maximumHeight)}px`);
      }
    }

    for (const player of document.querySelectorAll('[data-cleanbird-fit-video="true"]')) {
      if (activePlayers.has(player)) continue;
      delete player.dataset.cleanbirdFitVideo;
      delete player.dataset.cleanbirdVideoRatio;
      player.style.removeProperty('--cleanbird-fit-video-height');
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
      getComputedStyle(sidebar).display !== 'none'
    );
    root.toggleAttribute('data-cleanbird-right-visible', sidebarVisible);

    if (!settings.adaptiveWidth) {
      if (responsiveLayoutSignature) {
        responsiveLayoutSignature = '';
        root.style.removeProperty('--cleanbird-feed-width');
        root.style.removeProperty('--cleanbird-sidebar-width');
        root.style.removeProperty('--cleanbird-left-width');
        root.style.removeProperty('--cleanbird-main-width');
      }
      return;
    }

    const viewport = window.innerWidth;
    const scale = (minimum, fluid, maximum) => Math.max(minimum, Math.min(maximum, fluid));
    const viewportGutter = viewport >= 1200 ? scale(32, viewport * 0.025, 48) : 0;
    const leftWidth = viewport < 1050
      ? 88
      : settings.compactSidebars
        ? scale(225, viewport * 0.132, 285)
        : scale(260, viewport * 0.16, 340);
    const availableMain = Math.max(600, window.innerWidth - leftWidth - viewportGutter);
    const columnGap = sidebarVisible ? scale(16, viewport * 0.014, 30) : 0;
    const sidebarWidth = sidebarVisible
      ? (settings.compactSidebars
          ? scale(350, viewport * 0.2, 420)
          : scale(380, viewport * 0.22, 480))
      : 0;
    const feedWidth = sidebarVisible
      ? Math.max(600, availableMain - sidebarWidth - columnGap)
      : Math.max(600, availableMain);
    const mainWidth = feedWidth + sidebarWidth + columnGap;

    const nextSignature = [feedWidth, sidebarWidth, leftWidth, mainWidth]
      .map(value => Math.round(value))
      .join(':');
    if (nextSignature === responsiveLayoutSignature) return;
    responsiveLayoutSignature = nextSignature;

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
    const order = [
      ...tabOrder.filter(key => present.has(key)),
      ...discoveredOrder.filter(key => !tabOrder.includes(key))
    ];
    if (settings.forYouLast && order.includes('for you')) {
      return [...order.filter(key => key !== 'for you'), 'for you'];
    }
    return order;
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
      const up = document.createElement('button');
      const down = document.createElement('button');
      up.type = down.type = 'button';
      up.textContent = '↑';
      down.textContent = '↓';
      up.title = `Move ${name.textContent} up`;
      down.title = `Move ${name.textContent} down`;
      up.setAttribute('aria-label', up.title);
      down.setAttribute('aria-label', down.title);
      up.dataset.tabKey = down.dataset.tabKey = key;
      up.dataset.tabMove = '-1';
      down.dataset.tabMove = '1';
      up.disabled = index === 0;
      down.disabled = index === order.length - 1;
      buttons.append(up, down);
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
    if (settings.forYouLast && (key === 'for you' || order[target] === 'for you')) {
      settings.forYouLast = false;
      try { GM_setValue('forYouLast', false); } catch (_) {}
      const input = panel?.querySelector('input[data-setting="forYouLast"]');
      if (input) input.checked = false;
    }
    [order[index], order[target]] = [order[target], order[index]];
    persistVisibleTabOrder(order);
    reorderHomeTabs();
    tabEditorSignature = '';
    renderTabOrderEditor();
  }

  function resetTabOrder() {
    settings.forYouLast = false;
    try { GM_setValue('forYouLast', false); } catch (_) {}
    restoreNativeTabOrder();
    applySettings();
  }

  function restoreNativeTabOrder() {
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
    if (isHomeSortMenuOpen()) return;
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
    if ((!tabOrder.length && !settings.forYouLast) || location.pathname !== '/home') return;
    if (isHomeSortMenuOpen()) return;
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
      if (lastRoute && !isPostRoute(lastRoute)) rememberNonPostRoute(lastRoute);
      if (!lastRoute && !isPostRoute(route)) rememberNonPostRoute(route);
      lastRoute = route;
      followingAttemptedFor = '';
      setTimeout(queueScan, 120);
    }
    updateNavigation();
    updateMoreMenu();
    updatePromotedPosts();
    updateSuggestionModules();
    updatePremiumNags();
    updateFeedLayers();
    updateCenteredFeedTweets();
    updateCenteredFeedMedia();
    updateNavLayout();
    updateAccountPopup();
    updateFloatingClutter();
    updateFooter();
    stopAutoplay();
    selectFollowing();
    reorderHomeTabs();
    updateOverlayState();
    if (panel && !panel.hidden) renderTabOrderEditor();
    updateResponsiveLayout();
    fitVideosToViewport();
    updatePostBackControl();
    ensureControls();
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  function start() {
    if (started) return;
    started = true;
    installPrivacyGuards();
    installBackNavigationGuard();
    installAutoplayGuard();
    applySettings();
    const observer = new MutationObserver(queueScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', queueScan);
    window.addEventListener('hashchange', queueScan);
    window.addEventListener('resize', queueScan, { passive: true });
    document.addEventListener('fullscreenchange', queueScan);
    setInterval(queueScan, 2500);
  }

  function startAfterXMount() {
    const pageShell = () => document.querySelector(
      'main, [role="main"], [data-testid="primaryColumn"]'
    );
    if (pageShell()) {
      start();
      return;
    }

    const startupObserver = new MutationObserver(() => {
      if (!pageShell()) return;
      startupObserver.disconnect();
      start();
    });
    startupObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Open Cleanbird settings', openPanel);
    GM_registerMenuCommand('Reset Cleanbird settings', resetSettings);
  }

  if (document.documentElement) startAfterXMount();
  else document.addEventListener('readystatechange', startAfterXMount, { once: true });
})();
