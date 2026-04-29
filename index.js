const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const cron = require('node-cron');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

// --- RESET LOGIK (bleibt gleich) ---
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
app.get('/trigger-reset', async (req, res) => {
    const success = await resetAllStatuses();
    res.send(success ? "Reset abgeschlossen" : "Fehler");
});

// --- GEMEINSAME STYLES ---
const styles = `
<style>
  body{font-family:sans-serif;background:#f0f2f5;display:flex;flex-direction:column;align-items:center;margin:0;padding:20px}
  .container{width:98%;text-align:center}
  .grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));gap:20px;width:100%;justify-content:center}
  .card{background:#fff;padding:20px;border-radius:18px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.05);max-width:220px;margin:0 auto}
  .avatar{width:90px;height:90px;border-radius:50%;border:5px solid #fff;object-fit:cover;margin-bottom:10px}
  .border-active{border-color:#28a745}
  .border-away{border-color:#d1d1d6;filter:grayscale(1);opacity:0.4}
  .status-badge{padding:8px;border-radius:15px;font-size:0.8rem;font-weight:700;display:flex;justify-content:center;align-items:center}
  .bg-active{background:#e6f4ea;color:#1e7e34}
  .bg-away{background:#f5f5f7;color:#86868b}
  .name{font-size:1.1rem;font-weight:bold;margin-bottom:10px}
  
  /* Nur für das Dashboard relevant */
  .nav-bar { display: flex; gap: 10px; justify-content: center; margin-bottom: 25px; flex-wrap: wrap; }
  .nav-btn { text-decoration: none; background: #fff; color: #1d1d1f; padding: 10px 18px; border-radius: 20px; font-size: 0.9rem; font-weight: 700; border: 1px solid #ddd; box-shadow: 0 2px 6px rgba(0,0,0,0.08); display: flex; align-items: center; gap: 6px; }
  .btn-outlook { color: #0078d4; border-color: #0078d4; }
  .footer-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; border-top: 1px solid #ddd; padding: 20px; display: flex; justify-content: center; gap: 10px; box-shadow: 0 -4px 15px rgba(0,0,0,0.1); }
  .btn-update { background: #007aff; color: #fff; border: none; cursor: pointer; font-weight: bold; padding: 12px 20px; border-radius: 8px; }
</style>`;

// --- STATUS LOGIK ---
async function getStatus(id) {
    try {
        const h = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const [p, s] = await Promise.all([
            axios.get(`https://slack.com/api/users.profile.get?user=${id.trim()}`, { headers: h, timeout: 4000 }).catch(() => ({data:{}})),
            axios.get(`https://slack.com/api/users.getPresence?user=${id.trim()}`, { headers: h, timeout: 4000 }).catch(() => ({data:{}}))
        ]);
        const prof = p.data.profile || {};
        const txt = (prof.status_text || "").toLowerCase();
        const online = s.data.presence === 'active';
        
        // Prüfung auf "Im Büro" oder "Da"
        const isPresent = txt.includes("büro") || txt.includes(" da") || txt === "da";
        
        if (isPresent) {
            return { t: prof.status_text || "Im Haus", e: "🏢", c: "bg-active", b: "border-active", p: prof.image_192 };
        } else {
            return { t: "Abwesend", e: "⚪", c: "bg-away", b: "border-away", p: prof.image_192 };
        }
    } catch (e) { return { t: "Unbekannt", e: "❓", c: "bg-away", b: "border-away", p: "" }; }
}

// --- NEUE ROUTE: EMPFANGS-DISPLAY ---
app.get('/empfang', async (req, res) => {
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const data = await Promise.all(rows.map(async r => ({ n: r[0], ...(await getStatus(r[1])) })));
        
        // Sortierung: Wer da ist, kommt nach oben
        data.sort((a, b) => (a.t === "Abwesend") - (b.t === "Abwesend") || a.n.localeCompare(b.n));

        const cards = data.map(p => `
            <div class="card">
                <img src="${p.p}" class="avatar ${p.b}" onerror="this.src='https://via.placeholder.com/90'">
                <div class="name">${p.n}</div>
                <div class="status-badge ${p.c}">${p.e} ${p.t}</div>
            </div>`).join('');

        res.send(`<html><head><meta http-equiv="refresh" content="60"><title>Empfang</title></head>${styles}<body><div class="container"><h1>Wer ist im Haus?</h1><div class="grid">${cards}</div></div></body></html>`);
    } catch (e) { res.status(500).send("Fehler."); }
});

// --- DASHBOARD ROUTE (unverändert mit Buttons/Footer) ---
// ... (Hier folgt der Code für /dashboard wie bisher, falls du beide brauchst)
// Der Übersicht halber hier abgekürzt, du kannst die Dashboard-Logik von oben einfach beibehalten.

app.get('/dashboard', async (req, res) => {
    // Hier den ursprünglichen Dashboard-Code einfügen (mit Nav-Bar und Footer)
    // Damit hättest du zwei Ansichten: Eine für Mitarbeiter (/dashboard) und eine für den Eingang (/empfang)
});

app.get('/', (req, res) => res.redirect('/empfang'));
app.listen(port, '0.0.0.0', () => console.log("Online"));
