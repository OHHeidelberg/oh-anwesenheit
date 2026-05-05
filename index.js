const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const cron = require('node-cron');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';
const INFO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?gid=1558993151&single=true&output=csv';

// Variable für den temporären Infotext (wird beim Start aus CSV geladen)
let currentInfoText = "Lade Infotext...";

// Initialer Ladevorgang des Infotextes
async function refreshInfoText() {
    try {
        const infoCsv = await axios.get(INFO_URL, { timeout: 3000 });
        currentInfoText = infoCsv.data.split('\n')[0].trim();
    } catch (e) {
        console.log("Konnte Infotext nicht laden");
    }
}
refreshInfoText();

const htmlHead = `
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <title>OH Dashboard</title>
    <script>
        setTimeout(function(){ window.location.reload(true); }, 60000);
    </script>
</head>`;

const errorPage = (msg) => `<html>${htmlHead}<body style="background:#000;color:#555;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;"><div><h2>Verbindung wird neu aufgebaut...</h2><p>${msg}</p></div></body></html>`;

const styles = `
<style>
  :root { --bg-color: #000000; --card-bg: #2c2c2e; --text-color: #ffffff; --accent-blue: #007aff; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
  .container { width: 95%; padding: 20px 0; box-sizing: border-box; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; width: 100%; }
  .card { background: var(--card-bg); padding: 15px; border-radius: 20px; text-align: center; box-shadow: 0 8px 20px rgba(0,0,0,0.6); border: 1px solid #3d3d40; }
  .avatar { width: 80px; height: 80px; border-radius: 50%; border: 3px solid #48484a; object-fit: cover; margin-bottom: 10px; }
  .border-active { border-color: #32d74b; }
  .border-red { border-color: #ff453a; }
  .border-home { border-color: #ffd60a; }
  .border-away { border-color: #48484a; filter: grayscale(1); opacity: 0.5; }
  .name-label { font-weight: bold; font-size: 1.1rem; display: block; }
  .status-badge { padding: 6px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 700; margin-top: 10px; display: inline-block; }
  .bg-active { background: #1c3d22; color: #32d74b; }
  .bg-red { background: #3d1c1c; color: #ff453a; }
  .bg-home { background: #3d361c; color: #ffd60a; }
  .bg-away { background: #2c2c2e; color: #8e8e93; }
  .info-banner { width: 100%; background: linear-gradient(135deg, #004a99, #007aff); color: white; padding: 20px; border-radius: 18px; margin-bottom: 25px; font-size: 1.6rem; font-weight: bold; text-align: center; }
  .footer-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #1c1c1e; padding: 10px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #333; z-index: 1000; }
  .footer-row { display: flex; justify-content: center; gap: 10px; width: 100%; }
  select, button, input { background: #2c2c2e; color: #fff; border: 1px solid #444; padding: 10px; border-radius: 10px; }
  .btn-update { background: var(--accent-blue); border: none; font-weight: bold; }
  .nav-bar { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center; }
  .nav-btn { text-decoration: none; background: #1c1c1e; color: #fff; padding: 8px 15px; border-radius: 20px; border: 1px solid #333; font-size: 0.8rem; }
</style>`;

// --- Hilfsfunktionen für Slack ---
async function getFullStatus(id) {
    try {
        const h = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const [p, s] = await Promise.all([
            axios.get(`https://slack.com/api/users.profile.get?user=${id.trim()}`, { headers: h, timeout: 5000 }).catch(() => ({data:{}})),
            axios.get(`https://slack.com/api/users.getPresence?user=${id.trim()}`, { headers: h, timeout: 5000 }).catch(() => ({data:{}}))
        ]);
        const prof = p.data.profile || {};
        const online = s.data.presence === 'active';
        const txt = prof.status_text || "";
        const lowTxt = txt.toLowerCase();
        let res = { t: txt || (online ? "Online" : "Abwesend"), e: "📍", c: "bg-away", b: "border-away", p: prof.image_192 || 'https://via.placeholder.com/192', r: 6 };
        if (lowTxt.includes("büro") || lowTxt.includes("da")) { res.c="bg-active"; res.b="border-active"; res.r=1; res.e="🏢"; }
        else if (online && !txt) { res.c="bg-active"; res.b="border-active"; res.r=2; res.e="🟢"; }
        else if (lowTxt.includes("home")) { res.c="bg-home"; res.b="border-home"; res.r=3; res.e="🏡"; }
        else if (lowTxt.includes("unterwegs") || lowTxt.includes("mobil")) { res.c="bg-red"; res.b="border-red"; res.r=4; res.e="🚗"; }
        else if (lowTxt.includes("besprechung") || lowTxt.includes("meeting") || lowTxt.includes("termin")) { res.c="bg-red"; res.b="border-red"; res.r=5; res.e="🗓️"; }
        return res;
    } catch (e) { return { t: "Offline", e: "⚪", c: "bg-away", b: "border-away", r: 9, p: 'https://via.placeholder.com/192' }; }
}

// --- Routes ---

// NEU: Route zum Ändern des Infotextes
app.get('/set-info', (req, res) => {
    if (req.query.text) {
        currentInfoText = req.query.text;
    }
    res.redirect('/dashboard');
});

app.get('/update', async (req, res) => {
    const { status, user, bis } = req.query;
    const map = { da: ["Im Büro", ":office:"], homeoffice: ["Homeoffice", ":house_with_garden:"], besprechung: ["Besprechung", ":calendar:"], unterwegs: ["Unterwegs", ":car:"], weg: ["Abwesend", ":wave:"], krank: ["Krank", ":face_with_thermometer:"], urlaub: ["Urlaub", ":palm_tree:"] };
    let [text, emoji] = map[status] || ["Abwesend", ":wave:"];
    let expiration = 0;
    if (bis) {
        const [h, m] = bis.split(':');
        const exp = new Date(); exp.setHours(parseInt(h), parseInt(m), 0, 0);
        if (exp < new Date()) exp.setDate(exp.getDate() + 1);
        expiration = Math.floor(exp.getTime() / 1000);
        text += ` bis ${bis}`;
    }
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const person = rows.find(r => r[0] === user);
        if (person) {
            await axios.post('https://slack.com/api/users.profile.set', { user: person[1].trim(), profile: { status_text: text, status_emoji: emoji, status_expiration: expiration } }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
        }
        res.redirect('/dashboard');
    } catch (e) { res.send(errorPage("Update fehlgeschlagen")); }
});

app.get('/empfang', async (req, res) => {
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const data = await Promise.all(rows.map(async r => ({ n: r[0], ...(await getFullStatus(r[1])) })));
        const finalData = data.filter(p => p.t.toLowerCase().includes("büro") || p.t.toLowerCase().includes("da"));
        finalData.sort((a, b) => a.n.localeCompare(b.n));
        const infoBox = currentInfoText ? `<div class="info-banner">📢 ${currentInfoText}</div>` : "";
        const cards = finalData.map(p => `<div class="card"><img src="${p.p}" class="avatar ${p.b}"><span class="name-label">${p.n}</span><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
        res.send(`<html>${htmlHead}<body>${styles}<div class="container"><h1 style="text-align:center; color:white; font-size:2.5rem;">Willkommen</h1>${infoBox}<div class="grid">${cards}</div></div></body></html>`);
    } catch (e) { res.send(errorPage(e.message)); }
});

app.get('/dashboard', async (req, res) => {
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const data = await Promise.all(rows.map(async r => ({ n: r[0], id: r[1], ...(await getFullStatus(r[1])) })));
        data.sort((a, b) => a.r - b.r);
        const cards = data.map(p => `<div class="card"><img src="${p.p}" class="avatar ${p.b}"><span class="name-label">${p.n}</span><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
        const userOptions = rows.map(r => `<option value="${r[0]}">${r[0]}</option>`).sort().join('');
        
        res.send(`<html>${htmlHead}<body>${styles}<div class="container"><h1 style="text-align:center">Dashboard</h1><div class="grid">${cards}</div></div>
        <div style="height:180px"></div>
        <div class="footer-bar">
            <form action="/update" method="get" class="footer-row">
                <select name="user" required><option value="" disabled selected>Name</option>${userOptions}</select>
                <select name="status" required><option value="da">🏢 Büro</option><option value="homeoffice">🏡 Home</option><option value="besprechung">🗓️ Termin</option></select>
                <input type="time" name="bis">
                <button type="submit" class="btn-update">Status OK</button>
            </form>
            <form action="/set-info" method="get" class="footer-row">
                <input type="text" name="text" placeholder="Neuer Infotext..." style="flex-grow:1" value="${currentInfoText}">
                <button type="submit" style="background:#32d74b; border:none; font-weight:bold;">📢 Info OK</button>
            </form>
        </div>
        </body></html>`);
    } catch (e) { res.send(errorPage(e.message)); }
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(port, '0.0.0.0', () => console.log("Server online"));
