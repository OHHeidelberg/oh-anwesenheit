const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const USER_ID = 'U05SKMLDKCL';

// Hier speichern wir die Zustände (im echten Betrieb wäre das eine DB)
let anwesenheit = {
  "Chef": { status: "weg", lastUpdate: new Date() }
};

app.get('/', (req, res) => {
  res.send('Server läuft! Nutze /status-einfach oder /status-details zur Anzeige.');
});

app.get('/update', async (req, res) => {
  const { status, user = "Chef" } = req.query;

  let statusText = "";
  let statusEmoji = "";

  if (status === 'da') {
    statusText = "Im Büro";
    statusEmoji = ":office:";
  } else if (status === 'homeoffice') {
    statusText = "Homeoffice";
    statusEmoji = ":house_with_garden:";
  } else if (status === 'urlaub') {
    statusText = "Im Urlaub";
    statusEmoji = ":palm_tree:";
  } else if (status === 'weg') {
    statusText = ""; 
    statusEmoji = ""; 
  }

  // Lokal speichern für die Anzeige
  anwesenheit[user] = { status: status, lastUpdate: new Date() };

  try {
    // Slack Update
    await axios.post('https://slack.com/api/users.profile.set', {
      profile: { status_text: statusText, status_emoji: statusEmoji, status_expiration: 0 }
    }, {
      headers: { 'Authorization': `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' }
    });

    const presence = (status === 'weg' || status === 'urlaub') ? 'away' : 'auto';
    await axios.post('https://slack.com/api/users.setPresence', { presence: presence }, {
      headers: { 'Authorization': `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' }
    });

    res.send(`<h1>Update für ${user}</h1><p>Status: ${statusText || 'Abwesend'}</p>`);
  } catch (error) {
    res.status(500).send('Slack Fehler');
  }
});

// VERSION 1: Einfache Anzeige (Da / Nicht da)
app.get('/status-einfach', (req, res) => {
  let html = "<h1>Wer ist im Haus?</h1><ul>";
  for (const [name, data] of Object.entries(anwesenheit)) {
    const istDa = (data.status === 'da');
    html += `<li>${name}: ${istDa ? "✅ DA" : "❌ NICHT DA"}</li>`;
  }
  res.send(html + "</ul>");
});

// VERSION 2: Detail-Anzeige
app.get('/status-details', (req, res) => {
  let html = "<h1>Detaillierte Übersicht</h1><table border='1'><tr><th>Name</th><th>Status</th><th>Zuletzt gesehen</th></tr>";
  for (const [name, data] of Object.entries(anwesenheit)) {
    html += `<tr><td>${name}</td><td>${data.status}</td><td>${data.lastUpdate.toLocaleTimeString()}</td></tr>`;
  }
  res.send(html + "</table>");
});

app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
