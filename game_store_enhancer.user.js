// ==UserScript==
// @name         Game Store Enhancer (Launcher)
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      3.0.2
// @description  Detects and recommends the correct Game Store Enhancer script for the current store.
// @author       gbzret4d
// @match        https://www.humblebundle.com/*
// @match        https://www.fanatical.com/*
// @match        https://dailyindiegame.com/*
// @match        https://www.dailyindiegame.com/*
// @match        https://www.gog.com/*
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/main/game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/main/game_store_enhancer.user.js
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const REPO_BASE = 'https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/main/';
    const SITES = {
        'humblebundle.com': {
            name: 'Humble Bundle',
            script: 'humble_game_store_enhancer.user.js',
            color: '#cc2929'
        },
        'fanatical.com': {
            name: 'Fanatical',
            script: 'fanatical_game_store_enhancer.user.js',
            color: '#da0027'
        },
        'gog.com': {
            name: 'GOG',
            script: 'gog_game_store_enhancer.user.js',
            color: '#6e4595'
        },
        'dailyindiegame.com': {
            name: 'DailyIndieGame',
            script: 'dailyindiegame_game_store_enhancer.user.js',
            color: '#2b2b2b'
        }
    };

    // --- Identification ---
    function getCurrentSite() {
        const host = window.location.hostname;
        for (const domain in SITES) {
            if (host.includes(domain)) return SITES[domain];
        }
        return null;
    }

    // --- UI ---
    function showBanner(site) {
        if (localStorage.getItem('gse_launcher_dismissed_' + site.script)) return;

        // Double check existence just before showing (in case it loaded VERY late)
        if (checkStatus()) return;

        const banner = document.createElement('div');
        banner.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 300px;
            background: #1b2838;
            color: #fff;
            border: 1px solid #66c0f4;
            border-radius: 4px;
            padding: 15px;
            font-family: sans-serif;
            font-size: 13px;
            z-index: 2147483647;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;

        banner.innerHTML = `
            <div style="font-weight:bold;color:#66c0f4;display:flex;align-items:center;gap:8px;">
                <span>⚡ Game Store Enhancer</span>
            </div>
            <div>
                You are on <b>${site.name}</b>, but the enhanced script for this store is not active.
            </div>
            <a href="${REPO_BASE + site.script}" target="_blank" style="
                background: linear-gradient(90deg, #06BFFF 0%, #2D73FF 100%);
                color: white;
                text-align: center;
                padding: 8px;
                border-radius: 2px;
                text-decoration: none;
                font-weight: bold;
                transition: opacity 0.2s;
            ">Install ${site.name} Script</a>
            <div style="font-size:10px;text-align:center;color:#8f98a0;margin-top:5px;cursor:pointer;text-decoration:underline;">
                Dismiss this message
            </div>
        `;

        // Dismiss action
        const dismissBtn = banner.querySelector('div:last-child');
        dismissBtn.onclick = () => {
            localStorage.setItem('gse_launcher_dismissed_' + site.script, Date.now());
            banner.remove();
        };

        // Hover effect for button
        const btn = banner.querySelector('a');
        btn.onmouseover = () => btn.style.opacity = '0.9';
        btn.onmouseout = () => btn.style.opacity = '1';

        document.body.appendChild(banner);
    }

    // --- Main ---
    function checkStatus() {
        const isInstalled =
            document.documentElement.classList.contains('gse-installed') ||
            document.documentElement.dataset.gseInstalled === "true" ||
            (typeof unsafeWindow !== 'undefined' && unsafeWindow.gseInstalled === true);

        if (isInstalled) {
            console.log('[GSE Launcher] Specific script is active. Silent mode.');
            return true;
        }
        return false;
    }

    // Polling Mechanism (v3.0.2)
    let attempts = 0;
    const maxAttempts = 10; // Check for 5 seconds

    function poll() {
        if (checkStatus()) return; // Found it, exit.

        attempts++;
        if (attempts < maxAttempts) {
            setTimeout(poll, 500); // Retry every 500ms
        } else {
            // Final check failed
            const site = getCurrentSite();
            if (site) {
                console.log('[GSE Launcher] Specific script missing for', site.name);
                showBanner(site);
            }
        }
    }

    // Start polling
    setTimeout(poll, 1000);

})();
