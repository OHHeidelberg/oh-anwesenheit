const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const USER_ID = 'U05SKMLDKCL';

// Speicher für die Zustände
let anwesenheit = {
  "Chef": { status: "weg", lastUpdate: new Date() }
};

// Hilfsfunktion für schönes Design (CSS)
const style = `
  <style>
    body { font-family: sans-serif; background: #f4f7f6; display: flex; justify-content: center; padding: 20px; }
    .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
    h1 { color: #333; font-size: 1.5rem; text-align: center; }
    .user-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee; }
    .badge { padding: 5px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; text-transform: uppercase; }
    .status-da { background: #d4edda; color: #155724; }
    .status-homeoffice { background: #fff3cd; color: #856404; }
    .status-weg { background: #f8d7da; color: #721c24; }
    .status-urlaub { background: #d1ecf1; color: #0c5460; }
  </style>
`;

app.get('/', (req, res) => {
  res.send('Server läuft! <br><a href="/status-einfach">Einfache Ansicht</a> | <a href="/status-details">Detail Ansicht</a>');
});

app.get('/update', async (req, res) => {
  const { status, user = "Chef" } = req.query;
  let statusText = "";
  let statusEmoji = "";

  if (status === 'da') { statusText = "Im Büro"; statusEmoji = ":office:"; }
  else if (status === 'homeoffice') { statusText = "Homeoffice"; statusEmoji = ":house_with_garden:"; }
  else if (status === 'urlaub') { statusText = "Im Urlaub"; statusEmoji = ":palm_tree:"; }
  else if (status === 'weg') { statusText = ""; statusEmoji = ""; }

  anwesenheit[user] = { status: status || 'weg', lastUpdate: new Date() };

  try {
    await axios.post('https://slack.com/api/users.profile.set', {
      profile: { status_text: statusText, status_emoji: statusEmoji, status_expiration: 0 }
    }, { headers: { 'Authorization': `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' } });

    const presence = (status === 'weg' || status === 'urlaub') ? 'away' : 'auto';
    await axios.post('https://slack.com/api/users.setPresence', { presence: presence }, {
      headers: { 'Authorization': `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' }
    });

    res.send(`${style} <div class="card"><h1>Update Erfolg!</h1><p>${user} ist jetzt: <b>${statusText || 'Abgemeldet'}</b></p></div>`);
  } catch (error) {
    res.status(500).send('Fehler');
  }
});

// VERSION 1: Einfache Anzeige (Da / Nicht da)
app.get('/status-einfach', (req, res) => {
  let list = "";
  for (const [name, data] of Object.entries(anwesenheit)) {
    const isDa = data.status === 'da';
    list += `
      <div class="user-row">
        <span>${name}</span>
        <span class="badge ${isDa ? 'status-da' : 'status-weg'}">${isDa ? 'IM HAUS' : 'AUSSER HAUS'}</span>
      </div>`;
  }
  res.send(`${style} <div class="card"><h1>Präsenz-Check</h1>${list}</div>`);
});

// VERSION 2: Detail-Anzeige
app.get('/status-details', (req, res) => {
  let list = "";
  for (const [name, data] of Object.entries(anwesenheit)) {
    list += `
      <div class="user-row">
        <div>
          <strong>${name}</strong><br>
          <small style="color: #999">${data.lastUpdate.toLocaleTimeString()}</small>
        </div>
        <span class="badge status-${data.status}">${data.status}</span>
      </div>`;
  }
  res.send(`${style} <div class="card"><h1>Status-Details</h1>${list}</div>`);
});

app.listen(port, () => { console.log(`Server läuft auf Port ${port}`); });
