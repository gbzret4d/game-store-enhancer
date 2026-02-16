// ==UserScript==
// @name         Humble Bundle Game Store Enhancer
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      0.1.0
// @description  Humble Bundle Steam Integration with robust status checks and overlay fixes.
// @author       gbzret4d
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/humble_game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/humble_game_store_enhancer.user.js
// @match        https://www.humblebundle.com/*
// @connect      store.steampowered.com
// @connect      cdn.jsdelivr.net
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const STEAM_APPS_CACHE_URL = 'https://cdn.jsdelivr.net/gh/gbzret4d/game-store-enhancer@develop/data/steam_apps.min.json';
    const CACHE_NAME = 'hbsi_cache';
    const LOG_PREFIX = '[HBSI]';

    // --- Selectors (Verified via Browser Inspection) ---
    // Store: .entity-block-container (Grid), .entity (List/Generic)
    // Choice: .content-choice
    // General fallback: .game-tile (Legacy), .item-details (Legacy)
    const TILE_SELECTOR = '.entity-block-container, .entity, .content-choice, .game-tile, .item-details';

    // --- State ---
    const state = {
        steamApps: new Map(), // name -> appid
        userData: { owned: new Set(), wishlist: new Set(), ignored: new Set() },
        processed: new WeakSet()
    };

    // --- Styles ---
    GM_addStyle(`
        /* Badge Container */
        .hbsi-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            background-color: #171a21;
            padding: 4px 6px;
            border-radius: 4px;
            border: 1px solid #3c3d3e;
            box-shadow: 0 4px 8px rgba(0,0,0,0.5);
            font-family: "Motiva Sans", "Arial", sans-serif;
            font-size: 11px;
            font-weight: bold;
            color: #c7d5e0;
            text-decoration: none !important;
            line-height: 1;
            z-index: 2147483647 !important; /* Maximum Z-Index */
            cursor: pointer;
            pointer-events: auto !important; /* Force Clickable */
            transition: all 0.2s ease;
        }

        .hbsi-badge:hover {
            border-color: #66c0f4;
            color: #ffffff;
            transform: translateY(-1px);
            box-shadow: 0 6px 12px rgba(0,0,0,0.6);
        }

        .hbsi-badge svg {
            width: 14px;
            height: 14px;
            fill: currentColor;
        }

        /* Status Colors */
        .hbsi-status-owned { color: #a4d007 !important; border-color: #4c6b22 !important; }
        .hbsi-status-wishlist { color: #66c0f4 !important; border-color: #2e4d6d !important; }
        .hbsi-status-ignored { color: #d9534f !important; border-color: #6d2e2e !important; }

        /* Tile Borders (Pseudo-elements on the TILE) */
        /* Must be relative positioned tile */
        .hbsi-tile-owned::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border: 4px solid #5cb85c;
            border-radius: 4px;
            pointer-events: none;
            z-index: 10;
        }
        .hbsi-tile-wishlist::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border: 4px solid #5bc0de;
            border-radius: 4px;
            pointer-events: none;
            z-index: 10;
        }
        .hbsi-tile-ignored::after {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border: 4px solid #d9534f;
            border-radius: 4px;
            pointer-events: none;
            z-index: 10;
        }

        /* Positioning Helpers */
        .hbsi-pos-abs {
            position: absolute !important;
            bottom: 6px !important;
            left: 6px !important;
        }
        
        .hbsi-dimmed img {
            opacity: 0.4 !important;
            filter: grayscale(80%) !important;
        }
    `);

    // --- Helpers ---
    function normalize(str) {
        return str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    }

    // --- API Fetchers ---

    async function fetchUserData() {
        return new Promise(resolve => {
            console.log(LOG_PREFIX, "Fetching UserData...");
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://store.steampowered.com/dynamicstore/userdata/",
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);

                        // Robust Parsing
                        const owned = new Set(data.rgOwnedApps || []);
                        const wishlist = new Set(data.rgWishlist || []);
                        const ignored = new Set(Object.keys(data.rgIgnoredApps || {}).map(Number));

                        console.log(LOG_PREFIX, `UserData Loaded: ${owned.size} Owned, ${wishlist.size} Wishlisted, ${ignored.size} Ignored`);

                        // Warn if empty (Cookie issue)
                        if (owned.size === 0 && wishlist.size === 0) {
                            console.warn(LOG_PREFIX, "UserData is empty! Check if logged in to Steam in this browser context.");
                        }

                        resolve({ owned, wishlist, ignored });
                    } catch (e) {
                        console.error(LOG_PREFIX, "Failed to parse UserData", e);
                        resolve({ owned: new Set(), wishlist: new Set(), ignored: new Set() });
                    }
                },
                onerror: (err) => {
                    console.error(LOG_PREFIX, "UserData request failed", err);
                    resolve({ owned: new Set(), wishlist: new Set(), ignored: new Set() });
                }
            });
        });
    }

    async function fetchAppCache() {
        return new Promise(resolve => {
            console.log(LOG_PREFIX, "Fetching AppCache...");
            GM_xmlhttpRequest({
                method: "GET",
                url: STEAM_APPS_CACHE_URL,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        // Data format assumption: { "Game Name": 12345, ... } 
                        // Verify format based on previous knowledge: keys are names, value is ID.
                        Object.entries(data).forEach(([name, id]) => {
                            state.steamApps.set(normalize(name), id);
                        });
                        console.log(LOG_PREFIX, `AppCache Loaded: ${state.steamApps.size} apps`);
                        resolve();
                    } catch (e) {
                        console.error(LOG_PREFIX, "Failed to parse AppCache", e);
                        resolve();
                    }
                },
                onerror: () => {
                    console.error(LOG_PREFIX, "AppCache request failed");
                    resolve();
                }
            });
        });
    }

    // --- Badge Creator ---
    function createBadge(appId, statusClass, statusText) {
        const badge = document.createElement('a');
        badge.className = `hbsi-badge ${statusClass || ''}`;
        badge.href = `https://store.steampowered.com/app/${appId}`;
        badge.target = '_blank';
        badge.title = `Open in Steam (AppID: ${appId})`;

        // Steam Icon
        badge.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M12 0C5.372 0 0 5.372 0 12c0 5.176 3.255 9.584 7.848 11.25.106-2.086 1.154-3.926 2.768-5.064L9.124 12.98C8.1 12.834 7.33 11.96 7.33 10.9c0-1.215.985-2.2 2.2-2.2s2.2.985 2.2 2.2c0 .248-.046.486-.124.71l2.97 2.97c1.373-.39 2.87.16 3.73 1.25l2.4-1.2c-.08-.344-.136-.7-.136-1.07 0-2.43 1.97-4.4 4.4-4.4 2.43 0 4.4 1.97 4.4 4.4 0 2.43-1.97 4.4-4.4 4.4-.73 0-1.42-.18-2.03-.5l-2.4 1.2c.07.33.12.67.12 1.02 0 2.43-1.97 4.4-4.4 4.4s-4.4-1.97-4.4-4.4c0-1.09.39-2.09 1.05-2.88l-1.07-5.55C3.39 12.015 3.1 12.44 2.88 12.91 3.25 7.8 8.13 4 14 4c5.19 0 9.47 3.91 9.94 8.9-.4-5.38-4.87-9.6-10.27-9.6z"/></svg>
            <span>STEAM</span>
        `;

        if (statusText) {
            const sep = document.createElement('span');
            sep.style.borderLeft = '1px solid currentColor';
            sep.style.height = '12px';
            sep.style.opacity = '0.5';
            badge.appendChild(sep);

            const label = document.createElement('span');
            label.innerText = statusText;
            badge.appendChild(label);
        }

        // Nuclear Click Handler
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
            console.log(LOG_PREFIX, `Opening Steam Store for ${appId}`);
            window.open(badge.href, '_blank').focus();
        });

        // Prevent other events from bubbling to Humble
        ['mousedown', 'mouseup', 'dblclick', 'auxclick'].forEach(evt => {
            badge.addEventListener(evt, e => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            });
        });

        return badge;
    }

    // --- Processor ---
    function processTile(tile) {
        if (state.processed.has(tile)) return;
        state.processed.add(tile);

        // 1. Find Title
        const titleEl = tile.querySelector('.item-title, .entity-title, .content-choice-title, .game-name');
        if (!titleEl) return; // Can't identify game

        const name = titleEl.innerText.trim();
        const normName = normalize(name);
        if (!normName) return;

        // 2. Find AppID
        const appId = state.steamApps.get(normName);
        if (!appId) {
            // Optional: Log missing ID? 
            return;
        }

        // 3. Determine Status (Priority: Owned > Wishlist > Ignored)
        // User specifically requested this hierarchy.
        let isOwned = state.userData.owned.has(appId);
        let isWishlist = state.userData.wishlist.has(appId);
        let isIgnored = state.userData.ignored.has(appId);

        // Handling "Resident Evil 7" 418370 edgecase if any
        if (appId === 418370 && !isOwned) {
            // Debug log specific games
            console.log(LOG_PREFIX, `RE7 Check: ${isOwned} (Owned Set has ${state.userData.owned.size} items)`);
        }

        let statusClass = '';
        let statusText = '';
        let borderClass = '';

        if (isOwned) {
            statusClass = 'hbsi-status-owned';
            statusText = ''; // Icon shows generic Steam, color shows owned? Or text "OWNED"?
            // Previous script standard: just color or "OWNED"? 
            // User screenshot shows "STEAM | IGNORED". So maybe "STEAM | OWNED"?
            // Use minimal text to save space.
            borderClass = 'hbsi-tile-owned';
        } else if (isWishlist) {
            statusClass = 'hbsi-status-wishlist';
            borderClass = 'hbsi-tile-wishlist';
        } else if (isIgnored) {
            statusClass = 'hbsi-status-ignored';
            statusText = 'IGNORED';
            borderClass = 'hbsi-tile-ignored';

            // Dim tile image if ignored
            tile.classList.add('hbsi-dimmed');
        }

        // 4. Inject Badge
        const badge = createBadge(appId, statusClass, statusText);
        badge.classList.add('hbsi-pos-abs');

        // Apply Border Class to Tile
        // Ensure Tile is Relative
        const computedStyle = window.getComputedStyle(tile);
        if (computedStyle.position === 'static') {
            tile.style.position = 'relative';
        }
        if (borderClass) {
            tile.classList.add(borderClass);
        }

        // 5. Universal Sibling Injection
        // Find the interactive anchor (the link to the Humble Store page)
        const anchor = tile.querySelector('a') || tile.closest('a');

        // If tile IS the anchor, or contains it.
        // We want to avoid putting badge INSIDE the anchor if possible, 
        // OR we put it inside but protect it with z-index/events (which we did).

        // Best approach: Append to Tile (relative parent). 
        // Use z-index to sit on top of everything.
        // If 'anchor' covers the whole tile (common in modern web), our badge inside it might trigger anchor drag/click.
        // But our Badge has stopPropagation.

        // Strategy: Append to TILE.
        tile.appendChild(badge);

        console.log(LOG_PREFIX, `Processed "${name}" -> AppID ${appId} [${statusText || (isOwned ? 'OWNED' : 'NORMAL')}]`);
    }

    // --- Main ---
    async function main() {
        console.log(LOG_PREFIX, "Starting Init...");

        // Parallel Fetch
        const [userData, _] = await Promise.all([
            fetchUserData(),
            fetchAppCache()
        ]);

        state.userData = userData;

        // Mutation Observer
        const observer = new MutationObserver((mutations) => {
            const tiles = document.querySelectorAll(TILE_SELECTOR);
            tiles.forEach(processTile);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Initial Scan
        const tiles = document.querySelectorAll(TILE_SELECTOR);
        console.log(LOG_PREFIX, `Initial Scan found ${tiles.length} tiles`);
        tiles.forEach(processTile);
    }

    // Start
    main();

})();
