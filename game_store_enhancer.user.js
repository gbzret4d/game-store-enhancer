// ==UserScript==
// @name         Game Store Enhancer (Dev)
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      2.5.0
// @description  Enhances Humble Bundle, Fanatical, DailyIndieGame, and GOG with Steam data (owned/wishlist status, reviews, age rating).
// @author       gbzret4d
// @match        https://www.humblebundle.com/*
// @match        https://www.fanatical.com/*
// @match        https://dailyindiegame.com/*
// @match        https://www.dailyindiegame.com/*
// @match        https://www.gog.com/*
// @match        https://store.steampowered.com/agecheck/*

// @icon         https://store.steampowered.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/game_store_enhancer.user.js
// @homepageURL  https://github.com/gbzret4d/game-store-enhancer
// @connect      store.steampowered.com
// @connect      www.protondb.com
// @connect      protondb.max-p.me
// @connect      steamcommunity.com
// @connect      gbzret4d.github.io
// @connect      cdn.jsdelivr.net
// @connect      steamdb.info
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
                { container: '[class*="product-detail"]', title: 'h1' },
                // v2.1.13: Homepage Support
                { container: '.full-tile-view', title: '.item-title' }, // Featured
                { container: '.product-tile', title: '.item-title' },   // Store/Bundle
                { container: '.mosaic-tile', title: '.item-title' },     // Mosaic
                { container: '.takeover-tile-view', title: '.item-title' }, // Featured Takeover

                // v2.4.0: Layout Update (2026)
                { container: '.item-details', title: '.item-title' }, // Bundle Page V2
                { container: '.js-item-details', title: '.item-title' }, // Bundle Page V2 (JS)
                { container: '.entity-link', title: '.entity-title' }, // Store Page V2
                { container: '.js-entity-link', title: '.entity-title' } // Store Page V2 (JS)
            ],
            isValidGameElement: (element, nameEl) => {
                const isHomepage = window.location.pathname === '/' || window.location.pathname === '/home';

                // v2.1.13: Homepage uses slick-slide heavily. We MUST allow it there.
                // But on Bundle pages, we still want to filter it out to avoid duplicate carousel items.
                if (!isHomepage) {
                    // v2.1.2: Whitelist strategy for Bundles
                    // If we detect the main tier grid, ONLY accept items inside it.
                    if (document.querySelector('.desktop-tier-collection-view')) {
                        if (!element.closest('.desktop-tier-collection-view')) {
                            return false;
                        }
                        // Filter out carousel items that might be nested inside the main view
                        if (element.classList.contains('slick-slide') || element.closest('.slick-slide') || element.closest('.slick-track')) {
                            return false;
                        }
                    } else if (element.classList.contains('slick-slide') || element.closest('.slick-slide') || element.closest('.marketing-su-module-slide') || element.closest('.slick-track')) {
                        // Fallback blacklist logic for non-homepage
                        return false;
                    }
                }

                const link = element.closest('a') || element.querySelector('a');
                if (link && link.href) {
                    if (link.href.includes('/store/search') || link.href.includes('/store/promo')) {
                        return false;
                    }
                }
                const text = nameEl.textContent.trim().toLowerCase();
                const blocklist = ['deals under', 'great on', 'browse by', 'top selling', 'new on humble', 'coming soon', 'ign plus', 'get one month of ign plus'];
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
        'store.steampowered.com': {
            name: 'Steam',
            selectors: [], // No game enhancements needed on Steam itself yet
            ignoreUrl: null
        }
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
    const DEBUG = false; // Enabled for debugging IndieGala

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
    const CACHE_VERSION = '2.18'; // v2.5.0: Stats Fixes & Product Page Visuals

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


        
        .profile-private-page-library-subitem .ssl-link {
            margin-left: 10px;
            float: right;
        }

        .items-list-item .ssl-link,
        .product-title-cont .ssl-link {
            display: block;
            margin-top: 5px;
            width: fit-content;
        }

        /* IndieGala Specific Overrides */

        
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

        /* v2.1.9: Fix Clipping & Corners */
        .tier-item-view {
            overflow: visible !important; /* Allow badge to hang out if needed */
            position: relative !important;
        }

        /* Ensure badge is above the border and visible */
        .ssl-link, .ssl-steam-overlay {
            z-index: 20 !important;
            position: absolute !important;
            bottom: 6px; 
            left: 6px;
            border-bottom-left-radius: 4px;
        }

        /* Humble Home Link - Top Left on Image */
        .humble-home-steam-link {
            z-index: 200000 !important; /* Extremely high to sit on top of everything */
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            bottom: auto !important;
            border-top-left-radius: 4px;
            border-bottom-right-radius: 4px;
            opacity: 1 !important; /* Force Full Opacity */
            pointer-events: auto !important; /* Ensure clickable */
        }
        
        .humble-home-steam-link * {
            opacity: 1 !important; /* Ensure children are opaque */
        }

        /* v2.1.8: Refined Border Styling (Box-Shadow for cleaner look) */
        .ssl-container-owned::before, .ssl-container-wishlist::before, .ssl-container-ignored::before {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 10;
            pointer-events: none;
            border-radius: 4px; /* Default Humble Radius */
            box-sizing: border-box; /* Ensure border is inside */
            transition: all 0.2s ease;
        }

        /* Use Box-Shadow for a glow effect that doesn't mess with layout/padding */
        .ssl-container-owned::before {
            border: 2px solid #5cb85c;
            box-shadow: inset 0 0 4px rgba(92, 184, 92, 0.5), 0 0 4px rgba(92, 184, 92, 0.5);
        }
        
        .ssl-container-wishlist::before {
            border: 2px solid #5bc0de;
            box-shadow: inset 0 0 4px rgba(91, 192, 222, 0.5), 0 0 4px rgba(91, 192, 222, 0.5);
        }

        .ssl-container-ignored::before {
            border: 2px solid #d9534f;
            box-shadow: inset 0 0 4px rgba(217, 83, 79, 0.5), 0 0 4px rgba(217, 83, 79, 0.5);
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
        .main-list-item figure,
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
            bottom: 10px;
            right: 10px;
            background: rgba(0,0,0,0.8);
            color: #fff;
            padding: 10px;
            border-radius: 4px;
            z-index: 100000; /* High Z-index */
            font-size: 12px;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
            pointer-events: auto !important; /* Ensure clickable */
        }
        #ssl-stats h4 { margin: 0 0 5px 0; font-size: 14px; text-decoration: underline; color: #66c0f4; }
        #ssl-stats div { margin-bottom: 2px; }
        #ssl-stats .val { float: right; margin-left: 10px; font-weight: bold; color: #a4d007; }
        #ssl-stats:hover {
            opacity: 1;
            right: 0;
            pointer-events: auto;
        }
        
        .ssl-stats-panel-content { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    .ssl-stats-panel-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 5px; margin-bottom: 5px; }
    .ssl-stats-panel-title { font-weight: bold; color: #fff; }
    .ssl-stats-close { cursor: pointer; color: #aaa; }
    .ssl-stats-close:hover { color: #fff; }
    .ssl-stats-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .ssl-stats-label { color: #ccc; }
    .ssl-stats-value { font-weight: bold; color: #fff; }
    .ssl-link-inline { display: inline-block !important; margin-right: 8px !important; }

    /* Homepage Enhancements */
    .humble-home-steam-link { 
        display: inline-block; 
        margin-left: 8px; 
        vertical-align: middle; 
        opacity: 0.8;
        transition: opacity 0.2s;
    }
    .humble-home-steam-link:hover { opacity: 1; }
    
    .ssl-bundle-status {
        position: absolute;
        top: 8px;
        right: 8px;
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: bold;
        font-size: 12px;
        color: white;
        background: rgba(0,0,0,0.8);
        box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        z-index: 10;
        pointer-events: none;
    }
    .ssl-status-wishlist { border: 1px solid #3c9bf0; color: #3c9bf0; }
    .ssl-status-owned { border: 1px solid #4cff00; color: #4cff00; }
    .ssl-status-icon { margin-right: 4px; }
    
    .ssl-wishlist-dot { display: none; } /* Deprecated */
        
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

        /* Review Colors */
        .ssl-review-positive { color: #66c0f4 !important; font-weight: bold; }
        .ssl-review-mixed { color: #a4d007 !important; font-weight: bold; }
        .ssl-review-negative { color: #d9534f !important; font-weight: bold; }

        /* Humble Bundle Specifics */
        .tier-item-view, .entity-block-container,
        .item-details, .js-item-details, .entity-link, .takeover-tile-view {
             position: relative !important;
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

        // v2.5.0: Add Account Stats Section
        const cachedUserData = getStoredValue('steam_userdata', null);
        if (cachedUserData && cachedUserData.data) {
            html += `<div style="margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #444;">
                        <div style="font-size:10px; color:#aaa; margin-bottom:2px;">STEAM ACCOUNT</div>
                        <div>Owned: <span class="val" style="float:right; color:#a4d007;">${cachedUserData.data.ownedApps.length}</span></div>
                        <div>Wishlist: <span class="val" style="float:right; color:#66c0f4;">${cachedUserData.data.wishlist.length}</span></div>
                      </div>`;
        }

        html += `<div style="font-size:10px; color:#aaa; margin-bottom:2px;">PAGE STATS</div>`;
        const lines = [
            { label: 'Total Unique', val: stats.total },
            { label: 'Owned', val: stats.owned },
            { label: 'Wishlist', val: stats.wishlist },
            { label: 'Ignored', val: stats.ignored },
            { label: 'Missing', val: stats.missing },
            { label: 'No Data', val: stats.no_data }
        ];
        lines.forEach(l => { html += `<div>${l.label}: <span class="val">${l.val}</span></div>`; });

        // v2.4.16: Add Timestamp & Refresh Button
        // reuse cachedUserData from above
        if (cachedUserData && cachedUserData.timestamp) {
            const date = new Date(cachedUserData.timestamp);
            html += `<div style="margin-top:4px; font-size:10px; color:#aaa; border-top:1px solid #555; paddingTop:4px;">
                        Last Updated:<br>${date.toLocaleTimeString()} (${date.toLocaleDateString()})
                     </div>`;
        } else {
            html += `<div style="margin-top:4px; font-size:10px; color:#aaa;">No Data Cached</div>`;
        }

        html += `<div style="margin-top: 8px; text-align: center;">
             <button id="ssl-refresh-btn" style="
                 background: #333; color: #fff; border: 1px solid #555; 
                 pointer-events: auto; /* Force clickable */
                 padding: 4px 8px; cursor: pointer; font-size: 10px; border-radius: 2px;">
                 Refresh Data
             </button></div>`;

        panel.innerHTML = html;

        // Add Event Listener
        setTimeout(() => {
            const btn = document.getElementById('ssl-refresh-btn');
            if (btn) {
                btn.onclick = () => {
                    if (confirm('Clear Steam UserData Cache and Reload?')) {
                        setStoredValue('steam_userdata', null);
                        window.location.reload();
                    }
                };
            }
        }, 100);
    } function createSteamLink(appData) {
        if (!appData || !appData.id) return document.createElement('span');

        const link = document.createElement('a');
        link.className = 'ssl-link';

        let typePath = 'app';
        if (appData.type === 'sub') typePath = 'sub';
        if (appData.type === 'bundle') typePath = 'bundle';

        link.href = `https://store.steampowered.com/${typePath}/${appData.id}/`;
        link.target = '_blank';
        link.title = appData.name;

        let html = `<span><img src="https://store.steampowered.com/favicon.ico" style="width:12px; height:12px; vertical-align:middle; margin-right:4px;">STEAM</span>`;
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
                            ownedPackages: data.rgOwnedPackages || [],
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
    const STEAM_CACHE_URL = 'https://cdn.jsdelivr.net/gh/gbzret4d/game-store-enhancer@develop/data/steam_apps.min.json';
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
        // v2.1.7: Removed Manual Mapping - Using SteamDB Fallback instead

        const lowerName = gameName.toLowerCase().trim();
        const cacheKey = `steam_search_${lowerName.replace(/[^a-z0-9]/g, '')}`;
        const cached = getStoredValue(cacheKey, null);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL * 7)) return cached.data;

        const cleanupRegex = /(:| -| –| —)?\s*(The\s+)?(Pre-Purchase|Pre-Order|Steam Key|Complete|Anthology|Collection|Definitive|Game of the Year|GOTY|Digital|Deluxe|Ultimate|Premium)(\s+(Edition|Cut|Content|Pack))?(\s+Bundle)?(\s*\.{3,})?/gi;
        const cleanedName = gameName.replace(cleanupRegex, '').trim().toLowerCase();

        // 1. Try EXACT name first, then fallback to cleaned name
        const searchTerms = [gameName];
        if (cleanedName !== gameName.toLowerCase()) {
            searchTerms.push(cleanedName);
        }

        // v2.1.11: Aggressive Fallback for "Digital Deluxe" etc.
        // If "Prey Digital Deluxe Edition" fail, we MUST try "Prey"
        if (cleanedName.includes(' ')) {
            const baseName = cleanedName.split(/\s(digital|deluxe|edition|remaster|definitive|goty|game of the year|complete|collection|anthology)/i)[0].trim();
            // Ensure baseName is valid and not just empty
            if (baseName && baseName.length > 2 && baseName !== cleanedName) {
                console.log(`[Game Store Enhancer] Adding Base Name Fallback: "${baseName}"`);
                searchTerms.push(baseName);
            }
        }

        // v2.0: Check Offline Cache First
        const appDb = getStoredValue('steam_apps_db', null)?.data;
        if (appDb) {
            // Check all terms in offline cache
            for (const term of searchTerms) {
                const appId = appDb[term.toLowerCase().replace(/[^a-z0-9]/g, '')] || appDb[term];
                if (appId) {
                    console.log(`[Game Store Enhancer] Offline Cache Hit: "${term}" -> ID ${appId}`);
                    const result = { id: appId, type: 'app', name: gameName, price: null, discount: 0 };
                    setStoredValue(cacheKey, { data: result, timestamp: Date.now() });
                    return result;
                }
            }
        }

        console.log(`[Game Store Enhancer] Search Strategy:`, searchTerms);

        // Perform Online Search (Try terms sequentially)
        for (const term of searchTerms) {
            let result = await performOnlineSearch(term);

            // v2.1.7: SteamDB Fallback for Subs/Bundles (e.g. Prey Digital Deluxe)
            // Only try this if:
            // 1. Steam Store failed
            // 2. The term looks like a special edition (Deluxe/Edition/Complete)
            // 3. We haven't tried the "Base Name" fallback yet (which is usually the last term)
            const isBaseNameFallback = (term === searchTerms[searchTerms.length - 1] && searchTerms.length > 1);

            if (!result && !isBaseNameFallback && (term.toLowerCase().includes('deluxe') || term.toLowerCase().includes('edition') || term.toLowerCase().includes('complete'))) {
                console.log(`[Game Store Enhancer] Steam Store failed for "${term}", trying SteamDB...`);
                result = await searchSteamDB(term);
            }

            if (result) {
                setStoredValue(cacheKey, { data: result, timestamp: Date.now() });
                return result;
            }
        }

        // If all failed
        setStoredValue(cacheKey, { data: null, timestamp: Date.now() });
        return null;
    }

    // v2.1.7: Search SteamDB for Subs/Packages that Steam Store hides
    async function searchSteamDB(term) {
        return steamQueue.add(() => new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://steamdb.info/search/?a=sub&q=${encodeURIComponent(term)}`,
                onload: (res) => {
                    if (res.status !== 200 || res.responseText.includes('Cloudflare')) {
                        console.error(`[Game Store Enhancer] SteamDB Blocked/Error: ${res.status} for "${term}"`);
                        resolve(null);
                        return;
                    }
                    try {
                        const parser = new DOMParser();
                        // ...
                        const doc = parser.parseFromString(res.responseText, "text/html");
                        // SteamDB search results table: .table-hover tbody tr
                        const firstRow = doc.querySelector('.table-hover tbody tr');
                        if (firstRow) {
                            const link = firstRow.querySelector('a[href^="/sub/"]');
                            if (link) {
                                const subId = link.getAttribute('href').split('/')[2];
                                const name = link.textContent.trim();
                                console.log(`[Game Store Enhancer] SteamDB Hit: "${term}" -> Sub/Package ${subId}`);
                                resolve({ id: subId, type: 'sub', name: name, price: null, discount: 0 });
                                return;
                            }
                        }
                        resolve(null);
                    } catch (e) {
                        console.error("[Game Store Enhancer] SteamDB Parse Error:", e);
                        resolve(null);
                    }
                },
                onerror: () => resolve(null)
            });
        }));
    }

    async function performOnlineSearch(term) {
        return steamQueue.add(() => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                // v1.62: Use hardcoded URL to ensure HTML return
                url: `https://store.steampowered.com/search/results?term=${encodeURIComponent(term)}&ignore_preferences=1`,
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
                            resolve(result);
                        } else {
                            console.log(`[Game Store Enhancer] No results for "${term}"`);
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

    // --- Processing ---

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
                // v2.1.0: Ignore generic/empty links (Fixes IndieGala Bundle Deduplication)
                const href = link.getAttribute('href');
                if (href && href !== '#' && !href.startsWith('javascript:') && href.trim() !== '') {
                    // Remove query parameters to normalize URLs
                    return link.href.split('?')[0];
                }
            }
            return name; // Fallback to name if no valid link found
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
                    result = { id: directId, type: 'direct' };
                }
            }

            if (!result) {
                // v1.45: Skip Name Scan if "Force Simple" is active (unless direct ID found above)
                if (forceSimpleArg) return;
                // v1.3: 2. Name Scan (Fallback)
                result = await searchSteamGame(gameName);
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

                // v2.1.4: Hide Native Humble Review Text to reduce clutter
                if (currentConfig.name === 'Humble Bundle') {
                    // Look for divs containing "Positive on Steam" text
                    const nativeReviews = element.querySelectorAll('div, span');
                    nativeReviews.forEach(el => {
                        if (el.textContent.includes('Positive on Steam') || el.textContent.includes('Very Positive') || el.textContent.includes('Mixed') || el.textContent.includes('Negative')) {
                            el.style.display = 'none';
                        }
                    });
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

        // v2.4.1: Auto Age Check
        if (currentConfig.name === 'Humble Bundle') {
            if (document.querySelector('.age-check-form') || window.location.href.includes('agecheck')) {
                const yearSelect = document.querySelector('select[name="year"]');
                const enterBtn = document.querySelector('button[type="submit"], input[type="submit"]');
                if (yearSelect) {
                    yearSelect.value = '1990';
                    yearSelect.dispatchEvent(new Event('change'));
                }
                if (enterBtn) enterBtn.click();
            }
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


    // --- Homepage Bundle Scanner (v2.1.14 / v2.2.0) ---
    const BUNDLE_CACHE_KEY = 'gse_bundle_cache';
    const BUNDLE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 Hours

    function getBundleCache() {
        try {
            const raw = GM_getValue(BUNDLE_CACHE_KEY, '{}');
            return JSON.parse(raw);
        } catch (e) { return {}; }
    }

    function setBundleCache(url, gameIds) {
        const cache = getBundleCache();
        cache[url] = { timestamp: Date.now(), games: gameIds };
        GM_setValue(BUNDLE_CACHE_KEY, JSON.stringify(cache));
    }

    async function fetchBundleContents(url) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: (res) => {
                    try {
                        const text = res.responseText;
                        // Regex to find "machine_name" (e.g. "machine_name": "prey_digitaldeluxe")
                        // Or better yet, look for the 'models' blob if possible, but regex is faster/lighter than DOM parsing
                        // Pattern: "machine_name":\s*"([^"]+)"
                        const machineNames = [];
                        const regex = /"machine_name":\s*"([^"]+)"/g;
                        let match;
                        while ((match = regex.exec(text)) !== null) {
                            machineNames.push(match[1]);
                        }
                        resolve([...new Set(machineNames)]); // Unique IDs
                    } catch (e) { resolve([]); }
                },
                onerror: () => resolve([])
            });
        });
    }

    async function scanHomepageBundles() {
        if (window.location.pathname !== '/') return;

        // Find Bundle Tiles (using the same selectors we added for titles)
        const tiles = document.querySelectorAll('.full-tile-view a, .mosaic-tile, .product-tile a');
        const cache = getBundleCache();

        // Helper to check user status against a list of machine names
        const checkStatus = (machineNames) => {
            let wishlisted = 0;
            let owned = 0;
            let total = machineNames.length;

            // We need to map Machine Name -> AppID. 
            // This is tricky without the Asset Scanner.
            // HOWEVER, we can check the 'steam_app_cache' if we have it, OR just rely on the fact
            // that we might not have the ID yet. 
            // BUT, wait! 'steam_userdata' is keyed by AppID. 
            // We need AppIDs. 
            // The bundle page source usually contains 'steam_app_id' as well!
            // Let's optimize the Regex to find 'steam_app_id'.
            return { wishlisted: 0, owned: 0 }; // Placeholder until we fix the AppID extraction
        };

        // Refined Fetch for AppIDs
        const fetchBundleAppIds = (url) => {
            if (cache[url] && (Date.now() - cache[url].timestamp < BUNDLE_CACHE_TTL)) {
                return Promise.resolve(cache[url].games); // These should be AppIDs now
            }
            return new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: (res) => {
                        const text = res.responseText;
                        const appIds = [];

                        // Strategy 1: Look for "steam_app_id": 12345 (Standard JSON)
                        let regex = /"steam_app_id":\s*(\d+)/g;
                        let match;
                        while ((match = regex.exec(text)) !== null) appIds.push(parseInt(match[1]));

                        // Strategy 2: Look for steam_app_id: 12345 (JS Object keys)
                        regex = /steam_app_id:\s*(\d+)/g;
                        while ((match = regex.exec(text)) !== null) appIds.push(parseInt(match[1]));

                        // Strategy 3: Look for machine_name if App ID is missing? 
                        // No, stick to App IDs for now as they are reliable for comparisons.
                        // But if we find NO App IDs, maybe we should try finding the "products" blob?
                        // For now, simple regex is usually enough if the source contains the data.

                        const unique = [...new Set(appIds)];
                        if (unique.length > 0) setBundleCache(url, unique);
                        resolve(unique);
                    },
                    onerror: () => resolve([])
                });

            });
        };

        for (const tile of tiles) {
            let container = tile.closest('.full-tile-view, .mosaic-tile, .product-tile');
            if (!container) continue;

            // Avoid re-processing
            if (container.dataset.gseBundleScanned) continue;

            const href = tile.href || tile.parentElement.href;
            // 1. Filter Non-Game Bundles from URL
            if (!href || (!href.includes('/games/') && !href.includes('/software/') && !href.includes('humble_choice'))) {
                // Check for generic 'bundle' path but EXCLUDE books/software explicit paths
                if (href.includes('/books/') || href.includes('/software/')) return;
                // If it's just /bundles/something, we might want to check it ONLY if the user wants?
                // User said "ignore books/software".
                if (!href.includes('/games/') && !href.includes('humble_choice')) return;
            }

            // v2.4.0: Exclude IGN Plus
            if (tile.innerText.toLowerCase().includes('ign plus')) return;

            // Mark as scanning
            container.dataset.gseBundleScanned = "pending";

            fetchBundleAppIds(href).then(appIds => {
                if (!appIds || appIds.length === 0) return;

                // Compare with User Data
                const userdata = getStoredValue('steam_userdata', { owned: [], wishlist: [] });
                const wishlistedCount = appIds.filter(id => {
                    if (userdata.wishlist.includes(id)) return true;
                    if (userdata.owned.includes(id)) return false;
                    return false;
                }).length;
                const ownedCount = appIds.filter(id => userdata.owned.includes(id)).length;
                const totalCount = appIds.length;

                // Visual Feedback
                if (wishlistedCount > 0) {
                    container.classList.add('ssl-container-wishlist');
                    const badge = document.createElement('div');
                    badge.className = 'ssl-bundle-status ssl-status-wishlist';
                    badge.innerHTML = `<span class="ssl-status-icon">♥</span> ${wishlistedCount}`;
                    badge.title = `${wishlistedCount} Wishlisted Item(s)`;
                    container.style.position = 'relative';
                    container.appendChild(badge);
                } else if (ownedCount === totalCount && totalCount > 0) {
                    container.classList.add('ssl-container-owned');
                    const badge = document.createElement('div');
                    badge.className = 'ssl-bundle-status ssl-status-owned';
                    badge.innerHTML = `<span class="ssl-status-icon">✓</span> Owned`;
                    container.style.position = 'relative';
                    container.appendChild(badge);
                } else if (ownedCount > 0) {
                    // Partial Ownership (Optional: Orange/Blue mix?)
                    // For now, let's just show owned count if significant? 
                    // Or maybe just leave it clean. 
                }

                container.dataset.gseBundleScanned = "true";
            });
        }
    }

    // --- Homepage Game Scanner (v2.3.2 - Fixed) ---
    async function scanHomepageGames() {
        if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/store')) return;

        // v2.3.0: Broadened Selectors for Dynamic Tiles
        const selector = [
            '.full-tile-view',
            '.entity-block-container',
            '.mosaic-tile',
            '.game-tile',
            '.takeover-tile-view'
        ].join(', ');

        const tiles = document.querySelectorAll(selector);

        tiles.forEach(tile => {
            if (tile.dataset.gseGameScanned) return;

            // Heuristic v2: If no price class, look for any price-like text
            let priceEl = tile.querySelector('.price, .current-price, .price-button, .entity-pricing-details');
            if (!priceEl) {
                // Fallback: Find any element with a currency symbol
                // This is risky but necessary if classes are missing
                const candidates = tile.querySelectorAll('span, div');
                for (const c of candidates) {
                    if (/[€$£¥]/.test(c.innerText)) {
                        priceEl = c;
                        break;
                    }
                }
            }

            // If still no price and not explicitly a store tile, skip
            if (!priceEl && !tile.className.includes('store')) return;

            tile.dataset.gseGameScanned = "true";

            // 1. Extract Info - Retry Logic
            let titleEl = tile.querySelector('.js-tile-label, .tile-label, .entity-title, .human-name, .name');
            if (!titleEl) {
                // Fallback: The title is usually the first significant text that isn't the price
                const spans = tile.querySelectorAll('span');
                for (const s of spans) {
                    const text = s.innerText.trim();
                    if (text.length > 2 && !/[€$£¥]/.test(text) && !text.includes('OFF')) {
                        titleEl = s;
                        break;
                    }
                }
            }

            if (!titleEl) return;

            let title = titleEl.innerText.trim();

            // Extract Link (robust)
            let href = "";
            const linkEl = tile.querySelector('a');
            if (tile.tagName === 'A') href = tile.href;
            else if (linkEl) href = linkEl.href;

            // Skip non-game links if possible
            if (href && (href.includes('/books/') || href.includes('/software/'))) return;

            // 2. Resolve AppID
            searchSteamGame(title).then(result => {
                const appId = result ? result.id : null;
                if (!appId) return;

                // 3. Fetch Data & Status (Unified)
                Promise.all([
                    fetchSteamUserData(),
                    fetchSteamReviews(appId)
                ]).then(([userdata, reviews]) => {

                    const appIdNum = parseInt(appId);
                    const owned = userdata.ownedApps.includes(appIdNum);
                    // v2.5.0: Robust Wishlist Check (Handle both [123] and [{appid:123}] formats)
                    const wishlisted = userdata.wishlist.some(w => (w === appIdNum || w.appid === appIdNum));
                    const ignored = userdata.ignored && userdata.ignored[appIdNum];

                    // Update Total Stats (v2.4.17)
                    // v2.5.0: Fix Duplicate Counting - Only count if not already processed for stats
                    const isNewStat = !stats.countedSet.has(appIdNum);
                    if (isNewStat) {
                        stats.total++;
                        stats.countedSet.add(appIdNum);
                    }

                    // Debugging for User Report (Reanimal / Resident Evil)
                    const titleLower = title.toLowerCase();
                    if (titleLower.includes('reanimal') || titleLower.includes('resident evil')) {
                        console.group(`[Game Store Enhancer DEBUG] ${title}`);
                        console.log(`Title: "${title}"`);
                        console.log(`Found AppID: ${appId} (Parsed: ${appIdNum})`);
                        console.log(`Owned Check: ${owned} (In List: ${userdata.ownedApps.includes(appIdNum)})`);
                        console.log(`Wishlist Check: ${wishlisted} (In List: ${userdata.wishlist.some(w => (w === appIdNum || w.appid === appIdNum))})`);
                        // v2.5.0: Enhanced Debugging for Packages
                        console.log(`Parsed UserData:`, {
                            owned_count: userdata.ownedApps.length,
                            wishlist_count: userdata.wishlist.length,
                            package_count: userdata.ownedPackages ? userdata.ownedPackages.length : 0
                        });
                        if (userdata.ownedPackages && userdata.ownedPackages.length > 0) {
                            // Check if AppID is in any User Packages (Not possible without map, but we can dump top packages or something?)
                            // Or just log that we HAVE packages.
                            console.log(`[DEBUG] User owns ${userdata.ownedPackages.length} packages. (Checking match is separate)`);
                        }
                        console.groupEnd();
                    }

                    if (owned) {
                        tile.classList.add('ssl-container-owned');
                        tile.style.position = 'relative'; // Ensure pseudo-element border works
                        if (isNewStat) stats.owned++; // Update stats only once per unique game
                        // v2.4.5: Only dim the image, not the whole tile (so badge stays opaque)
                        const img = tile.querySelector('img');
                        if (img) img.style.opacity = '0.6';
                        else tile.style.opacity = '0.6'; // Fallback

                        // v2.4.14: Use Outline instead of Border to avoid layout shift
                        tile.style.outline = '2px solid #5cb85c';
                        tile.style.outlineOffset = '-2px';
                        tile.style.zIndex = '10'; // Ensure it's above background
                    } else if (wishlisted) {
                        tile.classList.add('ssl-container-wishlist');
                        tile.style.position = 'relative'; // Ensure pseudo-element border works
                        if (isNewStat) stats.wishlist++; // Update stats only once per unique game
                        // v2.4.14: Use Outline instead of Border
                        tile.style.outline = '2px solid #3c9bf0';
                        tile.style.outlineOffset = '-2px';
                        tile.style.zIndex = '10'; // Ensure it's above background
                    } else {
                        // Debug: Why is it missing?
                        const titleLower = title.toLowerCase();
                        if (titleLower.includes('reanimal')) {
                            console.warn(`[Game Store Enhancer] 'REANIMAL' not detected as Owned or Wishlisted. Checked AppID: ${appIdNum}`);
                        }
                    }

                    // v2.5.0: Product Page Enhancements (H1 targeting)
                    if (window.location.pathname.startsWith('/store') && !window.location.pathname.endsWith('/store')) {
                        const h1 = document.querySelector('h1');
                        if (h1 && title === h1.innerText.trim()) {
                            // Apply Border Color to H1
                            if (owned) {
                                h1.style.border = '2px solid #a4d007'; // Green
                                h1.style.boxShadow = '0 0 10px rgba(164, 208, 7, 0.2)';
                            } else if (wishlisted) {
                                h1.style.border = '2px solid #3c9bf0'; // Blue
                                h1.style.boxShadow = '0 0 10px rgba(60, 155, 240, 0.2)';
                            } else if (ignored) {
                                h1.style.border = '2px solid #d9534f'; // Red
                            }

                            h1.style.padding = '8px 12px'; // More padding for the border
                            h1.style.borderRadius = '6px';
                            h1.style.display = 'inline-block'; // Hug content
                            h1.style.width = 'auto'; // Prevent full width if possible
                            h1.style.marginRight = '15px'; // Space for badge if inline

                            // Badge Placement Strategy: Append detailed badge to H1 or place after it
                            // The user wants: Link, Score, Status NEXT to the name.
                            // We can use the 'link' element we created, but style it to fit the header.

                            const badge = createSteamLink(Object.assign({}, appData, { name: '' })); // No tooltip name needed inside
                            badge.className = 'ssl-link'; // Reset class

                            // Custom Header Badge Styling
                            badge.style.display = 'inline-flex';
                            badge.style.alignItems = 'center';
                            badge.style.marginLeft = '15px';
                            badge.style.verticalAlign = 'middle';
                            badge.style.fontSize = '14px'; // Match header size roughly
                            badge.style.fontWeight = 'normal';
                            badge.style.background = 'transparent'; // Integrate with header? or keep dark pill?
                            // Keep dark pill for contrast
                            badge.style.backgroundColor = '#171a21';
                            badge.style.padding = '4px 10px';
                            badge.style.borderRadius = '4px';
                            badge.style.border = '1px solid #3c3d3e';

                            // Remove old badge if exists (prevent dupes)
                            const oldBadge = h1.querySelector('.ssl-link-header');
                            if (oldBadge) oldBadge.remove();
                            // Also check sibling
                            const nextSibling = h1.nextElementSibling;
                            if (nextSibling && nextSibling.classList.contains('ssl-link')) nextSibling.remove();

                            badge.classList.add('ssl-link-header');

                            // Append to H1 (so it wraps with it) or After? 
                            // User said "nebem dem spielnamen" (next to game name).
                            // Appending to H1 might inherit H1 styles (font weight/size). 
                            // Let's Insert After H1, but ensure they are on same line if possible.
                            h1.style.display = 'inline-block';
                            h1.after(badge);

                            // Stop processing standard tile logic for this H1 element to avoid double badges?
                            // The 'tile' here is likely the container OF the H1 or the product page wrapper.
                            // We should probably NOT return here, as we might still want the image to dim etc?
                            // But usually on product page, the "tile" being scanned is the main content area.
                        }
                    } else {
                        // Standard Grid/List View Logic (NOT Product Page Header)
                        // Refactor v2.4.8: Create Sibling Link to avoid nested A tags
                        // ... (Existing logic for tiles) ...
                        let targetContainer = tile.parentElement;
                        // Ensure parent is relative so we can position absolute over the tile
                        if (window.getComputedStyle(targetContainer).position === 'static') {
                            targetContainer.style.position = 'relative';
                        }

                        // Create real A tag
                        const linkContainer = document.createElement('a');
                        linkContainer.className = link.className + ' humble-home-steam-link';
                        linkContainer.innerHTML = link.innerHTML;
                        linkContainer.title = link.title;
                        linkContainer.href = `https://store.steampowered.com/app/${appId}`;
                        linkContainer.target = '_blank';

                        // Apply standard badge styles + absolute positioning with Layout Fixes (v2.3.10)
                        linkContainer.style.cssText = link.style.cssText;
                        linkContainer.style.position = 'absolute';
                        // v2.4.4: Top-Left Positioning (User Request)
                        linkContainer.style.top = '0';
                        linkContainer.style.left = '0';
                        linkContainer.style.bottom = 'auto'; // Reset bottom
                        linkContainer.style.zIndex = '200000'; // High Z-Index
                        linkContainer.style.cursor = 'pointer';
                        linkContainer.style.pointerEvents = 'auto';
                        linkContainer.style.borderTopLeftRadius = '4px';
                        linkContainer.style.borderBottomRightRadius = '4px';

                        // Layout Fixes - Prevent "Vertical Strip" Issue (v2.3.11)
                        linkContainer.style.setProperty('display', 'inline-flex', 'important');
                        linkContainer.style.setProperty('flex-direction', 'row', 'important');
                        linkContainer.style.setProperty('align-items', 'center', 'important');
                        linkContainer.style.setProperty('justify-content', 'flex-start', 'important');
                        linkContainer.style.setProperty('width', 'auto', 'important');
                        linkContainer.style.setProperty('max-width', 'none', 'important');
                        linkContainer.style.setProperty('height', 'auto', 'important');
                        linkContainer.style.setProperty('white-space', 'nowrap', 'important');
                        linkContainer.style.backgroundColor = '#171a21'; // Solid Steam Dark (no rgba)
                        linkContainer.style.opacity = '1.0'; // Force Opaque
                        linkContainer.style.padding = '2px 4px';
                        linkContainer.style.lineHeight = 'normal';
                        linkContainer.style.boxShadow = '1px 1px 3px rgba(0,0,0,0.5)';

                        // Also enforce on children if needed
                        Array.from(linkContainer.children).forEach(child => {
                            child.style.display = 'inline-block';
                            child.style.verticalAlign = 'middle';
                            child.style.opacity = '1.0';
                        });

                        if (DEBUG) console.log(`[Game Store Enhancer] Rendering Sibling Badge for "${title}"`, targetContainer);
                        targetContainer.appendChild(linkContainer);
                    }
                }
            } catch (e) {
                console.error('[Game Store Enhancer] Error in processGameElement:', e);
            }
        }
    }

    function scanHomepage() {
        scanHomepageBundles();
        scanHomepageGames();
        setTimeout(updateStatsUI, 1000); // Update stats after scan (delayed to allow async fetches)
    }

    // v2.4.9: Steam Age Check Bypass Logic
    function handleAgeCheck() {
        console.log('[Game Store Enhancer] Checking for Age Gate...');

        // 1. Dropdown Case (Year Selection)
        const yearDropdown = document.getElementById('ageYear');
        if (yearDropdown) {
            console.log('[Game Store Enhancer] Found Year Dropdown. Selecting 2000...');
            yearDropdown.value = '2000';
            yearDropdown.dispatchEvent(new Event('change'));
        }

        // Helper to find and click the button
        const tryClickButton = (attempt = 1) => {
            // Steam has used various IDs/Classes over the years.
            const btn = document.getElementById('view_product_page_btn') || // Variant 2 (No Year)
                document.querySelector('#age_gate_btn_continue') ||
                document.querySelector('.age_gate_btn_continue') ||
                document.querySelector('.btn_medium.btn_green_white_innerfade') || // Classic "Enter" button
                document.querySelector('a[onclick*="ViewProductPage"]');

            if (btn) {
                console.log(`[Game Store Enhancer] Bypassing Age Check (Clicking Button) on attempt ${attempt}...`);
                btn.click();
            } else {
                if (attempt < 10) { // Retry for ~2 seconds (10 * 200ms)
                    console.log(`[Game Store Enhancer] Button not found yet, retrying... (${attempt})`);
                    setTimeout(() => tryClickButton(attempt + 1), 200);
                } else {
                    console.log('[Game Store Enhancer] No continue button found after multiple retries.');
                }
            }
        };

        tryClickButton();
    }

    // v2.4.9: Age Check Bypass
    if (window.location.hostname === 'store.steampowered.com' && window.location.pathname.startsWith('/agecheck')) {
        handleAgeCheck();
        return; // Stop other processing on age check page
    }

    // v2.1.14: Init Cache then Scan
    setTimeout(() => {
        fetchSteamAppCache();
        scanPage(); // Normal Store Pages
        if (window.location.pathname === '/' || window.location.pathname.startsWith('/store')) {
            scanHomepage(); // Homepage Specifics
        }
    }, 10); // Fast start

})();
