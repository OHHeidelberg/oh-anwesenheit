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

const htmlHead = `
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OH Dashboard</title>
    <script>
        // 1. Dark/Light Mode Logik (sofort ausführen)
        (function() {
            const savedTheme = localStorage.getItem('theme');
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        })();

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        }

        // 2. Kiosk-Schutz: Nur neu laden, wenn online und Server erreichbar
        async function checkAndReload() {
            if (!navigator.onLine) return;
            try {
                const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
                if (response.ok) window.location.reload();
            } catch (e) {
                console.log("Reload abgebrochen: Server/Internet nicht bereit.");
            }
        }

        setInterval(() => {
            if (!document.hidden) checkAndReload();
        }, 60000);

        window.addEventListener('online', checkAndReload);
    </script>
</head>`;

const styles = `
<style>
  :root { 
    --bg-color: #f2f2f7; --card-bg: #ffffff; --text-color: #000000; 
    --accent-blue: #007aff; --border-color: #d1d1d6; --nav-btn-bg: #e5e5ea;
  }
  [data-theme="dark"] { 
    --bg-color: #000000; --card-bg: #1c1c1e; --text-color: #ffffff; 
    --accent-blue: #0a84ff; --border-color: #38383a; --nav-btn-bg: #2c2c2e;
  }
  
  body { font-family: -apple-system, sans-serif; background: var(--bg-color); color: var(--text-color); margin: 0; transition: background 0.3s, color 0.3s; min-height: 100vh; }
  
  .header-container { display: flex; align-items: center; justify-content: center; position: relative; width: 100%; padding: 20px 0; }
  .theme-toggle { 
    position: absolute; right: 20px; top: 25px; background: var(--nav-btn-bg); 
    border: 1px solid var(--border-color); color: var(--text-color);
    padding: 8px 12px; border-radius: 20px; cursor: pointer; font-size: 1.2rem;
  }

  .container { width: 95%; margin: 0 auto; padding-bottom: 120px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; width: 100%; }
  .card { background: var(--card-bg); padding: 15px; border-radius: 20px; text-align: center; border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: center; position: relative; }
  
  .avatar-container { width: 80px; height: 80px; margin-bottom: 10px; position: relative; cursor: pointer; text-decoration: none; }
  .avatar { width: 100%; height: 100%; border-radius: 50%; border: 3px solid var(--border-color); object-fit: cover; background: #8e8e93; }
  .avatar-placeholder { width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--border-color); background: #8e8e93; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; }

  /* Tooltip */
  .tooltip {
    visibility: hidden; width: 160px; background-color: var(--nav-btn-bg); color: var(--text-color);
    border-radius: 12px; padding: 10px; position: absolute; z-index: 100; bottom: 110%; left: 50%;
    transform: translateX(-50%); box-shadow: 0 8px 16px rgba(0,0,0,0.2); font-size: 0.75rem; border: 1px solid var(--border-color);
    opacity: 0; transition: opacity 0.2s; pointer-events: none; text-align: left;
  }
  .avatar-container:hover .tooltip { visibility: visible; opacity: 1; }
  .tooltip table { width: 100%; border-collapse: collapse; }
  .today-row { color: var(--accent-blue); font-weight: bold; }

  .name-label { font-weight: bold; font-size: 1.1rem; margin-bottom: 5px; }
  .status-badge { padding: 6px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 700; width: 90%; margin-top: auto; }
  
  .bg-active { background: rgba(50, 215, 75, 0.2); color: #32d74b; }
  .bg-home { background: rgba(255, 214, 10, 0.2); color: #ffd60a; }
  .bg-red { background: rgba(255, 69, 58, 0.2); color: #ff453a; }
  .bg-away { background: var(--nav-btn-bg); color: #8e8e93; }
  
  .info-banner { width: 100%; background: linear-gradient(135deg, #004a99, #007aff); color: white; padding: 20px; border-radius: 18px; margin-bottom: 25px; font-size: 1.6rem; font-weight: bold; text-align: center; }
  .nav-bar { display: flex; gap: 10px; margin-bottom: 25px; flex-wrap: wrap; justify-content: center; }
  .nav-btn { text-decoration: none; background: var(--nav-btn-bg); color: var(--text-color); padding: 10px 18px; border-radius: 25px; font-size: 0.9rem; font-weight: 700; border: 1px solid var(--border-color); }
  
  .footer-bar { position: fixed; bottom: 0; width: 100%; background: var(--card-bg); padding: 15px; display: flex; justify-content: center; align-items: center; gap: 10px; border-top: 1px solid var(--border-color); z-index: 1000; box-sizing: border-box; flex-wrap: wrap; }
  select, button, input { background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color); padding: 12px; border-radius: 10px; font-size: 1rem; }
  .btn-update { background: var(--accent-blue); border: none; color: #fff; font-weight: bold; cursor: pointer; }
</style>`;

function renderAvatar(person) {
    const hasPhoto = person.p && person.p.includes('http') && !person.p.includes('placeholder');
    const firstLetter = person.n ? person.n.charAt(0) : '?';
    const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const todayIndex = new Date().getDay();
    
    let tooltipRows = "";
    ["Mo", "Di", "Mi", "Do", "Fr"].forEach(day => {
        const isToday = days[todayIndex] === day;
        const start = person.times[day]?.s || "-";
        const end = person.times[day]?.e || "-";
        const isFree = person.offDays.includes(day);
        const timeStr = isFree ? "<i>Frei</i>" : (start === "-" ? "n.a." : `${start}-${end}`);
        tooltipRows += `<tr class="${isToday ? 'today-row' : ''}"><td>${day}:</td><td style="text-align:right">${timeStr}</td></tr>`;
    });

    const content = `
        ${hasPhoto ? `<img src="${person.p}" class="avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="avatar-placeholder" style="display:none;">${firstLetter}</div>` 
                   : `<div class="avatar-placeholder">${firstLetter}</div>`}
        <div class="tooltip"><table><tr><th colspan="2">Kernarbeitszeit</th></tr>${tooltipRows}</table></div>`;
    
    return person.id && person.id !== "kein" 
        ? `<a href="slack://user?id=${person.id.trim()}" class="avatar-container">${content}</a>`
        : `<div class="avatar-container">${content}</div>`;
}

async function getFullStatus(id) {
    if (!id || id.trim() === "" || id.toLowerCase() === "kein") return { t: "Abwesend", e: "⚪", c: "bg-away", r: 8 };
    try {
        const h = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const [p, s] = await Promise.all([
            axios.get(`https://slack.com/api/users.profile.get?user=${id.trim()}`, { headers: h, timeout: 5000 }).catch(() => ({data:{}})),
            axios.get(`https://slack.com/api/users.getPresence?user=${id.trim()}`, { headers: h, timeout: 5000 }).catch(() => ({data:{}}))
        ]);
        const prof = p.data.profile || {};
        const online = s.data?.presence === 'active';
        const txt = prof.status_text || "";
        const lowTxt = txt.toLowerCase();
        let res = { t: txt || (online ? "Online" : "Abwesend"), e: "📍", c: "bg-away", p: prof.image_192, r: 8 };
        
        if (online && !txt) { res.r = 2; res.c = "bg-active"; res.e = "🟢"; }
        if (lowTxt.includes("büro") || lowTxt.includes("da")) { res.c="bg-active"; res.r=1; res.e="🏢"; }
        else if (lowTxt.includes("home")) { res.c="bg-home"; res.r=3; res.e="🏡"; }
        else if (lowTxt.includes("besprechung") || lowTxt.includes("termin")) { res.c="bg-red"; res.r=4; res.e="🗓️"; }
        else if (lowTxt.includes("unterwegs")) { res.c="bg-red"; res.r=5; res.e="🚗"; }
        else if (lowTxt.includes("krank")) { res.c="bg-away"; res.r=6; res.e="🤒"; }
        else if (lowTxt.includes("urlaub")) { res.c="bg-away"; res.r=7; res.e="🌴"; }
        return res;
    } catch (e) { return { t: "Abwesend", e: "⚪", c: "bg-away", r: 8 }; }
}

async function updateData() {
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        cachedData = await Promise.all(rows.map(async r => {
            const status = await getFullStatus(r[1]);
            return { 
                n: r[0], id: r[1], ...status, 
                times: { "Mo":{s:r[3],e:r[4]}, "Di":{s:r[5],e:r[6]}, "Mi":{s:r[7],e:r[8]}, "Do":{s:r[9],e:r[10]}, "Fr":{s:r[11],e:r[12]} }, 
                offDays: r[13] ? r[13].split(',').map(d=>d.trim()) : [] 
            };
        }));
        const info = await axios.get(INFO_URL).catch(() => null);
        if (info) cachedInfoText = info.data.split('\n')[0];
    } catch (e) { console.log("Update failed"); }
}
setInterval(updateData, 120000); updateData();

app.get('/dashboard', (req, res) => {
    const data = [...cachedData].sort((a,b) => a.r - b.r || a.n.localeCompare(b.n));
    const cards = data.map(p => `<div class="card">${renderAvatar(p)}<span class="name-label">${p.n}</span><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
    const userOptions = [...cachedData].sort((a,b) => a.n.localeCompare(b.n)).map(u => `<option value="${u.n}">${u.n}</option>`).join('');
    
    res.send(`<html>${htmlHead}<body>${styles}
        <div class="header-container"><h1>Dashboard</h1><button class="theme-toggle" onclick="toggleTheme()">🌓</button></div>
        <div class="container">
            <div class="nav-bar">
                <a href="https://forms.gle/KnKo9CFDjvnMM1sj7" target="_blank" class="nav-btn">🤒 Krank</a>
                <a href="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform" target="_blank" class="nav-btn">🌴 Urlaub</a>
                <a href="https://mail.hd-werkstaetten.de/owa/" target="_blank" class="nav-btn">✉️ Outlook</a>
            </div>
            <div class="grid">${cards}</div>
        </div>
        <form action="/update" class="footer-bar">
            <select name="user" id="userSelect" required><option value="" disabled selected>Mitarbeiter</option>${userOptions}</select>
            <select name="status">
                <option value="da">🏢 Büro</option>
                <option value="homeoffice">🏡 Home</option>
                <option value="besprechung">🗓️ Besprechung</option>
                <option value="unterwegs">🚗 Unterwegs</option>
                <option value="krank">🤒 Krank</option>
                <option value="urlaub">🌴 Urlaub</option>
                <option value="weg">🌊 Abwesend</option>
            </select>
            <input type="time" name="bis"><button type="submit" class="btn-update">Update</button>
        </form>
        <script>
            const sel = document.getElementById('userSelect');
            const saved = localStorage.getItem('selectedMitarbeiter');
            if (saved) sel.value = saved;
            sel.addEventListener('change', () => localStorage.setItem('selectedMitarbeiter', sel.value));
        </script></body></html>`);
});

app.get('/update', async (req, res) => {
    const { user, status, bis } = req.query;
    const person = cachedData.find(r => r.n === user);
    if (person?.id && person.id !== "kein") {
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
            const berlin = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Berlin"}));
            let target = new Date(berlin); target.setHours(h, m, 0, 0);
            if (target < berlin) target.setDate(target.getDate() + 1);
            expiration = Math.floor(Date.now() / 1000) + Math.floor((target - berlin) / 1000);
            text += ` bis ${bis}`;
        }
        try {
            await axios.post('https://slack.com/api/users.profile.set', { user: person.id.trim(), profile: { status_text: text, status_emoji: emoji, status_expiration: expiration } }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
            await updateData();
        } catch (e) {}
    }
    res.redirect('/dashboard');
});

app.get('/empfang', (req, res) => {
    const data = [...cachedData].sort((a, b) => (a.r !== 1) - (b.r !== 1) || a.n.localeCompare(b.n));
    const infoBox = (cachedInfoText && !cachedInfoText.startsWith("<!")) ? `<div class="info-banner">📢 ${cachedInfoText}</div>` : "";
    const cards = data.map(p => {
        const atOffice = p.r === 1;
        return `<div class="card" style="opacity:${atOffice ? 1 : 0.35}">${renderAvatar(p)}<span class="name-label">${p.n}</span><div class="status-badge ${atOffice ? p.c : 'bg-away'}">${atOffice ? p.e : '⚪'} ${atOffice ? p.t : 'Abwesend'}</div></div>`;
    }).join('');
    res.send(`<html>${htmlHead}<body>${styles}
        <div class="header-container"><h1>Willkommen</h1><button class="theme-toggle" onclick="toggleTheme()">🌓</button></div>
        <div class="container">${infoBox}<div class="grid">${cards}</div></div></body></html>`);
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(port, '0.0.0.0', () => console.log("Server online"));
