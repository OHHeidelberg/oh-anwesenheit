const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

const sharedStyles = `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
      .container { width: 100%; max-width: 900px; text-align: center; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; margin-top: 20px; }
      .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #eee; }
      .avatar { width: 90px; height: 90px; border-radius: 50%; object-fit: cover; background: #f8f8f8; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 15px; }
      .name { font-weight: bold; font-size: 1.2rem; color: #1d1d1f; display: block; margin-bottom: 10px; }
      .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }
      .bg-buro { background: #e6f4ea; color: #1e7e34; }
      .bg-home { background: #fff9e6; color: #947600; }
      .bg-weg { background: #f5f5f7; color: #86868b; }
    </style>
  </head>
`;

async function getSheetData() {
    try {
        const response = await axios.get(CSV_URL);
        return parse(response.data, { 
            columns: header => header.map(h => h.trim().toLowerCase()), // Macht alle Spaltennamen klein und sauber
            skip_empty_lines: true 
        });
    } catch (e) { return null; }
}

async function getSlackStatus(slackId) {
    if (!slackId || slackId.length < 5) return { text: "Keine ID im Sheet", color: "bg-weg" };
    try {
        const res = await axios.get(`https://slack.com/api/users.profile.get?user=${slackId.trim()}`, {
            headers: { Authorization: `Bearer ${SLACK_TOKEN}` }
        });
        if (res.data.ok) {
            const text = res.data.profile.status_text || "Verfügbar";
            let color = "bg-weg";
            if (text.toLowerCase().includes("büro")) color = "bg-buro";
            if (text.toLowerCase().includes("homeoffice")) color = "bg-home";
            return { text, color };
        }
    } catch (e) { }
    return { text: "Status unbekannt", color: "bg-weg" };
}

app.get('/dashboard', async (req, res) => {
    const team = await getSheetData();
    if (!team) return res.send("Fehler beim Laden des Sheets.");

    let cardsHtml = "";
    for (const m of team) {
        // Sucht die Spalte, egal ob sie "Name", "name" oder "NAME" heißt
        const name = m.name || m.mitarbeiter || "Unbekannt";
        const sID = m.slackid || m.id || m['slack-id'];
        const foto = m.fotourl || m.foto || m.bild;

        const status = await getSlackStatus(sID);

        cardsHtml += `
            <div class="card">
                <img src="${foto || 'https://via.placeholder.com/90'}" class="avatar" onerror="this.src='https://via.placeholder.com/90'">
                <span class="name">${name}</span>
                <div class="status-badge ${status.color}">${status.text}</div>
            </div>`;
    }

    res.send(`${sharedStyles} <div class="container"><h1>Live Status-Board</h1><div class="grid">${cardsHtml}</div></div>`);
});

// Update-Link bleibt gleich
app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    const team = await getSheetData();
    const person = team ? team.find(m => (m.name || "").toLowerCase() === user.toLowerCase()) : null;
    const sID = person ? (person.slackid || person.id) : null;

    if (!sID) return res.status(404).send("User oder SlackID nicht gefunden.");

    let text = status === 'da' ? "Im Büro" : (status === 'homeoffice' ? "Homeoffice" : "");
    let emoji = status === 'da' ? ":office:" : (status === 'homeoffice' ? ":house_with_garden:" : "");

    try {
        await axios.post('https://slack.com/api/users.profile.set', {
            profile: { status_text: text, status_emoji: emoji }
        }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
        res.send("Status aktualisiert! <a href='/dashboard'>Zum Dashboard</a>");
    } catch (e) { res.status(500).send("Slack Fehler"); }
});

app.listen(port, () => console.log(`Online auf Port ${port}`));
