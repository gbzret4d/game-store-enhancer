// ==UserScript==
// @name         GOG Game Store Enhancer
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      0.1.0
// @description  GOG Steam Integration with Name-based Search.
// @author       gbzret4d
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/gog_game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/gog_game_store_enhancer.user.js
// @match        https://www.gog.com/*
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
    const LOG_PREFIX = '[GOG Enhancer]';

    // --- Selectors ---
    const TILE_SELECTOR = [
        '.product-tile',
        '.productcard-basics',
        '.product-row'
    ].join(', ');

    // --- State ---
    const state = {
        steamApps: new Map(), // name -> appid
        userData: { owned: new Set(), wishlist: new Set(), ignored: new Set() },
        processed: new WeakSet()
    };

    // --- Styles ---
    document.documentElement.dataset.gseInstalled = "true";
    GM_addStyle(`
        .gog-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            background-color: #171a21;
            padding: 2px 4px;
            border-radius: 3px;
            border: 1px solid #3c3d3e;
            font-family: "Lato", sans-serif;
            font-size: 11px;
            color: #c7d5e0;
            text-decoration: none !important;
            margin-top: 4px;
            cursor: pointer;
            z-index: 100;
        }
        .gog-badge:hover { color: #fff; border-color: #66c0f4; }
        .gog-badge svg { width: 12px; height: 12px; fill: currentColor; }

        .gog-owned { color: #a4d007 !important; border-color: #4c6b22 !important; }
        .gog-wishlist { color: #66c0f4 !important; border-color: #2e4d6d !important; }
        .gog-ignored { color: #d9534f !important; border-color: #6d2e2e !important; }
    `);

    // --- Core Logic ---
    function normalize(str) { return str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : ''; }

    async function fetchUserData() {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://store.steampowered.com/dynamicstore/userdata/",
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        resolve({
                            owned: new Set(data.rgOwnedApps || []),
                            wishlist: new Set(data.rgWishlist || []),
                            ignored: new Set(Object.keys(data.rgIgnoredApps || {}).map(Number))
                        });
                    } catch (e) { resolve({ owned: new Set(), wishlist: new Set(), ignored: new Set() }); }
                },
                onerror: () => resolve({ owned: new Set(), wishlist: new Set(), ignored: new Set() })
            });
        });
    }

    async function fetchAppCache() {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: STEAM_APPS_CACHE_URL,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        Object.entries(data).forEach(([name, id]) => state.steamApps.set(normalize(name), id));
                        resolve();
                    } catch (e) { resolve(); }
                },
                onerror: () => resolve()
            });
        });
    }

    function createBadge(appId, statusClass, statusText) {
        const badge = document.createElement('a');
        badge.className = `gog-badge ${statusClass || ''}`;
        badge.href = `https://store.steampowered.com/app/${appId}`;
        badge.target = '_blank';
        badge.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 0C5.372 0 0 5.372 0 12c0 5.176 3.255 9.584 7.848 11.25.106-2.086 1.154-3.926 2.768-5.064L9.124 12.98C8.1 12.834 7.33 11.96 7.33 10.9c0-1.215.985-2.2 2.2-2.2s2.2.985 2.2 2.2c0 .248-.046.486-.124.71l2.97 2.97c1.373-.39 2.87.16 3.73 1.25l2.4-1.2c-.08-.344-.136-.7-.136-1.07 0-2.43 1.97-4.4 4.4-4.4 2.43 0 4.4 1.97 4.4 4.4 0 2.43-1.97 4.4-4.4 4.4-.73 0-1.42-.18-2.03-.5l-2.4 1.2c.07.33.12.67.12 1.02 0 2.43-1.97 4.4-4.4 4.4s-4.4-1.97-4.4-4.4c0-1.09.39-2.09 1.05-2.88l-1.07-5.55C3.39 12.015 3.1 12.44 2.88 12.91 3.25 7.8 8.13 4 14 4c5.19 0 9.47 3.91 9.94 8.9-.4-5.38-4.87-9.6-10.27-9.6z"/></svg>` + (statusText ? ` <span>${statusText}</span>` : '');

        badge.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            window.open(badge.href, '_blank');
        });
        return badge;
    }

    function processTile(tile) {
        if (state.processed.has(tile)) return;
        state.processed.add(tile);

        // Find Title
        let titleEl = tile.querySelector('.product-title span, h1.productcard-basics__title, .product-row__title, .product-title__text');
        if (!titleEl) return;

        const name = titleEl.textContent.trim();
        const appId = state.steamApps.get(normalize(name));

        if (!appId) return;

        let isOwned = state.userData.owned.has(appId);
        let isWishlist = state.userData.wishlist.has(appId);
        let isIgnored = state.userData.ignored.has(appId);

        let statusClass = '';
        let statusText = ''; // Icon only by default for GOG tiles to save space?

        if (isOwned) { statusClass = 'gog-owned'; statusText = 'OWNED'; }
        else if (isWishlist) { statusClass = 'gog-wishlist'; statusText = 'WISHLIST'; }
        else if (isIgnored) { statusClass = 'gog-ignored'; statusText = 'IGNORED'; }

        const badge = createBadge(appId, statusClass, statusText);

        // Inject
        if (tile.classList.contains('productcard-basics')) {
            // Product Page Header
            titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
        } else {
            // Tile
            tile.appendChild(badge);
        }
    }

    async function main() {
        const [userData] = await Promise.all([fetchUserData(), fetchAppCache()]);
        state.userData = userData;

        const observer = new MutationObserver(() => {
            document.querySelectorAll(TILE_SELECTOR).forEach(processTile);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => document.querySelectorAll(TILE_SELECTOR).forEach(processTile), 1000);
    }

    main();

})();
