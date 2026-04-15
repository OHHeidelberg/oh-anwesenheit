const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'DEIN_VERÖFFENTLICHTER_CSV_LINK';

// Design-Einstellungen
const header = `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="30">
    <style>
      body { font-family: sans-serif; background: #f4f7f9; display: flex; justify-content: center; padding: 20px; }
      .container { width: 100%; max-width: 600px; }
      .card { background: white; border-radius: 15px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 15px; display: flex; align-items: center; }
      .avatar { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-right: 20px; border: 2px solid #eee; }
      .info { flex-grow: 1; }
      .name { font-weight: bold; font-size: 1.2rem; color: #333; }
      .badge { padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; text-transform: uppercase; float: right; }
      .status-da { background: #d4edda; color: #155724; }
      .status-homeoffice { background: #fff3cd; color: #856404; }
      .status-weg { background: #f8d7da; color: #721c24; }
      h1 { text-align: center; color: #2c3e50; }
    </style>
  </head>
`;

// Funktion zum Laden der Mitarbeiter-Daten aus dem Sheet
async function getMitarbeiter() {
    try {
        const response = await axios.get(CSV_URL);
        const records = parse(response.data, { columns: true, skip_empty_lines: true });
        return records;
    } catch (e) {
        console.error("Fehler beim Laden des Sheets", e);
        return [];
    }
}

app.get('/status-details', async (req, res) => {
    const mitarbeiter = await getMitarbeiter();
    let html = `${header} <div class="container"><h1>Team Status</h1>`;
    
    mitarbeiter.forEach(m => {
        const s = m.Status ? m.Status.toLowerCase() : 'weg';
        html += `
            <div class="card">
                <img src="${m.FotoURL || 'https://via.placeholder.com/60'}" class="avatar">
                <div class="info">
                    <span class="name">${m.Name}</span>
                    <span class="badge status-${s}">${m.Status || 'Abwesend'}</span>
                </div>
            </div>`;
    });
    
    res.send(html + "</div>");
});

app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    const mitarbeiter = await getMitarbeiter();
    const person = mitarbeiter.find(m => m.Name.toLowerCase() === user.toLowerCase());

    if (!person) return res.status(404).send("User nicht im Sheet gefunden.");

    let sText = status === 'da' ? "Im Büro" : (status === 'homeoffice' ? "Homeoffice" : "");
    let sEmoji = status === 'da' ? ":office:" : (status === 'homeoffice' ? ":house_with_garden:" : "");

    try {
        await axios.post('https://slack.com/api/users.profile.set', {
            profile: { status_text: sText, status_emoji: sEmoji, status_expiration: 0 }
        }, { headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` } });

        res.send(`<h1>Erfolg!</h1><p>${person.Name} ist jetzt ${sText || 'Abgemeldet'}.</p>`);
    } catch (e) {
        res.status(500).send("Slack Fehler");
    }
});

app.listen(port, () => console.log(`Läuft auf ${port}`));
