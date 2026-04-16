const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

function translateEmoji(slackEmoji, isOnline) {
    if (slackEmoji) {
        const emojiMap = {
            ':office:': '🏢', ':house_with_garden:': '🏡', ':house:': '🏠',
            ':palm_tree:': '🌴', ':computer:': '💻', ':car:': '🚗',
            ':oncoming_automobile:': '🚘', ':bus:': '🚌', ':train:': '🚆',
            ':walking:': '🚶', ':coffee:': '☕'
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
      body { font-family: -apple-system, system-ui, sans-serif; background: #f0f2f5; margin: 0; padding: 10px; display: flex; flex-direction: column; align-items: center; }
      .container { width: 98%; max-width: 100%; text-align: center; }
      h1 { color: #1d1d1f; margin-bottom: 20px; font-size: 1.8rem; font-weight: 800; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; width: 100%; }
      .card { background: white; padding: 15px 10px; border-radius: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.03); display: flex; flex-direction: column; align-items: center; }
      
      /* Avatar mit dynamischer Rahmenfarbe */
      .avatar { 
        width: 75px; 
        height: 75px; 
        border-radius: 50%; 
        object-fit: cover; 
        margin-bottom: 10px; 
        background: #f8f8f8; 
        border: 4px solid #fff; /* Standard */
        box-shadow: 0 2px 6px rgba(0,0,0,0.1); 
        transition: border-color 0.3s ease;
      }
      
      /* Rahmenfarben passend zum Status */
      .border-active { border-color: #28a745 !important; } /* Grün */
      .border-home { border-color: #ffc107 !important; }   /* Gelb */
      .border-away { border-color: #d1d1d6 !important; }   /* Grau */

      .name { font-weight: bold; font-size: 1rem; color: #1d1d1f; display: block; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
      .status-badge { display: inline-flex; align-items: center; justify-content: center; padding: 6px 10px; border-radius: 15px; font-size: 0.75rem; font-weight: 700; width: 95%; }
      .emoji { font-size: 0.9rem; margin-right: 4px; }
      
      .bg-active { background: #e6f4ea; color: #1e7e34; } 
      .bg-home { background: #fff9e6; color: #947600; }
      .bg-away { background: #f5f5f7; color: #86868b; }
      .info { font-size: 0.65rem; color: #bbb; margin-top: 20px; }
    </style>
  </head>
`;

async function getSlackDetails(slackId) {
    if (!slackId) return { text: "ID fehlt", emoji: '❓', color: "bg-away", border: "border-away", photo: "" };
    try {
        const headers = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const config = { headers, timeout: 4000 };
        
        const [pRes, sRes] = await Promise.all([
            axios.get(`https://slack.com/api/users.profile.get?user=${slackId.trim()}`, config).catch(() => ({ data: { ok: false } })),
            axios.get(`https://slack.com/api/users.getPresence?user=${slackId.trim()}`, config).catch(() => ({ data: { ok: false } }))
        ]);

        const profile = pRes.data.profile || {};
        const isOnline = sRes.data.presence === 'active';
        const statusText = profile.status_text || "";
        
        let color = "bg-away";
        let border = "border-away";
        let text = statusText || (isOnline ? "Online" : "Abwesend");

        if (statusText) {
            const lower = statusText.toLowerCase();
            if (lower.includes("büro") || lower.includes("da")) {
                color = "bg-active";
                border = "border-active";
            } else if (lower.includes("home")) {
                color = "bg-home";
                border = "border-home";
            }
        } else if (isOnline) {
            color = "bg-active";
            border = "border-active";
        }

        return { 
            text, 
            emoji: translateEmoji(profile.status_emoji, isOnline), 
            color, 
            border,
            photo: profile.image_192 || "" 
        };
    } catch (e) { return { text: "Fehler", emoji: '⚠️', color: "bg-away", border: "border-away", photo: "" }; }
}

app.get('/dashboard', async (req, res) => {
    try {
        const response = await axios.get(CSV_URL, { timeout: 5000 });
        const rows = parse(response.data, { from_line: 2, skip_empty_lines: true, trim: true });

        let cardsHtml = "";
        for (const row of rows) {
            const status = await getSlackDetails(row[1]);
            cardsHtml += `
                <div class="card">
                    <img src="${status.photo || 'https://via.placeholder.com/100'}" class="avatar ${status.border}" onerror="this.src='https://via.placeholder.com/100'">
                    <span class="name">${row[0]}</span>
                    <div class="status-badge ${status.color}">
                        <span class="emoji">${status.emoji}</span>
                        <span>${status.text}</span>
                    </div>
                </div>`;
        }
        res.send(`${sharedStyles}<div class="container"><h1>Team Präsenz</h1><div class="grid">${cardsHtml}</div><div class="info">Update: ${new Date().toLocaleTimeString('de-DE')}</div></div>`);
    } catch (error) {
        res.status(500).send("Fehler beim Laden.");
    }
});

app.get('/', (req, res) => res.send('Aktiv. <a href="/dashboard">Dashboard</a>'));

app.listen(port, '0.0.0.0', () => {
    console.log(`Server läuft auf Port ${port}`);
});
