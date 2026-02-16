// ==UserScript==
// @name         Game Store Enhancer (formerly Steam Store Linker)
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      1.36
// @description  Enhances Humble Bundle, Fanatical, DailyIndieGame, and GOG with Steam data (owned/wishlist status, reviews, age rating).
// @author       gbzret4d
// @match        https://www.humblebundle.com/*
// @match        https://www.fanatical.com/*
// @match        https://dailyindiegame.com/*
// @match        https://www.dailyindiegame.com/*
// @match        https://www.gog.com/*
// @icon         https://store.steampowered.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/main/game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/main/game_store_enhancer.user.js
// @homepageURL  https://github.com/gbzret4d/game-store-enhancer
// @connect      store.steampowered.com
// @connect      www.protondb.com
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
    const CACHE_VERSION = '2.3'; // v1.25: Bump to force reset with new TTL

    // Styles
    const css = `
        .ssl-link {
            display: inline-block;
            margin-top: 5px;
            margin-right: 10px; /* v1.34: Spacing for DIG */
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
        
        /* v1.34: Hide native Steam links on DailyIndieGame to avoid clutter */
        a[href*="dailyindiegame.com"] a[href*="store.steampowered.com"], /* Sub-links inside container? */
        tr[onmouseover] a[href*="store.steampowered.com"] {
             display: none !important; 
        }
        .ssl-link:hover { color: #fff; background: #2a475e; }
        .ssl-link span { margin-right: 4px; padding-right: 4px; border-right: 1px solid #3c3d3e; }
        .ssl-link span:last-child { border-right: none; margin-right: 0; padding-right: 0; }

        .ssl-owned { color: #a4d007; font-weight: bold; }
        .ssl-wishlist { color: #66c0f4; font-weight: bold; }
        .ssl-ignored { color: #d9534f; }

        .ssl-review-positive { color: #66C0F4; font-weight: bold; } /* Blue for positive */
        .ssl-review-mixed { color: #a8926a; font-weight: bold; } /* Brown for mixed */
        .ssl-review-negative { color: #c15755; font-weight: bold; } /* Red for negative */
        
        /* v1.34: Add "gap" between rows on DIG by using a border that matches the background color */
        /* Note: We use border-bottom on the container to simulate a gap because standard margins don't work on TR/TD well without collapsing */
        .ssl-container-owned {
            border: 4px solid #a4d007 !important;
            border-bottom: 8px solid #1a1c1d !important; /* Gap Simulation */
            background-color: rgba(76, 107, 34, 0.3) !important; 
            box-shadow: inset 0 0 20px rgba(164, 208, 7, 0.4);
            box-sizing: border-box !important;
            transition: all 0.2s;
            z-index: 10;
        }

        /* v1.36: Hide the redundant "STEAM page link" column specifically in the game rows */
        tr[onmouseover] td:last-child, 
        tr[onmouseover] td:nth-last-child(2) { /* Sometimes there are hidden cols? hiding last visual one */
             display: none !important; 
        }

        /* v1.36: Fix Badge Positioning inside table cells */
        .ssl-link-inline { 
            margin-left: 10px; 
            vertical-align: middle; 
        }
        .ssl-container-owned:hover {
            box-shadow: inset 0 0 30px rgba(164, 208, 7, 0.6) !important;
        }
        .ssl-container-wishlist {
            border: 4px solid #66c0f4 !important;
            border-bottom: 8px solid #1a1c1d !important; /* Gap Simulation */
            background-color: rgba(59, 110, 140, 0.3) !important;
            box-shadow: inset 0 0 20px rgba(102, 192, 244, 0.4);
            box-sizing: border-box !important;
            border-radius: 4px;
            z-index: 10;
        }
        .ssl-container-ignored {
            border: 4px solid #d9534f !important;
            border-bottom: 8px solid #1a1c1d !important; /* Gap Simulation */
            background-color: rgba(90, 90, 90, 0.3) !important;
            box-shadow: inset 0 0 10px rgba(217, 83, 79, 0.4);
            box-sizing: border-box !important;
            opacity: 0.5;
            z-index: 10;
        }

        /* v1.33: Border box handles overflow better, removing manual offsets */

        #ssl-stats {
            position: fixed; bottom: 10px; right: 10px;
            background: rgba(23, 26, 33, 0.95);
            color: #c7d5e0; padding: 10px; border-radius: 4px;
            z-index: 10000; font-size: 12px;
            box-shadow: 0 0 5px rgba(0,0,0,0.5);
            border: 1px solid #2a475e;
            pointer-events: none;
            opacity: 0.8; transition: opacity 0.3s;
        }
        #ssl-stats:hover { opacity: 1; pointer-events: auto; }
        #ssl-stats h4 { margin: 0 0 5px 0; color: #66c0f4; font-size: 13px; text-transform: uppercase; border-bottom: 1px solid #2a475e; padding-bottom: 2px; }
        #ssl-stats div { display: flex; justify-content: space-between; margin-bottom: 2px; }
        #ssl-stats span.val { font-weight: bold; color: #fff; margin-left: 10px; }
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
        constructor(interval) {
            this.interval = interval;
            this.queue = [];
            this.running = false;
        }
        add(fn) {
            return new Promise((resolve, reject) => {
                this.queue.push({ fn, resolve, reject });
                this.process();
            });
        }
        async process() {
            if (this.running || this.queue.length === 0) return;
            this.running = true;
            while (this.queue.length > 0) {
                const { fn, resolve, reject } = this.queue.shift();
                try { resolve(await fn()); } catch (e) { reject(e); }
                await new Promise(r => setTimeout(r, this.interval));
            }
            this.running = false;
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

    async function searchSteamGame(gameName) {
        const cacheKey = 'steam_search_' + encodeURIComponent(gameName);
        const cached = getStoredValue(cacheKey, null);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL * 7)) return cached.data;

        const cleanupRegex = /(:| -| –| —)?\s*(The\s+)?(Complete|Anthology|Collection|Definitive|Game of the Year|GOTY|Deluxe|Ultimate|Premium)(\s+(Edition|Cut|Content|Pack))?(\s+Bundle)?(\s*\.{3,})?/gi;
        const cleanedName = gameName.replace(cleanupRegex, '').trim().toLowerCase();

        return steamQueue.add(() => new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                // v1.4: Add ignore_preferences=1 to bypass user content filters (adult/tags)
                url: STEAM_SEARCH_API + encodeURIComponent(cleanedName) + '&ignore_preferences=1',
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.items && data.items.length > 0) {

                            // Helper to extract ID from logo if missing
                            const extractId = (item) => {
                                if (item.id) return { id: item.id, type: item.type || 'app' };
                                if (item.logo) {
                                    const match = item.logo.match(/\/steam\/(apps|subs|bundles)\/(\d+)\//);
                                    if (match) {
                                        let type = 'app';
                                        if (match[1] === 'subs') type = 'sub';
                                        if (match[1] === 'bundles') type = 'bundle';
                                        return { id: parseInt(match[2]), type: type };
                                    }
                                }
                                return null;
                            };

                            let bestMatch = null;
                            let maxScore = -1;

                            // v1.2: Ranking System
                            data.items.forEach(item => {
                                const info = extractId(item);
                                if (!info) return;

                                const itemName = item.name.toLowerCase();
                                const similarity = getSimilarity(cleanedName, itemName);
                                let score = similarity;

                                // Bonuses
                                if (itemName === cleanedName) score += 0.5; // Exact match bonus
                                if (itemName.startsWith(cleanedName)) score += 0.2; // Prefix bonus

                                // Penalties for type mismatch (unless requested)
                                if (!cleanedName.includes('vr') && itemName.includes('vr')) score -= 0.5;
                                if (!cleanedName.includes('soundtrack') && (itemName.includes('soundtrack') || itemName.includes('ost'))) score -= 0.5;
                                if (!cleanedName.includes('demo') && itemName.includes('demo')) score -= 0.5;
                                if (!cleanedName.includes('dlc') && itemName.includes('dlc')) score -= 0.3;

                                if (score > maxScore) {
                                    maxScore = score;
                                    bestMatch = { ...item, ...info };
                                }
                            });

                            if (!bestMatch || maxScore < 0.6) { // Threshold
                                console.log(`[Game Store Enhancer] No good match for "${cleanedName}". Best: "${bestMatch ? bestMatch.name : 'none'}" (Score: ${maxScore.toFixed(2)})`);
                                setStoredValue(cacheKey, { data: null, timestamp: Date.now() });
                                resolve(null);
                                return;
                            }

                            const result = {
                                id: bestMatch.id,
                                type: bestMatch.type,
                                name: bestMatch.name,
                                tiny_image: bestMatch.tiny_image || bestMatch.logo,
                                price: bestMatch.price ? (bestMatch.price.final / 100) + ' ' + bestMatch.price.currency : null,
                                discount: bestMatch.price ? bestMatch.price.discount_percent : 0,
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

    async function processGameElement(element, nameSelector) {
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

        const nameEl = element.querySelector(nameSelector);

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

        if (!nameEl) return;

        // Custom Validator
        if (currentConfig.isValidGameElement) {
            if (!currentConfig.isValidGameElement(element, nameEl)) {
                element.dataset.sslProcessed = "ignored";
                return;
            }
        }

        if (element.dataset.sslProcessed) return;
        element.dataset.sslProcessed = "pending";

        const gameName = nameEl.textContent.trim();
        if (!gameName) return;

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

            // v1.30: DailyIndieGame Direct ID Lookup
            if (currentConfig.name === 'DailyIndieGame' && currentConfig.getAppId) {
                const directId = currentConfig.getAppId(element);
                if (directId) {
                    result = {
                        id: directId,
                        type: 'app',
                        name: gameName,
                        tiny_image: null, price: null, discount: 0
                    };

                    // Special Handling: Hide native Steam link if present
                    const nativeLink = element.querySelector('a[href*="store.steampowered.com"]');
                    if (nativeLink) nativeLink.style.display = 'none';

                    // If we are replacing a native link, we might want to hide the "View on Steam" text node too if it's separate?
                    // For now, hiding the link is the main goal.
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



                if (owned) {
                    if (isNewStats && !stats.countedSet.has(uniqueId)) stats.owned++;
                    element.classList.add('ssl-container-owned');
                } else if (wishlisted) {
                    if (isNewStats && !stats.countedSet.has(uniqueId)) stats.wishlist++;
                    element.classList.add('ssl-container-wishlist');
                } else if (ignored !== undefined) {
                    if (isNewStats && !stats.countedSet.has(uniqueId)) stats.ignored++;
                    element.classList.add('ssl-container-ignored');
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
                    // v1.36: DIG tables act weird with .after(). We append INSIDE the link or right next to it safely.
                    link.classList.add('ssl-link-inline');
                    // Try appending to the parent TD if possible, or inside the link?
                    // Appending inside the link is safest for visibility, but might handle click events wrong. 
                    // Let's try appending to the parent element (the Link's parent is the TD or Font tag).
                    nameEl.parentNode.appendChild(link);
                } else {
                    nameEl.after(link);
                }

                element.dataset.sslProcessed = "true";
            } else {
                element.dataset.sslProcessed = "notfound";
                if (isNewStats) {
                    if (!stats.countedSet.has(uniqueId)) {
                        stats.no_data++;
                        stats.total++;
                        stats.countedSet.add(uniqueId);
                        updateStatsUI();
                    }
                    element.dataset.sslStatsCounted = "true";
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
        currentConfig.selectors.forEach(strat => {
            document.querySelectorAll(strat.container).forEach(el => {
                processGameElement(el, strat.title);
            });
        });
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
    setTimeout(scanPage, 1000);

})();
