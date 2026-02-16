```
// ==UserScript==
// @name         Humble Bundle Game Store Enhancer
// @namespace    https://github.com/gbzret4d/game-store-enhancer
// @version      0.2.5
// @description  Humble Bundle Steam Integration with robust status checks, review scores, and overlay fixes.
// @author       gbzret4d
// @updateURL    https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/humble_game_store_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/develop/humble_game_store_enhancer.user.js
// @match        https://www.humblebundle.com/*
// @icon         https://www.google.com/s2/favicons?domain=humblebundle.com
// @connect      store.steampowered.com
// @connect      cdn.jsdelivr.net
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // --- Configuration ---
    const STEAM_APPS_CACHE_URL = 'https://cdn.jsdelivr.net/gh/gbzret4d/game-store-enhancer@main/data/steam_apps.min.json';
    const LOG_PREFIX = '[HBSI]';
    const REVIEW_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
    const FORCE_FETCH = false; // Debug flag

    // --- Selectors ---
    // Expanded to cover Homepage, Store, Bundles, and Choice
    const TILE_SELECTOR = [
        '.entity-block-container', // Legacy Grid
        '.entity', // Legacy List
        '.content-choice', // Choice
        '.game-tile', // Generic
        '.item-details', // Bundle Page V2
        '.full-tile-view', // Homepage Featured
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
    GM_addStyle(`
    .hbsi - badge {
    display: inline - flex;
    align - items: center;
    justify - content: center;
    gap: 5px;
    background - color: #171a21;
    padding: 4px 6px;
    border - radius: 4px;
    border: 1px solid #3c3d3e;
    box - shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
    font - family: "Motiva Sans", "Arial", sans - serif;
    font - size: 11px;
    font - weight: bold;
    color: #c7d5e0;
    text - decoration: none!important;
    line - height: 1;
    z - index: 2147483647!important;
    cursor: pointer;
    pointer - events: auto!important;
    transition: all 0.2s ease;
    white - space: nowrap;
    height: auto!important;
    width: auto!important;
    box - sizing: border - box;
    align - self: flex - start;
    flex - shrink: 0;
    flex - grow: 0;
}
        .hbsi - badge:hover {
    border - color: #66c0f4;
    color: #ffffff;
    transform: translateY(-1px);
    box - shadow: 0 6px 12px rgba(0, 0, 0, 0.6);
}
        .hbsi - badge svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
}
        .hbsi - status - owned { color: #a4d007!important; border - color: #4c6b22!important; }
        .hbsi - status - wishlist { color: #66c0f4!important; border - color: #2e4d6d!important; }
        .hbsi - status - ignored { color: #d9534f!important; border - color: #6d2e2e!important; }
        .hbsi - review - positive { color: #66c0f4; }
        .hbsi - review - mixed { color: #a8926a; }
        .hbsi - review - negative { color: #d9534f; }
        .hbsi - review - score {
    font - size: 10px;
    opacity: 0.9;
    margin - left: 2px;
}
        .hbsi - tile - owned { box - shadow: inset 0 0 0 3px #5cb85c!important; }
        .hbsi - tile - wishlist { box - shadow: inset 0 0 0 3px #5bc0de!important; }
        .hbsi - tile - ignored {
    box - shadow: inset 0 0 0 3px #d9534f!important;
    opacity: 0.6;
    filter: grayscale(80 %);
}
        .hbsi - pos - abs {
    position: absolute!important;
    top: 6px!important;
    left: 6px!important;
    bottom: auto!important;
    right: auto!important;
}
`);

    // --- Helpers ---
    function normalize(str) {
        return str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
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
                        const owned = new Set(data.rgOwnedApps || []);
                        const wishlist = new Set(data.rgWishlist || []);
                        const ignored = new Set(Object.keys(data.rgIgnoredApps || {}).map(Number));

                        console.log(LOG_PREFIX, `UserData Loaded: ${ owned.size } Owned, ${ wishlist.size } Wishlisted, ${ ignored.size } Ignored`);
                        resolve({ owned, wishlist, ignored });
                    } catch (e) {
                        console.error(LOG_PREFIX, "Failed to parse UserData", e);
                        resolve({ owned: new Set(), wishlist: new Set(), ignored: new Set() });
                    }
                }
            });
        });
    }

    // 2. App Cache
    async function fetchAppCache() {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "GET",
                url: STEAM_APPS_CACHE_URL,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        Object.entries(data).forEach(([name, id]) => {
                            state.steamApps.set(normalize(name), id);
                        });
                        console.log(LOG_PREFIX, `AppCache Loaded: ${ state.steamApps.size } apps`);
                        resolve();
                    } catch (e) { resolve(); }
                }
            });
        });
    }

    // 3. Review Scores
    async function fetchReviewScore(appId, badgeEl) {
        // console.log(LOG_PREFIX, `Requesting review for ${ appId }`);

        const cached = state.reviewCache[appId];
        if (cached && (Date.now() - cached.timestamp < REVIEW_CACHE_EXPIRY)) {
            updateBadgeWithReview(badgeEl, cached.data);
            return;
        }

        // Rate limiting handled naturally by not batching heavily here, but we could add a queue.
        // For now, strict on-demand.
        GM_xmlhttpRequest({
            method: "GET",
            url: `https://store.steampowered.com/appreviews/${appId}?json=1&num_per_page=0&purchase_type=all&language=all`,
    onload: (res) => {
        try {
            const json = JSON.parse(res.responseText);
            if (json.query_summary) {
                const data = {
                    score_desc: json.query_summary.review_score_desc,
                    percent: Math.floor((json.query_summary.total_positive / json.query_summary.total_reviews) * 100) || 0,
                    total: json.query_summary.total_reviews
                };

                // Cache it
                state.reviewCache[appId] = { timestamp: Date.now(), data: data };
                GM_setValue('review_cache', state.reviewCache);

                updateBadgeWithReview(badgeEl, data);
            }
        } catch (e) {
            console.error(LOG_PREFIX, `Review Fetch Parse Error for ${appId}`, e);
        }
    },
        onerror: (err) => {
            console.error(LOG_PREFIX, `Review Fetch Network Error for ${appId}`, err);
        }
        });
    }

function updateBadgeWithReview(badgeEl, data) {
    if (!data || data.total < 10) return; // Skip if too few reviews

    // Find or create label
    let label = badgeEl.querySelector('.hbsi-review-score');
    if (!label) {
        // Create label if not exists (it might exist from "Loading.." placeholder)
        // Check if we have the separator
        if (!badgeEl.querySelector('span[style*="border-left"]')) {
            const sep = document.createElement('span');
            sep.style.borderLeft = '1px solid currentColor';
            sep.style.height = '12px';
            sep.style.margin = '0 4px';
            sep.style.opacity = '0.3';
            badgeEl.appendChild(sep);
        }

        label = document.createElement('span');
        label.className = 'hbsi-review-score';
        badgeEl.appendChild(label);
    }

    label.innerText = `${data.percent}%`;

    // Color
    label.className = 'hbsi-review-score'; // Reset classes
    if (data.percent >= 95) label.classList.add('hbsi-review-positive'); // Overwhelmingly Positive
    else if (data.percent >= 80) label.classList.add('hbsi-status-owned'); // Very Positive
    else if (data.percent >= 70) label.classList.add('hbsi-review-mixed'); // Mixed/Mostly Positive
    else label.classList.add('hbsi-review-negative');

    label.title = `${data.score_desc} (${data.total} reviews)`;
}

// --- Badge Creator ---
function createBadge(appId, statusClass) {
    const badge = document.createElement('a');
    badge.className = `hbsi-badge ${statusClass || ''}`;
    badge.href = `https://store.steampowered.com/app/${appId}`;
    badge.target = '_blank';
    badge.title = `Open in Steam (AppID: ${appId})`;
    badge.dataset.appid = appId; // For debugging

    // Official Steam Logo (Piston)
    badge.innerHTML = `
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M11.979 0C5.363 0 0 5.383 0 12s5.363 12 11.979 12c.153 0 .307 0 .46-.006l.872-5.01-1.637-2.316a3.298 3.298 0 0 1-2.336.985 3.303 3.303 0 0 1-3.297-3.303c0-1.82 1.479-3.303 3.297-3.303 1.82 0 3.303 1.483 3.303 3.303 0 .262-.036.514-.092.756l3.52 4.976c3.785-.436 6.812-3.418 7.398-7.23 0-.01.005-.237.005-.246.248-2.365-.48-4.66-1.846-6.495a12.013 12.013 0 0 0-9.646-6.11zM9.04 10.155c.983 0 1.78.797 1.78 1.78 0 .984-.797 1.782-1.78 1.782-.984 0-1.782-.798-1.782-1.782 0-.983.798-1.78 1.782-1.78z"/></svg>
            <span>STEAM</span>
            <span style="border-left: 1px solid currentColor; height: 12px; margin: 0 4px; opacity: 0.3;"></span>
            <span class="hbsi-review-score">..</span>
        `;

    // Capture Phase Click Handler (The Nuclear Option)
    // This runs BEFORE Humble's event listeners.
    badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        console.log(LOG_PREFIX, `Opening Steam Store for ${appId} (Capture Phase)`);
        window.open(badge.href, '_blank').focus();
        return false;
    }, true); // <--- TRUE enables Capture Phase

    ['mousedown', 'mouseup'].forEach(evt => {
        badge.addEventListener(evt, e => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);
    });

    // Trigger Review Fetch
    fetchReviewScore(appId, badge);

    return badge;
}

// --- Processor ---
function processTile(tile) {
    if (state.processed.has(tile)) return;

    // 0. Duplication & Nesting Check
    if (tile.closest('.hbsi-processed') || tile.querySelector('.hbsi-processed')) {
        state.processed.add(tile);
        return;
    }

    // 1. Find Title
    const titleEl = tile.querySelector('.item-title, .entity-title, .content-choice-title, .game-name, .name, h4');
    if (!titleEl && !tile.getAttribute('aria-label')) return;

    const name = titleEl ? titleEl.innerText.trim() : tile.getAttribute('aria-label');
    const normName = normalize(name);
    if (!normName) return;

    // 2. Resolve AppID
    const appId = state.steamApps.get(normName);
    if (!appId) return;

    // 3. Status Logic
    let isOwned = state.userData.owned.has(appId);
    let isWishlist = state.userData.wishlist.has(appId);
    let isIgnored = state.userData.ignored.has(appId);
    if (isOwned) isIgnored = false;

    let statusClass = '';
    let borderClass = '';
    if (isOwned) { statusClass = 'hbsi-status-owned'; borderClass = 'hbsi-tile-owned'; }
    else if (isWishlist) { statusClass = 'hbsi-status-wishlist'; borderClass = 'hbsi-tile-wishlist'; }
    else if (isIgnored) { statusClass = 'hbsi-status-ignored'; borderClass = 'hbsi-tile-ignored'; }

    // 4. Resolve Target Container (Image)
    // Try to find the image container to position relative to ARTWORK.
    // Fallback to tile if no image found.
    let target = tile;
    const img = tile.querySelector('img, picture');
    if (img) {
        // Use immediate parent of image, or specific container classes if known
        // Usually immediate parent is best for "overlay" effect on image.
        target = img.parentElement;
    }

    // Double check for duplicate in target
    if (target.querySelector('.hbsi-badge')) {
        state.processed.add(tile);
        state.processed.add(target);
        return;
    }

    // 5. Inject
    const badge = createBadge(appId, statusClass);
    badge.classList.add('hbsi-pos-abs');

    // Inline Safety (Force Position)
    badge.style.position = 'absolute';
    badge.style.top = '6px';
    badge.style.left = '6px';
    badge.style.zIndex = '2147483647';

    // DEBUG: Visual Confirmation of v0.2.5
    badge.setAttribute('data-version', '0.2.5');

    // Layout Safety
    const style = window.getComputedStyle(target);
    if (style.position === 'static') {
        target.style.position = 'relative';
    }

    // Border Application (Apply to TILE usually, not image)
    // But if tile is huge, maybe image is better? 
    // User liked the border, let's keep it on the Tile (the main card).
    if (borderClass) {
        tile.classList.add(borderClass);
    }

    target.appendChild(badge);

    // Mark as processed
    state.processed.add(tile);
    state.processed.add(target);
    tile.classList.add('hbsi-processed');
}

// --- Main ---
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

    // Initial Scan
    setTimeout(() => {
        const tiles = document.querySelectorAll(TILE_SELECTOR);
        console.log(LOG_PREFIX, `Initial Scan found ${tiles.length} tiles`);
        tiles.forEach(processTile);
    }, 1000);
}

// Start
main();

}) ();

