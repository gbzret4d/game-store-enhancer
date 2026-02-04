# GOG.com Page Layout Analysis

This document serves as a reference for the DOM structure of GOG.com.
It is used to plan the support for the `Game Store Enhancer` userscript.

## Key Findings: Language Consistency
- **URL**: `https://www.gog.com/[lang]/game/[slug]` (e.g. `/en/` or `/de/`).
- **Structure**: The DOM structure is **identical** across languages. Selectors work globally.
- **IDs**: Most game elements have a `data-product-id` which is a GOG-specific ID.

## Page Types

### 1. Store Front / Search / Category Pages
*Game tiles found on the homepage, search results, and "All Games" lists.*

- **Container**: `a.product-tile`
- **Unique ID**: `data-product-id` attribute on the container.
- **Title Selector**: `.product-title span`
- **Price Selector**: `.product-price` (which contains `.product-price-value`, etc.)
- **Link**: Relative href (e.g. `/en/game/flatout_2`).
- **Integration**:
    - Inject "View on Steam" badge inside `.product-tile`.
    - Careful with layout: These tiles are often grid-based.

### 2. Product Page (Individual Game)
*The specific landing page for a game.*

- **Container**: `body` (or specific header wrapper like `.productcard-basics`, `.product-actions`).
- **Main Title**: `h1.productcard-basics__title`
- **Price**: `.product-actions-price__final-amount`
- **Platforms**: `.productcard-basics__column--works-on` (contains icons for Windows/Mac/Linux).
- **Integration**:
    - Ideal spot: Next to the title (`h1`) or near the "Add to Cart" block (`.product-actions`).

### 3. User Account / Library (`/account`)
*The user's list of owned games.*

- **Container**: `.product-row` (List view) or `.product-tile` (Grid view).
- **Title Selector**: `.product-title` or `.product-row__title`.
- **Integration**:
    - Inject badge into the row/tile.

### 4. Order History (`/account/settings/orders`)
*Table or list of past purchases.*

- **Pagination**: Supports URL parameters (`?page=2`).
- **Structure**: Orders are grouped, but games are listed as individual rows.
- **Game Row Selector**: `.product-row` (specifically `.product-row.order-product` or similar).
- **Title Selector**: `.product-title__text`
- **Price**: `.product-row__price`
- **Integration**:
    - Iterate through `.product-row`.
    - Inject badge next to title or price.
    - Handle pagination by re-running scan on URL change (or just relying on the script's Observer).

### 5. Wishlist (`/account/wishlist`)
*User's wishlist.*

- **Container**: `.product-row` (or `.product-row--wishlist`).
- **Unique ID**: **`gog-product` attribute** (e.g., `gog-product="1207658772"`).
- **Title Selector**: `.product-row__title`
- **Link Selector**: `a.product-row__link`
- **Integration**:
    - straightforward injection into `.product-row`.
    - `gog-product` ID is a robust identifier (though still distinct from Steam ID).

## Recommended Strategy

1.  **Selector Configuration**:
    ```javascript
    'gog.com': {
        name: 'GOG',
        selectors: [
            { container: '.product-tile', title: '.product-title span' }, // Store Grid
            { container: '.product-row', title: '.product-title' },       // Library List
            { container: '.productcard-basics', title: 'h1.productcard-basics__title' }, // Product Page
        ],
        ignoreUrl: '/checkout' // Example exclusion
    }
    ```
2.  **ID Handling**:
    - GOG IDs do **not** match Steam AppIDs.
    - **Method**: Must use **Text Search** (Game Name) -> Steam Search API.
    - **Optimization**: Use `data-product-id` to cache results so we don't re-search for the same tile.

## Potential Challenges
- **Redirects**: Accessing `/account` redirects to login. The script must run *after* the user logs in.
- **Lazy Loading**: GOG store pages use heavy lazy loading. `MutationObserver` is essential.
