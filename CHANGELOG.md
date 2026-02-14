# Changelog
All notable changes to the **Game Store Enhancer** userscript will be documented in this file.

The `develop` branch has been updated to **v2.0.23**.

## [2.0.23] - 2026-02-07
### Fixed
- **IndieGala**: Fixed "Grayed Out" images by removing the background color from ignored items.
- **IndieGala**: Corrected bundle detection for grid layouts (e.g., "Power Shock Bundle") by adding `.bundle-page-tier-item-inner`.
- **IndieGala**: Fixed border spacing issues by switching to `box-shadow: inset`.
- **IndieGala**: Moved overlay text (Steam logo/Review %) to the bottom of the card for better visibility.
- **IndieGala**: Added support for Bundle Overview lists (`.container-item`).

## [2.0.22] - 2026-02-07
### Fixed
- **Core**: Updated `fetchSteamAppCache` to use a raw GitHub URL, resolving 404 errors.
- **IndieGala**: Removed strict opacity rules that caused images to appear grayed out.

## [2.0.21] - 2026-02-07
### Added
- **IndieGala**: Added support for Library Bundle items.
- **IndieGala**: Added support for Bundle Page Carousel.

## [2.0.20] - 2026-02-07
### Fixed
- **Core**: Emergency fix for critical CSS syntax error that broke the script.

## [1.52] - 2026-02-06
### Added
- **IndieGala**: Added automatic **Age Check Bypass**.
  - Automatically clicks the "Confirm" button on 18+ content warnings (e.g. Bundles/Freebies).

## [1.53] - 2026-02-06
### Fixed
- **IndieGala**: Fixed **Image Overlay** layout issue ("Overwritten Image").
  - Changed overlay element from `<a>` to `<div>` to verify compatibility with games that are already wrapped in a link.
  - *Fixes*: Broken layout/image disappearance on Bundle and Store pages where `<a>` nesting is illegal.

## [1.54] - 2026-02-06
### Fixed
- **IndieGala**: Fixed **Image Overlay** positioning on Bundle pages.
  - Forced `position: relative` on the game card image container (`figure`) to ensure the overlay stays inside.
  - Switched overlay positioning to strict `bottom: 0` / `left: 0`.
  - Increased `z-index` to 20 to appear above local overlays.

## [1.55] - 2026-02-06
### Fixed
- **IndieGala**: Fixed **"Right Click to Copy Link"** on Image Overlay.
  - Re-implemented overlay as a real `<a>` tag (instead of `div`).
  - **Strategy**: Inserted as a *sibling* to the game card link (absolute positioning inside valid relative container) to avoid illegal HTML nesting.
  - **Duplication Fix**: Added strict check to prevent infinite overlay creation loop on Store pages.

## [1.57] - 2026-02-06
### Fixed
- **IndieGala**: Fixed syntax error in Store Page selector logic.
- **IndieGala**: Updated selectors to support v1.56 Store Page layout (`.main-list-item`).

## [1.58] - 2026-02-07
### Fixed
- **IndieGala**: Improved **Image Overlay Positioning**.
- **Strategy**: Now appends the overlay directly *inside* the `<figure>` element with `z-index: 20`.
- **Benfit**:
  - Ensures the overlay appears **on top** of the game image (not at the bottom of the card).
  - Fixes visibility and positioning on both **Store** and **Bundle** pages.
  - Keeps "Right Click -> Copy Link" functionality working.

## [1.59] - 2026-02-07
### Added
- **IndieGala**: Added support for **Homepage / Top Sellers** list.
  - Detects the list items on the homepage.
  - Inserts a **Steam Badge** (Icon + Review Score) directly next to the platform logos (Steam/Windows/Apple).

## [1.60] - 2026-02-07
### Fixed
- **IndieGala**: Fixed "Black Bar" artifact in Owned game highlighting (caused by global CSS bleeding).
- **IndieGala**: Fixed Overlay vs Badge priority on Homepage items (Badge now correctly appears next to icons).

## [1.61] - 2026-02-07
### Changed
- **Core**: Implemented **Concurrent Request Queue** (3 parallel requests) to significantly speed up page processing on stores requiring search (e.g. IndieGala Store).
- **IndieGala**: Removed broken AppID extraction from Store URLs (which used internal IDs), forcing a cleaner Search fallback for accurate results.

## [1.62] - 2026-02-07
### Added
- **Core**: Added **"Circuit Breaker"** protection. If Steam blocks requests (403/Access Denied), the script **pauses execution** and shows a red warning toast to prevent extending the ban.
- **IndieGala**: Added styling fixes to ensure **spacing between game cards** on Bundle and Store pages, fixing the "touching borders" issue.









## [1.51] - 2026-02-06
### Added
- **IndieGala**: Implemented **Image Overlay** for store grid items (v1.51).
  - Replaced "Hover Reveal" with a permanent, cleaner overlay on the game image.
  - Automatically targets `<figure>` elements for consistent placement.
  - Shows Steam Link and Review Score (e.g. "STEAM | 95%") at the bottom of the image.
  - Support for Store Grid, Showcase, and Results pages.

## [1.50] - 2026-02-06
### Fixed
- **IndieGala**: Fixed selector logic to support new grid layout (`.main-list-results-item-margin`).


## [1.48] - 2026-02-06
### Fixed
- **IndieGala**: improved **Grid Layout** placement.
  - Moved Steam link/status to the bottom "ADD TO CART" row for store items.
  - *Fixes*: Links being hidden or pushed out of view for games with long titles (e.g. *Monster Hunter Stories 2*).
  - Added robust fallback selectors for product pages.

## [1.47] - 2026-02-05
### Fixed
- **Core / Debug**: Added granular success logs ("Search Success", "Created link") to better trace why some games might not display links despite finding data.

## [1.46] - 2026-02-05
### Fixed
- **Core**: Fixed a critical crash (`ReferenceError: link is not defined`) when processing game results. This prevented links from showing up even if data was found.

## [1.45] - 2026-02-05
### Fixed
- **Core / Search**: Added debug logging for name cleaning.
- **IndieGala**: Verified product page selectors for games like "Warhammer 40,000: Rogue Trader".

## [1.44] - 2026-02-05
### Fixed
- **IndieGala**: Added support for **Publisher Sale / Submenu Cards** (e.g. "Telltale Sale").
  - These pages use "overlay" links with no visible text. The script now correctly extracts the game name from the link's `title` attribute.

## [1.43] - 2026-02-05
### Fixed
- **Core / Search**: Fixed Steam Search ID extraction.
  - Adapted logic to handle newer Steam Search API responses (like for *Resident Evil Requiem*) where the `id` field is missing and the logo URL format has changed.
  - *Fixes*: "No Steam data found" or stuck loading for games that are definitely on Steam.

## [1.42] - 2026-02-05
### Fixed
- **IndieGala**: Added support for **Product Detail Pages** (e.g. Resident Evil Requiem).
- **Core / Search**: Improved Name Cleaning.
  - Now filters out "Pre-Purchase", "Pre-Order", and "Steam Key" from game titles before searching Steam.
  - *Fixes*: Matches for keys sold as "PRE-PURCHASE [Game Name] Steam Key".

## [1.41] - 2026-02-05
### Fixed
- **IndieGala**: Added support for **Homepage / Search Results** grid items (e.g. "Metro Awakening", "Fallout 4").
  - Added missing selector `.main-list-results-item-margin`.

## [1.40] - 2026-02-05
### Added
- **IndieGala**: Added full support for **IndieGala.com**.
  - Works on **Store**, **Bundles**, **Library**, **Giveaways**, **Trades**, **Showcase**, and **Freebies**.
  - **Native Integration**: Uses existing Steam links/data attributes where available (Library, Giveaways Details) for 100% accuracy.
  - **Fallback Search**: Automatically searches Steam by title for listings without direct IDs (Store grids, Trade lists).

## [1.36] - 2026-02-04
### Fixed
- **DailyIndieGame**:
  - **Layout Fix**: Safely hides the "STEAM page link" column without breaking the entire site layout (Targeted specifically at game rows).
  - **Badge Visibility**: Changed insertion method to append badges to the parent container, solving the issue where badges were hidden or cut off.
  - **CSS**: Refined gap visualization.

## [1.35] - 2026-02-04
### Fixed
- **DailyIndieGame**:
  - **Visual Spacing**: Added a "gap" between game rows by simulating a margin using a transparent border. This prevents the "colored wall" effect.
  - **Badge Visibility**: Improved insertion logic to ensure badges appear correctly next to game titles.

## [1.34] - 2026-02-04
### Fixed
- **DailyIndieGame**: 
  - **Layout Fix**: Removed broad `table` selector which caused a massive green border around the entire game list. Now targets individual rows (`tr`).
  - **Duplicates**: Added a safeguard to prevent multiple Steam badges from appearing on the same game.
  - **Styling**: Added spacing (`margin-right`) to badges.
  - **Cleanup**: Hides the site's native "View on Steam" text links.

## [1.33] - 2026-02-04
### Fixed
- **UI**: Changed from `outline` to `border` for Owned/Wishlist/Ignored indicators.
  - *Fixes*: Visibility issues on Humble Bundle where `outline` was often hidden or too subtle.
  - Uses `box-sizing: border-box` to prevent layout shifts.

## [1.32] - 2026-02-04
### Changed
- **Project Structure**: Renamed project to **Game Store Enhancer** to reflect support for multiple stores (Humble, Fanatical, DIG, GOG).
- **File Name**: Userscript renamed to `game_store_enhancer.user.js`.
- **Repo Links**: Updated all update/download URLs to point to the new `game-store-enhancer` repository.

## [1.31] - 2026-02-04
### Added
- **GOG**: Added support for **GOG.com**.
  - Works on **Store**, **Product Pages**, **Wishlist**, **Library**, and **Order History**.
  - **Deduplication**: Uses internal GOG Product IDs to prevent re-scanning the same game multiple times on a page.
  - **Language Agnostic**: Selectors work on both English (`/en/`) and German (`/de/`) versions.

## [1.30] - 2026-02-04
### Added
- **DailyIndieGame**: Added full support for **DailyIndieGame.com**.
  - Works on **Marketplace**, **Bundles**, and **Product Pages**.
  - **Native Integration**: Replaces the site's default "View on Steam" text/links with our enhanced stats badge.
  - **Performance**: Uses the site's URL structure to grab the Steam AppID directly, bypassing the Steam Search API entirely for instant results.

## [1.29] - 2026-02-03
### Added
- **Fanatical**: Added support for **User Pages**.
  - The script now works on **Product Library** (`/product-library`) and **Order History** (`/orders`).
  - Correctly detects game titles in these list views and adds Steam links/status.

## [1.28] - 2026-02-03
### Fixed
- **Fanatical**: Added item deduplication for the **Stats Panel**.
  - Duplicate visible items (e.g. valid games appearing in both "Just Launched" carousel and the main list) are now counted only once in the *Total / Owned / Wishlisted* stats.
  - Ensures correct "Total" count even on complex pages like Bundles, while still showing links on all instances.

## [1.26] - 2026-02-03
### Fixed
- **Stats**: Added "No Data" category to the stats panel.
  - Now correctly counts items where no Steam data was found or an error occurred (e.g. invalid ID), ensuring the "Total" count matches the number of items on the page.

## [1.25] - 2026-02-02
### Changed
- **Performance**: Reduced **Cache Duration** from 24 hours to **15 minutes**.
  - *Context*: Active deal hunters need fresher data. 24h was too stale.
  - *Impact*: Ownership/Wishlist status updates much faster.
  - *Note*: Static data (like review scores) is cached for ~1.75 hours (7x base TTL) to respect API limits.

## [1.24] - 2026-02-02
### Fixed
- **Fanatical**: Fixed false positives in Book/Software bundle exclusion.
  - The script now uses **strict equality** checking for breadcrumbs to avoid ignoring legitimate game bundles (e.g. "Hyper VR Bundle") whose parent category text ("PC Game Bundles, Book Bundles...") contained the blocklisted keywords.

## [1.23] - 2026-02-02
### Added
- **Fanatical**: Added **Book & Software Bundle Filter**.
  - The script now intelligently detects "Book Bundles" and "Software Bundles" (via breadcrumbs) and **stops execution** on those pages.
  - *Benefit*: Prevents false positives and meaningless Steam searches for eBooks or software that doesn't exist on Steam.

## [1.18] - 2026-02-02
### Fixed
- **Steam Reviews**: Improved data fetching to include **Key Activations** (`&purchase_type=all`).
  - Corrects missing review scores for games like *Winds of Arcana* that have many reviews from key activations (which were previously ignored by the default API call).
  - Bumped `CACHE_VERSION` to '2.1' to force a data refresh.

## [1.17] - 2026-02-02
### Fixed
- **Fanatical**: Resolved infinite loop when encountering "app/null" entries (e.g., in mini-bundles).
  - Explicitly marks invalid IDs as errors to prevent endless re-scanning.
- **Steam Reviews**: Fixed "null%" display for games with 0 reviews or invalid data.
  - Added safeguards against `NaN` calculations.
  - Hides the review badge entirely if total reviews are 0 (prevents misleading red "0%").
- **Core**: Bumped `CACHE_VERSION` to '2.0' to clear any corrupted "null" data from the cache.

## [1.16] - 2026-02-01
### Fixed
- **UI**: Resolved text clipping in Humble Bundle Grid.
  - Reverted global `outline-offset: -3px` (which caused text like "Keys are low" to be covered).
  - Applied `outline-offset: -3px` **only** to Carousel items where bleeding was an issue.
  - **Result**: Grid text is readable again, and Carousel borders don't overlap. Best of both worlds.

## [1.15] - 2026-02-01
### Fixed
- **UI**: Fixed color bleeding in Humble Bundle Carousel.
  - Added `outline-offset: -3px` to draw the border *inside* the game card. This prevents the blue border of one game from overlapping the red border of the next game when they are tightly packed.

## [1.14] - 2026-02-01
### Fixed
- **Core**: Forced Cache Reset.
  - Bumped internal `CACHE_VERSION` to '1.9' to invalidate all stale cached data. This ensures recent user changes (Wishlist/Ignore) are immediately reflected without waiting 24 hours.

## [1.13] - 2026-02-01
### Fixed
- **Humble Bundle**: Fixed carousel detection for games after the first slide (e.g., "Haste").
  - Updated selector to target `.slick-slide` elements individually so the script doesn't just stop at the first visible game.

## [1.12] - 2026-02-01
### Fixed
- **Core**: Fixed logic for "Ignored" games (handles falsy `0` value from Steam API).
- **Fanatical**: Fixed infinite stats counter loop on dynamic pages.

## [1.11] - 2026-01-31
### Fixed
- **Humble Bundle**: Updated carousel/modal selectors to use verified `.expanded-info-view` class. This ensures Steam links appear correctly when clicking on a game for details.

## [1.10] - 2026-01-31
### Added
- **Humble Bundle**: Initial support for Game Details Carousel/Modal (using generic selectors).

## [1.9] - 2026-01-31
### Changed
- **UI**: Switched from CSS `border` to `outline` for game card highlighting.
  - *Fixes*: Humble Bundle layout breaking from 3 columns to 2 columns due to added border width.
- **UI**: Enhanced visibility of "Owned", "Wishlist", and "Ignored" states with a stronger glow effect (box-shadow).

## [1.8] - 2026-01-31
### Added
- **Feature**: **Steam Reviews Integration**. Now displays review score percentages directly on the game card:
  - <span style="color:#66C0F4">**Blue**</span>: Positive (>70%)
  - <span style="color:#a8926a">**Brown**</span>: Mixed
  - <span style="color:#c15755">**Red**</span>: Negative (<40%)
### Fixed
- **Core**: Fixed "Ownership" detection on Humble Bundle.
  - Enforced strict number type parsing for IDs.
  - Implemented `CACHE_VERSION` to force a cache reset for all users, eliminating stale/broken data.

## [1.7] - 2026-01-31
### Added
- **Fanatical**: Implemented **API Interceptor**.
  - The script now intercepts Fanatical's internal API responses to extract the *exact* Steam App ID directly.
  - **Result**: 100% matching accuracy on Fanatical (supersedes name-based search).

## [1.6] - 2026-01-31
### Fixed
- **Core**: Added **Persistence Check**.
  - Detects if other userscripts (like "Bundle Helper") wipe the added Steam links.
  - Automatically re-applies links if they are removed.

## [1.5] - 2026-01-31
### Fixed
- **Core**: Resolved a syntax error in the userscript header.

## [1.4] - 2026-01-31
### Added
- **Core**: **Content Filter Bypass**. Added `&ignore_preferences=1` to Steam search API to find games even if they are hidden by user preferences (e.g. mature content).
- **Core**: **Asset Scanner**. Priority system that scans for existing Steam images/links on the page to identify games before falling back to text search.
