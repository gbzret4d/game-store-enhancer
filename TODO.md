# TODO

## Bugs / Issues
- [ ] **[BUG] Humble Bundle Wishlist/Owned detection**: Users report "Owned: 0" after script rename. Likely due to missing UserData permissions/cookies. Verify fix instructions.

## Feature Requests
- [ ] **Steam Age Check Bypass**: Implement a function to automatically pass the Steam age check (e.g. by setting `birthtime` cookie) to fetch data for age-gated games.

## Design & UI Improvements
- [ ] **Settings Menu**: Add a configuration menu to the userscript to allow users to toggle features.
    - Toggle colored borders on/off.
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
