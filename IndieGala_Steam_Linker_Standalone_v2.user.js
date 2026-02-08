// ==UserScript==
// @name         IndieGala Steam Linker (Standalone v2)
// @namespace    https://github.com/gbzret4d/indiegala-steam-linker-v2
// @version      2.0.0
// @description  Standalone version with robust scanners and fixed visual styles.
// @author       gbzret4d
// @match        https://www.indiegala.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=indiegala.com
// @connect      store.steampowered.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // --- CSS Fixes ---
    // 1. Remove opacity from containers to prevent "grayed out" images
    // 2. Ensure overlays are on top (z-index 9999)
    GM_addStyle(`
        .ssl-overlay {
            position: absolute; bottom: 0; left: 0; width: 100%;
            background: rgba(0,0,0,0.85); color: white;
            font-size: 11px; padding: 4px 0; text-align: center;
            display: flex; justify-content: center; align-items: center;
            z-index: 9999; pointer-events: auto; text-decoration: none !important;
            border-top: 1px solid rgba(255,255,255,0.2);
            transition: opacity 0.2s;
        }
        .ssl-overlay:hover { opacity: 1 !important; background: rgba(0,0,0,0.95); }
        .ssl-overlay img { width: 14px; height: 14px; margin-right: 5px; vertical-align: middle; }
        
        /* Borders applied to specific elements, NOT containers */
        .ssl-border-owned { box-shadow: inset 0 0 0 3px #a4d007 !important; }
        .ssl-border-wishlist { box-shadow: inset 0 0 0 3px #66c0f4 !important; }
        .ssl-border-ignored { box-shadow: inset 0 0 0 3px #d9534f !important; }
        
        /* Helper to ensure positioning */
        .ssl-relative { position: relative !important; }
    `);

    // --- Cache ---
    const cache = {};

    // --- Search Helpers ---
    function searchSteam(term) {
        if (!term) return Promise.resolve(null);
        if (cache[term]) return Promise.resolve(cache[term]);

        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=us`,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.items && data.items.length > 0) {
                            const id = data.items[0].id;
                            cache[term] = id;
                            resolve(id);
                        } else {
                            resolve(null); // Not found
                        }
                    } catch (e) { resolve(null); }
                },
                onerror: () => resolve(null)
            });
        });
    }

    // --- Main Scanner ---
    function scan() {
        console.log("[SSL] Scanning...");

        // Strategy A: Standard Bundle Grid (Power Shock / Hentai Pair)
        // We look for the 'figure' because that's where we want to put the overlay/border
        const candidates = document.querySelectorAll('.bundle-page-tier-item-col figure, .main-list-results-item figure');

        candidates.forEach(figure => {
            if (figure.dataset.sslProcessed) return;

            // 1. Find Container & Title
            const container = figure.closest('.bundle-page-tier-item-col') || figure.closest('.main-list-results-item');
            if (!container) return;

            // Title Search Strategies
            let title = null;

            // Strategy 1: .bundle-page-tier-item-title (Bundle)
            const titleElBundle = container.querySelector('.bundle-page-tier-item-title');
            if (titleElBundle) title = titleElBundle.textContent.trim();

            // Strategy 2: .main-list-results-item-title (Store)
            if (!title) {
                const titleElStore = container.querySelector('.main-list-results-item-title');
                if (titleElStore) title = titleElStore.textContent.trim();
            }

            // Strategy 3: Image Alt/Title (Fallback)
            if (!title) {
                const img = figure.querySelector('img');
                if (img && img.alt && img.alt.length > 3) title = img.alt;
            }

            if (!title) return;

            figure.dataset.sslProcessed = "pending";
            console.log(`[SSL] Processing: ${title}`);

            // 2. Fetch & Inject
            searchSteam(title).then(id => {
                if (id) {
                    inject(figure, id);
                } else {
                    figure.dataset.sslProcessed = "done_no_result";
                }
            });
        });
    }

    function inject(figure, appId) {
        if (window.getComputedStyle(figure).position === 'static') figure.classList.add('ssl-relative');

        // Add Overlay
        if (!figure.querySelector('.ssl-overlay')) {
            const overlay = document.createElement('a');
            overlay.href = `https://store.steampowered.com/app/${appId}`;
            overlay.className = 'ssl-overlay';
            overlay.innerHTML = `<img src="https://store.steampowered.com/favicon.ico"> STEAM`;
            overlay.target = '_blank';
            figure.appendChild(overlay);
        }

        // Add Border (Simulated via Box Shadow to avoid layout shifts)
        // Check Status (Mocking logic for standalone - normally we'd fetch userdata)
        // For debugging, let's just apply a border to prove it works
        // figure.classList.add('ssl-border-wishlist'); 

        figure.dataset.sslProcessed = "done";
    }

    // --- Init ---
    // Run frequently to catch dynamic content
    setInterval(scan, 2000);

    // Initial run
    setTimeout(scan, 1000);

})();
