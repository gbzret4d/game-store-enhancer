// ==UserScript==
// @name         Humble Bundle Game Store Enhancer
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      0.2.8
// @description  Humble Bundle Steam Integration with robust status checks, review scores, and overlay fixes.
// @author       gbzret4d
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/main/humble_game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/main/humble_game_store_enhancer.user.js
// @match        https://www.humblebundle.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const LOG_PREFIX = '[GSE Humble]';
    const TILE_SELECTOR = [
        '.entity-block-container', // Bundle Games
        '.browse-product-grid-item', // Store Grid
        '.tier-item-view', // Bundles (Tiered)
        '.content-choice', // Choice Games
        '.game-box', // Choice Extras
        '.product-item', // Store Product
        '.entity-link', // Store Search Results / Homepage Stack
        '.mosaic-tile', // Homepage Mosaic
        '.product-item' // Store Product Page
    ].join(', ');

    // --- State ---
    const state = {
        steamApps: new Map(), // name -> appid
        userData: { owned: new Set(), wishlist: new Set(), ignored: new Set() },
        processed: new WeakSet(),
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
        .hbsi-tile-owned { box-shadow: inset 0 0 0 3px #5cb85c !important; }
        .hbsi-tile-wishlist { box-shadow: inset 0 0 0 3px #5bc0de !important; }
        .hbsi-tile-ignored {
            box-shadow: inset 0 0 0 3px #d9534f !important;
            opacity: 0.6;
            filter: grayscale(80%);
        }
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
            // console.log(LOG_PREFIX, "Fetching UserData...");
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://store.steampowered.com/dynamicstore/userdata/",
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        state.userData = {
                            owned: new Set(data.rgOwnedPackages || []),
                            wishlist: new Set(data.rgWishlist || []),
                            ignored: new Set(Object.keys(data.rgIgnoredApps || {}))
                        };
                        // console.log(LOG_PREFIX, "UserData loaded:", state.userData);
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
                        // console.log(LOG_PREFIX, `Cache loaded: ${state.steamApps.size} apps`);
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
                            // Extract simple status (e.g. "Very Positive")
                            // Format is usually <span class="...">Very Positive</span>
                            const match = data.strReviewSummary.match(/>([^<]+)</);
                            const score = match ? match[1] : "?";

                            // Determine class based on score text
                            let scoreClass = 'hbsi-review-mixed';
                            if (/positive/i.test(score)) scoreClass = 'hbsi-review-positive';
                            if (/negative/i.test(score)) scoreClass = 'hbsi-review-negative';

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

        // 1. Find Title
        let titleEl = tile.querySelector(
            '.item-title, .entity-title, .product-title, .content-choice-title, .game-box-title, h2'
        );

        // Fallback for Store Grid
        if (!titleEl && tile.classList.contains('browse-product-grid-item')) {
            titleEl = tile.querySelector('.entity-title');
        }

        if (!titleEl) return;
        const gameName = titleEl.textContent.trim();
        const normName = normalize(gameName);

        // 2. Resolve AppID
        const appid = state.steamApps.get(normName);
        if (!appid) {
            // console.log(LOG_PREFIX, "No AppID found for:", gameName);
            return;
        }

        // 3. Check Status
        const isOwned = state.userData.owned.has(parseInt(appid));
        const isWishlist = state.userData.wishlist.has(parseInt(appid));
        const isIgnored = state.userData.ignored.has(appid);

        // 4. Create Badge
        createBadge(tile, appid, isOwned, isWishlist, isIgnored);

        // 5. Visual Feedback on Tile (Border/Opacity)
        if (isOwned) tile.classList.add('hbsi-tile-owned');
        if (isWishlist) tile.classList.add('hbsi-tile-wishlist');
        if (isIgnored) tile.classList.add('hbsi-tile-ignored');
    }

    async function createBadge(tile, appid, isOwned, isWishlist, isIgnored) {
        // Validation: Don't double badge
        if (tile.querySelector('.hbsi-badge')) return;

        const badge = document.createElement('a');
        badge.className = 'hbsi-badge hbsi-pos-abs';
        badge.href = `https://store.steampowered.com/app/${appid}`;
        badge.target = '_blank';
        badge.title = 'View on Steam';

        // Icon
        badge.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12c0 3.167 1.22 6.046 3.235 8.197L2.4 24l3.803-.835A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm5.65 16.5c-.3 0-.585-.11-.795-.315l-3.26-3.15c-.445-.43-.46-1.125-.03-1.555.42-.42 1.105-.415 1.54.02l2.365 2.29 4.96-5.73c.4-4.63.495-1.155-.065-1.635-.455-.38-1.135-.33-1.57.17l-5.61 6.48 c-.215.25-.525.395-.855.395z"/></svg>`;

        // Status Colors
        if (isOwned) {
            badge.classList.add('hbsi-status-owned');
            badge.title = 'Owned on Steam';
        } else if (isWishlist) {
            badge.classList.add('hbsi-status-wishlist');
            badge.title = 'On Steam Wishlist';
        } else if (isIgnored) {
            badge.classList.add('hbsi-status-ignored');
            badge.title = 'Ignored on Steam';
        }

        // Append to suitable container
        // Note: 'hbsi-pos-abs' positions it absolute top-left.
        // Ensure parent has relative positioning if needed, or rely on existing layout.
        // For most tiles, we append directly to the tile container which is usually relative.

        // Special case: Mosaic tiles might need parent adjustment
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
            badge.appendChild(scoreSpan);
        }
    }

    // --- Initialization ---

    async function main() {
        // console.log(LOG_PREFIX, "Starting Init...");

        const [userData, _] = await Promise.all([
            fetchUserData(),
            fetchAppCache()
        ]);

        state.userData = userData;

        // Observer
        const observer = new MutationObserver((mutations) => {
            // Rate limit observer? Or just run. Browsers are fast.
            const tiles = document.querySelectorAll(TILE_SELECTOR);
            tiles.forEach(processTile);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            const tiles = document.querySelectorAll(TILE_SELECTOR);
            console.log(LOG_PREFIX, `Initial Scan found ${tiles.length} tiles`);
            tiles.forEach(processTile);
        }, 1000);
    }

    // Start
    main();

})();
