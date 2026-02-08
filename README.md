# Game Store Enhancer (formerly Steam Store Linker)

> [!CAUTION]
> **DEVELOP / BETA VERSIONS**
> The `develop` branch contains experimental code (e.g. `1.37-DEV`).
> **DO NOT USE** unless you are helping with testing. These versions **will break things**, contain debug logs, and might be unstable.
> Stick to the `main` branch for the stable experience.

A Tampermonkey Userscript that enhances **Humble Bundle**, **Fanatical**, **DailyIndieGame**, and **GOG.com** with Steam data.





> **Update (v3.0.4)**: IndieGala support is now handled by the **[Standalone Script](https://github.com/gbzret4d/game-store-enhancer/raw/develop/IndieGala_Steam_Linker.user.js)**. Install this alongside the main script to fix all issues (visual tweaks + sub ID support).





It displays your **Ownership Status**, **Wishlist**, **Steam User Reviews**, **Deck Compatibility**, and links directly to the Steam store.

## Features

- **Multi-Site Support**: Works on Humble Bundle, Fanatical, DailyIndieGame, and GOG.com.
- **Steam Integration**: Adds a direct link to the Steam store page for games found in bundles.
- **Visual Status Icons**:
    - **Owned**: Games you own are marked with a green checkmark check and grayed out.
    - **Wishlist**: Games on your wishlist are marked with a blue heart and highlighted.
    - **Ignored**: Games you have ignored on Steam are marked with a red cross.
- **Advanced Info**:
    - **Steam Deck / ProtonDB**: Shows a colored circle indicating Linux/Deck compatibility (Platinum, Gold, Silver, Bronze, Borked) via ProtonDB.
    - **Trading Cards**: Displays a blue card icon if the game drops Steam Trading Cards.
    - **Content Type**: Distinguishes between base games, **DLCs** (yellow icon), and **Soundtracks** (note icon).
    - **Steam User Rating**: Displays the percentage of positive user reviews from Steam (Blue >70%, Mixed, Red <40%).
    - **Fanatical API Interceptor**: Captures internal API data on Fanatical for 100% accuracy (no name guessing).
    - **Humble Bundle Carousel**: Supports the game detail modals/popups.
    - **Smart Exclusion**: Detects non-game pages (like "Book Bundles" or "Software Bundles" on Fanatical) and automatically disables itself to avoid errors.
- **Stats Panel**: A floating panel shows a summary of the current page (Total, Owned, Missing, etc.).
- **Smart Tooltips**: Hover over the Steam icon to see the game's **Cover Art** and full title.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) extension for your browser.
2. [Click this link to install the script](https://raw.githubusercontent.com/gbzret4d/game-store-enhancer/main/game_store_enhancer.user.js).
3. Confirm the installation in Tampermonkey.

## Updates
The script will automatically check for updates via Tampermonkey.
You can also manually update by clicking the installation link again or checking for updates in the Tampermonkey dashboard.

## Usage

1.  **Login**: Make sure you are logged into [Steam](https://store.steampowered.com/) in the same browser context.
2.  **Visit**: Go to any supported store page:
    - [Humble Bundle](https://www.humblebundle.com/)
    - [Fanatical](https://www.fanatical.com/)
    - [DailyIndieGame](https://dailyindiegame.com/)
    - [GOG](https://www.gog.com/)
3.  **Permissions**: The script will ask for permission to access:
    - `store.steampowered.com` (for ownership/search)
    - `www.protondb.com` (for Steam Deck status)
    - **Allow these** to enable full functionality.
4.  **Enjoy**: The stats panel will appear, and game cards will be enriched with Steam data.

## How it works

- **Site Adapters**: Uses modular adapters to find game titles on different websites.
- **Data Sources**:
    - **Steam UserData**: Fetches your owned/wishlisted games from Steam's dynamic store API.
    - **Steam Search**: Finds the correct Steam App ID by game name.
    - **Steam AppDetails**: Fetches secondary info like Trading Cards and DLC type.
    - **ProtonDB API**: Fetches the current Linux/Deck compatibility tier.

## Credits

- **[Revadike/SteamWebIntegration](https://github.com/Revadike/SteamWebIntegration)**: Inspiration for the "Asset Scanner" logic (detecting games via existing Steam images/links).
- **Steam**: For providing the platform and data.
- **SteamDB / ProtonDB**: For their excellent public APIs.
- **Caching**: Results are cached in Tampermonkey storage to respect API rate limits and speed up subsequent page loads.
- **Fanatical**: For their exposed internal API key structure that allows 100% accurate matching.

## Author

**[gbzret4d](https://github.com/gbzret4d)**

## Disclaimer

This script is not affiliated with Humble Bundle, Fanatical, DailyIndieGame, GOG, Valve, or ProtonDB. Use at your own risk.

## To-Do

- [ ] Add settings panel to toggle features (e.g. Hide Owned Games).
- [ ] **IndieGala Support**: Add support for store and bundle pages.
- [ ] **Metacritic / OpenCritic**: Display review scores alongside Steam ratings.
- [ ] Support more bundle sites (e.g. SteamGifts).
- [ ] Implement "External Database Mapping" (JSON on GitHub) to manually potential fix missing/wrong links for complex bundles.
- [ ] Add option to filter Steam reviews by purchase type (Steam Purchasers vs. Key Activations).
- [ ] Improve performance on very large pages.

## License

MIT License

Copyright (c) 2026 gbzret4d

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
