// ==UserScript==
// @name         Game Store Enhancer (Dev)
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      2.0.31
// @description  Enhances Humble Bundle, Fanatical, DailyIndieGame, GOG, and IndieGala with Steam data (owned/wishlist status, reviews, age rating).
// @author       gbzret4d
// @match        https://www.humblebundle.com/*
// @match        https://www.fanatical.com/*
// @match        https://dailyindiegame.com/*
// @match        https://www.dailyindiegame.com/*
// @match        https://www.gog.com/*
// @match        https://www.indiegala.com/*
// @match        https://freebies.indiegala.com/*
// @icon         https://store.steampowered.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/game_store_enhancer.user.js
// @homepageURL  https://github.com/gbzret4d/game-store-enhancer
// @connect      store.steampowered.com
// @connect      www.protondb.com
// @connect      protondb.max-p.me
// @connect      steamcommunity.com
// @connect      gbzret4d.github.io
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const SITE_CONFIG = {
        'humblebundle.com': {
            name: 'Humble Bundle',
            ignoreUrl: '/books/',
            selectors: [
                { container: '.tier-item-view', title: '.item-title' },
                { container: '.entity-block-container', title: '.entity-title' },
                { container: '.entity-content', title: '.entity-title' },
                { container: '.product-item', title: '.product-title' },
                { container: '.content-choice', title: '.content-choice-title' },
                { container: '.game-box', title: '.game-box-title' },
                { container: '.pay-what-you-want-row', title: 'h2' },
                { container: '.details-heading', title: 'h1' },
                { container: '.product-header', title: 'h1' },
                { container: '.product-hero', title: 'h1' },
                { container: '.product-hero', title: 'h1' },
                { container: '[class*="product-detail"]', title: 'h1' },
                // v1.13: Target individual slides to ensure every game in the carousel is processed (e.g. Haste)
                { container: '.expanded-info-view .slick-slide', title: 'h2.heading-medium' },
                { container: '.modal-content', title: 'h2' }, // Keep as backup
            ],
            isValidGameElement: (element, nameEl) => {
                const link = element.closest('a') || element.querySelector('a');
                if (link && link.href) {
                    if (link.href.includes('/store/search') || link.href.includes('/store/promo')) {
                        return false;
                    }
                }
                const text = nameEl.textContent.trim().toLowerCase();
                const blocklist = ['deals under', 'great on', 'browse by', 'top selling', 'new on humble', 'coming soon'];
                if (blocklist.some(term => text.includes(term))) return false;
                return true;
            }
        },
        'fanatical.com': {
            name: 'Fanatical',
            selectors: [
                { container: '.HitCard', title: '.hitCardStripe__seoName' },
                { container: '.PickAndMixCard', title: '.card-product-name' },
                { container: '.product-det', title: 'h1.product-name' },
                { container: '.product-container', title: 'h1.product-name' },
                { container: 'div[class*="ProductDetail"]', title: 'h1.product-name' },
                { container: '.name-banner-container', title: 'h1.product-name' },
                // v1.29: User Pages (Orders & Library)
                { container: '.new-order-item', title: '.game-name' }, // Library & Order Details
                { container: '.OrderItemsCard', title: '.order-item-name' } // Order History List
            ],
            ignoreUrl: null,
            interceptor: true, // Enable API Interceptor
            // v1.24: Exclude non-game bundles (Books/Software) using STRICT equality to avoid false positives
            // from the parent category "PC Game Bundles, Book Bundles & Software Bundles"
            isExcluded: () => {
                const breadcrumbs = Array.from(document.querySelectorAll('.breadcrumb-item, nav[aria-label="breadcrumb"] li, ol[itemtype="http://schema.org/BreadcrumbList"] li'));
                const keywords = ['Book Bundles', 'Software Bundles'];
                return breadcrumbs.some(b => keywords.some(k => b.innerText.trim() === k)); // v1.24: Exact match only
            }
        },
        'dailyindiegame.com': {
            name: 'DailyIndieGame',
            selectors: [
                // Main Marketplace & Bundles (Table Rows). Targeting the ROW (`tr`) allows us to highlight the whole line.
                { container: 'tr[onmouseover]', title: 'a[href^="site_gamelisting_"]' },
                // Product Page
                { container: '#content', title: 'font[size="5"]' }
            ],
            // Custom logic to grab ID from URL directly
            getAppId: (element) => {
                // 1. Check for 'site_gamelisting_' links
                const link = element.querySelector('a[href^="site_gamelisting_"]');
                if (link) {
                    const match = link.href.match(/site_gamelisting_(\d+)/);
                    if (match) return match[1];
                }
                // 2. Check current URL if on product page
                if (window.location.href.includes('site_gamelisting_')) {
                    const match = window.location.href.match(/site_gamelisting_(\d+)/);
                    if (match) return match[1];
                }
                return null;
            }
        },
        'gog.com': {
            name: 'GOG',
            selectors: [
                // Store Grid
                { container: '.product-tile', title: '.product-title span' },
                // Product Page
                { container: '.productcard-basics', title: 'h1.productcard-basics__title' },
                // Wishlist & Library (List View)
                { container: '.product-row', title: '.product-row__title' },
                // Order History
                { container: '.product-row', title: '.product-title__text' }
            ],
            // GOG IDs don't match Steam, so we rely on Name Search.
            // But we can filter out non-game pages if needed.
        },
        /*
            indiegala: {
            name: 'IndieGala',
            selectors: [
                // Store / Sales Grid (Updated v1.56)
                { container: '.main-list-item', title: '.store-main-page-items-list-item-details a' }, // Modern Store Item
                // v2.0: Verified Store Grid Selector (Live Analysis)
                { container: '.main-list-results-item', title: '.main-list-results-item-info h3' },
                // Store / Sales Grid (Updated v1.56)
                { container: '.main-list-item', title: '.store-main-page-items-list-item-details a' }, // Modern Store Item
                { container: '.store-main-page-items-list-item-col', title: '.store-main-page-items-list-item-details a' }, // Legacy?
                // v2.0: Generic Store Grid Fallback (Broadest match)
                { container: '.store-main-page-items-list-item-col', title: '.item-title' },
                // v1.41: Homepage "Results" Grid (e.g. Metro Awakening)
                { container: '.main-list-results-item-margin', title: 'h3 a' },
                // v1.42: Product Detail Page (e.g. Resident Evil Requiem)
                // v2.0.4: Moved to Cover Art container for better overlay positioning
                //{ container: '.store-product-header-flex', title: 'h1[itemprop="name"]', forceSimple: true },
                { container: '.store-product-contents-aside-inner figure', title: 'h1[itemprop="name"]', externalTitle: true },

                // v1.47: Fallback Product Page
                //{ container: '.store-product-page-content', title: 'h1', forceSimple: true }, // Legacy
                { container: '.dev-cover-text-col', title: 'h1', forceSimple: true }, // Another potential container
                // Bundles
                { container: '.bundle-item-cont', title: '.bundle-item-title' }, // General Bundles
                //{ container: '.bundle-page-tier-item-inner', title: '.bundle-page-tier-item-title' }, // Power Shock / Specific Bundles (Grid)
                { container: '.bundle-slider-game-info', title: '.bundle-slider-game-info-title' }, // Bundle Carousel
                { container: '.container-item', title: '.container-item-title' }, // Bundles Overview Lists

                // Library
                { container: 'li.profile-private-page-library-subitem', title: '.profile-private-page-library-subitem-text' },
                { container: '.profile-private-page-library-product-item', title: '.profile-private-page-library-product-item-title' },
                { container: '.library-bundle-item', title: '.title' }, // Generic Library Bundle

                // Giveaways
                { container: '.items-list-item', title: '.items-list-item-title a' },
                { container: '.trading-card-header', title: '.trading-card-header-game' },
                // Trades
                { container: '.trades-list-card-contents', title: '.trades-list-card-title a' },
                // Showcase
                { container: '.showcase-main-list-item.main-list-item', title: '.showcase-title' },
                // Freebies (subdomain)
                { container: '.products-col-inner', title: '.product-title' }
            ],
            getAppId: (element) => {
                // 1. (Removed v1.61) Store URL IDs are internal IndieGala IDs, not Steam.
                // We MUST rely on Search or other methods for Store items.

                // 2. Fallback: Try to get ID from Bundle Image URL
                const img = element.querySelector('img[src*="/bundle_games/"]');
                if (img) {
                    const match = img.src.match(/\/(\d+)\.jpg/);
                    if (match) return match[1];
                }
                // 3. Library: Try to get ID from existing native Steam Link
                const steamLink = element.querySelector('a[href*="steampowered.com/app/"]');
                if (steamLink) {
                    const match = steamLink.href.match(/\/app\/(\d+)/);
                    if (match) return match[1];
                }
                return null;
            }
        }
        */

    };


    // --- Fanatical API Interceptor ---
    const fanatical_cover_map = new Map();

    function setupFanaticalInterceptor() {
        if (typeof unsafeWindow === 'undefined' || !unsafeWindow.fetch) return;

        const original_fetch = unsafeWindow.fetch;
        unsafeWindow.fetch = async function (...args) {
            const response = await original_fetch(...args);
            const clone = response.clone();

            clone.json().then(json => {
                if (!json) return;

                const processGame = (game) => {
                    if (game && game.cover && game.steam) {
                        // v1.19: Only map valid IDs. 
                        if (game.steam.id) {
                            // v1.20: Handle full URLs and query strings more robustly
                            let filename = game.cover.split('/').pop().split('?')[0];
                            fanatical_cover_map.set(filename, game.steam);
                        }
                    }
                };

                // 1. Bundle Pages / Pick & Mix
                if (json.bundles) json.bundles.forEach(b => b.games?.forEach(processGame));
                if (json.products) json.products.forEach(processGame);

                // 2. Search / Single Game
                if (json.cover && json.steam) processGame(json);
                if (json.results) json.results.forEach(r => r.hits?.forEach(processGame));

            }).catch(() => { }); // Ignore json parse errors

            return response;
        };
        console.log('[Game Store Enhancer] Fanatical API Interceptor active.');
    }

    function getCurrentSiteConfig() {
        const hostname = window.location.hostname;
        for (const domain in SITE_CONFIG) {
            if (hostname.includes(domain)) return SITE_CONFIG[domain];
        }
        return null;
    }

    const currentConfig = getCurrentSiteConfig();
    const DEBUG = true; // Enabled for debugging IndieGala

    if (!currentConfig) {
        console.log('[Game Store Enhancer] Site not supported');
        return;
    }

    if (currentConfig.ignoreUrl && window.location.href.includes(currentConfig.ignoreUrl)) {
        console.log(`[Game Store Enhancer] Ignoring URL pattern: ${currentConfig.ignoreUrl}`);
        return;
    }

    if (currentConfig.interceptor) {
        setupFanaticalInterceptor();
    }

    // --- API & Constants ---
    const STEAM_USERDATA_API = 'https://store.steampowered.com/dynamicstore/userdata/';
    const STEAM_SEARCH_API = 'https://store.steampowered.com/search/results/?json=1&term=';
    const STEAM_REVIEWS_API = 'https://store.steampowered.com/appreviews/';
    const PROTONDB_API = 'https://protondb.max-p.me/games/';
    const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (v1.25)
    const CACHE_VERSION = '2.5'; // v1.46: Bump for crash fix & fresh logs

    // Styles
    const css = `
        .ssl-link {
            display: inline-block;
            margin-top: 5px;
            margin-right: 10px;
            font-size: 11px;
            text-decoration: none;
            color: #c7d5e0;
            background: #171a21;
            padding: 2px 4px;
            border-radius: 2px;
            white-space: nowrap;
            line-height: 1.2;
            box-shadow: 1px 1px 2px rgba(0,0,0,0.5);
            z-index: 999;
            position: relative;
        }

        /* IndieGala Tweaks */
        .store-main-page-items-list-item-col .ssl-link {
            display: block;
            width: fit-content;
            margin-bottom: 5px;
        }
        
        .profile-private-page-library-subitem .ssl-link {
            margin-left: 10px;
            float: right;
        }

        .items-list-item .ssl-link,
        .trades-list-card-contents .ssl-link,
        .showcase-main-list-item .ssl-link,
        .product-title-cont .ssl-link {
            display: block;
            margin-top: 5px;
            width: fit-content;
        }
        
        /* Hide native links on DIG */
        a[href*="dailyindiegame.com"] a[href*="store.steampowered.com"],
        tr[onmouseover] a[href*="store.steampowered.com"] {
             display: none !important; 
        }

        .ssl-link:hover { color: #fff; background: #2a475e; }
        .ssl-link span { margin-right: 4px; padding-right: 4px; border-right: 1px solid #3c3d3e; }
        .ssl-link span:last-child { border-right: none; margin-right: 0; padding-right: 0; }

        .ssl-owned { color: #a4d007; font-weight: bold; }
        .ssl-wishlist { color: #66c0f4; font-weight: bold; }
        .ssl-ignored { color: #d9534f; }

        /* v2.0.24: Visuals Update - Pseudo-elements for Borders (Top of Image) */
        
        .ssl-container-owned, .ssl-container-wishlist, .ssl-container-ignored {
            position: relative !important; /* Context for pseudo */
        }

        .ssl-container-owned::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border: 4px solid #5cb85c;
            box-shadow: inset 0 0 10px rgba(92, 184, 92, 0.4);
            pointer-events: none;
            z-index: 50; /* Above image */
            border-radius: inherit;
        }
        
        .ssl-container-wishlist::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border: 4px solid #5bc0de;
            box-shadow: inset 0 0 10px rgba(91, 192, 222, 0.4);
            pointer-events: none;
            z-index: 50;
            border-radius: inherit;
        }

        .ssl-container-ignored::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border: 4px solid #d9534f;
            box-shadow: inset 0 0 10px rgba(217, 83, 79, 0.4);
            pointer-events: none;
            z-index: 50;
            border-radius: inherit;
        }
        
        /* Remove old background/border styles */
        .ssl-container-owned, .ssl-container-wishlist, .ssl-container-ignored {
             border: none !important;
             background: none !important;
             box-shadow: none !important;
        }

        /* Overlay - Bottom Aligned (Absolute) - Fail-safe method */
        .ssl-steam-overlay {
            position: absolute !important;
            bottom: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important; /* Do not fill height, just bottom strip */
            pointer-events: none;
            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-end !important;
            align-items: center !important;
            padding-bottom: 4px;
            z-index: 60;
        }
        
        .ssl-overlay-text {
            background: rgba(0,0,0,0.85);
            color: #fff;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 2px;
            pointer-events: auto;
            backdrop-filter: blur(2px);
            box-shadow: 0 1px 3px rgba(0,0,0,0.5);
            line-height: 1;
        }

        /* Layout Fixes */
        .showcase-main-list-item figure,
        .main-list-item figure,
        .bundle-page-tier-item-inner, /* Power Shock */
        .container-item-inner {       /* Bundle Overview */
             position: relative !important; 
        }

        /* DailyIndieGame Specifics handled via box-shadow now too, strictly */
        ${currentConfig.name === 'DailyIndieGame' ? `
            .ssl-container-owned, .ssl-container-wishlist, .ssl-container-ignored {
                 border-bottom: 8px solid #1a1c1d !important;
                 box-shadow: inset 0 0 0 4px currentColor, inset 0 0 20px rgba(0,0,0,0.2) !important;
            }
            body[bgcolor] table { border-collapse: separate !important; border-spacing: 0 5px !important; }
            tr[onmouseover] td:last-child { display: none !important; }
            .ssl-link-inline { margin-left: 10px; vertical-align: middle; display: inline-block !important; }
        ` : ''}

        /* Stats Panel */
        #ssl-stats {
            position: fixed;
            top: 15%;
            right: 0;
            background: rgba(23, 26, 33, 0.95);
            color: #c7d5e0;
            padding: 12px;
            border-radius: 8px 0 0 8px;
            box-shadow: -2px 2px 10px rgba(0,0,0,0.5);
            z-index: 99999;
            font-size: 11px;
            line-height: 1.4;
            min-width: 140px;
            border: 1px solid #3c3d3e;
            border-right: none;
            pointer-events: none;
            transition: opacity 0.3s, right 0.3s;
        }
        #ssl-stats:hover {
            opacity: 1;
            right: 0;
            pointer-events: auto;
        }
        
        #ssl-stats h4 { 
            margin: 0 0 8px 0; 
            color: #66c0f4; 
            font-size: 12px; 
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #3c3d3e; 
            padding-bottom: 4px; 
        }
        .ssl-stat-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .ssl-stat-val { font-weight: bold; color: #fff; }
        
        /* Bundle Dot */
        .ssl-wishlist-dot {
            position: absolute;
            top: 8px; right: 8px;
            width: 12px; height: 12px;
            background-color: #66c0f4;
            border: 2px solid #fff;
            border-radius: 50%;
            z-index: 30;
            box-shadow: 0 0 4px rgba(0,0,0,0.5);
        }
    `;
    GM_addStyle(css);

    // --- State & UI ---
    // v1.28: Add countedSet for deduplication
    const stats = { total: 0, owned: 0, wishlist: 0, ignored: 0, missing: 0, no_data: 0, countedSet: new Set() };

    function updateStatsUI() {
        let panel = document.getElementById('ssl-stats');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'ssl-stats';
            document.body.appendChild(panel);
            window.addEventListener('beforeprint', () => { panel.style.display = 'none'; });
            window.addEventListener('afterprint', () => { panel.style.display = 'block'; });
        }

        let html = `<h4>${currentConfig.name} Stats</h4>`;
        const lines = [
            { label: 'Total', val: stats.total },
            { label: 'Owned', val: stats.owned },
            { label: 'Wishlist', val: stats.wishlist },
            { label: 'Ignored', val: stats.ignored },
            { label: 'Missing', val: stats.missing },
            { label: 'No Data', val: stats.no_data }
        ];
        lines.forEach(l => { html += `<div>${l.label}: <span class="val">${l.val}</span></div>`; });
        panel.innerHTML = html;
    }

    function createSteamLink(appData) {
        if (!appData || !appData.id) return document.createElement('span');

        const link = document.createElement('a');
        link.className = 'ssl-link';

        let typePath = 'app';
        if (appData.type === 'sub') typePath = 'sub';
        if (appData.type === 'bundle') typePath = 'bundle';

        link.href = `https://store.steampowered.com/${typePath}/${appData.id}/`;
        link.target = '_blank';
        link.title = appData.name;

        let html = `<span>STEAM</span>`;
        if (appData.cards) html += `<span>CARDS</span>`;
        if (appData.owned) html += `<span class="ssl-owned">OWNED</span>`;
        else if (appData.wishlisted) html += `<span class="ssl-wishlist">WISHLIST</span>`;

        if (appData.reviews && typeof appData.reviews.percent === 'number' && !isNaN(appData.reviews.percent) && appData.reviews.total > 0) {
            let colorClass = 'ssl-review-mixed';
            if (appData.reviews.percent >= 70) colorClass = 'ssl-review-positive';
            if (appData.reviews.percent < 40) colorClass = 'ssl-review-negative';
            html += `<span class="${colorClass}">${appData.reviews.percent}%</span>`;
        }

        if (appData.ignored !== undefined) html += `<span class="ssl-ignored">IGNORED</span>`;
        if (appData.proton) html += `<span>${appData.proton} PROTON</span>`;

        link.innerHTML = html;
        return link;
    }

    // --- Helpers ---
    class RequestQueue {
        constructor(interval, concurrency = 1) {
            this.interval = interval;
            this.concurrency = concurrency;
            this.active = 0;
            this.queue = [];
            this.stopped = false;
        }

        add(fn) {
            if (this.stopped) return Promise.reject(new Error("Queue Stopped"));
            return new Promise((resolve, reject) => {
                this.queue.push({ fn, resolve, reject });
                this.next();
            });
        }

        stop() {
            this.stopped = true;
            this.queue = []; // Clear pending
            console.error("Steam Request Queue STOPPED due to Rate Limit/Error.");
            // Try to notify UI
            const statsPanel = document.getElementById('ssl-stats');
            if (statsPanel) {
                let errorDiv = document.getElementById('ssl-rate-limit-error');
                if (!errorDiv) {
                    errorDiv = document.createElement('div');
                    errorDiv.id = 'ssl-rate-limit-error';
                    errorDiv.className = 'ssl-error-toast';
                    errorDiv.innerText = "⚠️ STEAM RATE LIMIT DETECTED. PAUSED.";
                    errorDiv.style.display = 'block';
                    statsPanel.appendChild(errorDiv);
                    // statsPanel.style.display = 'block'; // Panel is always visible?
                }
            }
        }

        next() {
            if (this.stopped || this.active >= this.concurrency || this.queue.length === 0) return;

            this.active++;
            const { fn, resolve, reject } = this.queue.shift();

            const execute = async () => {
                try {
                    const result = await fn();
                    resolve(result);
                } catch (e) {
                    // v1.62: Circuit Breaker Check
                    if (e.status === 403 || (e.message && e.message.includes("Access Denied"))) {
                        this.stop();
                    }
                    reject(e);
                } finally {
                    // Enforce interval AFTER completion to space out bursts slightly, 
                    // or immediately? To be safe with Steam, we'll wait a bit.
                    setTimeout(() => {
                        this.active--;
                        this.next();
                    }, this.interval);
                }
            };
            execute();
        }
    }
    const steamQueue = new RequestQueue(300);

    function getStoredValue(key, defaultVal) {
        try {
            const wrapped = GM_getValue(key, defaultVal);
            if (wrapped && wrapped.version === CACHE_VERSION) {
                return wrapped.payload;
            }
            return defaultVal;
        } catch (e) { return defaultVal; }
    }
    function setStoredValue(key, val) {
        try { GM_setValue(key, { version: CACHE_VERSION, payload: val }); } catch (e) { }
    }

    async function fetchSteamReviews(appId) {
        const cacheKey = 'steam_reviews_' + appId;
        const cached = getStoredValue(cacheKey, null);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL * 7)) return cached.data;

        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${STEAM_REVIEWS_API}${appId}?json=1&num_per_page=0&purchase_type=all`, // Include key activations
                onload: res => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.query_summary) {
                            const summary = data.query_summary;
                            const result = {
                                percent: (summary.total_reviews > 0) ? Math.floor((summary.total_positive / summary.total_reviews) * 100) : 0,
                                total: summary.total_reviews,
                                score: summary.review_score_desc // "Very Positive", etc.
                            };
                            setStoredValue(cacheKey, { data: result, timestamp: Date.now() });
                            resolve(result);
                        } else {
                            setStoredValue(cacheKey, { data: null, timestamp: Date.now() });
                            resolve(null);
                        }
                    } catch (e) { resolve(null); }
                },
                onerror: () => resolve(null)
            });
        });
    }

    // --- API Calls ---
    async function fetchSteamUserData() {
        const cached = getStoredValue('steam_userdata', null);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            console.log(`[Game Store Enhancer] UserData Cache Hit (v${CACHE_VERSION}). Owned: ${cached.data.ownedApps.length}, Wishlist: ${cached.data.wishlist.length}`); // DEBUG
            return cached.data;
        }

        return steamQueue.add(() => new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: STEAM_USERDATA_API,
                onload: (response) => {
                    // v1.62: Circuit Breaker for Rate Limits
                    if (response.status === 403 || response.responseText.includes("Access Denied")) {
                        reject({ status: 403, message: "Access Denied" });
                        return;
                    }
                    try {
                        const data = JSON.parse(response.responseText);
                        console.log('[Game Store Enhancer] UserData Response:', data); // DEBUG
                        const userData = {
                            ownedApps: data.rgOwnedApps || [],
                            wishlist: data.rgWishlist || [],
                            ignored: data.rgIgnoredApps || {}
                        };

                        // v1.19: Detect potential cookie blocking (Firefox)
                        if (userData.ownedApps.length === 0 && userData.wishlist.length === 0) {
                            console.warn('[Game Store Enhancer] Wiki result is empty. Possible causes: Not logged in OR Firefox "Total Cookie Protection" active. NOT CACHING this result.');
                            // Do NOT cache empty results to allow immediate retry on next load/login
                        } else {
                            setStoredValue('steam_userdata', { data: userData, timestamp: Date.now() });
                        }

                        console.log(`[Game Store Enhancer] Parsed Data - Owned: ${userData.ownedApps.length}, Wishlist: ${userData.wishlist.length}`); // DEBUG
                        resolve(userData);
                    } catch (e) {
                        console.error('[Game Store Enhancer] UserData Parse Error:', e); // DEBUG
                        resolve({ ownedApps: [], wishlist: [], ignored: {} });
                    }
                },
                onerror: (err) => {
                    console.error('[Game Store Enhancer] UserData Request Failed:', err); // DEBUG
                    resolve({ ownedApps: [], wishlist: [], ignored: {} });
                }
            });
        }));
    }

    // --- Steam API & Cache (v2.0) ---
    const STEAM_CACHE_URL = 'https://cdn.jsdelivr.net/gh/gbzret4d/game-store-enhancer@main/data/steam_apps.min.json';
    const STEAM_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 Hours

    async function fetchSteamAppCache() {
        // Allow user override (future proofing)
        const customUrl = GM_getValue('steam_cache_url', STEAM_CACHE_URL);

        const cached = getStoredValue('steam_apps_db', null);
        if (cached && (Date.now() - cached.timestamp < STEAM_CACHE_TTL)) {
            console.log(`[Game Store Enhancer] Steam AppDB Cache Hit (${Object.keys(cached.data).length} apps)`);
            return cached.data;
        }

        console.log(`[Game Store Enhancer] Fetching Steam AppDB from ${customUrl}...`);
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: customUrl,
                onload: (res) => {
                    try {
                        const db = JSON.parse(res.responseText);
                        console.log(`[Game Store Enhancer] Steam AppDB Updated: ${Object.keys(db).length} apps`);
                        setStoredValue('steam_apps_db', { data: db, timestamp: Date.now() });
                        resolve(db);
                    } catch (e) {
                        console.error('[Game Store Enhancer] Steam AppDB Parse Error', e);
                        resolve(null);
                    }
                },
                onerror: () => {
                    console.error('[Game Store Enhancer] Steam AppDB Fetch Error');
                    resolve(null);
                }
            });
        });
    }

    async function searchSteamGame(gameName) {
        const cacheKey = `steam_search_${gameName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const cached = getStoredValue(cacheKey, null);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL * 7)) return cached.data;

        const cleanupRegex = /(:| -| –| —)?\s*(The\s+)?(Pre-Purchase|Pre-Order|Steam Key|Complete|Anthology|Collection|Definitive|Game of the Year|GOTY|Deluxe|Ultimate|Premium)(\s+(Edition|Cut|Content|Pack))?(\s+Bundle)?(\s*\.{3,})?/gi;
        const cleanedName = gameName.replace(cleanupRegex, '').trim().toLowerCase();

        // v2.0: Check Offline Cache First
        const appDb = getStoredValue('steam_apps_db', null)?.data;
        if (appDb) {
            const appId = appDb[cleanedName];
            if (appId) {
                console.log(`[Game Store Enhancer] Offline Cache Hit: "${cleanedName}" -> ID ${appId}`);
                // Create minimal result. Price/Discount unknown, but ID is enough for links/reviews!
                const result = { id: appId, type: 'app', name: gameName, price: null, discount: 0 };
                setStoredValue(cacheKey, { data: result, timestamp: Date.now() });
                return result;
            }
        }

        console.log(`[Game Store Enhancer] Cleaning name: "${gameName}" -> "${cleanedName}"`);

        return steamQueue.add(() => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                // v1.62: Use hardcoded URL to ensure HTML return
                url: `https://store.steampowered.com/search/results?term=${encodeURIComponent(cleanedName)}&ignore_preferences=1`,
                onload: (response) => {
                    // v1.62: Circuit Breaker for Rate Limits
                    if (response.status === 403 || response.responseText.includes("Access Denied")) {
                        reject({ status: 403, message: "Access Denied" });
                        return;
                    }
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, "text/html");
                        const item = doc.querySelector('#search_resultsRows a.search_result_row');

                        if (item) {
                            const id = item.getAttribute('data-ds-appid');
                            // Determine type (bundle, sub, app)
                            let type = 'app';
                            if (item.getAttribute('data-ds-packageid')) type = 'sub';
                            else if (item.getAttribute('data-ds-bundleid')) type = 'bundle';

                            // Extract Name and Image
                            const name = item.querySelector('.title').textContent;
                            const img = item.querySelector('img')?.src;

                            // Extract Price/Discount
                            let price = null;
                            let discount = 0;
                            const discountEl = item.querySelector('.search_discount span');
                            if (discountEl) discount = parseInt(discountEl.innerText.replace('-', ''));

                            const result = { id, type, name, tiny_image: img, price, discount };
                            setStoredValue(cacheKey, { data: result, timestamp: Date.now() });
                            resolve(result);
                        } else {
                            console.log(`[Game Store Enhancer] No results for "${cleanedName}"`);
                            setStoredValue(cacheKey, { data: null, timestamp: Date.now() });
                            resolve(null);
                        }
                    } catch (e) {
                        console.error("[Game Store Enhancer] Search Parse Error:", e);
                        resolve(null);
                    }
                },
                onerror: (err) => {
                    console.error("[Game Store Enhancer] Search Network Error:", err);
                    resolve(null);
                }
            });
        }));
    }

    // --- Levenshtein Similarity Helper ---
    function getSimilarity(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        const longerLength = longer.length;
        if (longerLength === 0) return 1.0;
        return (longerLength - editDistance(longer.toLowerCase(), shorter.toLowerCase())) / longerLength;
    }

    function editDistance(s1, s2) {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
        const costs = new Array();
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i == 0) costs[j] = j;
                else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) != s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }

    async function fetchProtonDB(appId) {
        const cacheKey = 'proton_' + appId;
        const cached = getStoredValue(cacheKey, null);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL * 7)) return cached.data;

        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: PROTONDB_API + appId,
                onload: res => {
                    try {
                        const data = JSON.parse(res.responseText);
                        const tier = data.trendingTier || data.tier;
                        setStoredValue(cacheKey, { data: tier, timestamp: Date.now() });
                        resolve(tier);
                    } catch (e) { resolve(null); }
                },
                onerror: () => resolve(null)
            });
        });
    }

    function scanForSteamAssets(element) {
        // v1.3: Asset Scanner
        // 1. Check Links
        const links = element.querySelectorAll('a[href*="/app/"], a[href*="/sub/"], a[href*="/bundle/"]');
        for (const link of links) {
            const match = link.href.match(/\/(app|sub|bundle)\/(\d+)/i);
            if (match) {
                return { id: parseInt(match[2]), type: match[1].toLowerCase() };
            }
        }

        // 2. Check Images
        const images = element.querySelectorAll('img[src*="/apps/"], img[src*="/subs/"], img[src*="/bundles/"]');
        for (const img of images) {
            const match = img.src.match(/\/(apps|subs|bundles)\/(\d+)/i);
            if (match) {
                let type = 'app';
                if (match[1] === 'subs') type = 'sub';
                if (match[1] === 'bundles') type = 'bundle';
                return { id: parseInt(match[2]), type: type };
            }
        }
        return null;
    }

    // --- Processing ---// @version      1.6

    let userDataPromise = fetchSteamUserData();

    async function processGameElement(element, nameSelector, forceSimpleArg, externalTitleArg) {
        // v1.27: Visibility Check - Fixes double-counting on Bundle pages (hidden tiers/mobile views)
        if (element.offsetParent === null) return;

        // v1.6: Persistence Check - If marked 'true' but link is gone (wiped by another script), reset and retry.
        if (element.dataset.sslProcessed === "true") {
            if (!element.querySelector('.ssl-link')) {
                // Console log only if debugging/verbose, or just silently fix
                // console.log('[Game Store Enhancer] Link wiped by external script. Re-processing:', element);
                element.dataset.sslProcessed = "";
            } else {
                return; // Already processed and link exists
            }
        }

        if (element.dataset.sslProcessed) return;

        // v2.0.7: Fix forceSimple not being passed correctly
        const forceSimple = forceSimpleArg || false;
        const selectorToUse = nameSelector || currentConfig.title; // Fallback to config if not passed

        let nameEl;
        if (externalTitleArg) {
            nameEl = document.querySelector(selectorToUse);
        } else {
            nameEl = element.querySelector(selectorToUse);
        }

        if (!nameEl) {
            // Try strict fallback if selector failed (e.g. might differ in specific sections)
            return;
        }

        // v1.58: Fix Overlay Positioning - Ensure we have a valid container for relative positioning
        // Strategy:
        // 1. Look for a `figure` or `.main-list-item-col-image` for overlay
        // 2. Fallback to `nameEl` for simple link

        // Determine Strategy
        let figure = null;
        if (!forceSimple) {
            figure = element.querySelector('.main-list-item-col-image') || element.querySelector('figure') || element.querySelector('.product-image');
        }

        // v1.35: Deduplication Check - Prevent multiple badges
        if (element.querySelector('.ssl-link')) {
            element.dataset.sslProcessed = "true";
            return;
        }

        // v1.30: DailyIndieGame sometimes needs to process the element itself if it IS the link
        if (!nameEl && currentConfig.name === 'DailyIndieGame' && element.tagName === 'A') {
            // Logic to handle direct link processing if needed, but our selectors use containers.
            // For now, if nameEl is missing, we skip, unless we want to treat 'element' as the name source.
        }

        if (!nameEl) {
            if (DEBUG && currentConfig.name === 'IndieGala') {
                console.log('[Game Store Enhancer] [DEBUG] Name element NOT found in container:', element, 'Selector:', nameSelector);
            }
            return;
        }

        // CustomValidator
        if (currentConfig.isValidGameElement) {
            if (!currentConfig.isValidGameElement(element, nameEl)) {
                element.dataset.sslProcessed = "ignored";
                return;
            }
        }

        if (element.dataset.sslProcessed) return;
        element.dataset.sslProcessed = "pending";

        let gameName = nameEl.textContent.trim();
        // v1.44: Fallback to title attribute if text is empty (e.g. IndieGala Sale Overlay Links)
        if (!gameName && nameEl.getAttribute('title')) {
            gameName = nameEl.getAttribute('title').trim();
        }

        if (!gameName) {
            if (DEBUG && currentConfig.name === 'IndieGala') {
                console.log('[Game Store Enhancer] [DEBUG] Game Name is EMPTY. Element:', nameEl);
            }
            return;
        }

        if (DEBUG && currentConfig.name === 'IndieGala') {
            console.log(`[Game Store Enhancer] [DEBUG] Processing "${gameName}"...`);
        }

        // v1.28: Deduplication Helper
        const getUniqueId = (el, name) => {
            // v1.31: GOG Deduplication using stable IDs
            if (currentConfig.name === 'GOG') {
                const gogId = el.getAttribute('data-product-id') || el.getAttribute('gog-product');
                if (gogId) return 'gog_' + gogId;
            }

            const link = el.querySelector('a[href]');
            if (link && link.href) {
                // Remove query parameters to normalize URLs
                return link.href.split('?')[0];
            }
            return name; // Fallback to name if no link found
        };
        const uniqueId = getUniqueId(element, gameName);

        // v1.12: Move stats increment to AFTER successful processing to avoid infinite counting on re-scans
        const isNewStats = !element.dataset.sslStatsCounted;

        try {
            // v1.3: 1. Asset Scan (Priority)
            let result = null;

            // v1.61: Generic Direct ID Lookup (Enable for all sites)
            if (currentConfig.getAppId) {
                const directId = currentConfig.getAppId(element);
                if (directId) {
                    result = {
                        id: directId,
                        type: 'app',
                        name: gameName,
                        tiny_image: null, price: null, discount: 0
                    };

                    // DailyIndieGame Special: Hide native Steam link
                    if (currentConfig.name === 'DailyIndieGame') {
                        const nativeLink = element.querySelector('a[href*="store.steampowered.com"]');
                        if (nativeLink) nativeLink.style.display = 'none';
                    }
                }
            }

            // v1.7: Fanatical API Map Lookup (Highest Priority)
            if (currentConfig.interceptor) {
                const images = element.querySelectorAll('img[src]');
                for (const img of images) {
                    let filename = img.src.split('/').pop().split('?')[0];
                    // v1.20: Handle fanatical.imgix.net URLs which have a different structure
                    if (img.src.includes('fanatical.imgix.net')) {
                        const imgixMatch = img.src.match(/\/(\w+\.\w+)$/); // e.g., /cover.jpg
                        if (imgixMatch) {
                            filename = imgixMatch[1];
                        }
                    }

                    if (fanatical_cover_map.has(filename)) {
                        const steamData = fanatical_cover_map.get(filename);
                        result = {
                            id: steamData.id,
                            type: steamData.type || 'app',
                            name: gameName,
                            tiny_image: null, price: null, discount: 0
                        };
                        console.log(`[Game Store Enhancer] API Intercept match for "${gameName}": ${result.type}/${result.id}`);
                        break;
                    }
                }
            }

            if (!result) {
                const assetMatch = scanForSteamAssets(element);
                if (assetMatch) {
                    result = {
                        id: assetMatch.id,
                        type: assetMatch.type,
                        name: gameName, // Trust the page name
                        tiny_image: null,
                        price: null,
                        discount: 0
                    };
                    console.log(`[Game Store Enhancer] Asset match for "${gameName}": ${assetMatch.type}/${assetMatch.id}`);
                } else {
                    // 2. Steam Search (Fallback)
                    result = await searchSteamGame(gameName);
                }
            }

            if (result) {
                // v1.17: Loop Prevention - Validate ID before processing
                if (!result.id || isNaN(parseInt(result.id))) {
                    console.warn(`[Game Store Enhancer] Result found but ID is missing/invalid for "${gameName}". Marking as error.`);
                    element.dataset.sslProcessed = "error";
                    if (isNewStats) {
                        // v1.28: Deduplication check
                        if (!stats.countedSet.has(uniqueId)) {
                            stats.no_data++;
                            stats.total++;
                            stats.countedSet.add(uniqueId);
                            updateStatsUI();
                        }
                        element.dataset.sslStatsCounted = "true";
                    }
                    return;
                }
                const appId = parseInt(result.id);
                const userData = await userDataPromise;
                const owned = userData.ownedApps.includes(appId);
                // Simple wishlist check for ID presence
                const wishlisted = userData.wishlist.some(w => (w.appid === appId || w === appId));
                const ignored = userData.ignored && userData.ignored[appId];

                // Fetch extra data in parallel
                const [proton, reviews] = await Promise.all([
                    fetchProtonDB(appId),
                    fetchSteamReviews(appId)
                ]);

                const appData = { ...result, id: appId, owned, wishlisted, ignored, proton, reviews };

                // v1.46: FIX - Actually create the link element before trying to use it!
                const link = createSteamLink(appData);
                console.log(`[Game Store Enhancer] Created link for AppID ${appData.id}`);

                if (owned) {
                    if (isNewStats && !stats.countedSet.has(uniqueId)) stats.owned++;
                    element.classList.add('ssl-container-owned');
                } else if (wishlisted) {
                    if (isNewStats && !stats.countedSet.has(uniqueId)) stats.wishlist++;
                    element.classList.add('ssl-container-wishlist');
                } else if (ignored !== undefined) {
                    if (isNewStats && !stats.countedSet.has(uniqueId)) stats.ignored++;
                    element.classList.add('ssl-container-ignored');
                    if (nameEl) nameEl.classList.add('ssl-title-ignored');
                } else {
                    if (isNewStats && !stats.countedSet.has(uniqueId)) stats.missing++;
                }

                if (isNewStats) {
                    if (!stats.countedSet.has(uniqueId)) {
                        stats.total++;
                        stats.countedSet.add(uniqueId);
                        updateStatsUI();
                    }
                    element.dataset.sslStatsCounted = "true";
                }


                if (currentConfig.name === 'DailyIndieGame') {
                    // v1.39-DEV: Cell-Level Styling & In-Link Badge (The "Nuclear Option")

                    // 1. Force Badge Visibility by putting it INSIDE the name link (Prefix)
                    link.classList.add('ssl-link-inline');
                    link.style.display = 'inline-block';
                    link.style.marginRight = '8px';
                    link.style.fontSize = '10px';

                    // Ensure nameel is visible and amenable to insertion
                    nameEl.style.display = 'inline-block';
                    nameEl.insertBefore(link, nameEl.firstChild);

                    // 2. Hide Last Column (Steam Link) safely
                    const lastCell = element.lastElementChild;
                    if (lastCell) lastCell.style.display = 'none';

                    // 3. Fake Gap using Borders on CELLS (TR borders often fail in quirks mode)
                    const allCells = element.children;
                    for (let i = 0; i < allCells.length; i++) {
                        let cell = allCells[i];
                        cell.style.borderBottom = "10px solid #1a1c1d !important";
                        cell.style.setProperty("border-bottom", "10px solid #1a1c1d", "important");
                        // Optional: Add padding to separate text from border
                        cell.style.paddingBottom = "4px";
                    }
                } else if (currentConfig.name === 'IndieGala' && (
                    element.classList.contains('main-list-item') || // v1.56: Standard Store/Bundle Item
                    element.classList.contains('store-main-page-items-list-item-col') ||
                    element.classList.contains('main-list-results-item-margin') ||
                    element.classList.contains('showcase-main-list-item') ||
                    element.classList.contains('items-list-item') ||
                    element.dataset.sslProcessed !== "true" // Catch-all
                )) {
                    // v1.60: Hybrid Strategy & Priority Fix
                    // Strategy A: Platform Container (Homepage Lists) -> Inline with existing icons (Preferred if available)
                    // Strategy B: Figure Overlay (Store Grids, Bundles) -> High Visibility on Image

                    const figure = element.querySelector('figure');
                    const platformContainer = element.querySelector('.item-platforms'); // Homepage "Top Sellers" container

                    if (platformContainer) {
                        // --- STRATEGY A: PLATFORM CONTAINER (Homepage Lists) ---
                        // Insert as a small badge NEXT to the existing icons (Steam/Windows/Apple)

                        // DUPLICATION CHECK:
                        if (platformContainer.querySelector('.ssl-steam-badge')) {
                            element.dataset.sslProcessed = "true";
                            return;
                        }

                        const badge = document.createElement('a');
                        badge.className = 'ssl-steam-badge';
                        badge.href = link.href;
                        badge.target = '_blank';
                        badge.title = "View on Steam";

                        // Style to match icons
                        badge.style.display = 'inline-flex';
                        badge.style.alignItems = 'center';
                        badge.style.marginLeft = '10px';
                        badge.style.textDecoration = 'none';
                        badge.style.verticalAlign = 'middle';

                        let reviewText = '';
                        if (appData && appData.reviews && appData.reviews.percent) {
                            let color = '#a8926a';
                            if (parseInt(appData.reviews.percent) >= 70) color = '#66C0F4';
                            if (parseInt(appData.reviews.percent) < 40) color = '#c15755';
                            reviewText = `<span style="color:${color}; font-weight:bold; font-size:12px; margin-left:4px;">${appData.reviews.percent}%</span>`;
                        }

                        badge.innerHTML = `<img src="https://store.steampowered.com/favicon.ico" style="width:16px;height:16px;vertical-align:middle;">${reviewText}`;

                        platformContainer.appendChild(badge);

                    } else if (figure) {
                        // --- STRATEGY B: FIGURE OVERLAY (Store/Bundles) ---
                        // DUPLICATION CHECK:
                        if (figure.querySelector('.ssl-steam-overlay')) {
                            element.dataset.sslProcessed = "true";
                            return;
                        }

                        figure.style.position = 'relative';
                        figure.style.display = 'block';

                        const overlay = document.createElement('a');
                        overlay.className = 'ssl-steam-overlay';
                        overlay.href = link.href;
                        overlay.target = '_blank';

                        overlay.style.position = 'absolute';
                        overlay.style.bottom = '0';
                        overlay.style.left = '0';
                        overlay.style.width = '100%';
                        overlay.style.padding = '2px 0';
                        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                        overlay.style.zIndex = '20';
                        overlay.style.display = 'flex';
                        overlay.style.alignItems = 'center';
                        // v2.0.26: Force Bottom Alignment for IndieGala Bundle/Store
                        if (currentConfig.name === 'IndieGala') {
                            overlay.style.justifyContent = 'flex-end';
                        } else {
                            overlay.style.justifyContent = 'center';
                        }
                        overlay.style.pointerEvents = 'auto';
                        overlay.style.textDecoration = 'none';

                        let statusHtml = '<span style="color:#fff; font-size:11px; font-weight:bold;">STEAM</span>';
                        let overlayBg = 'rgba(0, 0, 0, 0.7)';

                        if (appData.owned) {
                            statusHtml = '<span style="color:#a4d007; font-weight:bold; font-size:11px;">OWNED</span>';
                        } else if (appData.wishlisted) {
                            statusHtml = '<span style="color:#66c0f4; font-weight:bold; font-size:11px;">WISHLIST</span>';
                        } else if (appData.ignored !== undefined) {
                            statusHtml = '<span style="color:#d9534f; font-weight:bold; font-size:11px;">IGNORED</span>';
                            overlayBg = 'rgba(0, 0, 0, 0.85)'; // Darker for ignored
                        }

                        overlay.style.backgroundColor = overlayBg;

                        let reviewSnippet = '';
                        if (appData && appData.reviews && appData.reviews.percent) {
                            let color = '#a8926a';
                            if (parseInt(appData.reviews.percent) >= 70) color = '#66C0F4';
                            if (parseInt(appData.reviews.percent) < 40) color = '#c15755';
                            reviewSnippet = ` <span style="color:${color}; margin-left:5px; font-weight:bold; font-size:11px;">${appData.reviews.percent}%</span>`;
                        }

                        overlay.innerHTML = `<img src="https://store.steampowered.com/favicon.ico" class="ssl-icon-img" style="width:14px;height:14px;vertical-align:middle; margin-right:4px;"> ${statusHtml}${reviewSnippet}`;
                        figure.appendChild(overlay);

                    } else {

                        // Fallback: If neither Strategy fits (or forced Simple)
                        // v2.0.6: Product Page Badge Strategy (Next to "Steam Key" label)
                        if (forceSimple) {
                            // Style as a dark badge
                            link.style.display = 'inline-block';
                            link.style.marginLeft = '10px';
                            link.style.color = '#fff';
                            link.style.fontWeight = 'bold';
                            link.style.fontSize = '14px'; // Slightly smaller than H1
                            link.style.verticalAlign = 'middle';
                            link.style.backgroundColor = '#171a21'; // Steam Dark Blue/Black
                            link.style.padding = '2px 8px';
                            link.style.borderRadius = '4px';
                            link.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';
                            link.style.lineHeight = 'normal';
                            link.style.whiteSpace = 'nowrap'; // Prevent wrapping

                            // Try to find the "Steam Key" label (em tag) inside H1
                            const steamKeyLabel = nameEl.querySelector('em');
                            if (steamKeyLabel) {
                                steamKeyLabel.after(link);
                            } else {
                                nameEl.appendChild(link); // Append to H1 if label missing
                            }
                        } else {
                            nameEl.after(link);
                        }
                    }
                } else {
                    // Fallback for non-IndieGala/Standard flow
                    nameEl.after(link);
                }
            }
        } catch (e) {
            console.error(e);
            element.dataset.sslProcessed = "error";
            if (isNewStats) {
                if (!stats.countedSet.has(uniqueId)) { // v1.28
                    stats.no_data++;
                    stats.total++;
                    stats.countedSet.add(uniqueId);
                    updateStatsUI();
                }
                element.dataset.sslStatsCounted = "true";

            }
        }
    }

    function scanPage() {
        if (currentConfig.isExcluded && currentConfig.isExcluded()) return;
        if (!currentConfig.selectors) return;

        if (DEBUG && currentConfig.name === 'IndieGala') {
            console.log('[Game Store Enhancer] [DEBUG] Scanning IndieGala page...');
        }

        // v1.52: IndieGala Age Gate Bypass
        if (currentConfig.name === 'IndieGala') {
            const confirmBtn = document.querySelector('a.adult-check-confirm');
            if (confirmBtn) {
                console.log('[Game Store Enhancer] Auto-confirming Age Gate...');
                confirmBtn.click();
            }
        }

        // v2.0.14: Add specific styles for IndieGala bundle pages
        // This is added here because it's specific to IndieGala and needs to be applied once.
        GM_addStyle(`
        /* v2.0.17: Spacing fix for IndieGala Bundle Page - Apply styling ONLY to the cover image */
        .ssl-container-ignored {
            border: none !important;
            padding: 0 5px !important; /* Reset/Ensure default padding */
            background: none !important;
            box-shadow: none !important;
        }
        .ssl-container-ignored .bundle-page-tier-item-outer {
            border: none !important;
            margin: 0 !important;
            box-shadow: none !important;
        }
        /* Target the figure/image inside the ignored container */
        .ssl-container-ignored .bundle-page-tier-item-image, 
        .ssl-container-ignored figure,
        .ssl-container-ignored img.img-fit {
            border: 4px solid #d9534f !important;
            border-radius: 6px;
            /* opacity: 0.6; - Removed per user request (too dark) */
        }
        .ssl-title-ignored {
             color: #d9534f !important;
        }
        
        /* v2.0.16: Bundle Wishlist Indicator - Inset Shadow to prevent clipping */
        .ssl-bundle-wishlisted {
            border: none !important;
            /* Inset shadow draws INSIDE the element, so it won't be clipped by overflow:hidden */
            box-shadow: inset 0 0 0 4px #66c0f4, 0 0 15px rgba(102, 192, 244, 0.6) !important; 
            /* Ensure detection on dark backgrounds */
            z-index: 10; 
        }

        /* v2.0.12: Bundle Wishlist Indicator */
        .ssl-wishlist-dot {
            display: none !important;
        }
    `);


        // v2.0.12: Scan Bundle Overview & Tier Items
        // v2.0.28: IndieGalaHandler Init
        // v2.0.31: IndieGala is now handled by a separate script as per user request.
        /*
        if (currentConfig.name === 'IndieGala') {
            IndieGalaHandler.init();
            return;
        }
        */

        currentConfig.selectors.forEach(strat => {
            const elements = document.querySelectorAll(strat.container);
            if (DEBUG && currentConfig.name === 'IndieGala') {
                console.log(`[Game Store Enhancer] [DEBUG] Selector "${strat.container}" found ${elements.length} elements.`);
            }
            elements.forEach(el => {
                processGameElement(el, strat.title, strat.forceSimple, strat.externalTitle);
            });
        });
    }


    // v2.0.28: IndieGalaHandler - Unified Logic
    /*
    const IndieGalaHandler = {
        config: {
            homepage: {
                urlRegex: /^https?:\/\/www\.indiegala\.com\/?$/,
                selectors: [
                    { container: '.main-list-item-col', title: '.main-list-item-col-title', img: '.main-list-item-col-image' }
                ]
            },
            store: {
                urlRegex: /\/store/,
                selectors: [
                    { container: '.main-list-results-item', title: '.main-list-results-item-title a', img: 'figure' }
                ]
            },
            bundlesOverview: {
                urlRegex: /\/bundles/,
                selectors: [
                    { container: '.container-item', title: null, link: 'a.container-item-click-cover' }
                ]
            },
            bundleDetail: {
                urlRegex: /\/bundle\/(?!s\/)/,
                selectors: [
                    // v2.0.30: Simplified to target inner card for correct border placement
                    { container: '.bundle-page-tier-item-inner', title: '.bundle-page-tier-item-title', img: 'figure' }
                ]
            }
        },

        init: function () {
            const path = window.location.href;
            if (this.config.homepage.urlRegex.test(path)) this.handleHomePage();
            else if (this.config.store.urlRegex.test(path)) this.handleStorePage();
            else if (this.config.bundlesOverview.urlRegex.test(path)) this.handleBundlesOverview();
            else if (this.config.bundleDetail.urlRegex.test(path)) this.handleBundleDetail();

            // Global Styles
            this.injectStyles();
        },

        injectStyles: function () {
            if (document.getElementById('ssl-ig-styles')) return;
            GM_addStyle(`
                .ssl-border-owned { border: 3px solid #a4d007 !important; border-radius: 4px !important; box-shadow: 0 0 5px rgba(164, 208, 7, 0.5); }
                .ssl-border-wishlisted { border: 3px solid #66c0f4 !important; border-radius: 4px !important; box-shadow: 0 0 5px rgba(102, 192, 244, 0.5); }
                .ssl-border-ignored { border: 3px solid #d9534f !important; border-radius: 4px !important; opacity: 0.6; }
                
                .ssl-steam-overlay {
                    position: absolute; bottom: 0; left: 0; width: 100%;
                    background: rgba(0,0,0,0.85); color: white; font-size: 11px;
                    padding: 3px 0; text-align: center; display: flex !important;
                    justify-content: center; align-items: center; z-index: 9999 !important; /* v2.0.30: Max Z-Index */
    pointer - events: auto; text - decoration: none!important;
}
    .ssl - steam - overlay img { width: 14px; height: 14px; vertical - align: middle; margin - right: 4px; }
`);
            const s = document.createElement('style'); s.id = 'ssl-ig-styles'; document.head.appendChild(s);
        },

        handleHomePage: function () { this.scanGrid(this.config.homepage.selectors); },
        handleStorePage: function () { this.scanGrid(this.config.store.selectors); },

        handleBundleDetail: function () {
            this.config.bundleDetail.selectors.forEach(strat => this.scanGrid([strat], true));
        },

        handleBundlesOverview: function () {
            const strat = this.config.bundlesOverview.selectors[0];
            document.querySelectorAll(strat.container).forEach(container => {
                if (container.dataset.sslProcessed) return;

                // Find Link
                const link = container.querySelector(strat.link) || container.querySelector('a[href^="/bundle/"]');
                if (!link) return;

                container.dataset.sslProcessed = "fetching";
                const bundleUrl = link.href;
                const bundleId = bundleUrl.split('/').pop();
                const cacheKey = `ssl_bundle_wishlist_${ bundleId } `;

                // Cache Check
                const cached = getStoredValue(cacheKey, null);
                if (cached && (Date.now() - cached.timestamp < CACHE_TTL * 4)) {
                    if (cached.hasWishlist) this.applyStyles(container, 'wishlisted');
                    container.dataset.sslProcessed = "true";
                    return;
                }

                // Fetch
                steamQueue.add(() => new Promise(resolve => {
                    GM_xmlhttpRequest({
                        method: 'GET', url: bundleUrl,
                        onload: (res) => {
                            try {
                                const html = res.responseText;
                                const allIds = new Set();
                                const matches = html.matchAll(/store\.steampowered\.com\/app\/(\d+)/g);
                                for (const m of matches) allIds.add(m[1]);

                                // Also check image logic if needed (backup)
                                const imgMatches = html.matchAll(/\/bundle_games\/(\d+\/)?(\d+)\.jpg/g);
                                for (const m of imgMatches) allIds.add(m[2] || m[1]);

                                fetchSteamUserData().then(userData => {
                                    const wishlist = userData?.wishlist || [];
                                    const hasWishlist = Array.from(allIds).some(id => wishlist.some(w => (w.appid == id || w == id)));

                                    if (hasWishlist) this.applyStyles(container, 'wishlisted');
                                    setStoredValue(cacheKey, { hasWishlist, timestamp: Date.now() });
                                    container.dataset.sslProcessed = "true";
                                    resolve();
                                });
                            } catch (e) { resolve(); }
                        },
                        onerror: () => resolve()
                    });
                }));
            });
        },

        scanGrid: function (selectors, isBundleDetail = false) {
            selectors.forEach(strat => {
                document.querySelectorAll(strat.container).forEach(container => {
                    if (container.dataset.sslProcessed) return;

                    // Ensure Position
                    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';

                    const titleEl = container.querySelector(strat.title);
                    if (!titleEl) return; // Must have title

                    const title = titleEl.textContent.trim();
                    const imgContainer = (strat.img === 'figure' ? container.querySelector('figure') : container.querySelector(strat.img)) || container;

                    if (!imgContainer) return;

                    // Ensure Img Context
                    if (window.getComputedStyle(imgContainer).position === 'static') imgContainer.style.position = 'relative';

                    // Scan ID
                    const appId = getAppId(container, title);

                    if (appId) {
                        this.processGame(appId, title, container, imgContainer, isBundleDetail);
                    } else {
                        // Search
                        searchSteam(title, container, 'ig_grid', isBundleDetail).then(res => {
                            // handled by linkSteamApp/searchSteam internals
                        });
                    }
                    container.dataset.sslProcessed = "pending";
                });
            });
        },

        processGame: async function (appId, title, container, imgContainer, isBundleDetail) {
            // Reuse generic data fetcher, but apply IG specific styles
            linkSteamApp(appId, imgContainer, title, isBundleDetail, container);
        },

        applyStyles: function (container, status) {
            container.classList.remove('ssl-border-owned', 'ssl-border-wishlisted', 'ssl-border-ignored');
            if (status !== 'none') container.classList.add(`ssl - border - ${ status } `);

            // Handle Bundle Detail "Ignored" Opacity special case
            if (status === 'ignored') {
                const img = container.querySelector('img');
                if (img) img.style.opacity = '0.6';
            }
        }
    };
    // --- Helper Functions (Restored & Updated) ---

    // v2.0.28: Updated Linker with Standardized CSS
    async function linkSteamApp(appId, container, title, isBundleDetail) {
        if (!appId) return;

        // 1. Fetch Data
        const userData = await userDataPromise;
        const owned = userData.ownedApps.includes(parseInt(appId));
        const wishlisted = userData.wishlist.some(w => (w.appid === parseInt(appId) || w === parseInt(appId)));
        const ignored = userData.ignored && userData.ignored[appId];

        const [proton, reviews] = await Promise.all([
            fetchProtonDB(appId),
            fetchSteamReviews(appId)
        ]);

        // 2. Target Image
        let figure = container.querySelector('figure') ||
            container.querySelector('.bundle-page-tier-item-image') ||
            container.querySelector('.main-list-item-col-image') ||
            container.querySelector('.main-list-results-item-img') ||
            container;

        if (window.getComputedStyle(figure).position === 'static') figure.style.position = 'relative';

        // 3. Create Overlay IF not exists
        if (!figure.querySelector('.ssl-steam-overlay')) {
            const overlay = document.createElement('a');
            overlay.className = 'ssl-steam-overlay';
            overlay.href = `https://store.steampowered.com/app/${appId}/`;
overlay.target = '_blank';

let statusHtml = '<span style="color:#fff; font-weight:bold;">STEAM</span>';
if (owned) statusHtml = '<span style="color:#a4d007; font-weight:bold;">OWNED</span>';
else if (wishlisted) statusHtml = '<span style="color:#66c0f4; font-weight:bold;">WISHLIST</span>';
else if (ignored) statusHtml = '<span style="color:#d9534f; font-weight:bold;">IGNORED</span>';

let reviewSnippet = '';
if (reviews && reviews.percent) {
    let color = '#a8926a';
    if (parseInt(reviews.percent) >= 70) color = '#66C0F4';
    if (parseInt(reviews.percent) < 40) color = '#c15755';
    reviewSnippet = ` <span style="color:${color}; margin-left:5px; font-weight:bold;">${reviews.percent}%</span>`;
}

// Using flex style from CSS
overlay.innerHTML = `<img src="https://store.steampowered.com/favicon.ico"> ${statusHtml}${reviewSnippet}`;
figure.appendChild(overlay);
        }

// 4. Updates Styles (Classes)
container.classList.remove('ssl-border-owned', 'ssl-border-wishlisted', 'ssl-border-ignored');

if (owned) container.classList.add('ssl-border-owned');
else if (wishlisted) container.classList.add('ssl-border-wishlisted');
else if (ignored) {
    container.classList.add('ssl-border-ignored');
    // Dim image for ignored
    if (isBundleDetail) {
        const img = container.querySelector('img');
        if (img) img.style.opacity = '0.6';
    }
}

// 5. Stats
const uniqueId = title + '_' + appId;
if (!stats.countedSet.has(uniqueId)) {
    if (owned) stats.owned++;
    else if (wishlisted) stats.wishlist++;
    else if (ignored) stats.ignored++;
    else stats.missing++;
    stats.total++;
    stats.countedSet.add(uniqueId);
    updateStatsUI();
}
container.dataset.sslStatsCounted = "true";
    }

// v2.0.28: Search Helper
async function searchSteam(title, container, type, isBundleDetail) {
    try {
        const result = await searchSteamGame(title);
        if (result && result.id) {
            linkSteamApp(result.id, container, title, isBundleDetail);
        } else {
            stats.no_data++;
            stats.total++;
            updateStatsUI();
            container.dataset.sslProcessed = "no_data";
        }
    } catch (e) {
        console.error(e);
        container.dataset.sslProcessed = "error";
    }
}

// --- Observer ---
const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    mutations.forEach(m => { if (m.addedNodes.length > 0) shouldScan = true; });
    if (shouldScan) {
        if (window.sslScanTimeout) clearTimeout(window.sslScanTimeout);
        window.sslScanTimeout = setTimeout(scanPage, 500);
    }
});

observer.observe(document.body, { childList: true, subtree: true });


// v2.0: Init Cache then Scan
setTimeout(() => {
    fetchSteamAppCache();
    scanPage();
}, 1000);
}) ();
