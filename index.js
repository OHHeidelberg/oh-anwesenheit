const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

// Hilfe: Wandelt Slack-Emoji-Codes in Symbole um
function translateEmoji(slackEmoji, isOnline) {
    if (slackEmoji) {
        const emojiMap = {
            ':office:': '🏢',
            ':house_with_garden:': '🏡',
            ':house:': '🏠',
            ':palm_tree:': '🌴',
            ':wave:': '👋',
            ':beach_with_umbrella:': '🏖️',
            ':coffee:': '☕',
            ':stuck_out_tongue:': '😋'
        };
        return emojiMap[slackEmoji] || '📍';
    }
    return isOnline ? '🟢' : '⚪';
}

const sharedStyles = `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="60">
    <style>
      body { font-family: -apple-system, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
      .container { width: 100%; max-width: 1000px; text-align: center; }
      h1 { color: #1d1d1f; margin-bottom: 30px; font-size: 2.2rem; font-weight: 800; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 25px; width: 100%; }
      .card { background: white; padding: 25px; border-radius: 24px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.03); }
      .avatar { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; margin-bottom: 15px; background: #f8f8f8; border: 4px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
      .name { font-weight: bold; font-size: 1.25rem; color: #1d1d1f; display: block; margin-bottom: 12px; }
      .status-badge { display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 30px; font-size: 0.9rem; font-weight: 700; }
      .emoji { font-size: 1.2rem; margin-right: 8px; }
      .bg-active { background: #e6f4ea; color: #1e7e34; } 
      .bg-home { background: #fff9e6; color: #947600; }
      .bg-away { background: #f5f5f7; color: #86868b; }
      .info { font-size: 0.7rem; color: #bbb; margin-top: 20px; }
    </style>
  </head>
`;

async function getSheetData() {
    try {
        const response = await axios.get(CSV_URL);
        return parse(response.data, { from_line: 2, skip_empty_lines: true, trim: true });
    } catch (e) { return null; }
}

async function getSlackDetails(slackId) {
    if (!slackId || slackId.length < 5) return { text: "ID fehlt", emoji: '❓', color: "bg-away" };
    try {
        const profileRes = await axios.get(`https://slack.com/api/users.profile.get?user=${slackId.trim()}`, {
            headers: { Authorization: `Bearer ${SLACK_TOKEN}` }
        });
        
        const presenceRes = await axios.get(`https://slack.com/api/users.getPresence?user=${slackId.trim()}`, {
            headers: { Authorization: `Bearer ${SLACK_TOKEN}` }
        });

        if (profileRes.data.ok && presenceRes.data.ok) {
            const isOnline = presenceRes.data.presence === 'active';
            const statusText = profileRes.data.profile.status_text;
            const rawEmoji = profileRes.data.profile.status_emoji || "";

            let text = statusText;
            let color = "bg-away";

            if (statusText) {
                if (statusText.toLowerCase().includes("büro")) color = "bg-active";
                if (statusText.toLowerCase().includes("homeoffice")) color = "bg-home";
            } else if (isOnline) {
                text = "Online";
                color = "bg-active";
            } else {
                text = "Abwesend";
            }

            return { text, emoji: translateEmoji(rawEmoji, isOnline), color };
        }
    } catch (e) { }
    return { text: "Offline", emoji: '☁️', color: "bg-away" };
}

app.get('/dashboard', async (req, res) => {
    const rows = await getSheetData();
    if (!rows) return res.send("Fehler beim Laden des Sheets.");

    let cardsHtml = "";
    for (const row of rows) {
        const status = await getSlackDetails(row[1]);
        cardsHtml += `
            <div class="card">
                <img src="${row[2] || 'https://via.placeholder.com/100'}" class="avatar" onerror="this.src='https://via.placeholder.com/100'">
                <span class="name">${row[0]}</span>
                <div class="status-badge ${status.color}">
                    <span class="emoji">${status.emoji}</span>
                    <span>${status.text}</span>
                </div>
            </div>`;
    }
    res.send(`${sharedStyles}<div class="container"><h1>Team Präsenz</h1><div class="grid">${cardsHtml}</div><div class="info">Letztes Update: ${new Date().toLocaleTimeString()}</div></div>`);
});

app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    const rows = await getSheetData();
    const personRow = rows ? rows.find(r => r[0].toLowerCase() === user.toLowerCase()) : null;
    if (!personRow) return res.status(404).send("User nicht gefunden.");

    let text = status === 'da' ? "Im Büro" : (status === 'homeoffice' ? "Homeoffice" : "");
    let emoji = status === 'da' ? ":office:" : (status === 'homeoffice' ? ":house_with_garden:" : "");

    try {
        await axios.post('https://slack.com/api/users.profile.set', {
            profile: { status_text: text, status_emoji: emoji }
        }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
        res.send(`Status für ${personRow[0]} aktualisiert. <a href="/dashboard">Dashboard</a>`);
    } catch (e) { res.status(500).send("Fehler."); }
});

app.listen(port, () => console.log(`Server läuft auf Port ${port}`));
