# IndieGala Site Analysis & Implementation Details
**Last Updated:** v2.0.3 (2026-02-07)

## 1. Overview
IndieGala uses a mix of modern and legacy layouts across its site sections. The userscript employs a multi-strategy approach to locate game containers, extract titles/IDs, and inject Steam data without breaking the site's layout or covering critical UI elements.

## 2. Page-Specific Implementations

### 2.1 Store Page (`/store`)
The main store grid has undergone layout changes (verified Feb 2026).
- **Primary Selector:** `.main-list-results-item` (v2.0.1)
  - This container holds the game cover and details in the modern grid.
- **Title Selector:** `.main-list-results-item-info h3`
- **Injection Strategy:** `Figure Overlay`
  - The script finds the cover image (`figure` or `.main-list-item-col-image`), sets it to `relative`, and appends a semi-transparent Steam overlay at the bottom.

### 2.2 Bundle Pages (`/bundle/...`)
Bundles feature a complex layout with a top carousel and a bottom tier grid.
- **Top Carousel (Slider):**
  - **Selector:** `.bundle-slider-game-info` (v2.0.2)
  - **Behavior:** Dynamic (Bootstrap Carousel). The script scans all slides (which are present in DOM) and adds links. MutationObserver handles updates.
- **Tier Grid:**
  - **Selector:** `.bundle-page-tier-item-col`
  - **Injection:** Figure Overlay.

### 2.3 Product Detail Page (`/store/game/...`)
Single game pages require a non-intrusive approach to avoid covering the game art or logos.
- **Selector:** `.store-product-header-flex` (v2.0.3)
- **Title Selector:** `h1[itemprop="name"]`
- **Injection Strategy:** `Simple Link` (Forced via `forceSimple: true`)
  - **Why?** The header contains a `figure` with the game art. The standard "Figure Overlay" strategy would place the link ON TOP of the art, obscuring the logo/DLC banners.
  - **Solution:** We force the script to append a text link (`[ STEAM 95% ]`) *next to* the H1 title instead.

### 2.4 Library & Trades
- **Library:** `li.profile-private-page-library-subitem`
- **Trades:** `.trades-list-card-contents`
- **Navigation:** These sections are Single Page Applications (SPA). The script's `MutationObserver` detects page changes (e.g., switching tabs) and re-scans automatically.

### 2.5 Other Sections
- **Showcase:** `.showcase-main-list-item.main-list-item`
- **Freebies:** `.products-col-inner`
- **Home/Top Sellers:** `.item-inner`

## 3. Core Features

### 3.1 Age Gate Bypass
IndieGala shows an age verification overlay for mature games.
- **Trigger:** `a.adult-check-confirm` presence.
- **Action:** The script automatically clicks this button on page load to reveal content immediately.

### 3.2 Dynamic Content Handling
- **MutationObserver:** Watches `document.body` for added nodes.
- **Debounced Scan:** verification logic runs 500ms after DOM activity stops to prevent performance issues during scrolling/loading.

## 4. Selector Configuration Reference
(Excerpt from `game_store_enhancer.user.js` v2.0.3)

```javascript
selectors: [
    // Store Grid
    { container: '.main-list-results-item', title: '.main-list-results-item-info h3' },
    
    // Bundle Carousel
    { container: '.bundle-slider-game-info', title: '.bundle-slider-game-info-title' },
    
    // Product Page (Force Simple Link)
    { container: '.store-product-header-flex', title: 'h1[itemprop="name"]', forceSimple: true },
    
    // Library
    { container: 'li.profile-private-page-library-subitem', title: '.profile-private-page-library-subitem-text' },
    
    // ... (see source for full list)
]
```
