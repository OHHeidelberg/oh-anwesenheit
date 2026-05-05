const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const cron = require('node-cron');
const app = express();
const port = process.env.PORT || 10000;

// Umgebungsvariablen & URLs
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';
const INFO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?gid=1558993151&single=true&output=csv';

// --- RESET LOGIK (Jeden Tag um 00:00 Uhr) ---
async function resetAllStatuses() {
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        for (const row of rows) {
            const slackId = row[1].trim();
            if (!slackId) continue;
            const profile = await axios.get(`https://slack.com/api/users.profile.get?user=${slackId}`, {
                headers: { Authorization: `Bearer ${SLACK_TOKEN}` }
            });
            const currentText = (profile.data.profile.status_text || "").toLowerCase();
            if (currentText.includes("urlaub") || currentText.includes("krank")) continue;
            await axios.post('https://slack.com/api/users.profile.set', { 
                user: slackId,
                profile: { status_text: "", status_emoji: "" } 
            }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
        }
        return true;
    } catch (e) { return false; }
}
cron.schedule('0 0 * * *', () => resetAllStatuses(), { timezone: "Europe/Berlin" });

// --- STYLES (Inkl. Anti-Burn-In & Responsive Design) ---
const styles = `
<style>
  :root {
    --bg-color: #f0f2f5;
    --card-bg: #fff;
    --text-color: #1d1d1f;
  }
  body {
    font-family: sans-serif;
    background: var(--bg-color);
    color: var(--text-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 0;
    padding: 10px 10px 140px 10px;
    transition: filter 1s ease, background 1s ease;
    /* Anti-Burn-In: Minimales Shifting alle 10 Min */
    animation: pixelShift 600s infinite alternate linear;
  }
  @keyframes pixelShift {
    0% { transform: translate(0, 0); }
    50% { transform: translate(1px, 1px); }
    100% { transform: translate(-1px, 0px); }
  }
  .container { width: 98%; text-align: center; }
  .nav-bar { display: flex; gap: 10px; justify-content: center; margin-bottom: 25px; flex-wrap: wrap; }
  .nav-btn { text-decoration: none; background: #fff; color: #1d1d1f; padding: 10px 18px; border-radius: 20px; font-size: 0.9rem; font-weight: 700; border: 1px solid #ddd; box-shadow: 0 2px 6px rgba(0,0,0,0.08); display: flex; align-items: center; gap: 6px; transition: 0.2s; }
  .nav-btn:hover { background: #f5f5f7; transform: translateY(-1px); }
  .btn-krank { color: #d32f2f; border-color: #ffcdd2; }
  .btn-urlaub { color: #007aff; border-color: #c7e0ff; }
  .btn-outlook { color: #0078d4; border-color: #0078d4; }
  .btn-docs { color: #555; border-color: #ddd; }
  .btn-server { color: #ed6c02; border-color: #ffe4cc; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; width: 100%; justify-content: center; }
  .card { background: var(--card-bg); padding: 15px; border-radius: 18px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.
