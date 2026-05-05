const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const cron = require('node-cron');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';
const INFO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?gid=1558993151&single=true&output=csv';

// --- INTERNER SPEICHER (CACHE) ---
let cachedData = [];
let cachedInfoText = "";

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

const styles = `
<style>
  :root { --bg-color: #000; --card-bg: #2c2c2e; --text-color: #fff; --accent-blue: #007aff; }
  body { font-family: -apple-system, sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
  .container { width: 95%; padding: 20px 0; box-sizing: border-box; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; width: 100%; }
  .card { background: var(--card-bg); padding: 15px; border-radius: 20px; text-align: center; border: 1px solid #3d3d40; display: flex; flex-direction: column; align-items: center; }
  .avatar { width: 80px; height: 80px; border-radius: 50%; border: 3px solid #48484a; object-fit: cover; margin-bottom: 10px; background: #444; }
  .border-active { border-color: #32d74b; } .border-away { border-color: #48484a; opacity: 0.6; }
  .name-label { font-weight: bold; font-size: 1.1rem; margin-bottom: 5px; }
  .status-badge { padding: 6px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 700; width: 90%; margin-top: auto; }
  .bg-active { background: #1c3d22; color: #32d74b; } .bg-away { background: #2c2c2e; color: #8e8e93; }
  .info-banner { width: 100%; background: linear-gradient(135deg, #004a99, #007aff); color: white; padding: 20px; border-radius: 18px; margin-bottom: 25px; font-size: 1.6rem; font-weight: bold; text-align: center; }
  .footer-bar { position: fixed; bottom: 0; width: 100%; background: #1c1c1e; padding: 15px; display: flex; justify-content: center; gap: 10px; border-top: 1px solid #333; z-index: 1000; }
  select, button { background: #2c2c2e; color: #fff; border: 1px solid #444; padding: 12px; border-radius: 10px; }
  .nav-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center; }
  .nav-btn { text-decoration: none; background: #1c1c1e; color: #fff; padding: 10px 15px; border-radius: 20px; border: 1px solid #333; font-size: 0.9rem; }
</style>`;

async function getFullStatus(id) {
    try {
        const h = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const [p, s] = await Promise.all([
            axios.get(`https://slack.com/api/users.profile.get?user=${id.trim()}`, { headers: h, timeout: 7000 }).catch(() => ({data:{}})),
            axios.get(`https://slack.com/api/users.getPresence?user=${id.trim()}`, { headers: h, timeout: 7000 }).catch(() => ({data:{}}))
        ]);
        const prof = p.data.profile || {};
        const online = s.data.presence === 'active';
        const txt = prof.status_text || "";
        const lowTxt = txt.toLowerCase();
        let res = { t: txt || (online ? "Online" : "Abwesend"), e: "📍", c: "bg-away", b: "border-away", p: prof.image_192 || 'https://via.placeholder.com/192', r: 6 };
        if (lowTxt.includes("büro") || lowTxt.includes("da")) { res.c="bg-active"; res.b="border-active"; res.r=1; res.e="🏢"; }
        else if (online && !txt) { res.c="bg-active"; res.b="border-active"; res.r=2; res.e="🟢"; }
        return res;
    } catch (e) { return null; }
}

async function updateData() {
    try {
        const csv = await axios.get(CSV_URL, { timeout: 10000 });
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const newData = await Promise.all(rows.map(async r => {
            const status = await getFullStatus(r[1]);
            return status ? { n: r[0], id: r[1], ...status } : null;
        }));
        
        const filtered = newData.filter(d => d !== null);
        if (filtered.length > 0) cachedData = filtered; // Nur überschreiben wenn Daten da sind

        const infoCsv = await axios.get(INFO_URL, { timeout: 5000 }).catch(() => null);
        if (infoCsv) cachedInfoText = infoCsv.data.split('\n')[0];
    } catch (e) { console.error("Update failed, using cache"); }
}

// Alle 2 Minuten im Hintergrund aktualisieren
setInterval(updateData, 120000);
updateData();

app.get('/empfang', async (req, res) => {
    // Wenn Cache leer, versuche sofort zu laden
    if (cachedData.length === 0) await updateData();
    
    const finalData = cachedData.map(p => {
        const isPresent = p.t.toLowerCase().includes("büro") || p.t.toLowerCase().includes("da") || p.r === 2;
        return isPresent ? p : { ...p, t: "Abwesend", e: "⚪", c: "bg-away", b: "border-away" };
    });
    
    finalData.sort((a, b) => (a.t === "Abwesend") - (b.t === "Abwesend") || a.n.localeCompare(b.n));
    const infoBox = (cachedInfoText && !cachedInfoText.startsWith("<!")) ? `<div class="info-banner">📢 ${cachedInfoText}</div>` : "";
    const cards = finalData.map(p => `<div class="card"><img src="${p.p}" class="avatar ${p.b}" onerror="this.src='https://via.placeholder.com/192'"><span class="name-label">${p.n}</span><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
    
    res.send(`<html>${htmlHead}<body>${styles}<div class="container"><h1 style="text-align:center; font-size:2.5rem;">Willkommen</h1>${infoBox}<div class="grid">${cards}</div></div></body></html>`);
});

app.get('/dashboard', async (req, res) => {
    if (cachedData.length === 0) await updateData();
    const data = [...cachedData].sort((a, b) => a.r - b.r);
    const cards = data.map(p => `<div class="card"><img src="${p.p}" class="avatar ${p.b}" onerror="this.src='https://via.placeholder.com/192'"><span class="name-label">${p.n}</span><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
    const userOptions = [...cachedData].sort((a,b) => a.n.localeCompare(b.n)).map(u => `<option value="${u.n}">${u.n}</option>`).join('');
    
    const navBar = `<div class="nav-bar"><a href="https://forms.gle/KnKo9CFDjvnMM1sj7" target="_blank" class="nav-btn">🤒 Krank</a><a href="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform" target="_blank" class="nav-btn">🌴 Urlaub</a></div>`;
    
    res.send(`<html>${htmlHead}<body>${styles}<div class="container"><h1>Dashboard</h1>${navBar}<div class="grid">${cards}</div></div>
    <div style="height:120px"></div>
    <form action="/update" class="footer-bar">
        <select name="user">${userOptions}</select>
        <button type="submit" style="background:#007aff; border:none; font-weight:bold;">📍 Im Büro</button>
    </form></body></html>`);
});

app.get('/update', async (req, res) => {
    const { user } = req.query;
    const person = cachedData.find(r => r.n === user);
    if (person) {
        try {
            await axios.post('https://slack.com/api/users.profile.set', { user: person.id.trim(), profile: { status_text: "Im Büro", status_emoji: ":office:" } }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
            await updateData(); // Cache sofort aktualisieren
        } catch (e) {}
    }
    res.redirect('/dashboard');
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(port, '0.0.0.0', () => console.log("Server online"));
