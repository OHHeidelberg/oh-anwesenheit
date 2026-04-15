const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;

// HIER DEINEN KOPIERTEN CSV-LINK EINSETZEN:
const CSV_URL = 'DEIN_VERÖFFENTLICHTER_CSV_LINK_HIER';

const header = `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: sans-serif; background: #f4f7f9; padding: 20px; text-align: center; }
      .card { background: white; border-radius: 15px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); display: inline-block; }
      .avatar { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #007aff; }
    </style>
  </head>
`;

async function getMitarbeiter() {
    try {
        const response = await axios.get(CSV_URL);
        // Wir parsen die CSV-Daten in ein Array von Objekten
        return parse(response.data, { columns: true, skip_empty_lines: true, trim: true });
    } catch (e) {
        console.error("Sheet konnte nicht geladen werden. Ist der Link korrekt veröffentlicht?");
        return null;
    }
}

app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    
    if (!user || !status) return res.status(400).send("Fehler: Name oder Status fehlt im Link.");

    const mitarbeiterList = await getMitarbeiter();
    
    if (!mitarbeiterList) return res.status(500).send("Server-Fehler: Verbindung zum Google Sheet fehlgeschlagen (502).");

    // Suche den User (ignoriert Groß/Kleinschreibung und Leerzeichen)
    const person = mitarbeiterList.find(m => m.Name.trim().toLowerCase() === user.trim().toLowerCase());

    if (!person) {
        return res.status(404).send(`User "${user}" nicht im Sheet gefunden. Vorhanden sind: ${mitarbeiterList.map(m => m.Name).join(", ")}`);
    }

    let sText = status === 'da' ? "Im Büro" : (status === 'homeoffice' ? "Homeoffice" : "Abgemeldet");
    let sEmoji = status === 'da' ? ":office:" : (status === 'homeoffice' ? ":house_with_garden:" : ":wave:");

    try {
        await axios.post('https://slack.com/api/users.profile.set', {
            profile: { 
                status_text: sText, 
                status_emoji: sEmoji, 
                status_expiration: 0 
            }
        }, { headers: { 'Authorization': `Bearer ${SLACK_TOKEN}` } });

        res.send(`${header} <div class="card">
            <img src="${person.FotoURL || 'https://via.placeholder.com/80'}" class="avatar"><br>
            <h2>Hallo ${person.Name}!</h2>
            <p>Dein Status wurde auf <b>${sText}</b> gesetzt.</p>
        </div>`);
    } catch (e) {
        res.status(500).send("Slack API Fehler. Prüfe deinen Token.");
    }
});

app.listen(port, () => console.log(`Server läuft auf Port ${port}`));
