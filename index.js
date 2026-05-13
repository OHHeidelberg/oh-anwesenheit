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
let pauseStorage = {}; 

const htmlHead = `
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>OH Dashboard</title>
    <script>
        (function() {
            const savedTheme = localStorage.getItem('theme');
            const isEmpfang = window.location.pathname.includes('/empfang');
            if (savedTheme === 'dark' || (isEmpfang && !savedTheme)) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else if (savedTheme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
            } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        })();

        function applyBurnInProtection() {
            const shiftX = Math.floor(Math.random() * 3) - 1;
            const shiftY = Math.floor(Math.random() * 3) - 1;
            document.body.style.transform = "translate(" + shiftX + "px, " + shiftY + "px)";
        }
        setInterval(applyBurnInProtection, 300000); 

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        }

        async function checkAndReload() {
            if (!navigator.onLine) return;
            try {
                const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
                if (response.ok) window.location.reload();
            } catch (e) {}
        }
        setInterval(() => { if (!document.hidden) checkAndReload(); }, 60000);
        window.addEventListener('online', checkAndReload);
    </script>
</head>`;

const styles = `
<style>
  :root { --bg-color: #f2f2f7; --card-bg: #ffffff; --text-color: #000000; --accent-blue: #007aff; --border-color: #d1d1d6; --nav-btn-bg: #e5e5ea; }
  [data-theme="dark"] { --bg-color: #000000; --card-bg: #1c1c1e; --text-color: #ffffff; --accent-blue: #0a84ff; --border-color: #38383a; --nav-btn-bg: #2c2c2e; }
  
  html, body { height: 100vh; margin: 0; padding: 0; overflow: hidden; }
  body { font-family: -apple-system, sans-serif; background: var(--bg-color); color: var(--text-color); display: flex; flex-direction: column; padding: 1vh 1vw; box-sizing: border-box; }

  .container { flex: 1; display: flex; flex-direction: column; overflow: hidden; gap: 1vh; }

  .grid { 
    flex: 1; display: grid; 
    grid-template-columns: repeat(auto-fill, minmax(14vw, 1fr)); 
    grid-auto-rows: 1fr; gap: 10px; width: 100%; overflow-y: auto; 
    padding-right: 5px;
  }

  .grid::-webkit-scrollbar { width: 6px; }
  .grid::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 10px; }

  .card { 
    background: var(--card-bg); padding: 10px; border-radius: 12px; border: 1px solid var(--border-color);
    display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 0;
    position: relative;
  }

  .avatar-container { height: 45%; aspect-ratio: 1/1; margin-bottom: 8px; text-decoration: none; position: relative; }
  .avatar { width: 100%; height: 100%; border-radius: 50%; border: 2px solid var(--border-color); object-fit: cover; background: #8e8e93; }
  .avatar-placeholder { width: 100%; height: 100%; border-radius: 50%; background: #8e8e93; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold; }
  
  .name-label { font-weight: bold; font-size: clamp(0.9rem, 1.1vw, 1.2rem); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 95%; text-align: center; }

  .status-badge { 
    padding: 5px 8px; border-radius: 10px; font-size: clamp(0.7rem, 0.85vw, 0.95rem); font-weight: 700; width: 90%; 
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; cursor: help; position: relative;
  }

  .status-badge:hover::after {
    content: attr(data-worktimes);
    position: absolute; bottom: 125%; left: 50%; transform: translateX(-50%);
    background: #333; color: #fff; padding: 10px; border-radius: 8px;
    font-size: 0.8rem; white-space: pre-wrap; z-index: 100; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    width: max-content; text-align: left; line-height: 1.4;
  }

  .bg-active { background: rgba(50, 215, 75, 0.2); color: #32d74b; }
  .bg-home { background: rgba(255, 214, 10, 0.2); color: #ffd60a; }
  .bg-red { background: rgba(255, 69, 58, 0.2); color: #ff453a; }
  .bg-away { background: var(--nav-btn-bg); color: #8e8e93; }

  .nav-bar { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; justify-content: center; align-items: center; margin-bottom: 5px; }
  .nav-btn, .theme-btn { text-decoration: none; background: var(--nav-btn-bg); color: var(--text-color); padding: 8px 14px; border-radius: 15px; font-size: 0.85rem; font-weight: 700; border: 1px solid var(--border-color); cursor: pointer; }

  .footer-bar { height: 8vh; min-height: 60px; background: var(--card-bg); margin-top: 5px; padding: 0 15px; display: flex; justify-content: center; align-items: center; gap: 10px; border-radius: 12px; border: 1px solid var(--border-color); flex-shrink: 0; }
  
  select, button, input { background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px; border-radius: 8px; font-size: 0.95rem; }
  .btn-update { background: var(--accent-blue); border: none; color: #fff; font-weight: bold; cursor: pointer; padding: 8px 16px; }

  .info-banner-container { display: flex; align-items: center; gap: 10px; height: 7vh; flex-shrink: 0; }
  .info-banner { flex: 1; height: 100%; background: linear-gradient(135deg, #004a99, #007aff); color: white; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 1.4rem; font-weight: bold; }

  @media (max-width: 800px) {
    html, body { overflow: auto; height: auto; }
    .container { overflow: visible; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); grid-auto-rows: 160px; overflow: visible; }
    .footer-bar { height: auto; padding: 15px; flex-direction: column; align-items: stretch; }
    .avatar-container { height: 60px; }
  }
</style>`;

function getWorkTimeList(person) {
    const daysArr = ["Mo", "Di", "Mi", "Do", "Fr"];
    const berlinTime = new Date().toLocaleString("en-US", {timeZone: "Europe/Berlin"});
    const todayNum = new Date(berlinTime).getDay();
    const today = daysArr[todayNum - 1]; 
    
    return daysArr.map(d => {
        let timeStr = "Frei";
        if (!person.offDays?.includes(d)) {
            const t = person.times?.[d];
            timeStr = (t && t.s && t.e) ? `${t.s}-${t.e}` : "k.A.";
        }
        return (d === today) ? `▶ ${d}: ${timeStr} ◀` : `  ${d}: ${timeStr}`;
    }).join('\n');
}

function renderAvatar(person) {
    const hasPhoto = person.p && person.p.includes('http') && !person.p.includes('placeholder');
    const firstLetter = person.n ? person.n.charAt(0) : '?';
    const content = hasPhoto ? `<img src="${person.p}" class="avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="avatar-placeholder" style="display:none;">${firstLetter}</div>` : `<div class="avatar-placeholder">${firstLetter}</div>`;
    return person.id && person.id !== "kein" ? `<a href="slack://user?id=${person.id.trim()}" class="avatar-container">${content}</a>` : `<div class="avatar-container">${content}</div>`;
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
        else if (lowTxt.includes("pause")) { res.c="bg-home"; res.r=3.5; res.e="🥪"; }
        else if (lowTxt.includes("uni")) { res.c="bg-home"; res.r=3.6; res.e="🎓"; }
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
    } catch (e) {}
}

setInterval(updateData, 120000); updateData();

app.get('/dashboard', (req, res) => {
    const userOptions = [...cachedData].sort((a,b) => a.n.localeCompare(b.n)).map(u => `<option value="${u.n}">${u.n}</option>`).join('');
    const cards = [...cachedData].sort((a,b) => a.r - b.r || a.n.localeCompare(b.n)).map(p => {
        const wtList = getWorkTimeList(p);
        return `<div class="card">${renderAvatar(p)}<span class="name-label">${p.n}</span><div class="status-badge ${p.c}" data-worktimes="Kernarbeitszeiten:\n${wtList}">${p.e} ${p.t}</div></div>`;
    }).join('');
    res.send(`<html>${htmlHead}<body>${styles}
        <div class="container">
            <div class="nav-bar">
                <a href="https://forms.gle/KnKo9CFDjvnMM1sj7" target="_blank" class="nav-btn">🤒 Krank</a>
                <a href="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform" target="_blank" class="nav-btn">🌴 Urlaub</a>
                <a href="https://ohheidelberg.github.io/oh-dokumente/?id=admin99" target="_blank" class="nav-btn">📂 Dokumente</a>
                <button class="theme-btn" onclick="toggleTheme()">🌓 Theme</button>
            </div>
            <div class="grid">${cards}</div>
            <form action="/update" class="footer-bar">
                <select name="user" id="userSelect" required><option value="" disabled selected>Mitarbeiter</option>${userOptions}</select>
                <select name="status">
                    <option value="da">🏢 Büro</option>
                    <option value="homeoffice">🏡 Homeoffice</option>
                    <option value="besprechung">🗓️ Besprechung</option>
                    <option value="unterwegs">🚗 Unterwegs</option>
                    <option value="uni">🎓 Uni</option>
                    <option value="pause">🥪 Pause</option>
                    <option value="weg">🌊 Abwesend</option>
                </select>
                <input type="time" name="bis"><button type="submit" class="btn-update">Update</button>
            </form>
        </div>
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
        const h = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const map = { 
            da:["Im Büro",":office:"], 
            homeoffice:["Homeoffice",":house_with_garden:"], 
            besprechung:["Besprechung",":calendar:"], 
            unterwegs:["Unterwegs",":car:"], 
            uni:["Uni",":mortar_board:"], 
            pause:["Pause",":sandwich:"], 
            weg:["Abwesend",":wave:"] 
        };
        let [text, emoji] = map[status] || ["Im Büro", ":office:"];
        let expiration = 0;
        if (bis) {
            const [hours, minutes] = bis.split(':');
            const berlin = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Berlin"}));
            let target = new Date(berlin); target.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            if (target < berlin) target.setDate(target.getDate() + 1);
            expiration = Math.floor(Date.now() / 1000) + Math.floor((target - berlin) / 1000);
            text += ` bis ${bis}`;
        }
        try {
            await axios.post('https://slack.com/api/users.profile.set', { user: person.id.trim(), profile: { status_text: text, status_emoji: emoji, status_expiration: expiration } }, { headers: h });
            await updateData();
        } catch (e) {}
    }
    res.redirect('/dashboard');
});

app.get('/empfang', (req, res) => {
    const data = [...cachedData].sort((a, b) => (a.r !== 1) - (b.r !== 1) || a.n.localeCompare(b.n));
    const infoText = (cachedInfoText && !cachedInfoText.startsWith("<!")) ? `📢 ${cachedInfoText}` : "OH Heidelberg";
    const cards = data.map(p => {
        const atOffice = p.r === 1;
        const wtList = getWorkTimeList(p);
        return `<div class="card" style="opacity:${atOffice ? 1 : 0.3}">${renderAvatar(p)}<span class="name-label">${p.n}</span><div class="status-badge ${atOffice ? p.c : 'bg-away'}" data-worktimes="Kernarbeitszeiten:\n${wtList}">${atOffice ? p.e : '⚪'} ${atOffice ? p.t : 'Abwesend'}</div></div>`;
    }).join('');
    res.send(`<html>${htmlHead}<body>${styles}
        <div class="container">
            <div class="info-banner-container">
                <div class="info-banner">${infoText}</div>
                <button class="theme-btn" style="height:100%; padding: 0 20px; border-radius: 12px; font-size: 1.2rem;" onclick="toggleTheme()">🌓 Theme</button>
            </div>
            <div class="grid">${cards}</div>
        </div></body></html>`);
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(port, '0.0.0.0', () => console.log("Server online"));
