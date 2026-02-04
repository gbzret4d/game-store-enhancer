# DailyIndieGame Page Layout Analysis

This document serves as a reference for the DOM structure of DailyIndieGame.com.
It is used to plan the support for the `Game Store Enhancer` userscript.

> [!NOTE]
> Analysis was performed using Internet Archive snapshots due to Cloudflare protection on the live site.
> The site structure appears static and relies heavily on consistent URL patterns containing Steam AppIDs.

## Key Finding: URL Structure
The most important feature of DailyIndieGame is its URL structure for game pages:
- **Pattern**: `https://www.dailyindiegame.com/site_gamelisting_[APPID].html`
- **Example**: `site_gamelisting_223470.html` (Tropico 4)
- **Usage**: The Steam AppID can be extracted directly from the link `href` without needing to search the game title on Steam.

## Page Types

### 1. Marketplace / Store List
*The main list of available games (`site_content_marketplace.html`).*

- **Card/Row Container**: Table rows or list items (Layout is table-based in older archives).
- **Game Link Selector**: `a[href^='site_gamelisting_']`
    - This element contains the Game Title.
    - Its `href` contains the **Steam AppID**.
- **Price Selector**: Often the text node in the column immediately following the title, or a specific cell (e.g., `td:nth-child(x)`).
- **Steam Link**: Pages often already have `a[href*='store.steampowered.com/app/']`.

### 2. Individual Game Page
*The specific landing page for a game.*

- **URL**: `site_gamelisting_[APPID].html`
- **Title Selector**: `h1`, or `font[size='5']`, or similar prominent text in the main content area (often generic HTML structure).
- **Steam Link**: `a[href*='store.steampowered.com/app/']` is usually present near the "Buy" button.

### 3. Weekly Bundles
*Bundle pages offering multiple games.*

- **URL Pattern**: `site_weeklybundle_[ID].html`
- **Item Selector**: The page lists games, each linking to their internal product page.
- **Selector**: `a[href^='site_gamelisting_']`
    - We can iterate over all such links on a bundle page to inject Steam status checks next to them.

## Recommended Strategy

1. **Target Links**: Instead of card containers, the script should likely target `a[href*='site_gamelisting_']` globally or within specific content divs (`#content`, `.marketplace-table`, etc.).
2. **Extract ID**: Regex capture `site_gamelisting_(\d+)\.html`.
3. **Inject Status**:
    - Since we have the AppID immediately, we don't need to "search" Steam. We can directly query the user's owned games list for this AppID.
    - Insert the icon/status next to the link.

## Cloudflare Warning
The site is protected by Cloudflare.
- **Impact on Script**: The userscript running in the user's browser *should* work fine as the user has already passed the challenge to view the page.
- **Impact on Development**: Automated scraping/testing is difficult. Manual verification is required.

## Proposed Integration Strategy (User Feedback)

To avoid clutter and redundancy:
1.  **Identify** the existing "View on Steam" link (which often contains the AppID).
2.  **Hide** this native link (e.g., `style.display = 'none'`).
3.  **Inject** the script's enhanced badge/button in its place.
    - This provides a seamless "upgrade" to the native button.
    - Since the AppID is known from the URL/link, we can skip the search API call and directly fetch the status/price.

