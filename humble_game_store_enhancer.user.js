// ==UserScript==
// @name         Humble Bundle Game Store Enhancer
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      0.3.15
// @description  Humble Bundle Steam Integration with robust status checks, review scores, and overlay fixes.
// @author       gbzret4d
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/humble_game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/humble_game_store_enhancer.user.js
// @match        https://www.humblebundle.com/*
// @match        https://store.steampowered.com/agecheck/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // --- Steam Age Check Bypass ---
    if (location.hostname === 'store.steampowered.com' && location.pathname.startsWith('/agecheck/')) {
        const yearSelect = document.querySelector('select[name="ageYear"]');
        const viewPageBtn = document.querySelector('#view_product_page_btn, .btn_medium.btn_green_white_innerfade');

        if (yearSelect && viewPageBtn) {
            yearSelect.value = "2000";
            if (yearSelect.value !== "2000") {
                // Should not happen for standard select, but just in case
                yearSelect.selectedIndex = yearSelect.options.length - 1;
            }
            viewPageBtn.click();
        }
        return; // Stop execution for Steam pages
    }

    // --- Configuration ---
    const LOG_PREFIX = '[GSE Humble]';
    const CACHE_URL = 'https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/main/data/steam_apps.min.json';
    // Broadened selectors to catch more elements (Legacy + Modern)
    const TILE_SELECTOR = [
        '.entity-block-container',
        '.entity-Link',
        '.browse-product-grid-item',
        '.tier-item-view',
        '.content-choice',
        '.game-box',
        '.product-item',
        '.entity-link',
        '.mosaic-tile',
        // Legacy v0.1 Selectors (Restored)
        '.entity',
        '.game-tile',
        '.item-details',
        '.full-tile-view',
        // Broad Matchers
        '[class*="entity-block-container"]',
        '[class*="product-item"]',
        'div[class*="entity-container"]'
    ].join(', ');

    // --- State ---
    const state = {
        steamApps: new Map(), // name -> appid
        userData: { owned: new Set(), wishlist: new Set(), ignored: new Set() },

        processed: new WeakSet(),
        processedCount: 0,
        reviewCache: GM_getValue('review_cache', {})
    };

    // --- Styles ---
    document.documentElement.dataset.gseInstalled = "true";
    document.documentElement.classList.add('gse-installed');
    try { if (typeof unsafeWindow !== 'undefined') unsafeWindow.gseInstalled = true; } catch (e) { }

    GM_addStyle(`
        .hbsi-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            background-color: #171a21;
            padding: 4px 6px;
            border-radius: 4px;
            border: 1px solid #3c3d3e;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
            font-family: "Motiva Sans", "Arial", sans-serif;
            font-size: 11px;
            font-weight: bold;
            color: #c7d5e0;
            text-decoration: none !important;
            line-height: 1;
            z-index: 2147483647 !important;
            cursor: pointer;
            pointer-events: auto !important;
            transition: all 0.2s ease;
            white-space: nowrap;
            height: auto !important;
            width: auto !important;
            box-sizing: border-box;
            align-self: flex-start;
            flex-shrink: 0;
            flex-grow: 0;
        }
        .hbsi-badge:hover {
            border-color: #66c0f4;
            color: #ffffff;
            transform: translateY(-1px);
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.6);
        }
        .hbsi-badge svg {
            width: 14px;
            height: 14px;
            fill: currentColor;
        }
        .hbsi-status-owned { color: #a4d007 !important; border-color: #4c6b22 !important; }
        .hbsi-status-wishlist { color: #66c0f4 !important; border-color: #2e4d6d !important; }
        .hbsi-status-ignored { color: #d9534f !important; border-color: #6d2e2e !important; }
        .hbsi-review-positive { color: #66c0f4; }
        .hbsi-review-mixed { color: #a8926a; }
        .hbsi-review-negative { color: #d9534f; }
        .hbsi-review-score {
            font-size: 10px;
            opacity: 0.9;
            margin-left: 2px;
        }
        
        /* 
           V0.3.11 Fix: Borders obscured by images.
           Solution: Use ::after pseudo-element to overlay the border on top of everything.
        */
        .hbsi-tile-owned::after,
        .hbsi-tile-wishlist::after,
        .hbsi-tile-ignored::after {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none; /* Let clicks pass through */
            z-index: 20; /* Above images, below badge (badge is z-index 2147483647) */
            box-sizing: border-box;
            box-shadow: inset 0 0 0 4px; /* Default thickness */
            border-radius: inherit; /* Follow container radius */
        }

        .hbsi-tile-owned::after { box-shadow: inset 0 0 0 4px #a4d007; }
        .hbsi-tile-wishlist::after { box-shadow: inset 0 0 0 4px #66c0f4; }
        .hbsi-tile-ignored::after { 
            box-shadow: inset 0 0 0 4px #d9534f;
            background: rgba(0,0,0,0.4); /* Slight dim for ignored */
        }

        /* Legacy support for direct class usage if needed */
        .hbsi-tile-owned { position: relative; }
        .hbsi-tile-wishlist { position: relative; }
        .hbsi-tile-ignored { position: relative; }

        .hbsi-pos-abs {
            position: absolute !important;
            top: 6px !important;
            left: 6px !important;
            bottom: auto !important;
            right: auto !important;
        }
    `);

    // --- Helpers ---
    function normalize(str) {
        if (typeof str !== 'string') return '';
        return str.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // --- API Fetchers ---

    // 1. User Data (Owned/Wishlist)
    async function fetchUserData() {
        return new Promise(resolve => {
            console.log(LOG_PREFIX, "Fetching UserData...");
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://store.steampowered.com/dynamicstore/userdata/",
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        // V0.3.13 FIX:
                        // 1. Owned: Combine rgOwnedApps (Purchases) + rgCurations (Curator/Press Keys)
                        //    NOTE: We strictly exclude rgOwnedPackages (SubIDs) to avoid ID collisions with AppIDs.
                        const ownedApps = new Set(data.rgOwnedApps || []);
                        if (data.rgCurations && typeof data.rgCurations === 'object') {
                            // V0.3.14 FIX:
                            // rgCurations contains BOTH owned keys (Value 2) AND recommendations (Value 0/1).
                            // We must strictly filter for value 2 to avoid false positives (e.g. Undertale, Cairn).
                            Object.entries(data.rgCurations).forEach(([appid, curators]) => {
                                // curators is an object like { "curatorID": value, ... }
                                // We check if ANY curator has set the status to 2 (Owned via Connect)
                                if (Object.values(curators).some(val => val === 2)) {
                                    ownedApps.add(parseInt(appid));
                                }
                            });
                        }

                        state.userData = {
                            owned: ownedApps,
                            wishlist: new Set(data.rgWishlist || []),
                            ignored: new Set(Object.keys(data.rgIgnoredApps || {}).map(id => parseInt(id)))
                        };
                        console.log(LOG_PREFIX, "UserData loaded:", state.userData.owned.size, "owned apps (inc. Curations)");
                        resolve(state.userData);
                    } catch (e) {
                        console.error(LOG_PREFIX, "Failed to parse UserData", e);
                        resolve(state.userData); // Return empty on fail
                    }
                },
                onerror: () => resolve(state.userData)
            });
        });
    }

    // 2. App Cache (Source of Truth)
    async function fetchAppCache() {
        return new Promise((resolve) => {
            console.log(LOG_PREFIX, "Fetching AppCache from", CACHE_URL);
            GM_xmlhttpRequest({
                method: "GET",
                url: CACHE_URL,
                onload: function (res) {
                    try {
                        const data = JSON.parse(res.responseText);
                        // Data format: { "normalized_name": app_id } -> Load directly
                        for (const [name, appid] of Object.entries(data)) {
                            state.steamApps.set(name, appid);
                        }
                        state.cacheLoaded = true;
                        console.log(LOG_PREFIX, `Cache loaded: ${state.steamApps.size} apps`);
                    } catch (e) {
                        console.error(LOG_PREFIX, 'Failed to parse AppCache', e);
                    }
                    resolve();
                },
                onerror: function (e) {
                    console.error(LOG_PREFIX, 'Failed to fetch AppCache', e);
                    resolve();
                }
            });
        });
    }

    // 3. Review Score (Steam Store API)
    // We use a simple cache to avoid spamming calls for the same game in grid views
    async function fetchReviewScore(appid) {
        if (state.reviewCache[appid]) return state.reviewCache[appid];

        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://store.steampowered.com/apphoverpublic/${appid}?l=english&json=1`,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data && data.strReviewSummary) {
                            // Target: "95% of the 1,234 user reviews..."
                            // strReviewDescription usually contains the percentage
                            let score = "?";
                            let scoreClass = 'hbsi-review-mixed';

                            // Try to extract percentage from description
                            if (data.strReviewDescription) {
                                const pctMatch = data.strReviewDescription.match(/(\d+)%/);
                                if (pctMatch) {
                                    score = pctMatch[1] + '%';
                                    const pctVal = parseInt(pctMatch[1], 10);
                                    if (pctVal >= 70) scoreClass = 'hbsi-review-positive';
                                    else if (pctVal < 40) scoreClass = 'hbsi-review-negative';
                                }
                            }

                            // Fallback to text summary if percentage not found
                            if (score === "?") {
                                const match = data.strReviewSummary.match(/>([^<]+)</);
                                if (match) score = match[1];
                                if (/positive/i.test(score)) scoreClass = 'hbsi-review-positive';
                                if (/negative/i.test(score)) scoreClass = 'hbsi-review-negative';
                            }

                            const result = { score, scoreClass };
                            state.reviewCache[appid] = result;
                            GM_setValue('review_cache', state.reviewCache);
                            resolve(result);
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null)
            });
        });
    }

    // --- Core Logic ---

    async function processTile(tile) {
        if (state.processed.has(tile)) return;
        state.processed.add(tile);
        state.processedCount++;

        // Debug: Log first 10 tiles or failures
        const activeLog = state.processedCount <= 10;

        // 1. Find Title
        let titleEl = tile.querySelector(
            '.item-title, .entity-title, .product-title, .content-choice-title, .game-box-title, h2, h3, h4, [class*="title"]'
        );

        // Fallback for Store Grid
        if (!titleEl && tile.classList.contains('browse-product-grid-item')) {
            titleEl = tile.querySelector('.entity-title');
        }

        let gameName = '';
        if (titleEl) {
            gameName = titleEl.textContent.trim();
        } else if (tile.hasAttribute('aria-label')) {
            // Homepage "full-tile-view" uses aria-label for the name
            gameName = tile.getAttribute('aria-label').trim();
        }

        if (!gameName) {
            // console.warn(LOG_PREFIX, "No name found for tile:", tile.className);
            return;
        }

        const normName = normalize(gameName);
        // console.log(LOG_PREFIX, `Processing: "${gameName}"`);

        // 2. Resolve AppID
        const appid = state.steamApps.get(normName);
        if (!appid) {
            // Log missing IDs to help debug normalization/cache issues
            if (activeLog) console.log(LOG_PREFIX, `-> Miss: No AppID for "${normName}"`);
            return;
        }

        if (activeLog) console.log(LOG_PREFIX, `-> Hit: AppID ${appid} for "${gameName}"`);

        // 3. Check Status
        const appidInt = parseInt(appid);
        const isOwned = state.userData.owned ? state.userData.owned.has(appidInt) : false;
        // Wishlist IDs come as numbers in rgWishlist, safe to cast appid to int or check both
        const isWishlist = state.userData.wishlist ? state.userData.wishlist.has(appidInt) : false;
        // Ignored are now Numbers in our set
        const isIgnored = state.userData.ignored ? state.userData.ignored.has(appidInt) : false;

        // 4. Create Badge
        createBadge(tile, appid, isOwned, isWishlist, isIgnored);

        // 5. Visual Feedback on Tile (Border/Opacity)
        // Ensure relative positioning for ::after absolute positioning to work
        if (getComputedStyle(tile).position === 'static') {
            tile.style.position = 'relative';
        }

        if (isOwned) {
            tile.classList.add('hbsi-tile-owned');
        }
        if (isWishlist) {
            tile.classList.add('hbsi-tile-wishlist');
        }
        if (isIgnored) {
            tile.classList.add('hbsi-tile-ignored');
        }
    }

    async function createBadge(tile, appid, isOwned, isWishlist, isIgnored) {
        // Validation: Don't double badge
        if (tile.querySelector('.hbsi-badge')) return;

        const badge = document.createElement('a');
        badge.className = 'hbsi-badge hbsi-pos-abs';
        badge.href = `https://store.steampowered.com/app/${appid}`;
        badge.target = '_blank';
        badge.title = 'View on Steam';

        // Base Icon
        let iconHtml = `<svg viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12c0 3.167 1.22 6.046 3.235 8.197L2.4 24l3.803-.835A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm5.65 16.5c-.3 0-.585-.11-.795-.315l-3.26-3.15c-.445-.43-.46-1.125-.03-1.555.42-.42 1.105-.415 1.54.02l2.365 2.29 4.96-5.73c.4-4.63.495-1.155-.065-1.635-.455-.38-1.135-.33-1.57.17l-5.61 6.48 c-.215.25-.525.395-.855.395z"/></svg>`;

        // Status Colors & Text
        let statusText = "";

        if (isOwned) {
            badge.classList.add('hbsi-status-owned');
            badge.title = 'Owned on Steam';
            statusText = '<span style="margin-left:4px; font-weight:800;">OWNED</span>';
        } else if (isWishlist) {
            badge.classList.add('hbsi-status-wishlist');
            badge.title = 'On Steam Wishlist';
            statusText = '<span style="margin-left:4px; font-weight:800;">WISHLIST</span>';
        } else if (isIgnored) {
            badge.classList.add('hbsi-status-ignored');
            badge.title = 'Ignored on Steam';
            statusText = '<span style="margin-left:4px; font-weight:800;">IGNORED</span>';
        }

        badge.innerHTML = iconHtml + statusText;

        // Append to suitable container
        // Note: 'hbsi-pos-abs' positions it absolute top-left.
        const style = window.getComputedStyle(tile);
        if (style.position === 'static') {
            tile.style.position = 'relative';
        }

        tile.appendChild(badge);

        // Fetch Review Score (Async)
        const reviewData = await fetchReviewScore(appid);
        if (reviewData) {
            const scoreSpan = document.createElement('span');
            scoreSpan.className = `hbsi-review-score ${reviewData.scoreClass}`;
            scoreSpan.textContent = reviewData.score;
            // Add a separator if we have status text
            if (statusText) {
                scoreSpan.style.borderLeft = "1px solid rgba(255,255,255,0.2)";
                scoreSpan.style.paddingLeft = "4px";
                scoreSpan.style.marginLeft = "4px";
            }
            badge.appendChild(scoreSpan);
        }
    }

    // --- Initialization ---

    async function main() {
        console.log(LOG_PREFIX, "v0.3.0 Init...");

        const [userData, _] = await Promise.all([
            fetchUserData(),
            fetchAppCache()
        ]);

        state.userData = userData;

        // Observer
        const observer = new MutationObserver((mutations) => {
            const tiles = document.querySelectorAll(TILE_SELECTOR);
            if (tiles.length > 0) tiles.forEach(processTile);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Polling Retry Logic (up to 5 seconds)
        let attempts = 0;
        const interval = setInterval(() => {
            const tiles = document.querySelectorAll(TILE_SELECTOR);
            console.log(LOG_PREFIX, `Scan #${attempts + 1}: found ${tiles.length} tiles`);

            if (tiles.length > 0) {
                tiles.forEach(processTile);
                // Don't clear interval, keep polling for lazy loaded stuff just in case
            }

            attempts++;
            if (attempts >= 5) clearInterval(interval);
        }, 1000);
    }

    // Start
    main();

})();
