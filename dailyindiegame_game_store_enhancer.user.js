// ==UserScript==
// @name         DailyIndieGame Game Store Enhancer
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      0.1.0
// @description  DailyIndieGame Steam Integration with direct ID extraction from URLs.
// @author       gbzret4d
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/dailyindiegame_game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/dailyindiegame_game_store_enhancer.user.js
// @match        https://dailyindiegame.com/*
// @match        https://www.dailyindiegame.com/*
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
    const LOG_PREFIX = '[DIG Enhancer]';

    // --- Selectors ---
    const ROW_SELECTOR = 'tr[onmouseover]'; // DIG uses table rows for game lists
    const TITLE_SELECTOR = '#content font[size="5"]'; // Product page title

    // --- State ---
    const state = {
        steamApps: new Map(), // name -> appid
        userData: { owned: new Set(), wishlist: new Set(), ignored: new Set() },
        processed: new WeakSet()
    };

    // --- Styles ---
    GM_addStyle(`
        .dig-badge {
            display: inline-block;
            vertical-align: middle;
            background-color: #171a21;
            padding: 2px 4px;
            border-radius: 3px;
            border: 1px solid #3c3d3e;
            font-family: sans-serif;
            font-size: 10px;
            color: #c7d5e0;
            text-decoration: none !important;
            margin-left: 5px;
            cursor: pointer;
        }
        .dig-badge:hover { color: #fff; border-color: #66c0f4; }
        .dig-badge svg { width: 10px; height: 10px; fill: currentColor; vertical-align: -1px; }

        .dig-owned { color: #a4d007 !important; border-color: #4c6b22 !important; }
        .dig-wishlist { color: #66c0f4 !important; border-color: #2e4d6d !important; }
        .dig-ignored { color: #d9534f !important; border-color: #6d2e2e !important; }

        /* Row Highlighting */
        tr.dig-row-owned td { background-color: rgba(76, 107, 34, 0.2) !important; }
        tr.dig-row-wishlist td { background-color: rgba(46, 77, 109, 0.2) !important; }
        tr.dig-row-ignored td { background-color: rgba(109, 46, 46, 0.2) !important; opacity: 0.6; }
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

    // Name Map (Fallback)
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
        badge.className = `dig-badge ${statusClass || ''}`;
        badge.href = `https://store.steampowered.com/app/${appId}`;
        badge.target = '_blank';
        badge.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 0C5.372 0 0 5.372 0 12c0 5.176 3.255 9.584 7.848 11.25.106-2.086 1.154-3.926 2.768-5.064L9.124 12.98C8.1 12.834 7.33 11.96 7.33 10.9c0-1.215.985-2.2 2.2-2.2s2.2.985 2.2 2.2c0 .248-.046.486-.124.71l2.97 2.97c1.373-.39 2.87.16 3.73 1.25l2.4-1.2c-.08-.344-.136-.7-.136-1.07 0-2.43 1.97-4.4 4.4-4.4 2.43 0 4.4 1.97 4.4 4.4 0 2.43-1.97 4.4-4.4 4.4-.73 0-1.42-.18-2.03-.5l-2.4 1.2c.07.33.12.67.12 1.02 0 2.43-1.97 4.4-4.4 4.4s-4.4-1.97-4.4-4.4c0-1.09.39-2.09 1.05-2.88l-1.07-5.55C3.39 12.015 3.1 12.44 2.88 12.91 3.25 7.8 8.13 4 14 4c5.19 0 9.47 3.91 9.94 8.9-.4-5.38-4.87-9.6-10.27-9.6z"/></svg>` + (statusText ? ` <span>${statusText}</span>` : '');

        badge.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            window.open(badge.href, '_blank');
        });
        return badge;
    }

    function extractId(url) {
        const match = url.match(/site_gamelisting_(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    function processRow(row) {
        if (state.processed.has(row)) return;
        state.processed.add(row);

        // Try getting ID from link
        let appId = null;
        let link = row.querySelector('a[href^="site_gamelisting_"]');
        if (link) {
            appId = extractId(link.href);
        }

        if (!appId) return;

        // Status
        let isOwned = state.userData.owned.has(appId);
        let isWishlist = state.userData.wishlist.has(appId);
        let isIgnored = state.userData.ignored.has(appId);

        let badgeClass = '';
        let rowClass = '';
        let text = '';

        if (isOwned) { badgeClass = 'dig-owned'; rowClass = 'dig-row-owned'; text = 'OWNED'; }
        else if (isWishlist) { badgeClass = 'dig-wishlist'; rowClass = 'dig-row-wishlist'; text = 'WISHLIST'; }
        else if (isIgnored) { badgeClass = 'dig-ignored'; rowClass = 'dig-row-ignored'; text = 'IGNORED'; }

        if (rowClass) row.classList.add(rowClass);

        // Inject Badge next to link
        if (link) {
            const badge = createBadge(appId, badgeClass, text);
            link.parentNode.insertBefore(badge, link.nextSibling);
        }
    }

    function processPage() {
        // 1. Marketplace Rows
        document.querySelectorAll(ROW_SELECTOR).forEach(processRow);

        // 2. Product Page Title (If URL has ID)
        if (window.location.href.includes('site_gamelisting_')) {
            const appId = extractId(window.location.href);
            const titleEl = document.querySelector(TITLE_SELECTOR);
            if (appId && titleEl && !state.processed.has(titleEl)) {
                state.processed.add(titleEl);
                // Logic same as row...
                let isOwned = state.userData.owned.has(appId);
                let badgeClass = ''; let text = '';
                if (isOwned) { badgeClass = 'dig-owned'; text = 'OWNED'; } // Simplify for header

                const badge = createBadge(appId, badgeClass, text);
                titleEl.appendChild(badge);
            }
        }
    }

    async function main() {
        const [userData] = await Promise.all([fetchUserData(), fetchAppCache()]);
        state.userData = userData;

        const observer = new MutationObserver(processPage);
        observer.observe(document.body, { childList: true, subtree: true });

        processPage();
    }

    main();

})();
