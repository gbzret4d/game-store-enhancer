const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '../data');
const OUT_FILE = path.join(DATA_DIR, 'steam_apps.min.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const apiKey = process.env.STEAM_API_KEY;

if (!apiKey) {
    console.error('[Steam Cache] ERROR: STEAM_API_KEY is missing from environment variables.');
    console.error('[Steam Cache] Please add it to your GitHub Repository Secrets.');
    process.exit(1);
}

console.log('[Steam Cache] Using IStoreService (v1) with API Key.');

async function fetchApps() {
    const allApps = [];
    let lastAppId = 0;
    let hasMore = true;
    let page = 1;

    while (hasMore) {
        console.log(`[Steam Cache] Fetching page ${page} (Last AppID: ${lastAppId})...`);

        const apps = await new Promise((resolve, reject) => {
            const url = `https://api.steampowered.com/IStoreService/GetAppList/v1/?key=${apiKey}&include_games=true&include_dlc=true&include_software=true&last_appid=${lastAppId}&max_results=50000&format=json`;

            https.get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Status Code: ${res.statusCode}`));
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.response && json.response.apps) {
                            resolve(json.response.apps);
                        } else {
                            // If no apps returned, maybe we are done or structure changed?
                            // Empty list usually means done.
                            resolve([]);
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });

        if (apps.length > 0) {
            allApps.push(...apps);
            // Update lastAppId for next page
            lastAppId = apps[apps.length - 1].appid;
            page++;
        } else {
            hasMore = false;
        }

        // Safety break
        if (page > 50) { // Should be enough for ~2.5M apps with 50k page size
            console.warn('[Steam Cache] Reached page limit safety break.');
            hasMore = false;
        }
    }

    return allApps;
}

fetchApps().then(apps => {
    console.log(`[Steam Cache] Downloaded ${apps.length} apps. Processing...`);

    const appMap = {};
    let count = 0;

    apps.forEach(app => {
        if (!app.name || app.name.trim() === '') return;

        // Normalize name: lowercase, remove non-alphanumeric chars
        // This MUST match the logic in the Userscript (v1.62+)
        const normalized = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');

        if (normalized.length < 2) return; // Skip extremely short/empty names after normalization

        // Conflict resolution: prefer potentially newer IDs or just overwrite (Steam usually has one valid ID per game)
        // We map Name -> ID
        appMap[normalized] = app.appid;
        count++;
    });

    console.log(`[Steam Cache] Processed ${count} valid apps.`);

    fs.writeFileSync(OUT_FILE, JSON.stringify(appMap));
    console.log(`[Steam Cache] Successfully wrote to ${OUT_FILE}`);
    console.log(`[Steam Cache] File size: ${(fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);

}).catch(err => {
    console.error('[Steam Cache] Fatal Error:', err.message);
    process.exit(1);
});
