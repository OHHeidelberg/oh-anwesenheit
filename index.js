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

// --- RESET LOGIK ---
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

// --- STYLES ---
const styles = `
<style>
  :root {
    --bg-color: #000000;
    --card-bg: #2c2c2e;
    --text-color: #ffffff;
    --accent-blue: #007aff;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg-color);
    color: var(--text-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden; /* Entfernt die Scrollbars komplett */
    animation: pixelShift 600s infinite alternate linear;
  }
  @keyframes pixelShift {
    0% { transform: translate(0, 0); }
    50% { transform: translate(1px, 1px); }
    100% { transform: translate(-1px, 0px); }
  }
  .container { 
    width: 95%; 
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 2vh;
    box-sizing: border-box;
  }
  
  /* Navigation (nur Dashboard) */
  .nav-bar { display: flex; gap: 12px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap; }
  .nav-btn { 
    text-decoration: none; background: #1c1c1e; color: #fff; padding: 10px 18px; border-radius: 25px; 
    font-size: 0.9rem; font-weight: 700; border: 1px solid #3a3a3c; display: flex; align-items: center; gap: 8px; 
  }

  /* Grid System optimiert für Screen-Filling */
  .grid { 
    display: grid; 
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); 
    gap: 2vh; 
    width: 100%; 
    justify-content: center;
    overflow: hidden; 
  }

  .card { 
    background: var(--card-bg); padding: 1.5vh; border-radius: 20px; text-align: center; 
    box-shadow: 0 8px 20px rgba(0,0,0,0.6); border: 1px solid #3d3d40; 
  }
  
  .avatar { width: 80px; height: 80px; border-radius: 50%; border: 3px solid #48484a; object-fit: cover; margin-bottom: 5px; }
  .border-active { border-color: #32d74b; }
  .border-red { border-color: #ff453a; }
  .border-home { border-color: #ffd60a; }
  .border-away { border-color: #48484a; filter: grayscale(1); opacity: 0.5; }

  .status-badge { margin-top: 8px; padding: 6px; border-radius: 12px; font-size: 0.85rem; font-weight: 700; display: flex; justify-content: center; align-items: center; }
  .bg-active { background: #1c3d22; color: #32d74b; border: 1px solid #245a2e; }
  .bg-red { background: #3d1c1c; color: #ff453a; border: 1px solid #632323; }
  .bg-home { background: #3d361c; color: #ffd60a; border: 1px solid #5a4b14; }
  .bg-away { background: #2c2c2e; color: #8e8e93; border: 1px solid #3a3a3c; }

  /* Banner-Größe reduziert für bessere Platznutzung */
  .info-banner { 
    width: 100%; background: linear-gradient(135deg, #004a99, #007aff); color: white; 
    padding: 2vh; border-radius: 20px; margin-bottom: 3vh; font-size: 1.8rem; 
    font-weight: bold; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; border: 1px solid #0056b3;
  }
  
  .footer-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #1c1c1e; border-top: 1px solid #333; padding: 15px; display: flex; justify-content: center; gap: 8px; z-index: 1000; }
  select, button, input { background: #2c2c2e; color: #fff; border: 1px solid #444; padding: 10px; border-radius: 8px; }
  .btn-update { background: var(--accent-blue); color: #fff; border: none; font-weight: bold; cursor: pointer; }
  .empfang-header { font-size: 3rem; margin: 1vh 0 2vh 0; color: #fff; letter-spacing: -1px; }

  /* Dashboard braucht Scrollen, Empfang nicht */
  .is-dashboard { overflow-y: auto !important; height: auto !important; }
</style>`;

// --- HELPER: Slack Status holen ---
async function getFullStatus(id) {
    try {
        const h = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const [p, s] = await Promise.all([
            axios.get(`https://slack.com/api/users.profile.get?user=${id.trim()}`, { headers: h, timeout: 4000 }).catch(() => ({data:{}})),
            axios.get(`https://slack.com/api/users.getPresence?user=${id.trim()}`, { headers: h, timeout: 4000 }).catch(() => ({data:{}}))
        ]);
        const prof = p.data.profile || {};
        const online = s.data.presence === 'active';
        const txt = prof.status_text || "";
        const lowTxt = txt.toLowerCase();
        let res = { t: txt || (online ? "Online" : "Abwesend"), e: "📍", c: "bg-away", b: "border-away", p: prof.image_192, r: 6 };
        if (lowTxt.includes("büro") || lowTxt.includes("da")) { res.c="bg-active"; res.b="border-active"; res.r=1; res.e="🏢"; }
        else if (online && !txt) { res.c="bg-active"; res.b="border-active"; res.r=2; res.e="🟢"; }
        else if (lowTxt.includes("home")) { res.c="bg-home"; res.b="border-home"; res.r=3; res.e="🏡"; }
        else if (lowTxt.includes("unterwegs") || lowTxt.includes("mobil")) { res.c="bg-red"; res.b="border-red"; res.r=4; res.e="🚗"; }
        else if (lowTxt.includes("besprechung") || lowTxt.includes("meeting") || lowTxt.includes("termin")) { res.c="bg-red"; res.b="border-red"; res.r=5; res.e="🗓️"; }
        return res;
    } catch (e) { return { t: "Fehler", e: "❓", c: "bg-away", b: "border-away", r: 9 }; }
}

// --- ROUTES ---
app.get('/update', async (req, res) => {
    const { status, user, bis } = req.query;
    const map = { da: ["Im Büro", ":office:"], homeoffice: ["Homeoffice", ":house_with_garden:"], besprechung: ["Besprechung", ":calendar:"], unterwegs: ["Unterwegs", ":car:"], krank: ["Krank", ":face_with_thermometer:"], urlaub: ["Urlaub", ":palm_tree:"], weg: ["Abwesend", ":wave:"] };
    let [text, emoji] = map[status] || ["Abwesend", ":wave:"];
    let expiration = 0;
    if (bis && bis.trim() !== "") {
        const [hours, minutes] = bis.split(':');
        const expireDate = new Date();
        expireDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        if (expireDate < new Date()) expireDate.setDate(expireDate.getDate() + 1);
        expiration = Math.floor(expireDate.getTime() / 1000);
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
    } catch (e) { res.send("Fehler."); }
});

app.get('/dashboard', async (req, res) => {
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const data = await Promise.all(rows.map(async r => ({ n: r[0], id: r[1], ...(await getFullStatus(r[1])) })));
        const nameList = [...data].sort((a, b) => a.n.localeCompare(b.n));
        data.sort((a, b) => a.r - b.r);
        const cards = data.map(p => `<div class="card"><a href="https://slack.com/app_redirect?channel=${p.id.trim()}" target="_blank" style="text-decoration:none"><img src="${p.p}" class="avatar ${p.b}"></a><div style="margin:8px 0;font-weight:bold">${p.n}</div><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
        const userOptions = nameList.map(u => `<option value="${u.n}">${u.n}</option>`).join('');
        const navBar = `<div class="nav-bar">
            <a href="https://forms.gle/KnKo9CFDjvnMM1sj7" target="_blank" class="nav-btn btn-krank">🤒 Krankmelden</a>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform" target="_blank" class="nav-btn btn-urlaub">🌴 Urlaubsantrag</a>
            <a href="https://mail.hd-werkstaetten.de/owa/" target="_blank" class="nav-btn btn-outlook">✉️ Outlook</a>
            <a href="https://ohheidelberg.github.io/oh-dokumente/?id=admin99" target="_blank" class="nav-btn btn-docs">📂 Dokumente</a>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSetlNl4LucOcOEh1uA3ozTPjEoeHoG4Sq74WQAygS8F_fsKEg/viewform" target="_blank" class="nav-btn btn-server">⚠️ Server</a>
        </div>`;
        const footerForm = `<form action="/update" method="get" class="footer-bar" onsubmit="localStorage.setItem('lastUser', document.getElementById('userSelect').value)">
            <select name="user" id="userSelect" required><option value="" disabled selected>Mitarbeiter</option>${userOptions}</select>
            <select name="status" required><option value="da">🏢 Im Büro</option><option value="homeoffice">🏡 Homeoffice</option><option value="besprechung">🗓️ Besprechung</option><option value="unterwegs">🚗 Unterwegs</option><option value="krank">🤒 Krank</option><option value="urlaub">🌴 Urlaub</option><option value="weg">⚪ Abwesend</option></select>
            <input type="time" name="bis">
            <button type="submit" class="btn-update">Update</button>
        </form><script>if(localStorage.getItem('lastUser')) document.getElementById('userSelect').value = localStorage.getItem('lastUser');</script>`;
        res.send(`<html><head><meta http-equiv="refresh" content="60"></head><body class="is-dashboard">${styles}<div class="container"><h1>Offene Hilfen Dashboard</h1>${navBar}<div class="grid">${cards}</div></div>${footerForm}</body></html>`);
    } catch (e) { res.status(500).send("Fehler."); }
});

app.get('/empfang', async (req, res) => {
    try {
        let infoText = "";
        try {
            const infoCsv = await axios.get(INFO_URL);
            infoText = infoCsv.data.split('\n')[0]; 
        } catch (e) {}
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const data = await Promise.all(rows.map(async r => ({ n: r[0], ...(await getFullStatus(r[1])) })));
        const finalData = data.map(p => {
            const isPresent = p.t.toLowerCase().includes("büro") || p.t.toLowerCase().includes("da");
            return isPresent ? p : { ...p, t: "Abwesend", e: "⚪", c: "bg-away", b: "border-away" };
        });
        finalData.sort((a, b) => (a.t === "Abwesend") - (b.t === "Abwesend") || a.n.localeCompare(b.n));
        const infoBox = (infoText && infoText.trim() !== "" && !infoText.startsWith("<!DOCTYPE")) ? `<div class="info-banner">📢 ${infoText}</div>` : "";
        const cards = finalData.map(p => `<div class="card"><img src="${p.p}" class="avatar ${p.b}" onerror="this.src='https://via.placeholder.com/75'"><div style="margin:8px 0;font-weight:bold;font-size:1.1rem">${p.n}</div><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
        res.send(`<html><head><meta http-equiv="refresh" content="60"></head><body>${styles}<div class="container"><h1 class="empfang-header">Willkommen</h1>${infoBox}<div class="grid">${cards}</div></div></body></html>`);
    } catch (e) { res.status(500).send("Fehler."); }
});

app.get('/trigger-reset', async (req, res) => {
    const success = await resetAllStatuses();
    res.send(success ? "Reset abgeschlossen" : "Fehler");
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(port, '0.0.0.0', () => console.log("Server online"));
