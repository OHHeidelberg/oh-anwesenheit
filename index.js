const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

function translateEmoji(slackEmoji, isOnline) {
    if (slackEmoji) {
        const emojiMap = {
            ':office:': '🏢', ':house_with_garden:': '🏡', ':house:': '🏠',
            ':palm_tree:': '🌴', ':wave:': '👋', ':beach_with_umbrella:': '🏖️',
            ':coffee:': '☕', ':stuck_out_tongue:': '😋', ':computer:': '💻'
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
      body { 
        font-family: -apple-system, system-ui, sans-serif; 
        background: #f0f2f5; 
        margin: 0; 
        padding: 10px; /* Minimaler Abstand zum Bildschirmrand */
        display: flex; 
        flex-direction: column; 
        align-items: center; 
      }
      .container { 
        width: 98%; /* Fast die gesamte Breite nutzen */
        max-width: 100%; /* Kein künstliches Limit mehr */
        text-align: center; 
      }
      h1 { color: #1d1d1f; margin-bottom: 20px; font-size: 1.8rem; font-weight: 800; }
      
      .grid { 
        display: grid; 
        /* Verringerte Mindestbreite, damit 6 oder mehr Karten nebeneinander passen */
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); 
        gap: 15px; 
        width: 100%; 
      }
      
      .card { 
        background: white; 
        padding: 15px 10px; 
        border-radius: 18px; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.05); 
        border: 1px solid rgba(0,0,0,0.03); 
        display: flex; 
        flex-direction: column; 
        align-items: center; 
      }
      .avatar { width: 70px; height: 70px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; background: #f8f8f8; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
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
    if (!slackId || slackId.length < 5) return { text: "ID fehlt", emoji: '❓', color: "bg-away", photo: "" };
    try {
        const headers = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const profileRes = await axios.get(`https://slack.com/api/users.profile.get?user=${slackId.trim()}`, { headers }).catch(() => ({ data: { ok: false } }));
        const presenceRes = await axios.get(`https://slack.com/api/users.getPresence?user=${slackId.trim()}`, { headers }).catch(() => ({ data: { ok: false } }));

        let isOnline = presenceRes.data.ok ? presenceRes.data.presence === 'active' : false;
        let statusText = profileRes.data.ok ? profileRes.data.profile.status_text : "";
        let rawEmoji = profileRes.data.ok ? profileRes.data.profile.status_emoji : "";
        let photo = profileRes.data.ok ? profileRes.data.profile.image_192 : "https://via.placeholder.com/100";

        let text = statusText;
        let color = "bg-away";

        if (statusText) {
            const lower = statusText.toLowerCase();
            if (lower.includes("büro") || lower.includes("da")) color = "bg-active";
            else if (lower.includes("home")) color = "bg-home";
        } else if (isOnline) {
            text = "Online";
            color = "bg-active";
        } else {
            text = "Abwesend";
        }

        return { text, emoji: translateEmoji(rawEmoji, isOnline), color, photo };
    } catch (e) {
        return { text: "Fehler", emoji: '⚠️', color: "bg-away", photo: "" };
    }
}

app.get('/dashboard', async (req, res) => {
    try {
        const response = await axios.get(CSV_URL);
        const rows = parse(response.data, { from_line: 2, skip_empty_lines: true, trim: true });

        let cardsHtml = "";
        for (const row of rows) {
            const status = await getSlackDetails(row[1]);
            cardsHtml += `
                <div class="card">
                    <img src="${status.photo}" class="avatar" onerror="this.src='https://via.placeholder.com/100'">
                    <span class="name">${row[0]}</span>
                    <div class="status-badge ${status.color}">
                        <span class="emoji">${status.emoji}</span>
                        <span>${status.text}</span>
                    </div>
                </div>`;
        }
        res.send(`${sharedStyles}<div class="container"><h1>Team Präsenz</h1><div class="grid">${cardsHtml}</div><div class="info">Stand: ${new Date().toLocaleTimeString('de-DE')}</div></div>`);
    } catch (error) {
        res.status(500).send("Fehler beim Laden.");
    }
});

app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    try {
        const sheetRes = await axios.get(CSV_URL);
        const rows = parse(sheetRes.data, { from_line: 2, skip_empty_lines: true, trim: true });
        const person = rows.find(r => r[0].toLowerCase() === user.toLowerCase());

        if (!person) return res.status(404).send("User nicht gefunden.");

        const text = status === 'da' ? "Im Büro" : (status === 'homeoffice' ? "Homeoffice" : "");
        const emoji = status === 'da' ? ":office:" : (status === 'homeoffice' ? ":house_with_garden:" : "");

        await axios.post('https://slack.com/api/users.profile.set', {
            profile: { status_text: text, status_emoji: emoji }
        }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });

        res.send(`Status aktualisiert. <a href="/dashboard">Dashboard</a>`);
    } catch (e) { res.status(500).send("Update Fehler."); }
});

// WICHTIG: Auf 0.0.0.0 binden, damit Render den Service erkennt
app.listen(port, '0.0.0.0', () => {
    console.log(`Server läuft auf Port ${port} und ist bereit.`);
});
