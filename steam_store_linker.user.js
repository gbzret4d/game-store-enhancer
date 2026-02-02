// ==UserScript==
// @name         Steam Store Linker (Humble & Fanatical)
// @namespace    http://tampermonkey.net/
// @version      1.23
// @description  Adds Steam links and ownership status to Humble Bundle and Fanatical
// @author       gbzret4d
// @match        https://www.humblebundle.com/*
// @match        https://www.fanatical.com/*
// @icon         https://store.steampowered.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/gbzret4d/steam-store-linker/main/steam_store_linker.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/steam-store-linker/main/steam_store_linker.user.js
// @homepageURL  https://github.com/gbzret4d/steam-store-linker
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
                { container: '.name-banner-container', title: 'h1.product-name' }
            ],
            ignoreUrl: null,
            interceptor: true, // Enable API Interceptor
            // v1.23: Exclude non-game bundles (Books/Software) to prevent false positives
            isExcluded: () => {
                const breadcrumbs = Array.from(document.querySelectorAll('.breadcrumb-item, nav[aria-label="breadcrumb"] li, ol[itemtype="http://schema.org/BreadcrumbList"] li'));
                const keywords = ['Book Bundles', 'Software Bundles'];
                return breadcrumbs.some(b => keywords.some(k => b.innerText.includes(k)));
            }
        },

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
        console.log('[Steam Linker] Fanatical API Interceptor active.');
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
        console.log('[Steam Linker] Site not supported');
        return;
    }

    if (currentConfig.ignoreUrl && window.location.href.includes(currentConfig.ignoreUrl)) {
        console.log(`[Steam Linker] Ignoring URL pattern: ${currentConfig.ignoreUrl}`);
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
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    const CACHE_VERSION = '2.2'; // v1.21: Bump to force clear stalled/empty userdata caches

    // Styles
    const css = `
        .ssl-link {
            display: inline-block;
            margin-top: 5px;
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
        .ssl-link:hover { color: #fff; background: #2a475e; }
        .ssl-link span { margin-right: 4px; padding-right: 4px; border-right: 1px solid #3c3d3e; }
        .ssl-link span:last-child { border-right: none; margin-right: 0; padding-right: 0; }

        .ssl-owned { color: #a4d007; font-weight: bold; }
        .ssl-wishlist { color: #66c0f4; font-weight: bold; }
        .ssl-ignored { color: #d9534f; }

        .ssl-review-positive { color: #66C0F4; font-weight: bold; } /* Blue for positive */
        .ssl-review-mixed { color: #a8926a; font-weight: bold; } /* Brown for mixed */
        .ssl-review-negative { color: #c15755; font-weight: bold; } /* Red for negative */
        
        .ssl-container-owned {
            opacity: 1 !important;
            filter: grayscale(0%) !important;
            outline: 3px solid #4c6b22 !important; /* Use outline to avoid layout shifts */
            /* outline-offset: -3px; removed globally to fix grid clipping */
            box-shadow: inset 0 0 20px rgba(76, 107, 34, 0.6), 0 0 10px rgba(76, 107, 34, 0.5); /* Inner and outer glow */
            transition: all 0.2s;
            z-index: 10; /* Ensure outline is valid */
        }
        .ssl-container-owned:hover {
            box-shadow: inset 0 0 30px rgba(76, 107, 34, 0.9), 0 0 15px rgba(76, 107, 34, 0.7) !important;
        }
        .ssl-container-wishlist {
            outline: 3px solid #66c0f4 !important;
            box-shadow: inset 0 0 20px rgba(102, 192, 244, 0.4), 0 0 10px rgba(102, 192, 244, 0.5) !important;
            border-radius: 4px; /* Optional, might conflict slightly with outline on some browsers but usually fine */
            z-index: 10;
        }
        .ssl-container-ignored {
            outline: 3px solid #d9534f !important;
            box-shadow: inset 0 0 10px rgba(217, 83, 79, 0.4);
            opacity: 0.5;
            z-index: 10;
        }

        /* v1.16: Apply outline-offset ONLY to Carousel items to prevent adjacent bleeding.
           Grid items should use default offset (0) to avoid clipping text like "Keys are low". */
        .expanded-info-view .ssl-container-owned,
        .expanded-info-view .ssl-container-wishlist,
        .expanded-info-view .ssl-container-ignored {
            outline-offset: -3px !important;
        }

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
    const stats = { total: 0, owned: 0, wishlist: 0, ignored: 0, missing: 0 };

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
            { label: 'Missing', val: stats.missing }
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
            console.log(`[Steam Linker] UserData Cache Hit (v${CACHE_VERSION}). Owned: ${cached.data.ownedApps.length}, Wishlist: ${cached.data.wishlist.length}`); // DEBUG
            return cached.data;
        }

        return steamQueue.add(() => new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: STEAM_USERDATA_API,
                onload: (response) => {
                    try {
                        const data = JSON.parse(response.responseText);
                        console.log('[Steam Linker] UserData Response:', data); // DEBUG
                        const userData = {
                            ownedApps: data.rgOwnedApps || [],
                            wishlist: data.rgWishlist || [],
                            ignored: data.rgIgnoredApps || {}
                        };

                        // v1.19: Detect potential cookie blocking (Firefox)
                        if (userData.ownedApps.length === 0 && userData.wishlist.length === 0) {
                            console.warn('[Steam Linker] Wiki result is empty. Possible causes: Not logged in OR Firefox "Total Cookie Protection" active. NOT CACHING this result.');
                            // Do NOT cache empty results to allow immediate retry on next load/login
                        } else {
                            setStoredValue('steam_userdata', { data: userData, timestamp: Date.now() });
                        }

                        console.log(`[Steam Linker] Parsed Data - Owned: ${userData.ownedApps.length}, Wishlist: ${userData.wishlist.length}`); // DEBUG
                        resolve(userData);
                    } catch (e) {
                        console.error('[Steam Linker] UserData Parse Error:', e); // DEBUG
                        resolve({ ownedApps: [], wishlist: [], ignored: {} });
                    }
                },
                onerror: (err) => {
                    console.error('[Steam Linker] UserData Request Failed:', err); // DEBUG
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
                                console.log(`[Steam Linker] No good match for "${cleanedName}". Best: "${bestMatch ? bestMatch.name : 'none'}" (Score: ${maxScore.toFixed(2)})`);
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
        // v1.6: Persistence Check - If marked 'true' but link is gone (wiped by another script), reset and retry.
        if (element.dataset.sslProcessed === "true") {
            if (!element.querySelector('.ssl-link')) {
                // Console log only if debugging/verbose, or just silently fix
                // console.log('[Steam Linker] Link wiped by external script. Re-processing:', element);
                element.dataset.sslProcessed = "";
            } else {
                return; // Already processed and link exists
            }
        }

        if (element.dataset.sslProcessed) return;

        const nameEl = element.querySelector(nameSelector);
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

        // v1.12: Move stats increment to AFTER successful processing to avoid infinite counting on re-scans
        const isNewStats = !element.dataset.sslStatsCounted;

        try {
            // v1.3: 1. Asset Scan (Priority)
            let result = null;

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
                        console.log(`[Steam Linker] API Intercept match for "${gameName}": ${result.type}/${result.id}`);
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
                    console.log(`[Steam Linker] Asset match for "${gameName}": ${assetMatch.type}/${assetMatch.id}`);
                } else {
                    // 2. Steam Search (Fallback)
                    result = await searchSteamGame(gameName);
                }
            }

            if (result) {
                // v1.17: Loop Prevention - Validate ID before processing
                if (!result.id || isNaN(parseInt(result.id))) {
                    console.warn(`[Steam Linker] Result found but ID is missing/invalid for "${gameName}". Marking as error.`);
                    element.dataset.sslProcessed = "error";
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
                    if (isNewStats) stats.owned++;
                    element.classList.add('ssl-container-owned');
                } else if (wishlisted) {
                    if (isNewStats) stats.wishlist++;
                    element.classList.add('ssl-container-wishlist');
                } else if (ignored !== undefined) {
                    if (isNewStats) stats.ignored++;
                    element.classList.add('ssl-container-ignored');
                } else {
                    if (isNewStats) stats.missing++;
                }

                if (isNewStats) {
                    stats.total++;
                    element.dataset.sslStatsCounted = "true";
                    updateStatsUI();
                }

                const link = createSteamLink(appData);
                nameEl.after(link);
                element.dataset.sslProcessed = "true";
            } else {
                element.dataset.sslProcessed = "notfound";
            }
        } catch (e) {
            console.error(e);
            element.dataset.sslProcessed = "error";
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
