const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;

// Dein CSV-Link
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

const sharedStyles = `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="60">
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
      .container { width: 100%; max-width: 900px; }
      h1 { color: #1d1d1f; text-align: center; margin-bottom: 30px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; width: 100%; }
      .card { background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); text-align: center; }
      .avatar { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; background: #eee; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
      .name { font-weight: bold; display: block; margin-bottom: 8px; font-size: 1.1rem; }
      .status-badge { display: inline-block; padding: 6px 12px; border-radius: 15px; font-size: 0.8rem; font-weight: bold; }
      /* Dynamische Farben basierend auf Slack-Text */
      .bg-buro { background: #e6f4ea; color: #1e7e34; }
      .bg-home { background: #fff9e6; color: #947600; }
      .bg-weg { background: #f5f5f7; color: #86868b; }
      .emoji { margin-right: 5px; }
    </style>
  </head>
`;

async function getSheetData() {
    try {
        const response = await axios.get(CSV_URL);
        return parse(response.data, { columns: true, skip_empty_lines: true, trim: true });
    } catch (e) {
        return null;
    }
}

// Hilfsfunktion: Holt den aktuellen Status eines Users direkt von Slack
async function getSlackStatus(slackId) {
    try {
        const res = await axios.get(`https://slack.com/api/users.profile.get?user=${slackId}`, {
            headers: { Authorization: `Bearer ${SLACK_TOKEN}` }
        });
        if (res.data.ok) {
            return {
                text: res.data.profile.status_text || "Abwesend",
                emoji: res.data.profile.status_emoji || ""
            };
        }
    } catch (e) {
        console.error("Slack Status Fetch Error", e.message);
    }
    return { text: "Unbekannt", emoji: "" };
}

app.get('/dashboard', async (req, res) => {
    const team = await getSheetData();
    if (!team) return res.status(502).send("Sheet Fehler");

    let cardsHtml = "";
    
    // Wir gehen alle Mitarbeiter durch und holen deren Live-Status
    for (const m of team) {
        if (!m.SlackID) continue;
        
        const slackStatus = await getSlackStatus(m.SlackID);
        
        // CSS Klasse bestimmen
        let colorClass = "bg-weg";
        if (slackStatus.text.includes("Büro")) colorClass = "bg-buro";
        if (slackStatus.text.includes("Homeoffice")) colorClass = "bg-home";

        cardsHtml += `
            <div class="card">
                <img src="${m.FotoURL || 'https://via.placeholder.com/80'}" class="avatar">
                <span class="name">${m.Name}</span>
                <div class="status-badge ${colorClass}">
                    <span>${slackStatus.text}</span>
                </div>
            </div>`;
    }

    res.send(`${sharedStyles} 
        <div class="container">
            <h1>Live Status-Board</h1>
            <div class="grid">${cardsHtml}</div>
        </div>`);
});

app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    const team = await getSheetData();
    const person = team ? team.find(m => m.Name.toLowerCase() === user.toLowerCase()) : null;

    if (!person) return res.status(404).send("User nicht gefunden.");

    let text = status === 'da' ? "Im Büro" : (status === 'homeoffice' ? "Homeoffice" : "");
    let emoji = status === 'da' ? ":office:" : (status === 'homeoffice' ? ":house_with_garden:" : "");

    try {
        await axios.post('https://slack.com/api/users.profile.set', {
            profile: { status_text: text, status_emoji: emoji }
        }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });

        res.send(`<h1>Check-in Erfolg</h1><p>${person.Name} ist jetzt ${text || 'Abgemeldet'}.</p><a href="/dashboard">Zum Dashboard</a>`);
    } catch (e) {
        res.status(500).send("Slack Fehler");
    }
});

app.listen(port, () => console.log(`Server läuft auf Port ${port}`));
