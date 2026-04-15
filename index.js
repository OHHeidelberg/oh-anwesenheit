const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;

// Dein korrigierter CSV-Link
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

const header = `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: -apple-system, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
      .card { background: white; padding: 30px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 320px; width: 90%; }
      .avatar { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 4px solid #007aff; margin-bottom: 15px; background: #eee; }
      h2 { margin: 10px 0; color: #1d1d1f; font-size: 1.5rem; }
      .status-badge { display: inline-block; padding: 10px 20px; border-radius: 25px; font-weight: bold; font-size: 1rem; margin-top: 10px; }
      .da { background: #e6f4ea; color: #1e7e34; }
      .homeoffice { background: #fff9e6; color: #947600; }
      .weg { background: #fce8e8; color: #c62828; }
      p { color: #888; font-size: 0.9rem; margin-top: 20px; }
    </style>
  </head>
`;

async function getSheetData() {
    try {
        const response = await axios.get(CSV_URL);
        // Wir parsen die CSV und trimmen Leerzeichen aus den Spaltennamen und Inhalten
        return parse(response.data, { 
            columns: true, 
            skip_empty_lines: true, 
            trim: true,
            relax_column_count: true 
        });
    } catch (e) {
        console.error("CSV-Fehler:", e.message);
        return null;
    }
}

app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    
    if (!user || !status) {
        return res.status(400).send("Fehler: Bitte 'user' und 'status' in der URL angeben.");
    }

    const team = await getSheetData();
    if (!team) return res.status(502).send("Fehler: Das Google Sheet konnte nicht geladen werden.");

    // Suche den Mitarbeiter (ignoriert Groß/Kleinschreibung)
    const person = team.find(m => m.Name && m.Name.toLowerCase() === user.toLowerCase());

    if (!person) {
        const namenListe = team.map(m => m.Name).filter(n => n).join(", ");
        return res.status(404).send(`User "${user}" nicht gefunden. Liste im Sheet: ${namenListe}`);
    }

    // Status-Logik
    let text = "Abgemeldet";
    let emoji = ":wave:";
    if (status === 'da') { text = "Im Büro"; emoji = ":office:"; }
    else if (status === 'homeoffice') { text = "Homeoffice"; emoji = ":house_with_garden:"; }

    try {
        // Slack Update
        await axios.post('https://slack.com/api/users.profile.set', {
            profile: { status_text: text, status_emoji: emoji, status_expiration: 0 }
        }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });

        // Schicke Bestätigungs-Seite
        res.send(`${header} 
            <div class="card">
                <img src="${person.FotoURL || 'https://via.placeholder.com/100'}" class="avatar" onerror="this.src='https://via.placeholder.com/100'">
                <h2>Hallo ${person.Name}</h2>
                <div class="status-badge ${status}">${text}</div>
                <p>Dein Slack-Status wurde aktualisiert.</p>
            </div>`);
    } catch (e) {
        console.error("Slack Fehler:", e.response ? e.response.data : e.message);
        res.status(500).send("Fehler: Slack konnte nicht aktualisiert werden. Ist der Token korrekt?");
    }
});

app.listen(port, () => console.log(`Server aktiv auf Port ${port}`));
