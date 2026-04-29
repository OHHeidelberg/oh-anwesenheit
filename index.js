const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const cron = require('node-cron');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

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
app.get('/trigger-reset', async (req, res) => {
    const success = await resetAllStatuses();
    res.send(success ? "Reset abgeschlossen" : "Fehler");
});

// --- STYLES ---
const styles = `
<style>
  body{font-family:sans-serif;background:#f0f2f5;display:flex;flex-direction:column;align-items:center;margin:0;padding:10px 10px 140px 10px}
  .container{width:98%;text-align:center}
  .nav-bar { display: flex; gap: 10px; justify-content: center; margin-bottom: 25px; flex-wrap: wrap; }
  .nav-btn { text-decoration: none; background: #fff; color: #1d1d1f; padding: 10px 18px; border-radius: 20px; font-size: 0.9rem; font-weight: 700; border: 1px solid #ddd; box-shadow: 0 2px 6px rgba(0,0,0,0.08); display: flex; align-items: center; gap: 6px; }
  .grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:15px;width:100%;justify-content:center}
  .card{background:#fff;padding:15px;border-radius:18px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.05);max-width:200px;margin:0 auto}
  .avatar{width:75px;height:75px;border-radius:50%;border:4px solid #fff;object-fit:cover}
  .border-active{border-color:#28a745}
  .border-red{border-color:#d32f2f}
  .border-home{border-color:#ffc107}
  .border-away{border-color:#d1d1d6;filter:grayscale(1);opacity:0.5}
  .status-badge{margin-top:8px;padding:6px;border-radius:15px;font-size:0.75rem;font-weight:700;display:flex;justify-content:center;align-items:center}
  .bg-active{background:#e6f4ea;color:#1e7e34}
  .bg-red{background:#ffebee;color:#d32f2f}
  .bg-home{background:#fff9e6;color:#947600}
  .bg-away{background:#f5f5f7;color:#86868b}
  .footer-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; border-top: 1px solid #ddd; padding: 20px; display: flex; justify-content: center; gap: 10px; box-shadow: 0 -4px 15px rgba(0,0,0,0.1); }
  select, button { padding: 12px; border-radius: 8px; border: 1px solid #ccc; font-size: 1rem; }
  .btn-update { background: #007aff; color: #fff; border: none; cursor: pointer; font-weight: bold; }
</style>`;

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

app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    const map = { da: ["Im Büro", ":office:"], homeoffice: ["Homeoffice", ":house_with_garden:"], besprechung: ["Besprechung", ":calendar:"], unterwegs: ["Unterwegs", ":car:"], krank: ["Krank", ":face_with_thermometer:"], urlaub: ["Urlaub", ":palm_tree:"], weg: ["Abwesend", ":wave:"] };
    const val = map[status] || ["Abwesend", ":wave:"];
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const person = rows.find(r => r[0] === user);
        if (person) {
            await axios.post('https://slack.com/api/users.profile.set', { user: person[1].trim(), profile: { status_text: val[0], status_emoji: val[1] } }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
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

        const cards = data.map(p => `<div class="card"><img src="${p.p}" class="avatar ${p.b}"><div style="margin:8px 0;font-weight:bold">${p.n}</div><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
        const userOptions = nameList.map(u => `<option value="${u.n}">${u.n}</option>`).join('');
        
        // DAS SKRIPT ZUM SPEICHERN UND LADEN DES NAMENS
        const footerScript = `
            <script>
                const select = document.getElementById('userSelect');
                const savedUser = localStorage.getItem('lastUser');
                if (savedUser) { select.value = savedUser; }
                function saveUser() { localStorage.setItem('lastUser', select.value); }
            </script>`;

        const footerForm = `
            <form action="/update" method="get" class="footer-bar" onsubmit="saveUser()">
                <select name="user" id="userSelect" required>
                    <option value="" disabled selected>Mitarbeiter wählen</option>
                    ${userOptions}
                </select>
                <select name="status" required>
                    <option value="da">🏢 Im Büro</option>
                    <option value="homeoffice">🏡 Homeoffice</option>
                    <option value="besprechung">🗓️ Besprechung</option>
                    <option value="unterwegs">🚗 Unterwegs</option>
                    <option value="krank">🤒 Krank</option>
                    <option value="urlaub">🌴 Urlaub</option>
                    <option value="weg">⚪ Abwesend</option>
                </select>
                <button type="submit" class="btn-update">Update</button>
            </form>`;

        res.send(`<html><head><meta http-equiv="refresh" content="60"></head>${styles}<body><div class="container"><h1>Offene Hilfen Dashboard</h1><div class="grid">${cards}</div></div>${footerForm}${footerScript}</body></html>`);
    } catch (e) { res.status(500).send("Fehler."); }
});

app.get('/empfang', async (req, res) => {
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const data = await Promise.all(rows.map(async r => ({ n: r[0], ...(await getFullStatus(r[1])) })));
        const finalData = data.map(p => {
            const isPresent = p.t.toLowerCase().includes("büro") || p.t.toLowerCase().includes("da");
            return isPresent ? p : { ...p, t: "Abwesend", e: "⚪", c: "bg-away", b: "border-away" };
        });
        finalData.sort((a, b) => (a.t === "Abwesend") - (b.t === "Abwesend") || a.n.localeCompare(b.n));
        const cards = finalData.map(p => `<div class="card"><img src="${p.p}" class="avatar ${p.b}" onerror="this.src='https://via.placeholder.com/75'"><div style="margin:8px 0;font-weight:bold">${p.n}</div><div class="status-badge ${p.c}">${p.e} ${p.t}</div></div>`).join('');
        res.send(`<html><head><meta http-equiv="refresh" content="60"></head><body>${styles}<div class="container"><h1>Wer ist im Haus?</h1><div class="grid">${cards}</div></div></body></html>`);
    } catch (e) { res.status(500).send("Fehler."); }
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(port, '0.0.0.0', () => console.log("Online"));
