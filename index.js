const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Hier holen wir uns die Daten sicher aus den Render-Einstellungen
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const USER_ID = 'U05SKMLDKCL';

app.get('/', (req, res) => {
  res.send('Der Status-Server ist bereit und wartet auf Scans!');
});

app.get('/update', async (req, res) => {
  const { status } = req.query;

  if (!SLACK_TOKEN) {
    return res.status(500).send('Fehler: Slack-Token nicht konfiguriert!');
  }

  let statusText = "";
  let statusEmoji = "";

  if (status === 'da') {
    statusText = "Im Büro";
    statusEmoji = ":office:";
  } else if (status === 'homeoffice') {
    statusText = "Homeoffice";
    statusEmoji = ":house_with_garden:";
  } else if (status === 'weg') {
    statusText = ""; 
    statusEmoji = ""; 
  } else {
    return res.status(400).send('Unbekannter Status.');
  }

  try {
    // 1. Status bei Slack setzen
    await axios.post('https://slack.com/api/users.profile.set', {
      profile: {
        status_text: statusText,
        status_emoji: statusEmoji,
        status_expiration: 0
      }
    }, {
      headers: { 
        'Authorization': `Bearer ${SLACK_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    // 2. Präsenz setzen
    const presence = (status === 'weg') ? 'away' : 'auto';
    await axios.post('https://slack.com/api/users.setPresence', 
      { presence: presence }, 
      { 
        headers: { 
          'Authorization': `Bearer ${SLACK_TOKEN}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    res.send(`<h1>Erfolg!</h1><p>Slack-Status wurde auf <b>${statusText || 'Verfügbar'}</b> gesetzt.</p>`);
    
  } catch (error) {
    console.error('Slack API Fehler:', error.response ? error.response.data : error.message);
    res.status(500).send('Fehler beim Slack-Update.');
  }
});

app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
