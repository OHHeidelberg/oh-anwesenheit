const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Konfiguration
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const USER_ID = 'U05SKMLDKCL'; // Deine ID
const MEINE_URL = 'https://mein-status-tool.onrender.com'; 

// Speicher für die Zustände (wird bei Server-Neustart zurückgesetzt)
let anwesenheit = {
  "Chef": { status: "weg", lastUpdate: new Date() }
};

// HTML Header mit CSS & Auto-Refresh (30 Sek)
const header = `
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="30"> 
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; background: #f0f2f5; display: flex; justify-content: center; padding: 20px; }
      .card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 8px 16px rgba(0,0,0,0.1); width: 100%; max-width: 450px; }
      h1 { color: #1d1d1f; font-size: 1.4rem; text-align: center; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
      .user-row { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px solid #f0f0f0; }
      .badge { padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
      .status-da { background: #e6f4ea; color: #1e7e34; }
      .status-homeoffice { background: #fff9e6; color: #947600; }
      .status-weg { background: #fce8e8; color: #c62828; }
      .status-urlaub { background: #e8f4fd; color: #1565c0; }
      .time { color: #888; font-size: 0.8rem; }
      .footer { text-align: center; margin-top: 20px; font-size: 0.7rem; color: #bbb; }
    </style>
  </head>
`;

app.get('/', (req, res) => {
  res.send(`${header} <div class="card"><h1>Status Server</h1><p align="center">System ist bereit.<br><br><a href="/status-details" style="color: #007aff; text-decoration: none;">👉 Zur Status-Tafel</a></p></div>`);
});

// Update-Endpunkt für NFC / QR
app.get('/update', async (req, res) => {
  const { status, user = "Chef" } = req.query;
  let statusText = "";
  let statusEmoji = "";

  if (status === 'da') { statusText = "Im Büro"; statusEmoji = ":office:"; }
  else if (status === 'homeoffice') { statusText = "Homeoffice"; statusEmoji = ":house_with_garden:"; }
  else if (status === 'urlaub')
