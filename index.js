const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;

// Dein CSV-Link
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

// Gemeinsames CSS für alle Seiten
const sharedStyles = `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="30">
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
      .container { width: 100%; max-width: 800px; }
      h1 { color: #1d1d1f; text-align: center; margin-bottom: 30px; font-size: 2rem; }
      
      /* Dashboard Grid */
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; width: 100%; }
      
      /* Mitarbeiter Karte */
      .card { background: white; padding: 20px; border-radius: 20px; box-shadow: 0 8px 20px rgba(0,0,0,0.08); text-align: center; transition: transform 0.2s; }
      .card:hover { transform: translateY(-5px); }
      
      .avatar { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 4px solid #eee; margin-bottom: 15px; background: #fafafa; }
      .name { font-size: 1.2rem; font-weight: bold; color: #1d1d1f; margin-bottom: 10px; display: block; }
      
      /* Status Badges */
      .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; text-transform: uppercase; }
      .da { background: #e6f4ea; color: #1e7e34; border: 1px solid #c3e6cb; }
      .homeoffice { background: #fff9e6; color: #947600; border: 1px solid #ffeeba; }
      .weg { background: #fce8e8; color: #c62828; border: 1px solid #f5c6cb; }
      
      .update-time { font-size: 0.7rem; color: #bbb; margin-top: 15px; }
      a { color: #007aff; text-decoration: none; font-size: 0.9rem; }
    </style>
  </head>
`;

async function getSheetData() {
    try {
        const response = await axios.get(CSV_URL);
        return parse(response.data, { columns: true, skip_empty_lines: true, trim: true });
    } catch (e) {
        console.error("CSV-Fehler:", e.message);
        return null;
    }
}

// 1. DASHBOARD - Die Übersicht für alle
app.get('/dashboard', async (req, res) => {
    const team = await getSheetData();
    if (!team) return res.status(502).send("Google Sheet konnte nicht geladen werden.");

    let cardsHtml = "";
    team.forEach(m => {
        const statusClass = m.Status ? m.Status.toLowerCase().replace(" ", "") : "weg";
        const statusDisplay = m.Status || "Abwesend";
        
        cardsHtml += `
            <div class="card">
                <img src="${m.FotoURL || 'https://via.placeholder.com/100'}" class="avatar" onerror="this.src='https://via.placeholder.com/100'">
                <span class="name">${m.Name}</span>
                <div class="status-badge ${statusClass}">${statusDisplay}</div>
                <div class="update-time">Zuletzt aktualisiert: ${new Date().toLocaleTimeString('de-DE')}</div>
            </div>`;
    });

    res.send(`${sharedStyles} 
        <div class="container">
            <h1>Team Präsenz</h1>
            <div class="grid">${cardsHtml}</div>
            <p style="text-align:center; margin-top:30px;"><a href="/">Zentrale</a></p>
        </div>`);
});

// 2. UPDATE - Der Link für NFC-Tags
app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    if (!user || !status) return res.status(400).send("Parameter fehlen.");

    const team = await getSheetData();
    const person = team ? team.find(m => m.Name.toLowerCase() === user.toLowerCase()) : null;

    if (!person) return res.status(404).send("User nicht gefunden.");

    let text = status === 'da' ? "Im Büro" : (status === 'homeoffice' ? "Homeoffice" : "Abgemeldet");
    let emoji = status === 'da' ? ":office:" : (status === 'homeoffice' ? ":house_with_garden:" : ":wave:");

    try {
        await axios.post('https://slack.com/api/users.profile.set', {
            profile: { status_text: text, status_emoji: emoji, status_expiration: 0 }
        }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });

        res.send(`${sharedStyles} 
            <div class="card" style="margin-top: 50px;">
                <img src="${person.FotoURL || 'https://via.placeholder.com/100'}" class="avatar">
                <h2>Check-in: ${person.Name}</h2>
                <div class="status-badge ${status}">${text}</div>
                <p>Status in Slack ist jetzt aktiv.</p>
                <br><a href="/dashboard">Zum Dashboard</a>
            </div>`);
    } catch (e) {
        res.status(500).send("Slack API Fehler.");
    }
});

app.get('/', (req, res) => {
    res.send(`${sharedStyles} <h1>Status Zentrale</h1><a href="/dashboard">👉 Zum Team-Dashboard</a>`);
});

app.listen(port, () => console.log(`Dashboard aktiv auf Port ${port}`));
