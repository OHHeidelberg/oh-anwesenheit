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
            ':walking:': '🚶', ':coffee:': '☕', ':face_with_thermometer:': '🤒'
        };
        return emojiMap[slackEmoji] || '📍';
    }
    return isOnline ? '🟢' : '⚪';
}

const sharedStyles = `
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: sans-serif; background: #f0f2f5; margin: 0; padding: 10px; display: flex; flex-direction: column; align-items: center; }
      .container { width: 98%; text-align: center; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); justify-content: center; gap: 15px; width: 100%; }
      .card { background: white; padding: 15px; border-radius: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; flex-direction: column; align-items: center; max-width: 200px; margin: 0 auto; }
      .avatar { width: 75px; height: 75px; border-radius: 50%; object-fit: cover; margin-bottom: 10px; border: 4px solid #fff; transition: all 0.4s ease; }
      .border-active { border-color: #28a745 !important; } 
      .border-home { border-color: #ffc107 !important; }
      .border-away { border-color: #d1d1d6 !important; filter: grayscale(100%); opacity: 0.5; }
      .name { font-weight: bold; margin-bottom: 8px; }
      .status-badge { padding: 6px 10px; border-radius: 15px; font-size: 0.75rem; font-weight: 700; width: 95%; display: flex; align-items: center; justify-content: center; }
      .bg-active { background: #e6f4ea; color: #1e7e34; } 
      .bg-home { background: #fff9e6; color: #947600; }
      .bg-away { background: #f5f5f7; color: #86868b; }
    </style>
  </head>
`;

async function getSlackDetails(slackId) {
    if (!slackId) return { text: "ID fehlt", emoji: '❓', color: "bg-away", border: "border-away", photo: "", rank: 99 };
    try {
        const headers = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const [pRes, sRes] = await Promise.all([
            axios.get(`https://slack.com/api/users.profile.get?user=${slackId.trim()}`, { headers, timeout: 4000 }).catch(() => ({ data: { ok: false } })),
            axios.get(`https://slack.com/api/users.getPresence?user=${slackId.trim()}`, { headers, timeout: 4000 }).catch(() => ({ data: { ok: false } }))
        ]);
        const profile = pRes.data.profile || {};
        const isOnline = sRes.data.presence === 'active';
        const statusText = profile.status_text || "";
        let color = "bg-away", border = "border-away", text = statusText || (isOnline ? "Online" : "Abwesend"), rank = 5;

        if (statusText) {
            const lower = statusText.toLowerCase();
            if (lower.includes("büro") || lower.includes("da")) { color = "bg-active"; border = "border-active"; rank = 1; }
            else if (lower.includes("home")) { color = "bg-home"; border = "border-home"; rank = 3; }
            else if (lower.includes("unterwegs") || lower.includes("fahrt") || lower.includes("auto")) { color = "bg-home"; border = "border-home"; rank = 4; }
        } else if (isOnline) { color = "bg-active"; border = "border-active"; text = "Online"; rank = 2; }
        return { text, emoji: translateEmoji(profile.status_emoji, isOnline), color, border, photo: profile.image_192 || "", rank };
    } catch (e) { return { text: "Fehler", emoji: '⚠️', color: "bg-away", border: "border-away", photo: "", rank: 99 }; }
}

app.get('/dashboard', async (req, res) => {
    try {
        const response = await axios.get(CSV_URL);
        const rows = parse(response.data, { from_line: 2, skip_empty_lines: true });
        const teamData = await Promise.all(rows.map(async (row) => ({ name: row[0], ...(await getSlackDetails(row[1])) })));
        teamData.sort((a, b) => a.rank - b.rank);
        const cardsHtml = teamData.map(p => `
            <div class="card">
                <img src="${p.photo || ''}" class="avatar ${p.border}" onerror="this.src='https://via.placeholder.com/100'">
                <span class="name">${p.name}</span>
                <div class="status-badge ${p.color}"><span>${p.emoji} ${p.text}</span></div>
            </div>`).join('');
        res.send(`${sharedStyles}<div class="container"><h1>Team Präsenz</h1><div class="grid">${cardsHtml}</div></div>`);
