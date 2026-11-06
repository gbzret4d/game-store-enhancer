// ==UserScript==
// @name         Fanatical Game Store Enhancer
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      0.1.1
// @description  Fanatical Steam Integration with API Interceptor and Breadcrumb Filtering.
// @author       gbzret4d
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/fanatical_game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/fanatical_game_store_enhancer.user.js
// @match        https://www.fanatical.com/*
// @connect      store.steampowered.com
// @connect      cdn.jsdelivr.net
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const STEAM_APPS_CACHE_URL = 'https://cdn.jsdelivr.net/gh/gbzret4d/game-store-enhancer@main/data/steam_apps.min.json';
    const LOG_PREFIX = '[Fanatical Enhancer]';

    // --- Selectors ---
    const TILE_Selector = [
        '.HitCard',
        '.PickAndMixCard',
        '.product-det',
        '.product-container',
        'div[class*="ProductDetail"]',
        '.name-banner-container',
        '.new-order-item',
        '.OrderItemsCard'
    ].join(', ');

    // --- State ---
    const state = {
        steamApps: new Map(), // name -> appid
        userData: { owned: new Set(), wishlist: new Set(), ignored: new Set() },
        coverMap: new Map(), // image_filename -> {id: 123} (From API Interceptor)
        bundleMap: new Map(), // image_filename -> [{name, slug}] for bundles whose own steam.id is null
        slugCache: new Map(), // slug -> Promise<steam appid | null>
        processed: new WeakSet()
    };

    function coverFilename(url) {
        return url.split('/').pop().split('?')[0];
    }

    // --- API Interceptor (Run Immediately) ---
    // Fanatical loads via fetch calls. To get 100% accurate IDs (especially for bundles), 
    // we intercept the JSON response which contains internal Steam IDs.
    function setupInterceptor() {
        if (typeof unsafeWindow === 'undefined' || !unsafeWindow.fetch) {
            console.warn(LOG_PREFIX, "Interceptor Warning: unsafeWindow or fetch not available.");
            return;
        }

        const original_fetch = unsafeWindow.fetch;
        unsafeWindow.fetch = async function (...args) {
            const response = await original_fetch(...args);
            const clone = response.clone();

            clone.json().then(json => {
                if (!json) return;

                const processGame = (game) => {
                    if (!game || !game.cover) return;
                    try {
                        // Extract filename from cover URL: ".../abc.jpg?v=1" -> "abc.jpg"
                        let filename = coverFilename(game.cover);
                        if (game.steam && game.steam.id) {
                            state.coverMap.set(filename, game.steam);
                        } else if (Array.isArray(game.bundleGames) && game.bundleGames.length) {
                            // Bundle product (e.g. Pick & Mix "Double-Pack"): no Steam id of its own,
                            // only {name, slug} per contained game. Resolved lazily in processBundleTile.
                            state.bundleMap.set(filename, game.bundleGames.map(g => ({ name: g.name.trim(), slug: g.slug })));
                        }
                    } catch (e) { /* Safe ignore */ }
                };

                // Traverse JSON structure (common Fanatical patterns)
                if (Array.isArray(json)) {
                    json.forEach(item => {
                        processGame(item); // Direct list
                        if (item.games && Array.isArray(item.games)) item.games.forEach(processGame); // Bundle content
                    });
                } else if (json.products && Array.isArray(json.products)) {
                    json.products.forEach(processGame);
                } else if (json.data && json.data.games && Array.isArray(json.data.games)) {
                    json.data.games.forEach(processGame); // Alternate Bundle
                } else {
                    processGame(json); // Single product
                }
            }).catch(() => { }); // Ignore JSON parse errors (non-JSON fetches)

            return response;
        };
        console.log(LOG_PREFIX, "API Interceptor Installed.");
    }

    setupInterceptor();

    // --- Styles ---
    document.documentElement.dataset.gseInstalled = "true";
    GM_addStyle(`
        .fgse-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            background-color: #171a21;
            padding: 3px 5px;
            border-radius: 4px;
            border: 1px solid #3c3d3e;
            font-family: sans-serif;
            font-size: 10px;
            font-weight: bold;
            color: #c7d5e0;
            text-decoration: none !important;
            line-height: 1;
            z-index: 1000;
            cursor: pointer;
            pointer-events: auto !important;
        }
        .fgse-badge:hover { color: #fff; border-color: #66c0f4; }
        .fgse-badge svg { width: 12px; height: 12px; fill: currentColor; }
        
        .fgse-owned { color: #a4d007 !important; border-color: #4c6b22 !important; }
        .fgse-wishlist { color: #66c0f4 !important; border-color: #2e4d6d !important; }
        .fgse-ignored { color: #d9534f !important; border-color: #6d2e2e !important; }
        
        .fgse-pos-abs { position: absolute !important; top: 10px; left: 10px; }
        .fgse-stack { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; z-index: 1000; }
        .fgse-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
                        const owned = new Set(data.rgOwnedApps || []);
                        const wishlist = new Set(data.rgWishlist || []);
                        const ignored = new Set(Object.keys(data.rgIgnoredApps || {}).map(Number));
                        console.log(LOG_PREFIX, `UserData: ${owned.size} Owned, ${wishlist.size} Wishlist, ${ignored.size} Ignored`);
                        resolve({ owned, wishlist, ignored });
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
                        console.log(LOG_PREFIX, `Cache: ${state.steamApps.size} apps`);
                        resolve();
                    } catch (e) { resolve(); }
                },
                onerror: () => resolve()
            });
        });
    }

    // Steam appid for a bundled game: Fanatical's own product API by slug, falling back to name lookup.
    function resolveBundleGame(game) {
        if (!state.slugCache.has(game.slug)) {
            state.slugCache.set(game.slug,
                fetch(`/api/products/${encodeURIComponent(game.slug)}/en`)
                    .then(r => r.ok ? r.json() : null)
                    .then(j => (j && j.steam && j.steam.id) || null)
                    .catch(() => null)
                    .then(id => id || state.steamApps.get(normalize(game.name)) || null));
        }
        return state.slugCache.get(game.slug);
    }

    function isExcludedPage() {
        // Exclude Book/Software bundles based on Breadcrumbs
        const breadcrumbs = Array.from(document.querySelectorAll('.breadcrumb-item, nav li, ol li'));
        const keywords = ['Book Bundles', 'Software Bundles'];
        return breadcrumbs.some(b => keywords.some(k => b.innerText.trim() === k));
    }

    function createBadge(appId, statusClass, statusText, gameName) {
        const badge = document.createElement('a');
        badge.className = `fgse-badge ${statusClass || ''}`;
        badge.href = `https://store.steampowered.com/app/${appId}`;
        badge.target = '_blank';
        badge.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 0C5.372 0 0 5.372 0 12c0 5.176 3.255 9.584 7.848 11.25.106-2.086 1.154-3.926 2.768-5.064L9.124 12.98C8.1 12.834 7.33 11.96 7.33 10.9c0-1.215.985-2.2 2.2-2.2s2.2.985 2.2 2.2c0 .248-.046.486-.124.71l2.97 2.97c1.373-.39 2.87.16 3.73 1.25l2.4-1.2c-.08-.344-.136-.7-.136-1.07 0-2.43 1.97-4.4 4.4-4.4 2.43 0 4.4 1.97 4.4 4.4 0 2.43-1.97 4.4-4.4 4.4-.73 0-1.42-.18-2.03-.5l-2.4 1.2c.07.33.12.67.12 1.02 0 2.43-1.97 4.4-4.4 4.4s-4.4-1.97-4.4-4.4c0-1.09.39-2.09 1.05-2.88l-1.07-5.55C3.39 12.015 3.1 12.44 2.88 12.91 3.25 7.8 8.13 4 14 4c5.19 0 9.47 3.91 9.94 8.9-.4-5.38-4.87-9.6-10.27-9.6z"/></svg><span>STEAM</span>` + (statusText ? `<span style="border-left:1px solid #fff;height:10px;margin:0 4px;opacity:0.5"></span><span>${statusText}</span>` : '');
        if (gameName) {
            // Bundle tiles get one badge per game, so label which game this is.
            const name = document.createElement('span');
            name.className = 'fgse-name';
            name.textContent = gameName;
            badge.appendChild(name);
            badge.title = gameName;
        }

        badge.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            window.open(badge.href, '_blank');
        });
        return badge;
    }

    function statusFor(appId) {
        if (state.userData.owned.has(appId)) return ['fgse-owned', 'OWNED'];
        if (state.userData.wishlist.has(appId)) return ['fgse-wishlist', 'WISHLIST'];
        if (state.userData.ignored.has(appId)) return ['fgse-ignored', 'IGNORED'];
        return ['', ''];
    }

    function badgeTarget(tile) {
        // Fanatical Layout Tweaks:
        // Position absolute usually works best on image containers.
        // .card-overlay itself is opacity:0 until hover, so attach to its (visible) parent instead.
        const overlay = tile.querySelector('.card-overlay');
        let target = (overlay && overlay.parentElement) || tile.querySelector('.hitCardStripe__image') || tile;
        if (getComputedStyle(target).position === 'static') {
            target.style.position = 'relative';
        }
        return target;
    }

    async function processBundleTile(tile, games) {
        const ids = await Promise.all(games.map(resolveBundleGame));
        const stack = document.createElement('div');
        stack.className = 'fgse-stack fgse-pos-abs';
        games.forEach((game, i) => {
            if (!ids[i]) return;
            const [statusClass, statusText] = statusFor(ids[i]);
            stack.appendChild(createBadge(ids[i], statusClass, statusText, game.name));
        });
        if (stack.children.length) badgeTarget(tile).appendChild(stack);
    }

    function processTile(tile) {
        if (state.processed.has(tile)) return;
        if (isExcludedPage()) return; // Skip non-game pages

        // 1. Try Inteceptor Map (Most Accurate)
        let appId = null;
        let img = tile.querySelector('img');
        let filename = img && img.src ? coverFilename(img.src) : null;
        if (filename) {
            let mapped = state.coverMap.get(filename);
            if (mapped) appId = mapped.id;

            let bundleGames = state.bundleMap.get(filename);
            if (!appId && bundleGames) {
                state.processed.add(tile);
                processBundleTile(tile, bundleGames);
                return;
            }
        }

        // 2. Fallback: Name Search
        if (!appId) {
            let titleEl = tile.querySelector('.hitCardStripe__seoName, .card-product-name, h1.product-name, .game-name, .order-item-name');
            if (titleEl) {
                appId = state.steamApps.get(normalize(titleEl.textContent.trim()));
            }
        }

        // Not matched yet: leave unprocessed so a later DOM mutation retries
        // (the interceptor's JSON may land after the tile renders).
        if (!appId) return;
        state.processed.add(tile);

        // 3. Status + 4. Inject
        const [statusClass, statusText] = statusFor(appId);
        const badge = createBadge(appId, statusClass, statusText);
        badge.classList.add('fgse-pos-abs');
        badgeTarget(tile).appendChild(badge);
    }

    async function main() {
        const [userData] = await Promise.all([fetchUserData(), fetchAppCache()]);
        state.userData = userData;

        const observer = new MutationObserver(() => {
            document.querySelectorAll(TILE_Selector).forEach(processTile);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // Initial
        setTimeout(() => document.querySelectorAll(TILE_Selector).forEach(processTile), 1000);
    }

    // Since interceptor runs document-start, wait for body for main logic
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

})();
