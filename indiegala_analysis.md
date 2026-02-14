# IndieGala Site Analysis & Implementation Details
**Last Updated:** v2.0.23 (2026-02-07)

## 1. Overview
IndieGala uses a mix of modern and legacy layouts. The userscript employs a multi-strategy approach to locate game containers.
**v2.0.23 Update:** Visuals have been standardized to use `box-shadow: inset` for status borders to prevent layout shifting. The "Ignored" status no longer has a gray background, and overlay text is bottom-aligned.

## 2. Page-Specific Implementations

### 2.1 Store Page (`/store`)
- **Primary Selector:** `.main-list-results-item`
- **Title Selector:** `.main-list-results-item-info h3`
- **Injection:** Figure Overlay (Bottom Aligned Text).

### 2.2 Bundle Pages (`/bundle/...`)
Bundles feature a complex layout with a top carousel and a bottom tier grid.
- **Top Carousel:**
  - **Selector:** `.bundle-slider-game-info`
- **Tier Grid (Standard):**
  - **Selector:** `.bundle-page-tier-item-col`
- **Tier Grid (Power Shock/Grid Style):**
  - **Selector:** `.bundle-page-tier-item-inner` (Added v2.0.23)
  - **Injection:** Figure Overlay.

### 2.3 Bundles Overview (`/bundles`)
- **Selector:** `.container-item` (Added v2.0.23)
- **Title:** `.container-item-title`

### 2.4 Product Detail Page (`/store/game/...`)
- **Selector:** `.store-product-contents-aside-inner figure`
- **Title Selector:** `h1[itemprop="name"]`
- **External Title:** `true`

### 2.5 Library & Trades
- **Library:** `li.profile-private-page-library-subitem`
- **Library Bundle Row:** `.library-bundle-item` (Generic)
- **Trades:** `.trades-list-card-contents`

## 3. Core Features & Strategies

### 3.1 Visual Strategy (v2.0.23)
- **Borders:** `box-shadow: inset 0 0 0 4px [color]` is used instead of `border` to avoid disrupting grid layouts (e.g., "Hentai Pair" bundle).
- **Overlay:** Text is aligned to the bottom of the container `justify-content: flex-end`.
- **Ignored Items:** Defined by `.ssl-container-ignored`. No background color is applied to avoid "grayed out" look.

### 3.2 Dynamic Content
- **MutationObserver:** Watches `document.body` for added nodes (single-page navigation).
- **Debounce:** 500ms delay after DOM activity.

## 4. Selector Configuration Reference
(Excerpt from `game_store_enhancer.user.js` v2.0.23)

```javascript
selectors: [
    // Store Grid
    { container: '.main-list-results-item', title: '.main-list-results-item-info h3' },
    
    // Bundles
    { container: '.bundle-item-cont', title: '.bundle-item-title' },
    { container: '.bundle-page-tier-item-inner', title: '.bundle-page-tier-item-title' },
    { container: '.container-item', title: '.container-item-title' },

    // Library
    { container: 'li.profile-private-page-library-subitem', title: '.profile-private-page-library-subitem-text' },
    // ...
]
```
