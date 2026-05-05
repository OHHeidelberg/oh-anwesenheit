const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const cron = require('node-cron');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';
const INFO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?gid=1558993151&single=true&output=csv';

const htmlHead = `
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <title>OH Dashboard</title>
    <script>
        setTimeout(() => window.location.reload(true), 60000);
        window.addEventListener('online', () => window.location.reload(true));
    </script>
</head>`;

const errorPage = (msg) => `<html>${htmlHead}<body style="background:#000;color:#555;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;">
    <div><h2>Verbindung wird neu aufgebaut...</h2><p style="font-size:0.8rem;">${msg || 'Server-Timeout'}</p></div>
</body></html>`;

const styles = `
<style>
  :root { --bg-color: #000; --card-bg: #2c2c2e; --text-color: #fff; --accent-blue: #007aff; }
  body { font-family: sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
  .container { width: 95%; padding: 20px 0; box-sizing: border-box; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; width: 100%; }
  .card { background: var(--card-bg); padding: 15px; border-radius: 20px; text-align: center; border: 1px solid #3d3d40; display: flex; flex-direction: column; align-items: center; }
  .avatar { width: 80px; height: 80px; border-radius: 50%; border: 3px solid #48484a; object-fit: cover; margin-bottom: 10px; }
  .border-active { border-color: #32d74b; } .border-away { border-color: #48484a; opacity: 0.5; }
  .name-label { font-weight: bold; font-size: 1.1rem; margin-bottom: 5px; }
  .status-badge { padding: 6px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 700; width: 90%; margin-top: auto; }
  .bg-active { background: #1c3d22; color: #32d74b; } .bg-away { background: #2c2c2e; color: #8e8e93; }
  .info-banner { width: 100%; background: linear-gradient(135deg, #004a99, #007aff); color: white; padding: 20px; border-radius: 18px; margin-bottom: 25px; font-size: 1.6rem; font-weight: bold; text-align: center; }
  .footer-bar { position: fixed; bottom: 0; width: 100%; background: #1c1c1e; padding: 15px; display: flex; justify-content: center; gap: 10px; border-top: 1px solid #333; }
  select, button, input { background: #2c2c2e; color: #fff; border: 1px solid #444; padding: 12px; border-radius: 10px; }
</style>`;

async function getFullStatus(id) {
    try {
        const h = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const [p, s] = await Promise.all([
            axios.get(`https://slack.com/api/users.profile.get?user=${id.trim()}`, { headers: h, timeout: 8000 }).catch(() => ({data:{}})),
            axios.get(`https://slack.com/api/users.getPresence?user=${id.trim()}`, { headers: h, timeout: 8000 }).catch(() => ({data:{}}))
        ]);
        const prof = p.data.profile || {};
        const online = s.data.presence === 'active';
        const txt = prof.status_text || "";
        const lowTxt = txt.toLowerCase();
        let res = { t: txt || (online ? "Online" : "Abwesend"), e: "📍", c: "bg-away", b: "border-away", p: prof.image_192 || 'https://via.placeholder.com/192', r: 6 };
        if (lowTxt.includes("büro") || lowTxt.includes("da")) { res.c="bg-active"; res.b="border-active"; res.r=1; res.e="🏢"; }
        else if (online && !txt) { res.c="bg-active"; res.b="border-active"; res.r=2; res.e="🟢"; }
        return res;
    } catch (e) { 
        return { t: "Timeout", e: "⏳", c: "bg-away", b: "border-away", r: 9, p: 'https://via.placeholder.com/192' }; 
    }
}

app.get('/empfang', async (req, res) => {
    try {
        // Kritischer Pfad: Wenn die Google Tabelle nicht lädt, wird hier ein leerer Array genutzt statt abzustürzen
        let rows = [];
        try {
            const csv = await axios.get(CSV_URL, { timeout: 10000 });
            rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        } catch (e) {
            return res.send(errorPage("Google Sheets nicht erreichbar"));
        }

        const data = await Promise.all(rows.map(async r => ({ n: r[0], ...(await getFullStatus(r[1])) })));
        
        let infoText = "";
        try { 
            const infoCsv = await axios.get(INFO_URL, { timeout: 5000 }); 
            infoText = infoCsv.data.split('\n')[0]; 
        } catch (e) { /* Info darf fehlschlagen */ }

        const finalData = data.map(p => {
            const isPresent = p.t.toLowerCase().includes("büro") || p.t.toLowerCase().includes("da") || p.r === 2;
            return isPresent ? p : { ...p, t: "Abwesend", e: "⚪", c: "bg-away", b: "border-away" };
        });
        
        finalData.sort((a, b) => (a.t === "Abwesend") - (b.t === "Abwesend") || a.n.localeCompare(b.n));
        const infoBox = (infoText && infoText.trim() !== "" && !infoText.startsWith("<!DOCTYPE")) ? `<div class="info-banner">📢 ${infoText}</div>` : "";
        const cards = finalData.map(p => `<div class="card"><img src="${p.p}" class="avatar ${p.b}"><span class="name-label">${p.n}</span><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
        
        res.send(`<html>${htmlHead}<body class="empfang-body">${styles}<div class="container"><h1 style="text-align:center; font-size:2.5rem;">Willkommen</h1>${infoBox}<div class="grid">${cards}</div></div></body></html>`);
    } catch (e) {
        res.send(errorPage("Allgemeiner Ladefehler"));
    }
});

app.get('/dashboard', async (req, res) => {
    try {
        const csv = await axios.get(CSV_URL, { timeout: 10000 });
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const data = await Promise.all(rows.map(async r => ({ n: r[0], id: r[1], ...(await getFullStatus(r[1])) })));
        data.sort((a, b) => a.r - b.r);
        const cards = data.map(p => `<div class="card"><span class="name-label">${p.n}</span><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
        const userOptions = rows.map(r => `<option value="${r[0]}">${r[0]}</option>`).sort().join('');
        res.send(`<html>${htmlHead}<body>${styles}<div class="container"><h1>Dashboard</h1><div class="grid">${cards}</div></div><form action="/update" class="footer-bar"><select name="user">${userOptions}</select><button type="submit">Update</button></form></body></html>`);
    } catch (e) { res.send(errorPage("Dashboard Fehler")); }
});

app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const person = rows.find(r => r[0] === user);
        if (person) {
            await axios.post('https://slack.com/api/users.profile.set', { user: person[1].trim(), profile: { status_text: "Im Büro", status_emoji: ":office:" } }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
        }
        res.redirect('/dashboard');
    } catch (e) { res.send(errorPage("Slack Update fehlgeschlagen")); }
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(port, '0.0.0.0', () => console.log("Server online"));
