// ==UserScript==
// @name         IndieGala Steam Linker
// @namespace    https://github.com/gbzret4d/indiegala-steam-linker
// @version      3.0.1
// @description  The ultimate fix for IndieGala. Adds Steam links, Review Scores, and Ownership Status (Owned/Wishlist) to Store, Bundles, and Bundle Overview.
// @author       gbzret4d
// @match        https://www.indiegala.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=indiegala.com
// @updateURL    https://github.com/gbzret4d/game-store-enhancer/raw/develop/IndieGala_Steam_Linker.user.js
// @downloadURL  https://github.com/gbzret4d/game-store-enhancer/raw/develop/IndieGala_Steam_Linker.user.js
// @connect      store.steampowered.com
// @connect      steamcommunity.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const CONFIG = {
        debug: true,
        cacheTime: 24 * 60 * 60 * 1000, // 24 Hours
        ignoredOpacity: 0.4 // Opacity for ignored games (image only)
    };

    // --- CSS ---
    GM_addStyle(`
        /* Overlay Strip */
        .ssl-overlay {
            position: absolute; bottom: 0; left: 0; width: 100%;
            background: rgba(0,0,0,0.9); color: white;
            font-size: 11px; padding: 4px 0; text-align: center;
            display: flex; justify-content: center; align-items: center;
            z-index: 9999; pointer-events: auto; text-decoration: none !important;
            border-top: 1px solid rgba(255,255,255,0.2);
            transition: opacity 0.2s;
            line-height: normal;
        }
        .ssl-overlay:hover { opacity: 1 !important; background: #000; }
        .ssl-overlay img { width: 14px; height: 14px; margin-right: 5px; vertical-align: middle; }
        
        /* Review Badges */
        .ssl-review {
            margin-left: 8px; padding: 1px 4px; border-radius: 3px; font-weight: bold; font-size: 10px;
        }
        .ssl-review-positive { color: #66C0F4; background: rgba(102, 192, 244, 0.2); }
        .ssl-review-mixed { color: #a89468; background: rgba(168, 148, 104, 0.2); }
        .ssl-review-negative { color: #c00; background: rgba(204, 0, 0, 0.2); }

        /* Status Borders (Inset to prevent layout shift) */
        .ssl-border-owned { box-shadow: inset 0 0 0 3px #a4d007 !important; }
        .ssl-border-wishlist { box-shadow: inset 0 0 0 3px #66c0f4 !important; }
        
        /* Ignored Status: Only dim the image, not the overlay */
        .ssl-ignored-img { opacity: 0.4 !important; filter: grayscale(100%) !important; }

        /* Bundle Overview Borders */
        .ssl-bundle-owned { border: 2px solid #a4d007 !important; }
        .ssl-bundle-wishlist { border: 2px solid #66c0f4 !important; }

        /* Utils */
        .ssl-relative { position: relative !important; }
    `);

    // --- State & Cache ---
    const CACHE = {
        get: (key) => {
            const item = GM_getValue(key);
            if (item && item.expiry > Date.now()) return item.data;
            return null;
        },
        set: (key, data) => {
            GM_setValue(key, { data, expiry: Date.now() + CONFIG.cacheTime });
        }
    };

    const STATE = {
        userData: CACHE.get('ssl_userdata') || { owned: [], wishlist: [], ignored: [] },
        requests: []
    };

    // --- API Helpers ---

    // Queue System to be nice to Steam
    function queueRequest(fn) {
        STATE.requests.push(fn);
        if (STATE.requests.length === 1) processQueue();
    }

    function processQueue() {
        if (STATE.requests.length === 0) return;
        const fn = STATE.requests[0];
        fn().finally(() => {
            STATE.requests.shift();
            setTimeout(processQueue, 200); // 200ms delay between requests
        });
    }

    function fetchUserData() {
        if (CACHE.get('ssl_userdata')) return; // Already cached
        console.log('[SSL] Fetching User Data...');

        // 1. Owned/Ignored
        queueRequest(() => new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://store.steampowered.com/dynamicstore/userdata/",
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        STATE.userData.owned = data.rgOwnedPackages || [];
                        STATE.userData.ignored = Object.keys(data.rgIgnoredApps || {});
                        // Wishlist from this endpoint is unreliable, fetch separate
                    } catch (e) { }
                    resolve();
                }
            });
        }));

        // 2. Wishlist
        queueRequest(() => new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://steamcommunity.com/my/wishlistdata/?p=0",
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        STATE.userData.wishlist = Object.keys(data || {});
                        CACHE.set('ssl_userdata', STATE.userData);
                        console.log('[SSL] User Data Updated:', STATE.userData);
                    } catch (e) { }
                    resolve();
                }
            });
        }));
    }

    function searchSteam(term) {
        const cacheKey = `ssl_id_${term}`;
        const cached = CACHE.get(cacheKey);
        if (cached) return Promise.resolve(cached);

        return new Promise(resolve => {
            queueRequest(() => new Promise(subResolve => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=us`,
                    onload: (res) => {
                        try {
                            const data = JSON.parse(res.responseText);
                            if (data.items && data.items.length > 0) {
                                const id = data.items[0].id;
                                CACHE.set(cacheKey, id);
                                subResolve();
                                resolve(id);
                            } else {
                                CACHE.set(cacheKey, '404'); // Cache not found
                                subResolve();
                                resolve(null);
                            }
                        } catch (e) { subResolve(); resolve(null); }
                    },
                    onerror: () => { subResolve(); resolve(null); }
                });
            }));
        });
    }

    function getReviewScore(appId) {
        const cacheKey = `ssl_review_${appId}`;
        const cached = CACHE.get(cacheKey);
        if (cached) return Promise.resolve(cached);

        return new Promise(resolve => {
            queueRequest(() => new Promise(subResolve => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://store.steampowered.com/appreviews/${appId}?json=1&day_range=365&language=all`,
                    onload: (res) => {
                        try {
                            const data = JSON.parse(res.responseText);
                            const summary = data.query_summary;
                            const score = {
                                percent: Math.floor((summary.total_positive / summary.total_reviews) * 100),
                                desc: summary.review_score_desc
                            };
                            CACHE.set(cacheKey, score);
                            subResolve();
                            resolve(score);
                        } catch (e) { subResolve(); resolve(null); }
                    }
                });
            }));
        });
    }

    // --- Scanners ---

    function scanGrid() {
        // Robust Scanner for Store & Bundle Details (Hentai/Power Shock)
        // TARGET: Any figure element in a results container
        const candidates = document.querySelectorAll('.bundle-page-tier-item-col figure, .main-list-results-item figure');

        candidates.forEach(figure => {
            if (figure.dataset.sslProcessed) return;

            // 1. Identify Container
            const container = figure.closest('.bundle-page-tier-item-col') || figure.closest('.main-list-results-item');
            if (!container) return;

            // 2. Extract Title
            let title = null;
            // Bundle Title
            const bundleTitle = container.querySelector('.bundle-page-tier-item-title');
            if (bundleTitle) title = bundleTitle.textContent.trim();

            // Store Title
            if (!title) {
                const storeTitle = container.querySelector('.main-list-results-item-title');
                if (storeTitle) title = storeTitle.textContent.trim();
            }

            // Fallback: Image Alt
            if (!title) {
                const img = figure.querySelector('img');
                if (img && img.alt && img.alt.length > 2) title = img.alt;
            }

            if (!title) return; // Skip if no title found

            figure.dataset.sslProcessed = "pending";

            // 3. Process
            searchSteam(title).then(id => {
                if (id && id !== '404') {
                    injectGame(figure, id);
                } else {
                    figure.dataset.sslProcessed = "done_no_id";
                }
            });
        });
    }

    function injectGame(figure, appId) {
        // 1. Status Check
        const isOwned = STATE.userData.owned.includes(parseInt(appId));
        const isWishlist = STATE.userData.wishlist.includes(String(appId));
        const isIgnored = STATE.userData.ignored.includes(String(appId));

        // 2. Visuals - Borders
        if (isOwned) figure.classList.add('ssl-border-owned');
        if (isWishlist) figure.classList.add('ssl-border-wishlist');

        // 3. Visuals - Ignored (Grey out Image ONLY)
        if (isIgnored) {
            const img = figure.querySelector('img');
            if (img) img.classList.add('ssl-ignored-img');
            figure.classList.add('ssl-border-ignored');
        }

        // 4. Overlay
        if (window.getComputedStyle(figure).position === 'static') figure.classList.add('ssl-relative');

        const overlay = document.createElement('a');
        overlay.href = `https://store.steampowered.com/app/${appId}`;
        overlay.className = 'ssl-overlay';
        overlay.target = '_blank';
        overlay.innerHTML = `<img src="https://store.steampowered.com/favicon.ico"> STEAM`;

        figure.appendChild(overlay);

        // 5. Review Score
        getReviewScore(appId).then(score => {
            if (score && !Number.isNaN(score.percent)) {
                const badge = document.createElement('span');
                badge.className = 'ssl-review';
                badge.textContent = `[ ${score.percent}% ]`;

                // Color Logic
                if (score.percent >= 70) badge.classList.add('ssl-review-positive');
                else if (score.percent >= 40) badge.classList.add('ssl-review-mixed');
                else badge.classList.add('ssl-review-negative');

                overlay.appendChild(badge);
            }
        });

        figure.dataset.sslProcessed = "done";
    }

    // --- Bundle Overview Scanner ---
    function scanBundlesOverview() {
        const bundles = document.querySelectorAll('.container-item');
        bundles.forEach(bundle => {
            if (bundle.dataset.sslProcessed) return;

            const link = bundle.querySelector('a.fit-click');
            if (!link) return;

            bundle.dataset.sslProcessed = "pending";
            // Background Fetch Bundle Page to check contents
            queueRequest(() => new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: link.href,
                    onload: (res) => {
                        try {
                            const text = res.responseText;
                            let hasOwned = false;
                            let hasWishlist = false;

                            const pageIds = new Set();
                            const matches = text.matchAll(/store\.steampowered\.com\/app\/(\d+)/g);
                            for (const m of matches) pageIds.add(parseInt(m[1]));

                            for (const id of pageIds) {
                                if (STATE.userData.wishlist.includes(String(id))) hasWishlist = true;
                                if (STATE.userData.owned.includes(id)) hasOwned = true;
                            }

                            if (hasWishlist) bundle.classList.add('ssl-bundle-wishlist');
                            if (hasOwned) bundle.classList.add('ssl-bundle-owned');

                        } catch (e) { }
                        resolve();
                    }
                });
            }));
            bundle.dataset.sslProcessed = "done";
        });
    }

    // --- Init ---
    setTimeout(fetchUserData, 1000); // Fetch data on load

    // Main Loop
    setInterval(() => {
        scanGrid();
        if (location.href.includes('/bundles')) scanBundlesOverview();
    }, 2000);

})();
