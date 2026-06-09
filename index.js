const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

const INFO_FILE = './info.json';

let cachedData = [];
let cachedInfoText = "";
let pauseStorage = {};


// ======================================================
// INFO TEXT LADEN
// ======================================================

try {
    if (fs.existsSync(INFO_FILE)) {
        const saved = JSON.parse(fs.readFileSync(INFO_FILE, 'utf8'));
        cachedInfoText = saved.text || "";
    }
} catch (e) {
    console.log("Keine Info-Datei gefunden");
}


// ======================================================
// HTML ESCAPE
// ======================================================

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ======================================================
// HTML HEAD
// ======================================================

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
                const response = await fetch(window.location.href, {
                    method: 'HEAD',
                    cache: 'no-store'
                });

                if (response.ok) {
                    window.location.reload();
                }
            } catch (e) {}
        }

        setInterval(() => {
            if (!document.hidden) checkAndReload();
        }, 60000);

        window.addEventListener('online', checkAndReload);
    </script>
</head>
`;


// ======================================================
// STYLES
// ======================================================

const styles = `
<style>

:root {
    --bg-color: #f2f2f7;
    --card-bg: #ffffff;
    --text-color: #000000;
    --accent-blue: #007aff;
    --border-color: #d1d1d6;
    --nav-btn-bg: #e5e5ea;
    --tooltip-today: #007aff;
}

[data-theme="dark"] {
    --bg-color: #000000;
    --card-bg: #1c1c1e;
    --text-color: #ffffff;
    --accent-blue: #0a84ff;
    --border-color: #38383a;
    --nav-btn-bg: #2c2c2e;
    --tooltip-today: #5ac8fa;
}

html, body {
    height: 100vh;
    margin: 0;
    padding: 0;
    overflow: hidden;
}

body {
    font-family: -apple-system, sans-serif;
    background: var(--bg-color);
    color: var(--text-color);
    display: flex;
    flex-direction: column;
    padding: 1vh 1vw;
    box-sizing: border-box;
}

.container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    gap: 1vh;
    height: 100%;
}

.grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11vw, 1fr));
    grid-auto-rows: minmax(120px, 1fr);
    gap: 1vh;
    width: 100%;
    overflow-y: auto;
    padding: 0.5vh;
    box-sizing: border-box;
}

.card {
    background: var(--card-bg);
    padding: 8px;
    border-radius: 12px;
    border: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.avatar-container {
    height: clamp(45px, 4.5vw, 65px);
    width: clamp(45px, 4.5vw, 65px);
    margin-bottom: 4px;
    text-decoration: none;
    display: block;
}

.avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2px solid var(--border-color);
    object-fit: cover;
}

.avatar-placeholder {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: #8e8e93;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: bold;
}

.name-label {
    font-weight: bold;
    margin-bottom: 4px;
}

.status-badge {
    padding: 4px 8px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 700;
    width: 90%;
    text-align: center;
}

.bg-active {
    background: rgba(50,215,75,0.2);
    color: #32d74b;
}

.bg-home {
    background: rgba(255,214,10,0.2);
    color: #ffd60a;
}

.bg-red {
    background: rgba(255,69,58,0.2);
    color: #ff453a;
}

.bg-away {
    background: var(--nav-btn-bg);
    color: #8e8e93;
}

.nav-bar {
    display: flex;
    gap: 6px;
    justify-content: center;
    flex-wrap: wrap;
}

.nav-btn,
.theme-btn {
    text-decoration: none;
    background: var(--nav-btn-bg);
    color: var(--text-color);
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 700;
    border: 1px solid var(--border-color);
    cursor: pointer;
}

.footer-bar {
    height: 6vh;
    min-height: 45px;
    background: var(--card-bg);
    padding: 0 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    border-radius: 12px;
    border: 1px solid var(--border-color);
}

.info-banner-container {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 6vh;
}

.info-banner {
    flex: 1;
    height: 100%;
    background: linear-gradient(135deg, #004a99, #007aff);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    font-size: clamp(1.1rem, 1.5vw, 1.4rem);
    font-weight: bold;
}

input, select, button {
    background: var(--bg-color);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    padding: 6px;
    border-radius: 8px;
}

.btn-update {
    background: var(--accent-blue);
    border: none;
    color: #fff;
    font-weight: bold;
    cursor: pointer;
}

</style>
`;


// ======================================================
// AVATAR
// ======================================================

function renderAvatar(person) {

    const hasPhoto =
        person.p &&
        person.p.includes('http') &&
        !person.p.includes('placeholder');

    const firstLetter = person.n
        ? person.n.charAt(0)
        : '?';

    const content = hasPhoto
        ? `
            <img src="${person.p}" class="avatar">
        `
        : `
            <div class="avatar-placeholder">${firstLetter}</div>
        `;

    return person.id && person.id !== "kein"
        ? `<a href="slack://user?id=${person.id.trim()}" class="avatar-container">${content}</a>`
        : `<div class="avatar-container">${content}</div>`;
}


// ======================================================
// SLACK STATUS
// ======================================================

async function getFullStatus(id) {

    if (!id || id.trim() === "" || id.toLowerCase() === "kein") {
        return {
            t: "Abwesend",
            e: "⚪",
            c: "bg-away",
            r: 8
        };
    }

    try {

        const h = {
            Authorization: `Bearer ${SLACK_TOKEN}`
        };

        const [p, s] = await Promise.all([
            axios.get(
                `https://slack.com/api/users.profile.get?user=${id.trim()}`,
                { headers: h }
            ),
            axios.get(
                `https://slack.com/api/users.getPresence?user=${id.trim()}`,
                { headers: h }
            )
        ]);

        const prof = p.data.profile || {};
        const online = s.data?.presence === 'active';

        const txt = prof.status_text || "";
        const lowTxt = txt.toLowerCase();

        let res = {
            t: txt || (online ? "Online" : "Abwesend"),
            e: "📍",
            c: "bg-away",
            p: prof.image_192,
            r: 8
        };

        if (online && !txt) {
            res.r = 2;
            res.c = "bg-active";
            res.e = "🟢";
        }

        if (lowTxt.includes("büro") || lowTxt.includes("da")) {
            res.c = "bg-active";
            res.r = 1;
            res.e = "🏢";
        }

        else if (lowTxt.includes("home")) {
            res.c = "bg-home";
            res.r = 3;
            res.e = "🏡";
        }

        else if (lowTxt.includes("pause")) {
            res.c = "bg-home";
            res.r = 3.5;
            res.e = "🥪";
        }

        else if (lowTxt.includes("besprechung")) {
            res.c = "bg-red";
            res.r = 4;
            res.e = "🗓️";
        }

        else if (lowTxt.includes("unterwegs")) {
            res.c = "bg-red";
            res.r = 5;
            res.e = "🚗";
        }

        else if (lowTxt.includes("uni")) {
            res.c = "bg-home";
            res.r = 3.6;
            res.e = "🎓";
        }

        else if (lowTxt.includes("krank")) {
            res.c = "bg-away";
            res.r = 6;
            res.e = "🤒";
        }

        else if (lowTxt.includes("urlaub")) {
            res.c = "bg-away";
            res.r = 7;
            res.e = "🌴";
        }

        else if (lowTxt.includes("christine")) {
            res.c = "bg-active";
            res.r = 1;
            res.e = "🎉";
        }
        
        return res;

    } catch (e) {

        return {
            t: "Abwesend",
            e: "⚪",
            c: "bg-away",
            r: 8
        };
    }
}


// ======================================================
// DATEN LADEN
// ======================================================

async function updateData() {

    try {

        const csv = await axios.get(CSV_URL);

        const rows = parse(csv.data, {
            from_line: 2,
            skip_empty_lines: true
        });

        // Aktuellen Wochentag in deutscher Zeitzone bestimmen
        const berlinDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
        const dayIdx = berlinDate.getDay(); // 0 = So, 1 = Mo, 2 = Di, 3 = Mi, 4 = Do, 5 = Fr, 6 = Sa
        const dayMap = { 1: "Mo", 2: "Di", 3: "Mi", 4: "Do", 5: "Fr" };
        const currentDayKuerzel = dayMap[dayIdx] || "";

        cachedData = await Promise.all(
            rows.map(async r => {

                const status = await getFullStatus(r[1]);

                // Berechnen der Kernarbeitszeit für heute
                let tagesText = "Keine Kernarbeitszeit";

                // Spalte N (Index 13) enthält freie Tage kommagetrennt (z.B. "Mo, Di")
                const freie Tage = r[13] ? r[13].split(',').map(t => t.trim()) : [];

                if (dayIdx === 0 || dayIdx === 6) {
                    tagesText = "Wochenende";
                } else if (freie Tage.includes(currentDayKuerzel)) {
                    tagesText = "Frei";
                } else {
                    // Spaltenzuordnung anhand Wochentag:
                    // Mo: Start=D(3), End=E(4) | Di: Start=F(5), End=G(6) | Mi: Start=H(7), End=I(8) | Do: Start=J(9), End=K(10) | Fr: Start=L(11), End=M(12)
                    let startCol = 3 + (dayIdx - 1) * 2;
                    let endCol = startCol + 1;

                    let startWert = r[startCol] ? r[startCol].trim() : "";
                    let endWert = r[endCol] ? r[endCol].trim() : "";

                    if (startWert.toLowerCase() === "uni") {
                        tagesText = "Uni";
                    } else if (startWert && endWert) {
                        tagesText = `${startWert} - ${endWert}`;
                    }
                }

                return {
                    n: r[0],
                    id: r[1],
                    zeit: tagesText,
                    ...status
                };

            })
        );

    } catch (e) {
        console.log(e);
    }
}

setInterval(updateData, 120000);
updateData();


// ======================================================
// INFO TEXT SPEICHERN
// ======================================================

app.post(
    '/update-info',
    express.urlencoded({ extended: true }),
    (req, res) => {

        cachedInfoText = req.body.infoText || "";

        fs.writeFileSync(
            INFO_FILE,
            JSON.stringify(
                { text: cachedInfoText },
                null,
                2
            )
        );

        res.redirect('/dashboard');
    }
);


// ======================================================
// DASHBOARD
// ======================================================

app.get('/dashboard', (req, res) => {

    const userOptions = [...cachedData]
        .sort((a,b) => a.n.localeCompare(b.n))
        .map(u => `
            <option value="${u.n}">
                ${u.n}
            </option>
        `)
        .join('');

    const cards = [...cachedData]
        .sort((a,b) => a.r - b.r || a.n.localeCompare(b.n))
        .map(p => {

            return `
                <div class="card" title="Kernarbeitszeit heute: ${escapeHtml(p.zeit)}">

                    ${renderAvatar(p)}

                    <span class="name-label">
                        ${p.n}
                    </span>

                    <div class="status-badge ${p.c}">
                        ${p.e} ${p.t}
                    </div>

                </div>
            `;
        })
        .join('');

    res.send(`
<html>
${htmlHead}

<script>

document.addEventListener('DOMContentLoaded', () => {

    const sel = document.querySelector('select[name="user"]');

    if (!sel) return;

    // Gespeicherten Mitarbeiter laden
    const saved = localStorage.getItem('selectedMitarbeiter');

    if (saved) {
        sel.value = saved;
    }

    // Bei Änderung speichern
    sel.addEventListener('change', () => {

        localStorage.setItem(
            'selectedMitarbeiter',
            sel.value
        );

    });

});

</script>


<body>
${styles}

<div class="container">

<div class="nav-bar">

    <a href="https://forms.gle/KnKo9CFDjvnMM1sj7"
       target="_blank"
       class="nav-btn">
       🤒 Krank
    </a>

    <a href="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform"
       target="_blank"
       class="nav-btn">
       🌴 Urlaub
    </a>

    <a href="https://outlook.office.com/mail/"
       target="_blank"
       class="nav-btn">
       📬 Outlook
    </a>

    <a href="https://ohheidelberg.github.io/oh-dokumente/?id=admin99"
       target="_blank"
       class="nav-btn">
       📂 Dokumente
    </a>

    <a href="https://docs.google.com/forms/d/e/1FAIpQLSetlNl4LucOcOEh1uA3ozTPjEoeHoG4Sq74WQAygS8F_fsKEg/viewform"
       target="_blank"
       class="nav-btn"
       style="border-color:#ff453a;">
       ⚠️ Serverproblem
    </a>

    <button class="theme-btn" onclick="toggleTheme()">
        🌓
    </button>

</div>

<div class="grid">
    ${cards}
</div>

    <form action="/update" class="footer-bar">

        <select name="user" required>
            <option value="" disabled selected>
                Mitarbeiter
            </option>

            ${userOptions}
        </select>

        <select name="status">

            <option value="da">
                🏢 Büro
            </option>

            <option value="homeoffice">
                🏡 Homeoffice
            </option>

            <option value="besprechung">
                🗓️ Besprechung
            </option>

            <option value="unterwegs">
                🚗 Unterwegs
            </option>

            <option value="pause">
                🥪 Pause
            </option>

            <option value="krank">
            🤒 Krank
            </option>

            <option value="urlaub">
            🌴 Urlaub
            </option>
            
            <option value="uni">
                🎓 Uni
            </option>
            
            <option value="weg">
                🌊 Abwesend
            </option>

        </select>
<input type="time" name="bis">
        <button type="submit" class="btn-update">
            Update
        </button>

    </form>

    <form
        action="/update-info"
        method="POST"
        style="display:flex; gap:8px;"
    >

        <input
            type="text"
            name="infoText"
            value="${escapeHtml(cachedInfoText)}"
            placeholder="Info-Text für Empfang..."
            style="flex:1;"
        >

        <button type="submit" class="btn-update">
            Info setzen
        </button>

    </form>

</div>

</body>
</html>
`);
});


// ======================================================
// STATUS UPDATE
// ======================================================

app.get('/update', async (req, res) => {

    const { user, status, bis } = req.query;

    const person = cachedData.find(r => r.n === user);

    if (person?.id && person.id !== "kein") {

        const h = {
            Authorization: `Bearer ${SLACK_TOKEN}`
        };

const map = {

    da: ["Im Büro", ":office:"],

    homeoffice: [
        "Homeoffice",
        ":house_with_garden:"
    ],

    besprechung: [
        "Besprechung",
        ":calendar:"
    ],

    unterwegs: [
        "Unterwegs",
        ":car:"
    ],

    uni: [
        "Uni",
        ":mortar_board:"
    ],

    pause: [
        "Pause",
        ":sandwich:"
    ],

    krank: [
        "Krank",
        ":face_with_thermometer:"
    ],

    urlaub: [
        "Urlaub",
        ":palm_tree:"
    ],

    weg: [
        "Abwesend",
        ":wave:"
    ]
};

        let [text, emoji] =
            map[status] || ["Im Büro", ":office:"];

        let expiration = 0;

        // =========================================
        // ENDUHRZEIT
        // =========================================

        if (bis) {

            const [hours, minutes] = bis.split(':');

            const berlin = new Date(
                new Date().toLocaleString(
                    "en-US",
                    { timeZone: "Europe/Berlin" }
                )
            );

            let target = new Date(berlin);

            target.setHours(
                parseInt(hours),
                parseInt(minutes),
                0,
                0
            );

            // Wenn Uhrzeit bereits vorbei → nächster Tag
            if (target < berlin) {
                target.setDate(target.getDate() + 1);
            }

            expiration =
                Math.floor(Date.now() / 1000) +
                Math.floor((target - berlin) / 1000);

            text += ` bis ${bis}`;
        }

        try {

            await axios.post(
                'https://slack.com/api/users.profile.set',
                {
                    user: person.id.trim(),
                    profile: {
                        status_text: text,
                        status_emoji: emoji,
                        status_expiration: expiration
                    }
                },
                { headers: h }
            );

            await updateData();

        } catch (e) {
            console.log(e);
        }
    }

    res.redirect('/dashboard');
});


// ======================================================
// EMPFANG
// ======================================================

app.get('/empfang', (req, res) => {

    const data = [...cachedData]
        .sort((a, b) =>
            (a.r !== 1) - (b.r !== 1) ||
            a.n.localeCompare(b.n)
        );

    const infoText = cachedInfoText
        ? `📢 ${escapeHtml(cachedInfoText)}`
        : "Herzlich Willkommen bei der Lebenshilfe Heidelberg e.V.";

    const cards = data.map(p => {

        const atOffice = p.r === 1;

        return `
            <div class="card" style="opacity:${atOffice ? 1 : 0.3}" title="Kernarbeitszeit heute: ${escapeHtml(p.zeit)}">

                ${renderAvatar(p)}

                <span class="name-label">
                    ${p.n}
                </span>

                <div class="status-badge ${atOffice ? p.c : 'bg-away'}">

                    ${atOffice ? p.e : '⚪'}

                    ${atOffice ? p.t : 'Abwesend'}

                </div>

            </div>
        `;
    }).join('');

    res.send(`
<html>
${htmlHead}

<body>
${styles}

<div class="container">

    <div class="info-banner-container">

        <div class="info-banner">
            ${infoText}
        </div>

        <button
            class="theme-btn"
            style="height:100%; padding:0 20px;"
            onclick="toggleTheme()"
        >
            🌓
        </button>

    </div>

    <div class="grid">
        ${cards}
    </div>

</div>

</body>
</html>
`);
});


// ======================================================
// START
// ======================================================

app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

app.listen(port, '0.0.0.0', () => {
    console.log("Server online");
});
