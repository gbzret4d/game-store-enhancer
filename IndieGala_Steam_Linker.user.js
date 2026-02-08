// ==UserScript==
// @name         IndieGala Steam Linker (Standalone)
// @namespace    https://github.com/gbzret4d/indiegala-steam-linker
// @version      1.0.0
// @description  Adds Steam links and review scores to IndieGala games. Standalone version for testing.
// @author       gbzret4d
// @match        https://www.indiegala.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=indiegala.com
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
        cacheTimestamp: 3600000 // 1 hour
    };

    // --- CSS ---
    GM_addStyle(`
        .ssl-overlay {
            position: absolute; bottom: 0; left: 0; width: 100%;
            background: rgba(0,0,0,0.9); color: white;
            font-size: 11px; padding: 4px 0; text-align: center;
            display: flex; justify-content: center; align-items: center;
            z-index: 99999; pointer-events: auto; text-decoration: none !important;
            border-top: 1px solid rgba(255,255,255,0.2);
        }
        .ssl-overlay img { width: 14px; height: 14px; margin-right: 5px; vertical-align: middle; }
        
        .ssl-border-owned { border: 2px solid #a4d007 !important; box-shadow: 0 0 5px rgba(164, 208, 7, 0.5); }
        .ssl-border-wishlist { border: 2px solid #66c0f4 !important; box-shadow: 0 0 5px rgba(102, 192, 244, 0.5); }
        .ssl-border-ignored { border: 2px solid #d9534f !important; opacity: 0.5; }

        .ssl-relative { position: relative !important; }
    `);

    // --- Helper: Search Steam ---
    function searchSteam(term) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=us`,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.items && data.items.length > 0) {
                            resolve(data.items[0].id);
                        } else {
                            resolve(null);
                        }
                    } catch (e) { resolve(null); }
                },
                onerror: () => resolve(null)
            });
        });
    }

    // --- Scanner Logic ---
    function scan() {
        // Hentai Pair / Power Shock Grid Logic
        document.querySelectorAll('.bundle-page-tier-item-col').forEach(col => {
            if (col.dataset.sslProcessed) return;
            col.dataset.sslProcessed = "pending";

            // Find Title
            let titleEl = col.querySelector('.bundle-page-tier-item-title');
            if (!titleEl) titleEl = col.querySelector('.title');

            // Fallback: If no title class, look for text inside
            if (!titleEl) {
                const potentialTitles = Array.from(col.querySelectorAll('*')).filter(el => el.children.length === 0 && el.textContent.trim().length > 3);
                if (potentialTitles.length > 0) titleEl = potentialTitles[0];
            }

            if (!titleEl) return;
            const title = titleEl.textContent.trim();

            searchSteam(title).then(id => {
                if (id) {
                    inject(col, id, title);
                    col.dataset.sslProcessed = "done";
                }
            });
        });

        // Store Page Logic
        document.querySelectorAll('.main-list-results-item').forEach(item => {
            if (item.dataset.sslProcessed) return;
            // ... existing logic ...
        });
    }

    function inject(container, appId, title) {
        let imgContainer = container.querySelector('figure') || container.querySelector('.bundle-page-tier-item-image');
        if (!imgContainer) imgContainer = container;

        if (window.getComputedStyle(imgContainer).position === 'static') imgContainer.style.position = 'relative';

        const overlay = document.createElement('a');
        overlay.href = `https://store.steampowered.com/app/${appId}`;
        overlay.className = 'ssl-overlay';
        overlay.innerHTML = `<img src="https://store.steampowered.com/favicon.ico"> STEAM`;
        overlay.target = '_blank';

        imgContainer.appendChild(overlay);
    }

    setInterval(scan, 2000);
})();
