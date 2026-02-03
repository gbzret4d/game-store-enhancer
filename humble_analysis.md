# Humble Bundle Page Layout Analysis

This document serves as a reference for the DOM structure of different page types on Humble Bundle.
It is used to maintain the selectors in the `Steam Store Linker` userscript.

## Page Types

### 1. Standard Bundle (Tiered)
*The classic bundle page with multiple tiers (e.g., $1, BTA, $15).*

- **Card/Item Container**: 
  - `.tier-item-view`: The main container for a tier's game list.
  - `.product-item`: Individual game row/card within a tier.
- **Title Selector**: `.item-title` or `.product-title`
- **Image Selector**: `img` inside the item container (often has specific alignment classes).
- **Notes**: Games are often grouped in `div.tier-item-view`. The userscript processes these individual items.

### 2. Store / Search Results
*Grid view of games in the Humble Store.*

- **Card Container**: `.entity-block-container`
- **Title Selector**: `.entity-title`
- **Link Selector**: `a.entity-link` (Wraps the whole card, used for href checks).
- **Image Selector**: `img.entity-image`
- **Notes**: 
  - Layout is consistent across `sort=bestselling`, `filter=onsale`, and other search variations.
  - The userscript correctly detects these cards and injects `ssl-link` elements.

### 3. Single Product Page
*Detail page for a specific game.*

- **Container**: `body` (or specific header sections like `.product-hero`, `.details-heading`).
- **Title Selector**: `h1` (Universally used for the game title).
- **Image Selector**: `.product-hero img` or `.main-image-view img` (often part of a slick carousel).
- **Notes**: The script targets the specific header container to inject the link next to the H1.

### 4. Humble Choice
*Monthly subscription game selection.*

- **Card Container**: `.content-choice`, `.content-choice-grid .game-container`
- **Title Selector**: `.content-choice-title`, `.game-name`
- **Image Selector**: `img` inside the container.
- **Notes**: The structure can be a grid or a list depending on the user's view (Current Month vs. Library view).

### 5. Carousel / Modal (Details)
*Pop-up or slide-over when clicking a game in a bundle.*

- **Container**: `.expanded-info-view .slick-slide`
- **Title Selector**: `h2.heading-medium`
- **Notes**: These contents are dynamic. The userscript relies on `MutationObserver` to catch these when they appear.

### 6. User Library / Keys
*The "Keys & Entitlements" or "Library" page.*

#### Keys (`/home/keys`)
- **Container**: `.unredeemed-keys-table tbody tr`
- **Row Classes**: `.key-manager-choice-row`, `.key-manager-row`
- **Title Selector**: `.game-name h4` (or just `.game-name`)
- **Functionality**:
  - Contains a "Hide redeemed keys" checkbox (`#hide-redeemed`).
  - Toggling this checkbox removes fully redeemed rows from the view (handled by React/JS).
  - *Potential*: Insert Steam status next to the "Redeem" button?

#### Library (`/home/library`)
- **Layout**: Split-pane view (List on left, Details on right).
- **List Item Container**: `.subproducts-holder .text-holder` (left pane)
- **Title Selector**: `h2` inside the list item.
- **Detail Pane**: Right column changes based on selection.
- **Notes**: The DOM is quite dynamic here. Target the `h2` in the list for a quick overview status.
