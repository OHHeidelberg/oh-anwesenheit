const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Der Server läuft! Scan erfolgreich.');
});

app.get('/update', (req, res) => {
  const { user, status } = req.query;
  res.send(`Update empfangen: ${user} ist jetzt ${status}. (Slack-Anbindung folgt!)`);
});

app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
