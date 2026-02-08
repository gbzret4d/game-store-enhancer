// ==UserScript==
// @name         IndieGala Steam Linker
// @namespace    https://github.com/gbzret4d/indiegala-steam-linker
// @version      3.1.1
// @description  The ultimate fix for IndieGala. Adds Steam links, Review Scores, and Ownership Status. Includes visible Stats/Debug Panel.
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
        cacheTime: 24 * 60 * 60 * 1000,
        ignoredOpacity: 0.7, // Changed from 0.4 to 0.7 to be less "grayed out"
        queueInterval: 100
    };

    // --- CSS ---
    GM_addStyle(`
        /* Overlay Strip */
        .ssl-overlay {
            position: absolute !important; bottom: 0 !important; left: 0 !important; width: 100% !important;
            height: 24px !important; /* Force height to prevent "Giant Logo" bug */
            background: rgba(0,0,0,0.9) !important; color: white !important;
            font-size: 11px !important; padding: 0 !important; text-align: center !important;
            display: flex !important; justify-content: center !important; align-items: center !important;
            z-index: 900 !important; pointer-events: auto !important; text-decoration: none !important;
            border-top: 1px solid rgba(255,255,255,0.2) !important;
            transition: opacity 0.2s !important;
            line-height: normal !important;
            border-radius: 0 !important;
            max-width: 100% !important;
        }
        .ssl-overlay:hover { opacity: 1 !important; background: #000 !important; }
        
        /* HARDENED IMAGE SIZE to prevent 'Giant Logo' bug */
        .ssl-overlay img { 
            width: 14px !important; 
            height: 14px !important; 
            min-width: 14px !important;
            max-width: 14px !important;
            margin-right: 5px !important; 
            vertical-align: middle !important;
            display: inline-block !important;
            border: none !important;
            padding: 0 !important;
            background: transparent !important;
            border-radius: 0 !important;
            box-shadow: none !important;
        }
        
        .ssl-review { margin-left: 8px; padding: 1px 4px; border-radius: 3px; font-weight: bold; font-size: 10px; }
        .ssl-review-positive { color: #66C0F4; background: rgba(102, 192, 244, 0.2); }
        .ssl-review-mixed { color: #a89468; background: rgba(168, 148, 104, 0.2); }
        .ssl-review-negative { color: #c00; background: rgba(204, 0, 0, 0.2); }
        .ssl-review-none { display: none !important; } /* Hidden by default */

        /* Status Borders - Reverted to Box-Shadow Inset on Container for reliability */
        .ssl-border-owned { 
            box-shadow: inset 0 0 0 4px #a4d007 !important; 
            z-index: 800 !important;
        }
        .ssl-border-wishlist { 
            box-shadow: inset 0 0 0 4px #66c0f4 !important; 
            z-index: 800 !important;
        }
        
        .ssl-ignored-img { 
            opacity: ${CONFIG.ignoredOpacity} !important; 
            filter: grayscale(100%) !important; 
        }
        .ssl-border-ignored { box-shadow: inset 0 0 0 4px #555 !important; }

        .ssl-bundle-owned { border: 2px solid #a4d007 !important; }
        .ssl-bundle-wishlist { border: 2px solid #66c0f4 !important; }

        .ssl-relative { position: relative !important; }

        /* DEBUG PANEL */
        #ssl-debug-panel {
            position: fixed; bottom: 10px; right: 10px;
            background: rgba(0,0,0,0.85); color: #fff;
            padding: 10px; border-radius: 5px;
            font-family: monospace; font-size: 12px;
            z-index: 100000; border: 1px solid #444;
            min-width: 200px;
            max-width: 300px;
        }
        #ssl-debug-panel h4 { margin: 0 0 5px 0; color: #a4d007; font-size: 13px; }
        #ssl-debug-panel div { margin-bottom: 2px; }
        #ssl-debug-panel button {
            background: #444; color: white; border: none;
            padding: 3px 8px; cursor: pointer; margin-top: 5px; width: 100%;
            font-size: 11px;
        }
        #ssl-debug-panel button:hover { background: #666; }
        .ssl-status-ok { color: #a4d007; }
        .ssl-status-warn { color: #f0ad4e; }
        .ssl-status-err { color: #d9534f; }
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
        requests: [],
        processing: false,
        activeRequest: 'None'
    };

    // --- UI Helpers ---
    function updateDebugPanel() {
        let panel = document.getElementById('ssl-debug-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'ssl-debug-panel';
            document.body.appendChild(panel);
        }

        const ownedCount = STATE.userData.owned ? STATE.userData.owned.length : 0;
        const wishlistCount = STATE.userData.wishlist ? STATE.userData.wishlist.length : 0;

        panel.innerHTML = `
            <h4>Steam Linker v3.1.1</h4>
            <div>Owned (Apps): <span class="ssl-status-ok">${ownedCount}</span></div>
            <div>Wishlist: <span class="ssl-status-ok">${wishlistCount}</span></div>
            <div>Queue: ${STATE.requests.length}</div>
            <div style="font-size:10px; color:#aaa; white-space:nowrap; overflow:hidden;">Active: ${STATE.activeRequest}</div>
            <button id="ssl-force-refresh">Refresh Data</button>
            <button id="ssl-clear-cache">Clear Cache</button>
        `;

        const btnRefresh = document.getElementById('ssl-force-refresh');
        if (btnRefresh) btnRefresh.onclick = () => {
            fetchUserData();
        };

        const btnClear = document.getElementById('ssl-clear-cache');
        if (btnClear) btnClear.onclick = () => {
            const keys = GM_listValues();
            keys.forEach(k => GM_deleteValue(k));
            location.reload();
        };
    }

    // --- API Helpers ---
    const MATURE_HEADERS = {
        "Cookie": "birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1"
    };

    function queueRequest(name, fn) {
        STATE.requests.push({ name, fn });
        updateDebugPanel();
        if (!STATE.processing) processQueue();
    }

    function processQueue() {
        if (STATE.requests.length === 0) {
            STATE.processing = false;
            STATE.activeRequest = "Idle";
            updateDebugPanel();
            return;
        }
        STATE.processing = true;

        const req = STATE.requests[0];
        STATE.activeRequest = req.name;
        updateDebugPanel();

        let handled = false;

        const next = () => {
            if (handled) return;
            handled = true;
            STATE.requests.shift();
            setTimeout(processQueue, CONFIG.queueInterval);
        };

        setTimeout(() => {
            if (!handled) {
                console.warn(`[SSL] Request '${req.name}' timed out - Forcing next`);
                next();
            }
        }, 5000);

        try {
            req.fn().finally(next);
        } catch (e) {
            console.error(e);
            next();
        }
    }

    function fetchUserData() {
        console.log('[SSL] Fetching User Data...');
        STATE.activeRequest = "Fetching User Data...";
        updateDebugPanel();

        queueRequest("UserData", () => new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://store.steampowered.com/dynamicstore/userdata/",
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        STATE.userData.owned = data.rgOwnedApps || [];
                        STATE.userData.ignored = Object.keys(data.rgIgnoredApps || {});
                        updateDebugPanel();
                    } catch (e) { }
                    resolve();
                },
                onerror: resolve,
                ontimeout: resolve
            });
        }));

        queueRequest("Wishlist", () => new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://steamcommunity.com/my/wishlistdata/?p=0",
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        STATE.userData.wishlist = Object.keys(data || {});
                        CACHE.set('ssl_userdata', STATE.userData);
                        updateDebugPanel();
                    } catch (e) { }
                    resolve();
                },
                onerror: resolve,
                ontimeout: resolve
            });
        }));
    }

    function searchSteam(term) {
        const cacheKey = `ssl_id_${term}`;
        const cached = CACHE.get(cacheKey);
        if (cached) return Promise.resolve(cached);

        return new Promise(resolve => {
            queueRequest(`Search: ${term.substring(0, 10)}...`, () => new Promise(subResolve => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=us`,
                    headers: MATURE_HEADERS,
                    timeout: 4000,
                    onload: (res) => {
                        let foundId = null;
                        try {
                            const data = JSON.parse(res.responseText);
                            if (data.items && data.items.length > 0) {
                                foundId = data.items[0].id;
                            }
                        } catch (e) { }

                        if (foundId) {
                            CACHE.set(cacheKey, foundId);
                            subResolve();
                            resolve(foundId);
                        } else {
                            searchSteamFallback(term, subResolve, resolve, cacheKey);
                        }
                    },
                    onerror: () => { searchSteamFallback(term, subResolve, resolve, cacheKey); },
                    ontimeout: () => { searchSteamFallback(term, subResolve, resolve, cacheKey); }
                });
            }));
        });
    }

    function searchSteamFallback(term, subResolve, resolve, cacheKey) {
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://store.steampowered.com/search/?term=${encodeURIComponent(term)}&ignore_preferences=1&category1=998`,
            headers: MATURE_HEADERS,
            timeout: 4000,
            onload: (res) => {
                let id = null;
                try {
                    const match = res.responseText.match(/href="https:\/\/store\.steampowered\.com\/app\/(\d+)/);
                    if (match) id = match[1];
                } catch (e) { }

                if (id) {
                    CACHE.set(cacheKey, id);
                } else {
                    CACHE.set(cacheKey, '404');
                }
                subResolve();
                resolve(id);
            },
            onerror: () => { subResolve(); resolve(null); },
            ontimeout: () => { subResolve(); resolve(null); }
        });
    }

    function getReviewScore(appId) {
        const cacheKey = `ssl_review_${appId}`;
        const cached = CACHE.get(cacheKey);
        if (cached) return Promise.resolve(cached);

        return new Promise(resolve => {
            queueRequest(`Review: ${appId}`, () => new Promise(subResolve => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://store.steampowered.com/appreviews/${appId}?json=1&day_range=365&language=all`,
                    headers: MATURE_HEADERS,
                    timeout: 4000,
                    onload: (res) => {
                        try {
                            const data = JSON.parse(res.responseText);
                            const summary = data.query_summary;

                            let percent = 0;
                            if (summary.total_reviews > 0) {
                                percent = Math.floor((summary.total_positive / summary.total_reviews) * 100);
                            } else {
                                percent = -1;
                            }

                            const score = {
                                percent: percent,
                                total: summary.total_reviews,
                                desc: summary.review_score_desc
                            };
                            CACHE.set(cacheKey, score);
                            subResolve();
                            resolve(score);
                        } catch (e) { subResolve(); resolve(null); }
                    },
                    onerror: () => { subResolve(); resolve(null); },
                    ontimeout: () => { subResolve(); resolve(null); }
                });
            }));
        });
    }

    // --- Scanners ---

    function scanGrid() {
        const candidates = document.querySelectorAll(`
            .bundle-page-tier-item-col figure, 
            .main-list-results-item figure,
            .flickity-slider figure,
            .slick-slide figure,
            .carousel-item figure
        `);

        candidates.forEach(figure => {
            if (figure.dataset.sslProcessed) return;

            const container = figure.closest('.bundle-page-tier-item-col') ||
                figure.closest('.main-list-results-item') ||
                figure.closest('.carousel-cell') ||
                figure.closest('.slick-slide') ||
                figure.parentElement;

            if (!container) return;

            // Ensure Relative Positioning for Overlay
            if (window.getComputedStyle(figure).position === 'static') figure.classList.add('ssl-relative');

            let title = null;

            const titleEl = container.querySelector('h3, h2, .bundle-page-tier-item-title, .main-list-results-item-title, .title, .item-title-text');
            if (titleEl) title = titleEl.textContent.trim();

            if (!title) {
                const fig = container.querySelector('figcaption');
                if (fig) title = fig.textContent.trim();
            }

            if (!title) {
                const img = figure.querySelector('img');
                if (img && img.alt && img.alt.length > 2) title = img.alt;
            }

            if (!title) return;

            figure.dataset.sslProcessed = "pending";

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
        const isOwned = STATE.userData.owned.includes(parseInt(appId));
        const isWishlist = STATE.userData.wishlist.includes(String(appId));
        const isIgnored = STATE.userData.ignored.includes(String(appId));

        if (isOwned) figure.classList.add('ssl-border-owned');
        else if (isWishlist) figure.classList.add('ssl-border-wishlist');

        if (isIgnored) {
            const img = figure.querySelector('img');
            if (img) img.classList.add('ssl-ignored-img');
            figure.classList.add('ssl-border-ignored');
        }

        const overlay = document.createElement('a');
        overlay.href = `https://store.steampowered.com/app/${appId}`;
        overlay.className = 'ssl-overlay';
        overlay.target = '_blank';
        overlay.innerHTML = `<img src="https://store.steampowered.com/favicon.ico"> STEAM`;

        figure.appendChild(overlay);

        getReviewScore(appId).then(score => {
            if (score && typeof score.percent === 'number') {
                const badge = document.createElement('span');
                badge.className = 'ssl-review';

                // FIXED: Do not display anything if score is invalid or -1
                if (score.percent === -1 || score.total === 0) {
                    // Do nothing, badge remains empty or we don't append it
                    // Actually, user wants NOTHING displayed.
                    // So we don't append badge at all.
                } else {
                    badge.textContent = `${score.percent}%`;
                    if (score.percent >= 70) badge.classList.add('ssl-review-positive');
                    else if (score.percent >= 40) badge.classList.add('ssl-review-mixed');
                    else badge.classList.add('ssl-review-negative');
                    overlay.appendChild(badge); // Only append if valid
                }
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

            queueRequest(`Scan Bundle: ${link.href.split('/').pop()}`, () => new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: link.href,
                    headers: MATURE_HEADERS,
                    onload: (res) => {
                        try {
                            const text = res.responseText;
                            const pageIds = new Set();

                            const matchesApp = text.matchAll(/store\.steampowered\.com\/app\/(\d+)/g);
                            const matchesSub = text.matchAll(/store\.steampowered\.com\/sub\/(\d+)/g);

                            for (const m of matchesApp) pageIds.add(m[1]);
                            for (const m of matchesSub) pageIds.add(m[1]);

                            let hasOwned = false;
                            let hasWishlist = false;

                            for (const id of pageIds) {
                                const idStr = String(id);
                                const idInt = parseInt(id);
                                if (STATE.userData.wishlist.includes(idStr)) hasWishlist = true;
                                if (STATE.userData.owned.includes(idInt)) hasOwned = true;
                            }

                            if (hasWishlist) bundle.classList.add('ssl-bundle-wishlist');
                            if (hasOwned) bundle.classList.add('ssl-bundle-owned');

                        } catch (e) { }
                        resolve();
                    },
                    onerror: resolve,
                    ontimeout: resolve
                });
            }));
            bundle.dataset.sslProcessed = "done";
        });
    }

    // --- Init ---
    updateDebugPanel();
    setTimeout(fetchUserData, 1000);

    // Main Loop
    setInterval(() => {
        scanGrid();
        if (location.href.includes('/bundles')) scanBundlesOverview();
    }, 2000);

})();
