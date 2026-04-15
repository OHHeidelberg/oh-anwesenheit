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
      body { font-family: -apple-system, system-ui, sans-serif; background: #f0f2f5; padding: 20px; display: flex; flex-direction: column; align-items: center; }
      .container { width: 100%; max-width: 900px; text-align: center; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
      .card { background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
      .avatar { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; background: #eee; }
      .error-box { background: #fee; color: #c33; padding: 15px; border-radius: 10px; border: 1px solid #fcc; margin: 20px; }
      .status-badge { display: inline-block; padding: 6px 12px; border-radius: 15px; font-size: 0.8rem; font-weight: bold; background: #eee; }
    </style>
  </head>
`;

async function getSheetData() {
    try {
        const response = await axios.get(CSV_URL);
        // Wir erzwingen hier das Trimmen und schauen uns die Rohdaten an
        const data = parse(response.data, { columns: true, skip_empty_lines: true, trim: true });
        return data;
    } catch (e) {
        console.error("CSV Fehler:", e.message);
        return null;
    }
}

async function getSlackStatus(slackId) {
    if (!slackId) return { text: "Keine SlackID", emoji: "" };
    try {
        const res = await axios.get(`https://slack.com/api/users.profile.get?user=${slackId}`, {
            headers: { Authorization: `Bearer ${SLACK_TOKEN}` }
        });
        return {
            text: res.data.ok ? (res.data.profile.status_text || "Verfügbar") : "ID Fehler",
            emoji: res.data.profile.status_emoji || ""
        };
    } catch (e) { return { text: "Offline", emoji: "" }; }
}

app.get('/dashboard', async (req, res) => {
    const team = await getSheetData();
    
    if (!team || team.length === 0) {
        return res.send(`${sharedStyles} <h1>Live Status-Board</h1><div class="error-box">Keine Daten gefunden. Ist das Sheet veröffentlicht? Gefundene Spalten: ${team ? Object.keys(team[0]).join(", ") : "Keine"}</div>`);
    }

    let cardsHtml = "";
    for (const m of team) {
        // Wir nutzen hier eine flexiblere Suche nach der SlackID (falls Kleingeschrieben)
        const sID = m.SlackID || m.slackid || m['Slack-ID'];
        const name = m.Name || m.name || "Unbekannt";
        const foto = m.FotoURL || m.fotourl || "";

        const slackStatus = await getSlackStatus(sID);

        cardsHtml += `
            <div class="card">
                <img src="${foto || 'https://via.placeholder.com/80'}" class="avatar">
                <div style="margin-top:10px;"><b>${name}</b></div>
                <div class="status-badge">${slackStatus.text}</div>
            </div>`;
    }

    res.send(`${sharedStyles} <div class="container"><h1>Live Status-Board</h1><div class="grid">${cardsHtml}</div></div>`);
});

app.listen(port, () => console.log(`Server läuft`));
