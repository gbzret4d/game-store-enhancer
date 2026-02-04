# Fanatical Page Layout Analysis

This document serves as a reference for the DOM structure of different page types on Fanatical.
It is used to maintain the selectors in the `Game Store Enhancer` userscript.

## Page Types

### 1. Pick & Mix (Build Your Own)
*Interactive selection grids where users choose specific games.*

- **Card Container**: `.PickAndMixCard`
- **Image Selector**: `.responsive-image img` (often `fanatical.imgix.net`)
- **Title Selector**: `a[title]` inside the card (or inferred from context)
- **Notes**: No visible "Add to Cart" for individual items; uses "Add to bundle" buttons.

### 2. Standard Bundle (Tiered)
*Fixed sets of games or tiered options.*

- **Card Container**: `div.cover-container`
- **Selector**: `a.faux-block-link__overlay-link` (for interaction/overlay)
- **Image**: `img.img-fluid.img-full.img-force-full.cover-foreground`
- **Notes**: Often uses an overlay link that covers the image.

### 3. Store / Search Results
*General shop grid listing individual games.*

- **Card Container**: `div.HitCard__main`
- **Selector**: `a.HitCard__main__cover` (this is the image container)
- **Image**: `img.img-fluid.img-full.img-force-full`
- **Notes**: The store grid uses "HitCards" (`.HitCard`) which are structurally different from bundle cards.

### 4. User Pages (Library & Orders)
*Private user dashboard areas.*

#### A. Orders List (`/en/orders`)
- **Container**: `div.OrderItemsCard`
- **Title**: `p.order-item-name`
- **Notes**: A single order row can contain multiple games (titles are p-tags).

#### B. Order Details & Library (`/en/orders/*` & `/en/product-library`)
- **Container**: `article.new-order-item`
- **Title**: `h4.game-name`
- **Notes**: Both pages use identical structure for game cards. "Bundle" sections in Order Details use `section.bundle-section` and `h3.bundle-name`.
