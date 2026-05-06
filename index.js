const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';
const INFO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?gid=1558993151&single=true&output=csv';

let cachedData = [];
let cachedInfoText = "";
let lastSelectedUser = ""; 

const htmlHead = `
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OH Dashboard</title>
    <script>
        // Sanfterer Reload: Nur wenn die Seite auch wirklich im Fokus ist
        setInterval(() => {
            if (!document.hidden) {
                window.location.href = window.location.pathname + window.location.search;
            }
        }, 60000);
    </script>
</head>`;

const styles = `
<style>
  :root { --bg-color: #000; --card-bg: #2c2c2e; --text-color: #fff; --accent-blue: #007aff; }
  body { font-family: -apple-system, sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
  .container { width: 95%; padding: 20px 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; width: 100%; }
  .card { background: var(--card-bg); padding: 15px; border-radius: 20px; text-align: center; border: 1px solid #3d3d40; display: flex; flex-direction: column; align-items: center; transition: opacity 0.3s; }
  .avatar-container { width: 80px; height: 80px; margin-bottom: 10px; position: relative; cursor: pointer; text-decoration: none; }
  .avatar { width: 100%; height: 100%; border-radius: 50%; border: 3px solid #48484a; object-fit: cover; background: #3a3a3c; }
  .avatar-placeholder { 
    width: 80px; height: 80px; border-radius: 50%; border: 3px solid #48484a;
    background: #444; color: #aaa; display: flex; align-items: center; justify-content: center;
    font-size: 2rem; font-weight: bold; text-transform: uppercase;
  }
  .border-active { border-color: #32d74b !important; }
  .border-home { border-color: #ffd60a !important; }
  .border-red { border-color: #ff453a !important; }
  .border-away { border-color: #48484a !important; }
  .name-label { font-weight: bold; font-size: 1.1rem; margin-bottom: 5px; }
  .status-badge { padding: 6px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 700; width: 90%; margin-top: auto; }
  .bg-active { background: #1c3d22; color: #32d74b; }
  .bg-home { background: #3d361c; color: #ffd60a; }
  .bg-red { background: #3d1c1c; color: #ff453a; }
  .bg-away { background: #2c2c2e; color: #8e8e93; }
  .info-banner { width: 100%; background: linear-gradient(135deg, #004a99, #007aff); color: white; padding: 20px; border-radius: 18px; margin-bottom: 25px; font-size: 1.6rem; font-weight: bold; text-align: center; }
  .nav-bar { display: flex; gap: 10px; margin-bottom: 25px; flex-wrap: wrap; justify-content: center; }
  .nav-btn { text-decoration: none; background: #1c1c1e; color: #fff; padding: 10px 18px; border-radius: 25px; font-size: 0.9rem; font-weight: 700; border: 1px solid #3a3a3c; }
  .footer-bar { position: fixed; bottom: 0; width: 100%; background: #1c1c1e; padding: 15px; display: flex; justify-content: center; align-items: center; gap: 10px; border-top: 1px solid #333; z-index: 1000; flex-wrap: wrap; box-sizing: border-box; }
  select, button, input { background: #2c2c2e; color: #fff; border: 1px solid #444; padding: 12px; border-radius: 10px; font-size: 1rem; }
  .btn-update { background: var(--accent-blue); border: none; font-weight: bold; cursor: pointer; }
</style>`;

function renderAvatar(person) {
    const hasPhoto = person.p && person.p.includes('http') && !person.p.includes('placeholder');
    const firstLetter = person.n ? person.n.charAt(0) : '?';
    const borderColor = person.b || 'border-away';
    const content = hasPhoto 
        ? `<img src="${person.p}" class="avatar ${borderColor}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <div class="avatar-placeholder ${borderColor}" style="display:none;">${firstLetter}</div>`
        : `<div class="avatar-placeholder ${borderColor}">${firstLetter}</div>`;
    
    if (person.id && person.id !== "kein") {
        return `<a href="slack://user?id=${person.id.trim()}" class="avatar-container">${content}</a>`;
    }
    return `<div class="avatar-container">${content}</div>`;
}

async function getFullStatus(id, name) {
    if (!id || id.trim() === "" || id.toLowerCase() === "kein") {
        return { t: "Abwesend", e: "⚪", c: "bg-away", b: "border-away", p: null, r: 8 };
    }
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
        
        let res = { t: txt || (online ? "Online" : "Abwesend"), e: "📍", c: "bg-away", b: "border-away", p: prof.image_192, r: 8 };
        
        if (online && !txt) { 
            res.r = 2; res.c = "bg-active"; res.b = "border-active"; res.e = "🟢";
        }

        if (lowTxt.includes("büro") || lowTxt.includes("da")) { res.c="bg-active"; res.b="border-active"; res.r=1; res.e="🏢"; }
        else if (lowTxt.includes("home")) { res.c="bg-home"; res.b="border-home"; res.r=3; res.e="🏡"; }
        else if (lowTxt.includes("besprechung") || lowTxt.includes("termin")) { res.c="bg-red"; res.b="border-red"; res.r=4; res.e="🗓️"; }
        else if (lowTxt.includes("unterwegs")) { res.c="bg-red"; res.b="border-red"; res.r=5; res.e="🚗"; }
        else if (lowTxt.includes("krank")) { res.c="bg-away"; res.b="border-away"; res.r=6; res.e="🤒"; }
        else if (lowTxt.includes("urlaub")) { res.c="bg-away"; res.b="border-away"; res.r=7; res.e="🌴"; }
        
        return res;
    } catch (e) { 
        return { t: "Abwesend", e: "⚪", c: "bg-away", b: "border-away", p: null, r: 8 };
    }
}

async function updateData() {
    try {
        const csv = await axios.get(CSV_URL, { timeout: 10000 });
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const newData = await Promise.all(rows.map(async r => {
            const status = await getFullStatus(r[1], r[0]);
            return { n: r[0], id: r[1], ...status };
        }));
        if (newData.length > 0) cachedData = newData;
        const infoCsv = await axios.get(INFO_URL, { timeout: 5000 }).catch(() => null);
        if (infoCsv) cachedInfoText = infoCsv.data.split('\n')[0];
    } catch (e) { console.log("Cache update failed"); }
}

setInterval(updateData, 120000);
updateData();

app.get('/empfang', (req, res) => {
    const data = [...cachedData];
    // Sortierung: Büro-Leute nach oben, dann alphabetisch
    data.sort((a, b) => (a.r !== 1) - (b.r !== 1) || a.n.localeCompare(b.n));
    
    const infoBox = (cachedInfoText && !cachedInfoText.startsWith("<!")) ? `<div class="info-banner">📢 ${cachedInfoText}</div>` : "";
    
    const cards = data.map(p => {
        // Empfang-Spezifische Logik: Nur R1 (Büro) wird farbig/echt angezeigt
        const isAtOffice = p.r === 1;
        const statusText = isAtOffice ? p.t : "Abwesend";
        const statusEmoji = isAtOffice ? p.e : "⚪";
        const statusClass = isAtOffice ? p.c : "bg-away";
        const cardOpacity = isAtOffice ? "1.0" : "0.35";
        
        return `
        <div class="card" style="opacity:${cardOpacity}">
            ${renderAvatar(p)}
            <span class="name-label">${p.n}</span>
            <div class="status-badge ${statusClass}">${statusEmoji} ${statusText}</div>
        </div>`;
    }).join('');
    
    res.send(`<html>${htmlHead}<body>${styles}<div class="container"><h1 style="text-align:center; font-size:2.5rem;">Willkommen</h1>${infoBox}<div class="grid">${cards}</div></div></body></html>`);
});

app.get('/dashboard', (req, res) => {
    const data = [...cachedData].sort((a, b) => a.r - b.r || a.n.localeCompare(b.n));
    const cards = data.map(p => `<div class="card">${renderAvatar(p)}<span class="name-label">${p.n}</span><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
    
    // Alphabetisch sortierte Mitarbeiter für das Dropdown
    const userOptions = [...cachedData].sort((a,b) => a.n.localeCompare(b.n))
        .map(u => `<option value="${u.n}">${u.n}</option>`).join('');
    
    const navBar = `
    <div class="nav-bar">
        <a href="https://forms.gle/KnKo9CFDjvnMM1sj7" target="_blank" class="nav-btn">🤒 Krank</a>
        <a href="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform" target="_blank" class="nav-btn">🌴 Urlaub</a>
        <a href="https://mail.hd-werkstaetten.de/owa/" target="_blank" class="nav-btn">✉️ Outlook</a>
        <a href="https://ohheidelberg.github.io/oh-dokumente/?id=admin99" target="_blank" class="nav-btn">📂 Dokumente</a>
        <a href="https://status.render.com/" target="_blank" class="nav-btn">⚠️ Serverprobleme</a>
    </div>`;

    const footer = `
    <form action="/update" class="footer-bar" id="updateForm">
        <select name="user" id="userSelect" required>
            <option value="" disabled selected>Mitarbeiter</option>
            ${userOptions}
        </select>
        <select name="status">
            <option value="da">🏢 Büro</option>
            <option value="homeoffice">🏡 Home</option>
            <option value="besprechung">🗓️ Termin</option>
            <option value="unterwegs">🚗 Unterwegs</option>
            <option value="krank">🤒 Krank</option>
            <option value="urlaub">🌴 Urlaub</option>
            <option value="weg">🌊 Abwesend</option>
        </select>
        <input type="time" name="bis">
        <button type="submit" class="btn-update">Update</button>
    </form>
    
    <script>
        // Lokales Gedächtnis Script
        const select = document.getElementById('userSelect');
        
        // 1. Beim Laden: Schauen, ob ein Name gespeichert ist
        const savedUser = localStorage.getItem('selectedMitarbeiter');
        if (savedUser) {
            select.value = savedUser;
        }

        // 2. Beim Ändern: Namen im Browser speichern
        select.addEventListener('change', () => {
            localStorage.setItem('selectedMitarbeiter', select.value);
        });
    </script>`;

    res.send(`<html>${htmlHead}<body>${styles}<div class="container"><h1 style="text-align:center">Dashboard</h1>${navBar}<div class="grid">${cards}</div></div><div style="height:150px"></div>${footer}</body></html>`);
});

app.get('/update', async (req, res) => {
    const { user, status, bis } = req.query;
    lastSelectedUser = user;
    const person = cachedData.find(r => r.n === user);
    if (person && person.id && person.id !== "kein") {
        const map = { 
            da: ["Im Büro", ":office:"], 
            homeoffice: ["Homeoffice", ":house_with_garden:"], 
            besprechung: ["Besprechung", ":calendar:"], 
            unterwegs: ["Unterwegs", ":car:"], 
            krank: ["Krank", ":face_with_thermometer:"],
            urlaub: ["Urlaub", ":palm_tree:"],
            weg: ["Abwesend", ":wave:"] 
        };
        let [text, emoji] = map[status] || ["Im Büro", ":office:"];
        let expiration = 0;
        
        if (bis) {
            const [h, m] = bis.split(':');
            const nowInBerlin = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Berlin"}));
            let targetDate = new Date(nowInBerlin);
            targetDate.setHours(parseInt(h), parseInt(m), 0, 0);
            
            if (targetDate < nowInBerlin) {
                targetDate.setDate(targetDate.getDate() + 1);
            }
            
            const secondsDiff = Math.floor((targetDate.getTime() - nowInBerlin.getTime()) / 1000);
            expiration = Math.floor(Date.now() / 1000) + secondsDiff;
            text += ` bis ${bis}`;
        }

        try {
            await axios.post('https://slack.com/api/users.profile.set', { 
                user: person.id.trim(), 
                profile: { 
                    status_text: text, 
                    status_emoji: emoji, 
                    status_expiration: expiration 
                } 
            }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
            
            await updateData();
        } catch (e) { console.error("Slack Update Error"); }
    }
    res.redirect('/dashboard');
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(port, '0.0.0.0', () => console.log("Server online"));
