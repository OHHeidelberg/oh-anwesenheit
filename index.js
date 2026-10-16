const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';
const INFO_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?gid=1558993151&single=true&output=csv';

// CSV Export URL für Urlaubstabelle (Google Sheet)
const URLAUB_CSV_URL = 'https://docs.google.com/spreadsheets/d/1NDwRVyNkI2wUX8sTjTiUscrRZ43Fs70WTFt8UK8qOsU/export?format=csv&id=1NDwRVyNkI2wUX8sTjTiUscrRZ43Fs70WTFt8UK8qOsU';

// CSV Export URL für Krankmeldungen
const KRANK_CSV_URL = 'https://docs.google.com/spreadsheets/d/1NDwRVyNkI2wUX8sTjTiUscrRZ43Fs70WTFt8UK8qOsU/export?format=csv&id=1NDwRVyNkI2wUX8sTjTiUscrRZ43Fs70WTFt8UK8qOsU';

const fs = require('fs');
const INFO_FILE = './info.json';

let cachedData = [];
let pauseStorage = {}; 
let urlaubMap = {}; // Speichert das Urlaubs-Enddatum pro Name
let krankMap = {};  // Speichert das Krank-Datum (Ende bzw. Start) pro Name

let defaultInfoText = "Das ist kein Touchscreen"; // Fallback, wird aus dem Sheet überschrieben
let cachedInfoText = defaultInfoText;
let infoCustom = false;  // true = manuell geänderter Text ist aktiv
let infoDate = "";       // Datum (Berlin) der letzten manuellen Änderung

function berlinDate() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); // YYYY-MM-DD
}

function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resetInfoText() {
    infoCustom = false;
    infoDate = "";
    cachedInfoText = defaultInfoText;
    try { if (fs.existsSync(INFO_FILE)) fs.unlinkSync(INFO_FILE); } catch (e) {}
}

// Beim Start: gespeicherten Text nur übernehmen, wenn er von heute ist
try {
    if (fs.existsSync(INFO_FILE)) {
        const saved = JSON.parse(fs.readFileSync(INFO_FILE, 'utf8'));
        if (saved.text && saved.date === berlinDate()) {
            cachedInfoText = saved.text;
            infoCustom = true;
            infoDate = saved.date;
        }
    }
} catch (e) { console.log("Keine Info-Datei gefunden"); }

// Neue Version bei jedem Serverstart -> offene Seiten laden sich danach einmal neu
const SERVER_VERSION = Date.now().toString();

const htmlHead = `
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>OH Dashboard</title>
    <meta name="server-version" content="${SERVER_VERSION}">
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
            const shiftX = Math.floor(Math.random() * 7) - 3;
            const shiftY = Math.floor(Math.random() * 7) - 3;
            document.body.style.transform = "translate(" + shiftX + "px, " + shiftY + "px)";
        }
        setInterval(applyBurnInProtection, 60000); 

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        }

        // Signatur aus Namen, Status und Infotext - nur wenn sie sich ändert, wird neu geladen
        function pageSignature(root) {
            const cards = Array.from(root.querySelectorAll('.card')).map(function(c) {
                const n = c.querySelector('.name-label');
                const b = c.querySelector('.status-badge');
                return (n ? n.textContent : '') + '|' + (b ? b.className + ':' + b.textContent : '');
            }).join('||');
            const info = root.querySelector('.info-text');
            const inp = root.querySelector('input[name="infoText"]');
            const ver = root.querySelector('meta[name="server-version"]');
            return cards + '##' + (info ? info.textContent : '') + '##' + (inp ? inp.getAttribute('value') : '') + '##' + (ver ? ver.getAttribute('content') : '');
        }

        async function checkAndReload() {
            if (window.embedOpen) return;
            if (!navigator.onLine) return;
            try {
                const response = await fetch(window.location.href, { cache: 'no-store' });
                if (!response.ok) return;
                const html = await response.text();
                const fresh = new DOMParser().parseFromString(html, 'text/html');
                if (pageSignature(fresh) !== pageSignature(document)) window.location.reload();
            } catch (e) {}
        }
        setInterval(() => { if (!document.hidden) checkAndReload(); }, 60000);
        window.addEventListener('online', checkAndReload);

        function openEmbed(el) {
            var frame = document.getElementById('embedFrame');
            if (!frame) return true;
            frame.src = el.getAttribute('data-src') || el.href;
            document.body.classList.add('embed-mode');
            window.embedOpen = true;
            document.querySelectorAll('.nav-btn.active').forEach(function(b) { b.classList.remove('active'); });
            el.classList.add('active');
            var ext = document.getElementById('embedExternal');
            if (ext) ext.href = el.href;
            return false;
        }

        function closeEmbed() {
            if (window.embedOpen) {
                window.embedOpen = false;
                window.location.reload();
            }
        }
    </script>
</head>`;

const styles = `
<style>
  :root { 
    --bg-color: #f2f2f7; 
    --card-bg: #ffffff; 
    --text-color: #000000; 
    --accent-blue: #007aff; 
    --border-color: #d1d1d6; 
    --nav-btn-bg: #e5e5ea; 
    --tooltip-bg: rgba(255, 255, 255, 0.98);
    --tooltip-text: #000000;
  }
  [data-theme="dark"] { 
    --bg-color: #000000; 
    --card-bg: #1c1c1e; 
    --text-color: #ffffff; 
    --accent-blue: #0a84ff; 
    --border-color: #38383a; 
    --nav-btn-bg: #2c2c2e; 
    --tooltip-bg: rgba(28, 28, 30, 0.98);
    --tooltip-text: #ffffff;
  }
  
  html, body { height: 100vh; margin: 0; padding: 0; overflow: hidden; }
  body { font-family: -apple-system, sans-serif; background: var(--bg-color); color: var(--text-color); display: flex; flex-direction: column; padding: 1vh 1vw; box-sizing: border-box; }

  .container { flex: 1; display: flex; flex-direction: column; overflow: hidden; gap: 1vh; height: 100%; }

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

  .grid::-webkit-scrollbar { width: 6px; }
  .grid::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 10px; }

  .card { 
    background: var(--card-bg); 
    padding: 8px; 
    border-radius: 12px; 
    border: 1px solid var(--border-color);
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    justify-content: space-between; 
    min-height: 0;
    min-width: 0;
    position: relative;
    box-sizing: border-box;
    overflow: hidden;
  }

  /* Overlay-Tooltip im Kästchen (Kompaktere Abstände) */
  .tooltip-overlay {
    visibility: hidden;
    opacity: 0;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--tooltip-bg);
    color: var(--tooltip-text);
    border-radius: 11px;
    padding: 4px 6px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: opacity 0.15s ease, visibility 0.15s ease;
    box-sizing: border-box;
    pointer-events: none;
    backdrop-filter: blur(4px);
  }

  .tooltip-title {
    font-weight: bold;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 1px;
    margin-bottom: 1px;
    text-align: center;
    font-size: clamp(0.65rem, 0.75vw, 0.8rem);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.1;
  }

  .tooltip-body {
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    flex: 1;
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    font-size: clamp(0.58rem, 0.68vw, 0.78rem);
    line-height: 0.95;
    margin: 1px 0;
  }

  .tooltip-day {
    font-weight: 700;
    opacity: 0.8;
  }

  .tooltip-time {
    text-align: right;
    font-weight: 500;
  }

  /* Hervorhebung für den aktuellen Wochentag */
  .tooltip-current {
    color: var(--accent-blue) !important;
    font-weight: 800 !important;
    opacity: 1 !important;
  }

  .card:hover .tooltip-overlay {
    visibility: visible;
    opacity: 1;
  }

  .avatar-container { 
    height: clamp(45px, 4.5vw, 65px); 
    width: clamp(45px, 4.5vw, 65px); 
    margin-bottom: 4px; 
    text-decoration: none; 
    display: block; 
    flex-shrink: 0;
  }
  .avatar-dim { filter: grayscale(1); opacity: 0.45; }
  .avatar { width: 100%; height: 100%; border-radius: 50%; border: 2px solid var(--border-color); object-fit: cover; background: #8e8e93; }
  .avatar-placeholder { width: 100%; height: 100%; border-radius: 50%; background: #8e8e93; color: #fff; display: flex; align-items: center; justify-content: center; font-size: clamp(1rem, 1.2vw, 1.5rem); font-weight: bold; }
  
  .name-label { font-weight: bold; font-size: clamp(0.75rem, 0.9vw, 1rem); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 95%; text-align: center; flex-shrink: 0; }

  .status-badge { 
    padding: 4px 6px; 
    border-radius: 8px; 
    font-size: clamp(0.65rem, 0.75vw, 0.85rem); 
    font-weight: 700; 
    width: 95%; 
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    text-align: center;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .bg-active { background: rgba(50, 215, 75, 0.2); color: #32d74b; }
  .bg-home { background: rgba(255, 214, 10, 0.2); color: #ffd60a; }
  .bg-red { background: rgba(255, 69, 58, 0.2); color: #ff453a; }
  .bg-away { background: var(--nav-btn-bg); color: #8e8e93; }

  .bg-party {
    background: linear-gradient(120deg, #ff2a5f, #ff9500, #ffcc00, #4cd964, #5ac8fa, #007aff, #5856d6, #ff2a5f);
    background-size: 400% 400%;
    color: #ffffff !important;
    font-weight: 900;
    text-shadow: 1px 1px 3px rgba(0,0,0,0.6);
    animation: rainbow 6s ease infinite, blink 1.5s ease-in-out infinite;
    box-shadow: 0 0 10px rgba(255, 204, 0, 0.5);
  }

  @keyframes rainbow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes blink {
    0% { opacity: 1; }
    50% { opacity: 0.75; }
    100% { opacity: 1; }
  }

  .embed-frame { display: none; flex: 1; min-height: 0; width: 100%; border: 1px solid var(--border-color); border-radius: 12px; background: #ffffff; box-sizing: border-box; }
  .embed-only { display: none; }
  .nav-btn.active { border-color: var(--accent-blue); color: var(--accent-blue); }
  body.embed-mode .dash-part { display: none !important; }
  body.embed-mode .embed-frame { display: block; }
  body.embed-mode .embed-only { display: inline-block; }
  .nav-bar { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: center; align-items: center; margin-bottom: 2px; }
  .nav-btn, .theme-btn { text-decoration: none; background: var(--nav-btn-bg); color: var(--text-color); padding: 6px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: 700; border: 1px solid var(--border-color); cursor: pointer; }

  .footer-bar { height: 6vh; min-height: 45px; background: var(--card-bg); margin-top: 2px; padding: 0 12px; display: flex; justify-content: center; align-items: center; gap: 8px; border-radius: 12px; border: 1px solid var(--border-color); flex-shrink: 0; }
  
  select, button, input { background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color); padding: 6px; border-radius: 8px; font-size: 0.85rem; }
  .btn-update { background: var(--accent-blue); border: none; color: #fff; font-weight: bold; cursor: pointer; padding: 6px 12px; }

  .info-banner-container { display: flex; align-items: center; gap: 8px; height: 6vh; flex-shrink: 0; }
  .info-banner { flex: 1; height: 100%; background: linear-gradient(135deg, #004a99, #007aff); color: white; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: clamp(1.1rem, 1.5vw, 1.4rem); font-weight: bold; }

  /* Lauftext für den Infotext: nach jedem Laden 2x durchlaufen, danach steht der Text mittig */
  .info-banner { overflow: hidden; }
  .info-text { display: inline-block; white-space: nowrap; margin: 0 auto; animation: info-marquee var(--dur, 15s) linear 2; }
  @keyframes info-marquee {
    from { transform: translateX(calc(50vw + 50%)); }
    to { transform: translateX(calc(-50vw - 50%)); }
  }

  /* Ankündigungs-Modus (nur /empfang): Infotext groß und leuchtend, abwesende Karten schrumpfen auf das graue Foto */
  .announce .grid { flex: 0 1 auto; max-height: 55vh; grid-template-columns: repeat(auto-fill, minmax(5.5vw, 1fr)); grid-auto-rows: auto; align-content: start; }
  .announce .card:not(.absent) { grid-column: span 2; min-height: 120px; }
  .announce .card.absent { align-self: start; justify-content: center; padding: 3px; min-height: 0; height: 9vh; }
  .announce .card.absent .name-label, .announce .card.absent .status-badge { display: none; }
  .announce .card.absent .avatar-container { margin-bottom: 0; }
  .announce .info-banner-container { flex: 1 1 0; height: auto; min-height: 25vh; }
  .announce .info-banner {
    font-size: clamp(3rem, 14vh, 9rem);
    background: linear-gradient(135deg, #0a2a6e, #007aff, #5856d6, #007aff);
    background-size: 300% 300%;
    animation: announce-bg 6s ease infinite, announce-glow 1.6s ease-in-out infinite;
  }
  .announce .info-text { text-shadow: 0 0 12px #ffffff, 0 0 28px #5ac8fa, 0 0 56px #0a84ff; }
  @keyframes announce-bg { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
  @keyframes announce-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(10, 132, 255, 0.6); }
    50% { box-shadow: 0 0 60px rgba(90, 200, 250, 1); }
  }

  @media (max-width: 768px) {
    html, body { overflow: auto; height: auto; }
    .container { overflow: visible; height: auto; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); grid-auto-rows: 150px; overflow: visible; }
    .footer-bar { height: auto; padding: 12px; flex-direction: column; align-items: stretch; }
  }
</style>`;

function renderAvatar(person) {
    const hasPhoto = person.p && person.p.includes('http') && !person.p.includes('placeholder');
    const firstLetter = person.n ? person.n.charAt(0) : '?';
    const content = hasPhoto ? `<img src="${person.p}" class="avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="avatar-placeholder" style="display:none;">${firstLetter}</div>` : `<div class="avatar-placeholder">${firstLetter}</div>`;
    const cls = person.dim ? 'avatar-container avatar-dim' : 'avatar-container';
    return person.id && person.id !== "kein" ? `<a href="slack://user?id=${person.id.trim()}" class="${cls}">${content}</a>` : `<div class="${cls}">${content}</div>`;
}

// Hilfsfunktion zum Formatieren der Kernpräsenzzeit pro Tag
function formatDayTime(startRaw, endRaw) {
    const start = (startRaw || "").trim();
    const end = (endRaw || "").trim();
    const startLow = start.toLowerCase();

    if (!start && !end) return "k.A.";
    if (startLow === "frei") return "frei";
    if (startLow === "sb") return "Schulbegleitung";
    if (startLow === "sab") return "Schulanschlussbetreuung";
    if (startLow === "uni") return "Uni";
    if (startLow === "homeoffice") return "Homeoffice";
    
    if (start && end) return `${start}-${end}`;
    if (start) return start;
    return "k.A.";
}

// Hilfsfunktion zum Erzeugen des Overlay-Tooltips mit Hervorhebung des aktuellen Wochentags
function renderTooltip(person) {
    if (!person || !person.presence) return "";

    // Aktuellen Wochentag für Berlin/Deutschland ermitteln (1 = Mo, 2 = Di, ..., 5 = Fr)
    const todayIndex = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getDay();

    const days = [
        { id: 1, label: "Mo", val: person.presence.mo },
        { id: 2, label: "Di", val: person.presence.di },
        { id: 3, label: "Mi", val: person.presence.mi },
        { id: 4, label: "Do", val: person.presence.do },
        { id: 5, label: "Fr", val: person.presence.fr }
    ];

    const rows = days.map(d => {
        const isToday = d.id === todayIndex;
        const currentClass = isToday ? ' tooltip-current' : '';
        return `
        <div class="tooltip-row">
            <span class="tooltip-day${currentClass}">${d.label}:</span>
            <span class="tooltip-time${currentClass}">${d.val}</span>
        </div>`;
    }).join('');

    return `
    <div class="tooltip-overlay">
        <div class="tooltip-title">${person.n}</div>
        <div class="tooltip-body">
            ${rows}
        </div>
    </div>`;
}

// Hilfsfunktion zum Umwandeln von DD.MM.YYYY oder YYYY-MM-DD in ein Date-Objekt
function parseGermanDate(dateStr) {
    if (!dateStr) return null;
    const str = dateStr.trim();

    if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length === 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
    }

    if (str.includes('.')) {
        const parts = str.split('.');
        if (parts.length >= 3) {
            let year = parts[2];
            if (year.length === 2) year = '20' + year;
            return new Date(parseInt(year), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
    }

    return null;
}

// Hilfsfunktion zum Formatieren in DD.MM.YY (akzeptiert DD.MM.YYYY und YYYY-MM-DD)
function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const str = dateStr.trim();

    if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length === 3) {
            const day = parts[2].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[0].substring(2);
            return `${day}.${month}.${year}`;
        }
    }

    const parts = str.split('.');
    if (parts.length >= 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        let year = parts[2];
        if (year.length === 4) year = year.substring(2);
        return `${day}.${month}.${year}`;
    }

    return dateStr;
}

// Wandelt Daten im Freitext automatisch in DD.MM.YY um
function reformatDatesInText(text) {
    if (!text) return text;

    let formatted = text.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (match, y, m, d) => {
        const day = d.padStart(2, '0');
        const month = m.padStart(2, '0');
        const year = y.substring(2);
        return `${day}.${month}.${year}`;
    });

    formatted = formatted.replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g, (match, d, m, y) => {
        const day = d.padStart(2, '0');
        const month = m.padStart(2, '0');
        const year = y.length === 4 ? y.substring(2) : y;
        return `${day}.${month}.${year}`;
    });

    return formatted;
}

async function fetchUrlaubData() {
    try {
        const res = await axios.get(URLAUB_CSV_URL, { timeout: 8000 });
        const rows = parse(res.data, { from_line: 2, skip_empty_lines: true });
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const map = {};
        rows.forEach(r => {
            const name = r[1] ? r[1].trim() : '';
            const startDateStr = r[2];
            const endDateStr = r[3];
            const status = r[6] ? r[6].trim() : '';

            if (!name || !endDateStr) return;
            if (status && !status.toLowerCase().includes('genehmigt')) return;

            const startDate = parseGermanDate(startDateStr);
            const endDate = parseGermanDate(endDateStr);

            if (startDate && endDate) {
                if (today >= startDate && today <= endDate) {
                    map[name.toLowerCase()] = formatDateShort(endDateStr);
                }
            }
        });
        urlaubMap = map;
    } catch (e) {
        console.log("Fehler beim Abrufen der Urlaubstabelle:", e.message);
    }
}

async function fetchKrankData() {
    try {
        const res = await axios.get(KRANK_CSV_URL, { timeout: 8000 });
        const rows = parse(res.data, { from_line: 2, skip_empty_lines: true });
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const map = {};
        rows.forEach(r => {
            const name = r[1] ? r[1].trim() : '';
            const startDateStr = r[2];
            const endDateStr = r[3];

            if (!name) return;

            const startDate = parseGermanDate(startDateStr);
            const endDate = parseGermanDate(endDateStr);

            if (startDate && endDate) {
                if (today >= startDate && today <= endDate) {
                    map[name.toLowerCase()] = { type: 'bis', date: formatDateShort(endDateStr) };
                }
            } else if (startDate && today >= startDate) {
                map[name.toLowerCase()] = { type: 'seit', date: formatDateShort(startDateStr) };
            }
        });
        krankMap = map;
    } catch (e) {
        console.log("Fehler beim Abrufen der Krank-Tabelle:", e.message);
    }
}

async function getFullStatus(id, name) {
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

        let displayTxt = txt;

        let res = { t: displayTxt || (online ? "Online" : "Abwesend"), e: "📍", c: "bg-away", p: prof.image_192, r: 8 };
        if (online && !txt) { res.r = 2; res.c = "bg-active"; res.e = "🟢"; }
        
        if (lowTxt.includes("büro") || lowTxt.includes("da")) { 
            res.c="bg-active"; res.r=1; res.e="🏢"; res.buero = true;
        } else if (lowTxt.includes("home")) { 
            res.c="bg-home"; res.r=3; res.e="🏡"; 
        } else if (lowTxt.includes("stören") || lowTxt.includes("besprechung") || lowTxt.includes("termin")) { 
            if (!lowTxt.includes("stören")) {
                res.t = "Nicht stören";
            } else {
                res.t = txt.replace(/^bitte\s+/i, '');
            }
            res.c = "bg-red"; res.r = 4; res.e = "🚫"; 
        } else if (lowTxt.includes("unterwegs")) { 
            res.c="bg-red"; res.r=5; res.e="🚗"; 
        } else if (lowTxt.includes("pause")) { 
            res.c="bg-home"; res.r=3.5; res.e="🥪"; 
        } else if (lowTxt.includes("christine")) { 
            res.c="bg-party"; res.r=1; res.e="🎉"; 
        } else if (lowTxt.includes("uni")) { 
            res.c="bg-home"; res.r=3.6; res.e="🎓"; 
        } else if (lowTxt.includes("krank")) { 
            res.c="bg-away"; 
            res.r=6; 
            res.e="🤒"; 

            const searchName = (name || "").toLowerCase();
            let krankInfo = null;

            Object.keys(krankMap).forEach(key => {
                if (searchName.includes(key) || key.includes(searchName)) {
                    krankInfo = krankMap[key];
                }
            });

            if (krankInfo) {
                res.t = krankInfo.type === 'bis' ? `Krank bis ${krankInfo.date}` : `Krank seit ${krankInfo.date}`;
            } else {
                res.t = reformatDatesInText(txt || "Krank");
            }
        } else if (lowTxt.includes("urlaub")) { 
            res.c="bg-away"; 
            res.r=7; 
            res.e="🌴"; 
            
            const searchName = (name || "").toLowerCase();
            let endDateFormatted = null;

            Object.keys(urlaubMap).forEach(key => {
                if (searchName.includes(key) || key.includes(searchName)) {
                    endDateFormatted = urlaubMap[key];
                }
            });

            if (endDateFormatted) {
                res.t = `Urlaub bis ${endDateFormatted}`;
            } else {
                res.t = reformatDatesInText(txt || "Urlaub");
            }
        }
        return res;
    } catch (e) { return { t: "Abwesend", e: "⚪", c: "bg-away", r: 8 }; }
}

async function getSlackStatus(userId, headers) {
    const r = await axios.get(
        `https://slack.com/api/users.profile.get?user=${userId}`,
        { headers, timeout: 5000 }
    );
    const p = r.data.profile || {};
    return {
        text: p.status_text || "",
        emoji: p.status_emoji || "",
        expiration: p.status_expiration || 0
    };
}

async function updateData() {
    try {
        await Promise.all([fetchUrlaubData(), fetchKrankData()]);

        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        cachedData = await Promise.all(rows.map(async r => {
            const name = r[0];
            const slackId = r[1];

            // Kernpräsenzzeiten einlesen (Spalte D [Index 3] bis M [Index 12])
            const presence = {
                mo: formatDayTime(r[3], r[4]),
                di: formatDayTime(r[5], r[6]),
                mi: formatDayTime(r[7], r[8]),
                do: formatDayTime(r[9], r[10]),
                fr: formatDayTime(r[11], r[12])
            };

            const status = await getFullStatus(slackId, name);
            return { 
                n: name, id: slackId, presence, ...status
            };
        }));
        const info = await axios.get(INFO_URL).catch(() => null);
        if (info) {
            const line = info.data.split('\n')[0].trim();
            if (line) defaultInfoText = line;
        }
        if (!infoCustom) cachedInfoText = defaultInfoText;
    } catch (e) {}
}

let resetDoneToday = false;

setInterval(async () => {
    const berlinTime = new Date().toLocaleString("en-US", {
        timeZone: "Europe/Berlin"
    });
    const nowObj = new Date(berlinTime);
    const now = Math.floor(Date.now() / 1000);
    const h = { Authorization: `Bearer ${SLACK_TOKEN}` };

    // Infotext täglich um 0:00 Uhr (Berlin) auf die Standardnachricht zurücksetzen
    if (infoCustom && infoDate !== berlinDate()) resetInfoText();

    // Statusse mit Endzeit automatisch zurücksetzen
    for (const userId of Object.keys(pauseStorage)) {
        const entry = pauseStorage[userId];
        if (now >= entry.expires) {
            try {
                const prev = entry.previous;
                let profile = {
                    status_text: "Abwesend",
                    status_emoji: ":wave:",
                    status_expiration: 0
                };
                let nextEntry = null;

                // War vorher ein Status gesetzt (ohne Endzeit oder mit noch gültiger Endzeit)? Dann wiederherstellen.
                if (entry.isPause && prev && prev.text &&
                    (prev.expiration === 0 || prev.expiration > now)) {
                    profile = {
                        status_text: prev.text,
                        status_emoji: prev.emoji,
                        status_expiration: prev.expiration
                    };
                    if (prev.expiration > 0) {
                        nextEntry = { expires: prev.expiration, isPause: false, previous: null };
                    }
                }

                await axios.post(
                    'https://slack.com/api/users.profile.set',
                    { user: userId, profile },
                    { headers: h }
                );

                delete pauseStorage[userId];
                if (nextEntry) pauseStorage[userId] = nextEntry;
                await updateData();
            } catch (e) {
                console.log(
                    `Fehler beim automatischen Zurücksetzen von ${userId}:`,
                    e.message
                );
            }
        }
    }

    // Täglicher Reset um 21:30 Uhr
    const targetHour = 21;
    const targetMinute = 30;

    if (nowObj.getHours() === targetHour && nowObj.getMinutes() === targetMinute) {
        if (!resetDoneToday) {
            console.log(`Automatischen Reset um ${targetHour}:${targetMinute} Uhr gestartet...`);

            for (const person of cachedData) {
                if (person.id && person.id !== "kein") {
                    const lowT = (person.t || "").toLowerCase();

                    if (!lowT.includes("urlaub") && !lowT.includes("krank")) {
                        try {
                            await axios.post(
                                'https://slack.com/api/users.profile.set',
                                {
                                    user: person.id.trim(),
                                    profile: {
                                        status_text: "Abwesend",
                                        status_emoji: ":wave:",
                                        status_expiration: 0
                                    }
                                },
                                { headers: h }
                            );
                        } catch (e) {}
                    }
                }
            }

            pauseStorage = {};
            await updateData();
            resetDoneToday = true;
        }
    } else {
        resetDoneToday = false;
    }
}, 30000);

setInterval(updateData, 120000); 
updateData();

app.use(express.urlencoded({ extended: true }));

app.post('/update-info', (req, res) => {
    const text = (req.body.infoText || "").trim();
    if (!text || text === defaultInfoText) {
        resetInfoText();
    } else {
        cachedInfoText = text;
        infoCustom = true;
        infoDate = berlinDate();
        try {
            fs.writeFileSync(INFO_FILE, JSON.stringify({ text, date: infoDate }));
        } catch (e) {}
    }
    res.redirect('back');
});

app.get('/dashboard', (req, res) => {
    const userOptions = [...cachedData].sort((a,b) => a.n.localeCompare(b.n)).map(u => `<option value="${u.n}">${u.n}</option>`).join('');
    const cards = [...cachedData].sort((a,b) => a.r - b.r || a.n.localeCompare(b.n)).map(p => {
        return `
        <div class="card">
            ${renderAvatar(p)}
            <span class="name-label">${p.n}</span>
            <div class="status-badge ${p.c}">${p.e} ${p.t}</div>
            ${renderTooltip(p)}
        </div>`;
    }).join('');
    res.send(`<html>${htmlHead}<body>${styles}
        <div class="container">
            <div class="nav-bar">
                <button class="nav-btn" onclick="closeEmbed()">🏠 Dashboard</button>
                <a href="https://forms.gle/KnKo9CFDjvnMM1sj7" class="nav-btn" onclick="return openEmbed(this)">🤒 Krank</a>
                <a href="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform" data-src="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform?embedded=true" class="nav-btn" onclick="return openEmbed(this)">🌴 Urlaub</a>
                <a href="https://calendar.google.com/calendar/embed?src=ff6fe888ce2372b2a071807d3f707927304cbc43034474129ab499807a4080e2%40group.calendar.google.com&ctz=Europe%2FBerlin" class="nav-btn" onclick="return openEmbed(this)">📅 Abwesenheitskalender</a>
                <a href="https://mail.hd-werkstaetten.de/owa" class="nav-btn" onclick="return openEmbed(this)">📬 Outlook</a>
                <a href="https://ohheidelberg.github.io/oh-dokumente/?id=admin99" class="nav-btn" onclick="return openEmbed(this)">📂 Dokumente</a>
                <a href="/ticket" class="nav-btn" onclick="return openEmbed(this)">🔧 Hausmeister</a>
                <a href="https://forms.gle/KHjYAyxnNYCw7hYo7" class="nav-btn" onclick="return openEmbed(this)" style="border-color: #ff453a;">⚠️ Serverproblem</a>
                <a id="embedExternal" class="nav-btn embed-only" href="#" target="_blank" rel="noopener">↗ Neuer Tab</a>
                <button class="theme-btn" onclick="toggleTheme()">🌓</button>
            </div>
            <div class="grid dash-part">${cards}</div>
            <iframe id="embedFrame" class="embed-frame" title="Eingebettete Seite"></iframe>
            <form action="/update" class="footer-bar dash-part">
                <select name="user" id="userSelect" required><option value="" disabled selected>Mitarbeiter</option>${userOptions}</select>
                <select name="status">
                    <option value="da">🏢 Büro</option>
                    <option value="homeoffice">🏡 Homeoffice</option>
                    <option value="stoeren">🚫 Nicht stören</option>
                    <option value="unterwegs">🚗 Unterwegs</option>
                    <option value="uni">🎓 Uni</option>
                    <option value="pause">🥪 Pause</option>
                    <option value="urlaub">🌴 Urlaub</option>
                    <option value="weg">🌊 Abwesend</option>
                </select>
                <input type="time" name="bis"><button type="submit" class="btn-update">Update</button>
            </form>
            <form action="/update-info" method="POST" class="dash-part" style="margin-top: 10px; display: flex; gap: 8px;">
                <input type="text" name="infoText" value="${escapeHtml(cachedInfoText)}" placeholder="Info-Text für Empfang..." style="flex: 1;">
                <button type="submit" class="btn-update">Info setzen</button>
            </form>
        </div>
        <script>
            const sel = document.getElementById('userSelect');
            const saved = localStorage.getItem('selectedMitarbeiter');
            if (saved) sel.value = saved;
            sel.addEventListener('change', () => localStorage.setItem('selectedMitarbeiter', sel.value));
        </script></body></html>`);
});

// Admin99 Ansicht mit den zusätzlichen Buttons
app.get('/admin99', (req, res) => {
    const userOptions = [...cachedData].sort((a,b) => a.n.localeCompare(b.n)).map(u => `<option value="${u.n}">${u.n}</option>`).join('');
    const cards = [...cachedData].sort((a,b) => a.r - b.r || a.n.localeCompare(b.n)).map(p => {
        return `
        <div class="card">
            ${renderAvatar(p)}
            <span class="name-label">${p.n}</span>
            <div class="status-badge ${p.c}">${p.e} ${p.t}</div>
            ${renderTooltip(p)}
        </div>`;
    }).join('');
    res.send(`<html>${htmlHead}<body>${styles}
        <div class="container">
            <div class="nav-bar">
                <button class="nav-btn" onclick="closeEmbed()">🏠 Dashboard</button>
                <a href="https://forms.gle/KnKo9CFDjvnMM1sj7" class="nav-btn" onclick="return openEmbed(this)">🤒 Krank</a>
                <a href="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform" data-src="https://docs.google.com/forms/d/e/1FAIpQLSe3GoWxjG_9ouha7jRpCml_sr2cCNGeKhSQ_amT1z7d8TXCug/viewform?embedded=true" class="nav-btn" onclick="return openEmbed(this)">🌴 Urlaub</a>
                <a href="https://calendar.google.com/calendar/embed?src=ff6fe888ce2372b2a071807d3f707927304cbc43034474129ab499807a4080e2%40group.calendar.google.com&ctz=Europe%2FBerlin" class="nav-btn" onclick="return openEmbed(this)">📅 Abwesenheitskalender</a>
                <a href="https://mail.hd-werkstaetten.de/owa" class="nav-btn" onclick="return openEmbed(this)">📬 Outlook</a>
                <a href="https://ohheidelberg.github.io/oh-dokumente/?id=admin99" class="nav-btn" onclick="return openEmbed(this)">📂 Dokumente</a>
                <a href="/ticket" class="nav-btn" onclick="return openEmbed(this)">🔧 Hausmeister</a>
                <a href="https://docs.google.com/spreadsheets/d/1xzP5RzX2FCHs1fVaEDKPd4P-Szvo7rHRPzCmKul5rzM/edit?usp=sharing" target="_blank" class="nav-btn">🎉 Jubeltage</a>
                <a href="https://docs.google.com/spreadsheets/d/1YqfNMvrWAUH6otX3e7w8FbdyscSTZAZ-G6FTdKh9D_0/edit?usp=sharing" target="_blank" class="nav-btn">⏰ Präsenzzeiten</a>
                <a href="https://forms.gle/KHjYAyxnNYCw7hYo7" class="nav-btn" onclick="return openEmbed(this)" style="border-color: #ff453a;">⚠️️ Serverproblem</a>
                <a id="embedExternal" class="nav-btn embed-only" href="#" target="_blank" rel="noopener">↗ Neuer Tab</a>
                <button class="theme-btn" onclick="toggleTheme()">🌓</button>
            </div>
            <div class="grid dash-part">${cards}</div>
            <iframe id="embedFrame" class="embed-frame" title="Eingebettete Seite"></iframe>
            <form action="/update" class="footer-bar dash-part">
                <select name="user" id="userSelect" required><option value="" disabled selected>Mitarbeiter</option>${userOptions}</select>
                <select name="status">
                    <option value="da">🏢 Büro</option>
                    <option value="homeoffice">🏡 Homeoffice</option>
                    <option value="stoeren">🚫 Nicht stören</option>
                    <option value="unterwegs">🚗 Unterwegs</option>
                    <option value="uni">🎓 Uni</option>
                    <option value="pause">🥪 Pause</option>
                    <option value="urlaub">🌴 Urlaub</option>
                    <option value="weg">🌊 Abwesend</option>
                </select>
                <input type="time" name="bis"><button type="submit" class="btn-update">Update</button>
            </form>
            <form action="/update-info" method="POST" class="dash-part" style="margin-top: 10px; display: flex; gap: 8px;">
                <input type="text" name="infoText" value="${escapeHtml(cachedInfoText)}" placeholder="Info-Text für Empfang..." style="flex: 1;">
                <button type="submit" class="btn-update">Info setzen</button>
            </form>
        </div>
        <script>
            const sel = document.getElementById('userSelect');
            const saved = localStorage.getItem('selectedMitarbeiter');
            if (saved) sel.value = saved;
            sel.addEventListener('change', () => localStorage.setItem('selectedMitarbeiter', sel.value));
        </script></body></html>`);
});

app.get('/empfang', (req, res) => {

    // Dauer eines Durchlaufs in Sekunden (länger bei langem Text, max. 25s, damit 2 Durchläufe in 60s passen)
    const infoDur = Math.min(25, Math.max(10, 8 + (cachedInfoText || '').length * 0.12));

    // Nur "Im Büro" wird angezeigt, alles andere erscheint als "Abwesend"
    const empfangData = cachedData.map(p => {
        if (p.buero) return p;
        return { ...p, t: "Abwesend", e: "⚪", c: "bg-away", r: 8, dim: true };
    });

    // Kein Tooltip in der Empfangsansicht
    const cards = empfangData
        .sort((a, b) => a.r - b.r || a.n.localeCompare(b.n))
        .map(p => {
            return `
            <div class="card${p.dim ? ' absent' : ''}">
                ${renderAvatar(p)}
                <span class="name-label">${p.n}</span>
                <div class="status-badge ${p.c}">${p.e} ${p.t}</div>
            </div>`;
        }).join('');

    res.send(`
    <html>
    ${htmlHead}
    <body>
    ${styles}

        <div class="container">

            <!-- Nur Theme-Button -->
            <div style="
                display:flex;
                justify-content:flex-end;
                margin-bottom:8px;
            ">
                <button class="theme-btn" onclick="toggleTheme()">🌓</button>
            </div>

            <!-- Mitarbeiter -->
            <div class="grid">
                ${cards}
            </div>

            <!-- Infotext -->
            ${cachedInfoText ? `
            <div class="info-banner-container">
                <div class="info-banner">
                    <span class="info-text" data-custom="${infoCustom ? '1' : '0'}" style="--dur: ${infoDur}s;">${escapeHtml(cachedInfoText)}</span>
                </div>
            </div>
            ` : ''}

        </div>

    <script>
    (function() {
        var el = document.querySelector('.info-text');
        if (!el) return;
        var SLOT = 300000;   // alle 5 Minuten (zur vollen 5-Minuten-Marke)
        var SPEED = 280;     // Lauftext-Geschwindigkeit in Pixel pro Sekunde
        var announcing = false;

        function endAnnounce() {
            if (!announcing) return;
            announcing = false;
            document.body.classList.remove('announce');
            el.style.animation = 'none';
        }

        function startAnnounce() {
            if (announcing) return;
            announcing = true;
            document.body.classList.add('announce');
            el.style.animation = 'none';
            var w = el.getBoundingClientRect().width;
            var dur = Math.max(8, (window.innerWidth + w) / SPEED);
            void el.offsetWidth;
            el.style.animation = 'info-marquee ' + dur + 's linear 2';
            setTimeout(endAnnounce, dur * 2000 + 3000);
        }

        el.addEventListener('animationend', endAnnounce);

        function check() {
            // Große Anzeige nur, wenn der Infotext vom Standardtext abweicht
            if (el.getAttribute('data-custom') !== '1') return;
            var now = Date.now();
            var slot = Math.floor(now / SLOT);
            if (now - slot * SLOT > 60000) return;  // nur in der ersten Minute eines Fensters
            var last = 0;
            try { last = parseInt(localStorage.getItem('lastAnnounceSlot') || '0', 10); } catch (e) {}
            if (slot === last) return;
            try { localStorage.setItem('lastAnnounceSlot', String(slot)); } catch (e) {}
            startAnnounce();
        }
        setInterval(check, 5000);
    })();
    </script>

    </body>
    </html>
    `);
});

app.get('/update', async (req, res) => {
    const { user, status, bis } = req.query;
    const person = cachedData.find(r => r.n === user);
    if (person?.id && person.id !== "kein") {
        const h = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const map = { 
            da: ["Im Büro", ":office:"], 
            homeoffice: ["Homeoffice", ":house_with_garden:"], 
            stoeren: ["Nicht stören", ":no_entry_sign:"],
            besprechung: ["Nicht stören", ":no_entry_sign:"],
            unterwegs: ["Unterwegs", ":car:"], 
            uni: ["Uni", ":mortar_board:"], 
            pause: ["Pause", ":sandwich:"], 
            urlaub: ["Urlaub", ":palm_tree:"],
            weg: ["Abwesend", ":wave:"],
            feier: ["Mit Christine feiern", ":tada:"]
        };
        let [text, emoji] = map[status] || ["Im Büro", ":office:"];
let expiration = 0;
let displayText = text;

if (bis) {
    const [hours, minutes] = bis.split(':');

    const berlin = new Date(
        new Date().toLocaleString("en-US", {
            timeZone: "Europe/Berlin"
        })
    );

    let target = new Date(berlin);
    target.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    // Wenn die Uhrzeit bereits vorbei ist,
    // gilt sie für den nächsten Tag
    if (target <= berlin) {
        target.setDate(target.getDate() + 1);
    }

    expiration = Math.floor(Date.now() / 1000) +
                 Math.floor((target - berlin) / 1000);

    // Endzeit im sichtbaren Status anzeigen
    displayText = `${text} bis ${hours}:${minutes} Uhr`;
}
        


const uid = person.id.trim();
let previous = null;

if (status === 'pause') {
    const existing = pauseStorage[uid];
    if (existing && existing.isPause && existing.previous) {
        // Pause wird nur verlängert/geändert -> ursprünglichen Status behalten
        previous = existing.previous;
    } else {
        try {
            const cur = await getSlackStatus(uid, h);
            if (cur.text && !cur.text.toLowerCase().includes('pause')) {
                previous = cur;
            }
        } catch (e) {}
    }
}

try {
    await axios.post(
        'https://slack.com/api/users.profile.set',
        {
            user: person.id.trim(),
            profile: {
                status_text: displayText,
                status_emoji: emoji,
                status_expiration: expiration
            }
        },
        { headers: h }
    );

    // Automatische Rückstellung speichern
    if (expiration > 0) {
        pauseStorage[uid] = {
            expires: expiration,
            isPause: status === 'pause',
            previous
        };
    } else {
        delete pauseStorage[uid];
    }

    await updateData();

} catch (e) {
        console.log("Fehler beim Aktualisieren des Status:", e.message);
    }
    }

    res.redirect('back');
});

// ===================== HAUSMEISTER-TICKETSYSTEM =====================
// Eingabemaske:      /ticket            (Button "Hausmeister" im Dashboard)
// Status abrufen:    /ticket/status?nr=HM-XXXXXX
// Hausmeister:       /hausmeister       (Übersicht + Status per Klick)
//
// Umgebungsvariablen (alle optional):
//   TICKET_SHEET_URL    Web-App-URL des Google-Apps-Scripts (Tickets werden dauerhaft in einem Google Sheet gespeichert)
//   TICKET_SHEET_TOKEN  Geheimes Passwort, identisch mit TOKEN im Apps Script
//   TICKETS_FILE        Lokale Sicherungskopie / Zwischenspeicher (Standard ./tickets.json)
//   BASE_URL         Öffentliche Adresse des Servers für Links in E-Mails (z. B. https://mein-dashboard.onrender.com)
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true/false), SMTP_USER, SMTP_PASS   -> E-Mail-Versand (benötigt "npm install nodemailer")
//   MAIL_FROM        Absenderadresse (Standard: SMTP_USER)
//   HAUSMEISTER_MAIL E-Mail des Hausmeisters: bekommt neue Aufträge und ist Antwortadresse für Rückfragen

const crypto = require('crypto');
const TICKETS_FILE = process.env.TICKETS_FILE || './tickets.json';
const TICKET_STATI = ['Warteschlange', 'In Arbeit', 'Erledigt', 'Rückfrage offen'];
const TICKET_STATUS_CLASS = {
    'Warteschlange': 'st-wait',
    'In Arbeit': 'st-work',
    'Erledigt': 'st-done',
    'Rückfrage offen': 'st-question'
};

let tickets = [];
try {
    if (fs.existsSync(TICKETS_FILE)) tickets = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8'));
} catch (e) {
    console.log("Tickets konnten nicht geladen werden:", e.message);
    tickets = [];
}

function saveTickets() {
    try {
        fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2));
    } catch (e) {
        console.log("Tickets konnten nicht gespeichert werden:", e.message);
    }
}

// ---------- Dauerhafte Speicherung im Google Sheet (über Apps Script) ----------
const TICKET_SHEET_URL = process.env.TICKET_SHEET_URL || 'https://script.google.com/macros/s/AKfycbx-UPrrB_kf5jVqzkBvwWE5u2N7Av4wvqZzAwO9tN05o74OLh1Hc6siEMWzYRB9XkhjrA/exec';
const TICKET_SHEET_TOKEN = process.env.TICKET_SHEET_TOKEN || '';
const sheetEnabled = !!(TICKET_SHEET_URL && TICKET_SHEET_TOKEN);
const unsynced = new Set(); // Tickets, die noch nicht erfolgreich ins Sheet geschrieben wurden
let ticketsVersion = 0;     // zählt lokale Änderungen (schützt vor veralteten Abfrageergebnissen)

function normalizeSheetTicket(r) {
    if (!r || !String(r.nr || '').trim()) return null;
    const status = TICKET_STATI.find(s => s.toLowerCase() === String(r.status || '').trim().toLowerCase()) || 'Warteschlange';

    let history = [];
    try { history = JSON.parse(r.history || '[]'); } catch (e) { history = []; }
    if (!Array.isArray(history)) history = [];
    history = history.filter(h => h && h.ts && h.status);

    const createdAt = String(r.createdAt || '').trim() || (history[0] && history[0].ts) || new Date().toISOString();
    if (!history.length) history = [{ ts: createdAt, status, note: 'Auftrag eingegangen' }];

    // Datum: auch von Hand eingetragenes TT.MM.JJJJ akzeptieren
    let bis = String(r.bis || '').trim();
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(bis);
    if (m) bis = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bis)) bis = '';

    return {
        nr: normalizeNr(r.nr),
        createdAt,
        auftraggeber: String(r.auftraggeber || ''),
        titel: String(r.titel || ''),
        beschreibung: String(r.beschreibung || ''),
        bis,
        ort: String(r.ort || ''),
        adresse: String(r.adresse || ''),
        email: String(r.email || ''),
        status,
        history
    };
}

// Ticket ins Sheet schreiben (neu: ganze Zeile, bestehend: nur Status/Anmerkung/Verlauf)
async function pushTicket(ticket) {
    if (!sheetEnabled || !ticket) return;
    unsynced.add(ticket.nr);
    try {
        const last = ticket.history[ticket.history.length - 1] || {};
        const payload = { token: TICKET_SHEET_TOKEN, action: 'save', ticket: { ...ticket, note: last.note || '' } };
        const r = await axios.post(TICKET_SHEET_URL, JSON.stringify(payload), {
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            timeout: 20000,
            maxRedirects: 5
        });
        if (r.data && r.data.ok) {
            unsynced.delete(ticket.nr);
        } else {
            console.log("Ticket konnte nicht ins Sheet geschrieben werden:", (r.data && r.data.error) || "ungültige Antwort (Bereitstellung des Apps Scripts prüfen: Zugriff = Jeder)");
        }
    } catch (e) {
        console.log("Ticket-Übertragung ins Sheet fehlgeschlagen:", e.message);
    }
}

// Tickets aus dem Sheet laden (so werden auch Änderungen von Hand übernommen)
async function loadTicketsFromSheet() {
    if (!sheetEnabled) return;
    const versionAtStart = ticketsVersion;
    try {
        const r = await axios.get(TICKET_SHEET_URL, {
            params: { token: TICKET_SHEET_TOKEN, action: 'list' },
            timeout: 20000,
            maxRedirects: 5
        });
        if (!r.data || !r.data.ok || !Array.isArray(r.data.tickets)) {
            console.log("Tickets konnten nicht aus dem Sheet gelesen werden:", (r.data && r.data.error) || "ungültige Antwort (Bereitstellung des Apps Scripts prüfen)");
            return;
        }
        // Wurde währenddessen lokal etwas geändert, ist das Ergebnis veraltet -> beim nächsten Durchlauf erneut
        if (ticketsVersion !== versionAtStart) return;

        const fromSheet = r.data.tickets.map(normalizeSheetTicket).filter(Boolean).filter(t => !unsynced.has(t.nr));
        const localPending = tickets.filter(t => unsynced.has(t.nr));
        tickets = [...fromSheet, ...localPending];
        saveTickets();

        // Fehlgeschlagene Übertragungen erneut versuchen
        for (const nr of [...unsynced]) {
            const t = tickets.find(x => x.nr === nr);
            if (t) await pushTicket(t); else unsynced.delete(nr);
        }
    } catch (e) {
        console.log("Ticket-Abfrage aus dem Sheet fehlgeschlagen:", e.message);
    }
}

// E-Mail-Versand (nur aktiv, wenn SMTP_HOST gesetzt und nodemailer installiert ist)
let mailer = null;
try {
    if (process.env.SMTP_HOST) {
        const nodemailer = require('nodemailer');
        mailer = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
        });
    }
} catch (e) {
    console.log("E-Mail-Versand nicht verfügbar (nodemailer installiert?):", e.message);
}

async function sendMail(to, subject, text) {
    if (!mailer || !to) return;
    try {
        await mailer.sendMail({
            from: process.env.MAIL_FROM || process.env.SMTP_USER,
            to,
            replyTo: process.env.HAUSMEISTER_MAIL || undefined,
            subject,
            text
        });
    } catch (e) {
        console.log("Fehler beim E-Mail-Versand:", e.message);
    }
}

function clip(v, max) {
    return String(v || '').trim().slice(0, max);
}

function isValidEmail(m) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m);
}

// Ticketnummer: HM- plus 6 zufällige Zeichen (nicht erratbar, keine verwechselbaren Zeichen)
function newTicketNr() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let nr;
    do {
        nr = 'HM-';
        for (let i = 0; i < 6; i++) nr += alphabet[crypto.randomInt(alphabet.length)];
    } while (tickets.some(t => t.nr === nr));
    return nr;
}

function normalizeNr(input) {
    let n = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
    if (n && !n.startsWith('HM-')) n = 'HM-' + n.replace(/^HM/, '');
    return n;
}

function formatTs(iso) {
    try {
        return new Date(iso).toLocaleString('de-DE', {
            timeZone: 'Europe/Berlin',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) { return iso; }
}

function formatDateLong(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : (str || '');
}

function baseUrl(req) {
    if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/+$/, '');
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    return proto + '://' + req.get('host');
}

const ticketStyles = `
<style>
  :root { --bg:#f2f2f7; --card:#ffffff; --text:#000000; --muted:#6c6c70; --accent:#007aff; --border:#d1d1d6; --input:#ffffff; }
  [data-theme="dark"] { --bg:#000000; --card:#1c1c1e; --text:#ffffff; --muted:#98989d; --accent:#0a84ff; --border:#38383a; --input:#2c2c2e; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, sans-serif; background: var(--bg); color: var(--text); }
  .wrap { max-width: 720px; margin: 0 auto; padding: 16px; }
  .wrap.wide { max-width: 1100px; }
  h1 { font-size: 1.4rem; margin: 4px 0 12px; }
  h2 { font-size: 1.1rem; margin: 0 0 10px; }
  .box { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  label { display: block; font-weight: 700; font-size: 0.85rem; margin: 12px 0 4px; }
  label .opt { font-weight: 400; color: var(--muted); }
  input, textarea { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--input); color: var(--text); font: inherit; }
  textarea { min-height: 110px; resize: vertical; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .row > div { flex: 1 1 220px; }
  .btn { display: inline-block; padding: 10px 16px; border: none; border-radius: 10px; background: var(--accent); color: #fff; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; margin-top: 6px; }
  .btn.secondary { background: var(--border); color: var(--text); }
  .hint { color: var(--muted); font-size: 0.85rem; }
  .error { background: rgba(255,69,58,0.15); color: #ff453a; padding: 10px; border-radius: 10px; margin-bottom: 12px; font-weight: 700; }
  .nr { font-size: 2rem; font-weight: 900; letter-spacing: 2px; text-align: center; padding: 12px; background: var(--bg); border-radius: 12px; margin: 12px 0; user-select: all; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-weight: 800; font-size: 0.85rem; white-space: nowrap; }
  .st-wait { background: rgba(142,142,147,0.25); color: #8e8e93; }
  .st-work { background: rgba(255,159,10,0.25); color: #d98200; }
  .st-done { background: rgba(50,215,75,0.22); color: #25a244; }
  .st-question { background: rgba(255,69,58,0.2); color: #ff453a; }
  .timeline { list-style: none; padding: 0; margin: 0; }
  .timeline li { padding: 8px 0; border-top: 1px solid var(--border); }
  .timeline li:first-child { border-top: none; }
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .tab { padding: 8px 14px; border-radius: 999px; background: var(--card); border: 1px solid var(--border); color: var(--text); text-decoration: none; font-weight: 700; }
  .tab.active { border-color: var(--accent); color: var(--accent); }
  .ticket { border-left: 6px solid var(--border); }
  .ticket.b-st-wait { border-left-color: #8e8e93; }
  .ticket.b-st-work { border-left-color: #ff9f0a; }
  .ticket.b-st-done { border-left-color: #32d74b; }
  .ticket.b-st-question { border-left-color: #ff453a; }
  .t-head { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: flex-start; }
  .t-title { font-weight: 800; font-size: 1.1rem; }
  .t-meta { color: var(--muted); font-size: 0.85rem; margin: 4px 0 8px; }
  .t-desc { white-space: pre-wrap; margin: 8px 0; }
  .t-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 6px 14px; font-size: 0.9rem; margin: 8px 0; }
  .overdue { color: #ff453a; font-weight: 800; }
  .st-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 8px; }
  .st-btn { padding: 12px 8px; border-radius: 10px; border: 2px solid transparent; background: var(--input); color: var(--text); font: inherit; font-weight: 800; cursor: pointer; }
  .st-btn.current { outline: 3px solid var(--accent); }
  a { color: var(--accent); }
</style>`;

function ticketPage(title, bodyHtml, wide) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<script>
(function() {
    var t = null;
    try { t = localStorage.getItem('theme'); } catch (e) {}
    if (t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();
</script>
${ticketStyles}
</head>
<body>
<div class="wrap${wide ? ' wide' : ''}">${bodyHtml}</div>
</body>
</html>`;
}

function renderTicketForm(values, error) {
    values = values || {};
    const v = k => escapeHtml(values[k] || '');
    return ticketPage('Hausmeisterauftrag', `
        <h1>🔧 Hausmeister</h1>

        <div class="box">
            <h2>Status eines Auftrags abrufen</h2>
            <form method="GET" action="/ticket/status" class="row" style="align-items: flex-end;">
                <div>
                    <label>Ticketnummer</label>
                    <input name="nr" placeholder="z. B. HM-7K4Q2X" required autocomplete="off">
                </div>
                <div style="flex: 0 0 auto;">
                    <button type="submit" class="btn">Status anzeigen</button>
                </div>
            </form>
        </div>

        <div class="box">
            <h2>Neuer Auftrag</h2>
            ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
            <form method="POST" action="/ticket/neu">
                <label>Auftraggeber *</label>
                <input name="auftraggeber" value="${v('auftraggeber')}" required maxlength="100">

                <label>Titel *</label>
                <input name="titel" value="${v('titel')}" required maxlength="150">

                <label>Beschreibung *</label>
                <textarea name="beschreibung" required maxlength="3000">${v('beschreibung')}</textarea>

                <div class="row">
                    <div>
                        <label>Bitte erledigen bis <span class="opt">(optional)</span></label>
                        <input type="date" name="bis" min="${berlinDate()}" value="${v('bis')}">
                    </div>
                    <div>
                        <label>E-Mail für Rückfragen und Statusmeldungen *</label>
                        <input type="email" name="email" value="${v('email')}" required maxlength="200">
                    </div>
                </div>

                <label>Ort *</label>
                <input name="ort" value="${v('ort')}" placeholder="z. B. Gebäude A, Raum 12" required maxlength="150">

                <label>Adresse <span class="opt">(optional)</span></label>
                <input name="adresse" value="${v('adresse')}" placeholder="Straße, PLZ Ort" maxlength="200">

                <div style="position: absolute; left: -9999px;" aria-hidden="true">
                    <input name="website" tabindex="-1" autocomplete="off">
                </div>

                <p class="hint">* Pflichtfeld</p>
                <button type="submit" class="btn">Auftrag absenden</button>
            </form>
        </div>
    `);
}

app.get('/ticket', (req, res) => {
    res.send(renderTicketForm());
});

app.post('/ticket/neu', (req, res) => {
    const b = req.body || {};
    if (b.website) return res.redirect('/ticket'); // Honeypot gegen Spam-Bots

    const data = {
        auftraggeber: clip(b.auftraggeber, 100),
        titel: clip(b.titel, 150),
        beschreibung: clip(b.beschreibung, 3000),
        bis: /^\d{4}-\d{2}-\d{2}$/.test(b.bis || '') ? b.bis : '',
        ort: clip(b.ort, 150),
        adresse: clip(b.adresse, 200),
        email: clip(b.email, 200)
    };

    if (!data.auftraggeber || !data.titel || !data.beschreibung || !data.ort) {
        return res.status(400).send(renderTicketForm(data, 'Bitte alle Pflichtfelder ausfüllen.'));
    }
    if (!isValidEmail(data.email)) {
        return res.status(400).send(renderTicketForm(data, 'Bitte eine gültige E-Mail-Adresse angeben.'));
    }

    const now = new Date().toISOString();
    const ticket = {
        nr: newTicketNr(),
        createdAt: now,
        ...data,
        status: 'Warteschlange',
        history: [{ ts: now, status: 'Warteschlange', note: 'Auftrag eingegangen' }]
    };
    tickets.push(ticket);
    ticketsVersion++;
    saveTickets();
    pushTicket(ticket);

    const base = baseUrl(req);
    const statusLink = `${base}/ticket/status?nr=${encodeURIComponent(ticket.nr)}`;

    sendMail(ticket.email, `Hausmeisterauftrag ${ticket.nr} eingegangen`,
        `Hallo ${ticket.auftraggeber},\n\n` +
        `Ihr Auftrag wurde aufgenommen.\n\n` +
        `Ticketnummer: ${ticket.nr}\n` +
        `Titel: ${ticket.titel}\n` +
        `Status: ${ticket.status}\n\n` +
        `Status abrufen: ${statusLink}\n\n` +
        `Bei Statusänderungen und Rückfragen melden wir uns an diese Adresse.`);

    if (process.env.HAUSMEISTER_MAIL) {
        sendMail(process.env.HAUSMEISTER_MAIL, `Neuer Auftrag ${ticket.nr}: ${ticket.titel}`,
            `Neuer Hausmeisterauftrag\n\n` +
            `Ticketnummer: ${ticket.nr}\n` +
            `Auftraggeber: ${ticket.auftraggeber} (${ticket.email})\n` +
            `Titel: ${ticket.titel}\n` +
            `Ort: ${ticket.ort}${ticket.adresse ? ', ' + ticket.adresse : ''}\n` +
            `Bitte erledigen bis: ${ticket.bis ? formatDateLong(ticket.bis) : 'keine Angabe'}\n\n` +
            `${ticket.beschreibung}\n\n` +
            `Übersicht: ${base}/hausmeister`);
    }

    res.send(ticketPage('Auftrag eingegangen', `
        <h1>✅ Auftrag eingegangen</h1>
        <div class="box">
            <p>Ihre Ticketnummer:</p>
            <div class="nr">${escapeHtml(ticket.nr)}</div>
            <p>Bitte notieren Sie sich die Nummer. Damit können Sie den Status jederzeit unter „Hausmeister“ abrufen.</p>
            ${mailer ? `<p class="hint">Eine Bestätigung wird an ${escapeHtml(ticket.email)} gesendet.</p>` : ''}
            <a class="btn" href="/ticket/status?nr=${encodeURIComponent(ticket.nr)}">Status anzeigen</a>
            <a class="btn secondary" href="/ticket">Neuer Auftrag</a>
        </div>
    `));
});

app.get('/ticket/status', (req, res) => {
    const nr = normalizeNr(req.query.nr);
    const t = tickets.find(x => x.nr === nr);

    if (!t) {
        return res.status(404).send(ticketPage('Ticket nicht gefunden', `
            <h1>🔧 Hausmeister</h1>
            <div class="box">
                <div class="error">Zu dieser Ticketnummer wurde kein Auftrag gefunden.</div>
                <p class="hint">Bitte die Nummer prüfen (Format: HM-XXXXXX).</p>
                <a class="btn" href="/ticket">Zurück</a>
            </div>
        `));
    }

    const history = [...t.history].reverse().map(h => `
        <li>
            <span class="badge ${TICKET_STATUS_CLASS[h.status] || 'st-wait'}">${escapeHtml(h.status)}</span>
            <span class="hint">${escapeHtml(formatTs(h.ts))}</span>
            ${h.note ? `<div>${escapeHtml(h.note)}</div>` : ''}
        </li>`).join('');

    res.send(ticketPage('Ticket ' + t.nr, `
        <h1>🔧 Auftrag ${escapeHtml(t.nr)}</h1>
        <div class="box">
            <span class="badge ${TICKET_STATUS_CLASS[t.status] || 'st-wait'}" style="font-size: 1.1rem;">${escapeHtml(t.status)}</span>
            <h2 style="margin-top: 12px;">${escapeHtml(t.titel)}</h2>
            <div class="t-desc">${escapeHtml(t.beschreibung)}</div>
            <div class="t-info">
                <div><b>Auftraggeber:</b> ${escapeHtml(t.auftraggeber)}</div>
                <div><b>Ort:</b> ${escapeHtml(t.ort)}${t.adresse ? ', ' + escapeHtml(t.adresse) : ''}</div>
                <div><b>Bitte erledigen bis:</b> ${t.bis ? escapeHtml(formatDateLong(t.bis)) : 'keine Angabe'}</div>
                <div><b>Eingegangen:</b> ${escapeHtml(formatTs(t.createdAt))}</div>
            </div>
        </div>
        <div class="box">
            <h2>Verlauf</h2>
            <ul class="timeline">${history}</ul>
        </div>
        <a class="btn" href="/ticket/status?nr=${encodeURIComponent(t.nr)}">Aktualisieren</a>
        <a class="btn secondary" href="/ticket">Zurück</a>
    `));
});

// ---------- Hausmeister-Übersicht ----------
const HM_FILTERS = ['offen', 'erledigt', 'alle'];

function renderHausmeisterTicket(t, f, today) {
    const overdue = t.bis && t.bis < today && t.status !== 'Erledigt';
    const last = t.history[t.history.length - 1] || {};
    const buttons = TICKET_STATI.map(s =>
        `<button type="submit" name="status" value="${escapeHtml(s)}" class="st-btn ${TICKET_STATUS_CLASS[s]}${t.status === s ? ' current' : ''}">${escapeHtml(s)}</button>`
    ).join('');
    const mapLink = t.adresse
        ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.adresse)}" target="_blank" rel="noopener">Karte</a>`
        : '';
    const mailSubject = encodeURIComponent(`Hausmeisterauftrag ${t.nr}: ${t.titel}`);

    return `
    <div class="box ticket b-${TICKET_STATUS_CLASS[t.status] || 'st-wait'}" id="${escapeHtml(t.nr)}">
        <div class="t-head">
            <div>
                <div class="t-title">${escapeHtml(t.titel)}</div>
                <div class="t-meta">${escapeHtml(t.nr)} · eingegangen ${escapeHtml(formatTs(t.createdAt))}</div>
            </div>
            <span class="badge ${TICKET_STATUS_CLASS[t.status] || 'st-wait'}">${escapeHtml(t.status)}</span>
        </div>
        <div class="t-desc">${escapeHtml(t.beschreibung)}</div>
        <div class="t-info">
            <div><b>Von:</b> ${escapeHtml(t.auftraggeber)} · <a href="mailto:${escapeHtml(t.email)}?subject=${mailSubject}">${escapeHtml(t.email)}</a></div>
            <div><b>Ort:</b> ${escapeHtml(t.ort)}${t.adresse ? ', ' + escapeHtml(t.adresse) : ''}${mapLink}</div>
            <div><b>Bis:</b> ${t.bis ? escapeHtml(formatDateLong(t.bis)) : 'keine Angabe'}${overdue ? ' <span class="overdue">überfällig</span>' : ''}</div>
            ${last.note && last.note !== 'Auftrag eingegangen' ? `<div><b>Letzte Anmerkung:</b> ${escapeHtml(last.note)} <span class="hint">(${escapeHtml(formatTs(last.ts))})</span></div>` : ''}
        </div>
        <form method="POST" action="/hausmeister/status">
            <input type="hidden" name="nr" value="${escapeHtml(t.nr)}">
            <input type="hidden" name="f" value="${escapeHtml(f)}">
            <input type="text" name="note" maxlength="500" placeholder="Anmerkung oder Rückfrage an den Auftraggeber (optional, wird per E-Mail mitgeschickt)" onkeydown="if (event.key === 'Enter') { event.preventDefault(); }">
            <div class="st-buttons">${buttons}</div>
        </form>
    </div>`;
}

app.get('/hausmeister', (req, res) => {
    const f = HM_FILTERS.includes(req.query.f) ? req.query.f : 'offen';
    const today = berlinDate();

    const list = tickets.filter(t =>
        f === 'alle' ? true : (f === 'erledigt' ? t.status === 'Erledigt' : t.status !== 'Erledigt')
    );
    list.sort((a, b) => {
        if (f === 'offen') {
            const da = a.bis || '9999-99-99';
            const db = b.bis || '9999-99-99';
            return da.localeCompare(db) || a.createdAt.localeCompare(b.createdAt);
        }
        return b.createdAt.localeCompare(a.createdAt);
    });

    const cnt = s => tickets.filter(t => t.status === s).length;
    const openCount = tickets.filter(t => t.status !== 'Erledigt').length;
    const cards = list.map(t => renderHausmeisterTicket(t, f, today)).join('');

    res.send(ticketPage('Hausmeister Aufträge', `
        <h1>🔧 Hausmeister – Aufträge</h1>
        <div class="tabs">
            <a class="tab${f === 'offen' ? ' active' : ''}" href="/hausmeister?f=offen">Offen (${openCount})</a>
            <a class="tab${f === 'erledigt' ? ' active' : ''}" href="/hausmeister?f=erledigt">Erledigt (${cnt('Erledigt')})</a>
            <a class="tab${f === 'alle' ? ' active' : ''}" href="/hausmeister?f=alle">Alle (${tickets.length})</a>
            <a class="tab" href="/ticket">➕ Auftrag erfassen</a>
        </div>
        <p class="hint">Warteschlange: ${cnt('Warteschlange')} · In Arbeit: ${cnt('In Arbeit')} · Rückfrage offen: ${cnt('Rückfrage offen')}</p>
        ${cards || '<div class="box">Keine Aufträge in dieser Ansicht.</div>'}
        <script>
        setInterval(function() {
            var typing = false;
            document.querySelectorAll('input[name="note"]').forEach(function(i) { if (i.value) typing = true; });
            if (!typing && !document.hidden && document.activeElement.tagName !== 'INPUT') location.reload();
        }, 60000);
        </script>
    `, true));
});

app.post('/hausmeister/status', (req, res) => {
    const b = req.body || {};
    const back = '/hausmeister' + (HM_FILTERS.includes(b.f) ? '?f=' + b.f : '');
    const t = tickets.find(x => x.nr === b.nr);
    const status = b.status;
    const note = clip(b.note, 500);

    if (!t || !TICKET_STATI.includes(status)) return res.redirect(back);

    // Nur speichern, wenn sich der Status ändert oder eine Anmerkung dabei ist
    if (t.status !== status || note) {
        t.status = status;
        t.history.push({ ts: new Date().toISOString(), status, note });
        ticketsVersion++;
        saveTickets();
        pushTicket(t);

        const link = `${baseUrl(req)}/ticket/status?nr=${encodeURIComponent(t.nr)}`;
        sendMail(t.email, `Hausmeisterauftrag ${t.nr}: ${status}`,
            `Hallo ${t.auftraggeber},\n\n` +
            `der Status Ihres Auftrags „${t.titel}“ (${t.nr}) hat sich geändert:\n\n` +
            `Neuer Status: ${status}\n` +
            (note ? `Anmerkung: ${note}\n` : '') +
            `\nStatus abrufen: ${link}\n` +
            (status === 'Rückfrage offen' ? `\nBitte antworten Sie auf diese E-Mail, um die Rückfrage zu beantworten.\n` : ''));
    }
    res.redirect(back);
});
if (sheetEnabled) {
    loadTicketsFromSheet();
    setInterval(loadTicketsFromSheet, 60000);
} else {
    console.log("Tickets werden nur lokal gespeichert (TICKET_SHEET_URL / TICKET_SHEET_TOKEN nicht gesetzt).");
}
// ===================== ENDE HAUSMEISTER-TICKETSYSTEM =====================

app.listen(port, () => {
    console.log(`Server läuft auf Port ${port}`);
});
