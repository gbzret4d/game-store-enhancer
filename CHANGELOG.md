# Changelog

All notable changes to the **Steam Store Linker** userscript will be documented in this file.

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
