const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '../data');
const OUT_FILE = path.join(DATA_DIR, 'steam_apps.min.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

console.log('[Steam Cache] Fetching App List from Steam...');

const apiKey = process.env.STEAM_API_KEY;
const apiPath = apiKey
    ? `/ISteamApps/GetAppList/v0002/?key=${apiKey}&format=json`
    : '/ISteamApps/GetAppList/v0002/?format=json';

if (apiKey) console.log('[Steam Cache] Using provided Steam API Key.');

const options = {
    hostname: 'api.steampowered.com',
    path: apiPath,
    method: 'GET',
    headers: {
        'User-Agent': 'Node.js/SteamCacheUpdater'
    }
};

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.error(`[Steam Cache] Failed to fetch data. Status Code: ${res.statusCode}`);
            process.exit(1);
        }

        try {
            const json = JSON.parse(data);
            if (!json.applist || !json.applist.apps) {
                console.error('[Steam Cache] Invalid data format received from Steam.');
                process.exit(1);
            }

            const apps = json.applist.apps;
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

        } catch (e) {
            console.error('[Steam Cache] Error parsing JSON:', e);
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error(`[Steam Cache] Request error: ${e.message}`);
    process.exit(1);
});

req.end();
