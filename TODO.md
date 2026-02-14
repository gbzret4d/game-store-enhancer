# TODO



## Feature Requests
- [ ] **IndieGala Support**: Add support for store and bundle pages.
- [ ] **Steam Age Check Bypass**: Implement a function to automatically pass the Steam age check (e.g. by setting `birthtime` cookie) to fetch data for age-gated games.

## Design & UI Improvements
- [ ] **Settings Menu**: Add a configuration menu to the userscript to allow users to toggle features.
    - Toggle colored borders on/off.
    - Toggle **Age Check Bypass** (IndieGala).
- [ ] **Visual Tweaks**:
    - Allow customization of status colors (e.g. Owned, Wishlist, Ignored).

## Research & Questions
- [ ] **[Investigation] Handling Name Mismatches**: How should we handle games with different names across stores (e.g. "Game GOTY" vs "Game")?
    - *Option A*: External JSON Database (GitHub) for manual mapping?
    - *Option B*: Local "Fix Link" feature for users?
    - *Option C*: Improved fuzzy matching logic?

## Future Ideas (Backlog)
- [ ] **Bundle History**: Show if a game has been bundled before (and how often). Useful for deciding whether to buy a tier.
- [ ] **Price History**: Show "Historical Low" price (via IsThereAnyDeal or similar).
- [ ] **Steam Deck Details**: Show specific ProtonDB attributes on hover (e.g. "Small Text", "External Launcher").
- [ ] **Local Override**: Allow users to manually "fix" a wrong Steam link via a context menu.

## 🔌 Integrations (External Data)
- [ ] **HowLongToBeat**: Show average playtime (Main Story / Completionist) on the cover.
- [ ] **Metacritic / OpenCritic**: Show external review scores next to Steam rating.
- [ ] **IsThereAnyDeal (ITAD)**: Show historical low price and warn if cheaper elsewhere.
- [ ] **Barter.vg**: Integration for traders (show trade frequency/junk status).
- [ ] **GeForce Now**: Icon for Cloud Streaming support.

## ⚠️ Warnings & Filters
- [ ] **DRM-Check**: Warn if game has Denuvo or Always-Online (via PCGamingWiki/Steam-Tags).
- [ ] **Genre-Highlighting**: User-defined highlight (Green) or dim (Red) based on genres (e.g. "Visual Novel", "Sports").
- [ ] **Hardware-Check**: Warn if VR required or high system requirements.
- [ ] **Asset-Flip Filter**: Warn for known "Fake Games" or bad developer reputation.

## 🛠️ User Experience & Tools
- [ ] **"Copy Key" Function**: Button next to unused keys on bundle pages to copy with one click.
- [ ] **Notes Function**: Private text field per game ("Watch later", "Save for friend").
- [ ] **Custom Tags**: User-defined tags ("Played on Console", "Junk").
- [ ] **Multi-User Check**: Check if a friend owns the game (by entering SteamID).

- [ ] **Sum Calculator**: Calculate real value of a bundle (Steam Price Sum vs Bundle Price).

## 🏗️ Architecture & Polishing
- [ ] **Refactoring**: Split the large `game_store_enhancer.user.js` into modular files (API, UI, Sites) and add a build step (Webpack/Rollup).
- [ ] **Settings Menu**: Implement a user-friendly configuration UI (toggle features, custom colors).

## 🚀 Distribution (The "Pro" Step)
- [ ] **Browser Extension**: Convert the Userscript into a full Chrome/Firefox Add-on.
    - *Expert Note*: Allows better permissions handling, popup UI for settings, and cleaner installation for non-tech users.

## 💾 Database Strategy
- [ ] **Mapping Database**: Host a `database.json` on GitHub Records (Raw URL).
    - *Why*: Free, high uptime, easy to update via Pull Requests. No own server needed.
    - *Content*: `{"Prey Digital Deluxe": 480490, ...}`

## 🐧 Linux / Steam Deck Advanced
- [ ] **Launcher Warning**: Warn about external launchers (EA App, Ubisoft Connect) on the Deck.
