const express = require('express');
const axios = require('axios');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const INFO_FILE = './info.json';

const fs = require('fs');
const INFO_FILE = './info.json';

// Initialer Wert
let cachedInfoText = "OH Heidelberg"; 

// Erst dann Datei laden
try {
    if (fs.existsSync(INFO_FILE)) {
        cachedInfoText = JSON.parse(fs.readFileSync(INFO_FILE, 'utf8')).text;
    }
} catch (e) { console.log("Keine Info-Datei gefunden"); }

const htmlHead = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anwesenheit</title>
    <style>
        :root {
            --bg-color: #f4f6f9;
            --card-bg: #ffffff;
            --text-main: #333333;
            --text-sub: #666666;
            --border-color: #dddddd;
            --accent-green: #2ecc71;
            --accent-red: #e74c3c;
            --accent-orange: #e67e22;
            --shadow: 0 4px 6px rgba(0,0,0,0.05);
        }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: var(--bg-color); color: var(--text-main); margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
        .info-banner { background-color: #34495e; color: #ffffff; padding: 15px; border-radius: 8px; width: 100%; max-width: 1000px; text-align: center; font-size: 1.25rem; font-weight: bold; margin-bottom: 20px; box-shadow: var(--shadow); box-sizing: border-box; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; width: 100%; max-width: 1000px; }
        .card { background: var(--card-bg); border-radius: 8px; padding: 15px; box-shadow: var(--shadow); border-left: 5px solid #ccc; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
        .card.anwesend { border-left-color: var(--accent-green); }
        .card.abwesend { border-left-color: var(--accent-red); }
        .card.homeoffice { border-left-color: var(--accent-orange); }
        .name { font-size: 1.15rem; font-weight: 600; margin-bottom: 5px; }
        .status { font-size: 0.9rem; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; }
        .anwesend .status { color: var(--accent-green); }
        .abwesend .status { color: var(--accent-red); }
        .homeoffice .status { color: var(--accent-orange); }
        .info { font-size: 0.85rem; color: var(--text-sub); line-height: 1.4; }
        
        .tooltip { position: absolute; top: 10px; right: 10px; cursor: pointer; background: #eee; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; color: #666; }
        .tooltip:hover::after { content: attr(data-tooltip); position: absolute; bottom: 25px; right: 0; background: #333; color: #fff; padding: 5px 10px; border-radius: 4px; font-size: 0.75rem; white-space: pre; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-weight: normal; }

        .admin-btn { margin-top: 30px; padding: 10px 20px; background-color: #34495e; color: white; text-decoration: none; border-radius: 50px; font-size: 0.9rem; transition: background 0.2s; }
        .admin-btn:hover { background-color: #2c3e50; }
        
        .login-container, .admin-container { background: var(--card-bg); padding: 30px; border-radius: 8px; box-shadow: var(--shadow); width: 100%; max-width: 400px; text-align: center; box-sizing: border-box; }
        input[type="password"], input[type="text"] { width: 100%; padding: 10px; margin: 15px 0; border: 1px solid var(--border-color); border-radius: 4px; box-sizing: border-box; font-size: 1rem; }
        button { width: 100%; padding: 10px; background-color: var(--accent-green); color: white; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; font-weight: bold; }
        button:hover { opacity: 0.9; }
        .back-link { display: inline-block; margin-top: 15px; color: var(--text-sub); text-decoration: none; font-size: 0.9rem; }
    </style>
`;

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'super-safe-secret-key-change-this',
    resave: false,
    saveUninitialized: true
}));

const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT17X3pU2fG9T4V8O_5XF9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7T1RFb0E/pub?gid=0&single=true&output=csv';
const INFO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT17X3pU2fG9T4V8O_5XF9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7XU_9v8Z3aB7c_5v2o5V4x9o6Y7mO0v7T1RFb0E/pub?gid=733737330&single=true&output=csv';

const ADMIN_PASSWORD = 'info';

let cachedData = [];

function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let cols = [];
        let insideQuote = false;
        let currentField = '';
        
        for (let j = 0; j < line.length; j++) {
            let char = line[j];
            if (char === '"') {
                insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
                cols.push(currentField.trim().replace(/^"|"$/g, ''));
                currentField = '';
            } else {
                currentField += char;
            }
        }
        cols.push(currentField.trim().replace(/^"|"$/g, ''));
        
        if (cols.length >= 5) {
            result.push({
                name: cols[0],
                status: cols[1].toLowerCase(),
                wt: cols[2],
                info: cols[3],
                am_ort: cols[4]
            });
        }
    }
    return result;
}

async function updateData() {
    try {
        const response = await axios.get(SPREADSHEET_URL);
        cachedData = parseCSV(response.data);
        
        // Nur wenn cachedInfoText noch dem Standard entspricht oder leer ist, aus Sheet laden
        if (!cachedInfoText || cachedInfoText === "OH Heidelberg") {
           if (!cachedInfoText) {
                const info = await axios.get(INFO_URL).catch(() => null);
            if (info) cachedInfoText = info.data.split('\n')[0];
}
            }
        }
        console.log('Daten erfolgreich aktualisiert');
    } catch (error) {
        console.error('Fehler beim Abrufen der Daten:', error.message);
    }
}

// Intervall auf 2 Minuten setzen (120000 ms)
setInterval(updateData, 120000);
updateData();

function checkAuth(req, res, next) {
    if (req.session.isAdmin) {
        next();
    } else {
        res.redirect('/login');
    }
}

app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>${htmlHead}</head>
        <body>
            <div class="login-container">
                <h2>Admin Login</h2>
                <form action="/login" method="POST">
                    <input type="password" name="password" placeholder="Passwort" required autofocus>
                    <button type="submit">Einloggen</button>
                </form>
                <a href="/empfang" class="back-link">Zurück zur Übersicht</a>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else {
        res.send('<script>alert("Falsches Passwort"); window.location="/login";</script>');
    }
});

app.get('/admin', checkAuth, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>${htmlHead}</head>
        <body>
            <div class="admin-container">
                <h2>Infotext ändern</h2>
                <form action="/admin/update-info" method="POST">
                    <input type="text" name="infoText" value="${cachedInfoText}" placeholder="Neuer Infotext" required autofocus>
                    <button type="submit">Speichern</button>
                </form>
                <br>
                <a href="/logout" class="back-link" style="color:var(--accent-red);">Ausloggen</a> | 
                <a href="/empfang" class="back-link">Zurück zur Übersicht</a>
            </div>
        </body>
        </html>
    `);
});

app.post('/admin/update-info', checkAuth, (req, res) => {
    const newText = req.body.infoText.trim();
    if (newText) {
        cachedInfoText = newText;
        try {
            fs.writeFileSync(INFO_FILE, JSON.stringify({ text: cachedInfoText }), 'utf8');
        } catch (e) {
            console.error("Fehler beim Speichern der info.json", e);
        }
        res.send('<script>alert("Infotext aktualisiert!"); window.location="/admin";</script>');
    } else {
        res.redirect('/admin');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/empfang');
});

app.get('/empfang', (req, res) => {
    const cardsHtml = cachedData.map(p => {
        let statusClass = 'abwesend';
        let statusText = 'Abwesend';
        
        if (p.status.includes('anwesend') || p.status.includes('da')) {
            statusClass = 'anwesend';
            statusText = 'Anwesend';
        } else if (p.status.includes('homeoffice') || p.status.includes('ho')) {
            statusClass = 'homeoffice';
            statusText = 'Homeoffice';
        }
        
        const wtList = p.wt ? p.wt.split(';').join('<br>') : 'Keine Angaben';
        const tooltipAttr = `data-tooltip="Kernpräsenzzeiten:\n${wtList.replace(/<br>/g, '\n')}"`;
        
        return `
            <div class="card ${statusClass}">
                <div class="tooltip" ${tooltipAttr}>?</div>
                <div>
                    <div class="name">${p.name}</div>
                    <div class="status">${statusText}</div>
                </div>
                <div class="info">
                    ${p.am_ort ? `<strong>Ort:</strong> ${p.am_ort}<br>` : ''}
                    ${p.info ? `<strong>Info:</strong> ${p.info}` : ''}
                </div>
            </div>
        `;
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
            ${htmlHead}
            <meta http-equiv="refresh" content="60">
        </head>
        <body>
            <div class="info-banner">${cachedInfoText}</div>
            <div class="grid">${cardsHtml}</div>
            <a href="/login" class="admin-btn">Admin-Bereich</a>
        </body>
        </html>
    `);
});

app.get('*', (req, res) => {
    res.redirect('/empfang');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
