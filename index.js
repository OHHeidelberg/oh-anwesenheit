const express = require('express');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const app = express();
const port = process.env.PORT || 10000;

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQKp0oJEEuoypAf3kFwxNZRkfZvIVbKUiBUzom2WDJc5_sd_SE13WMi2Lm0Wu9iccCQk8cTRP9GbYJ5/pub?output=csv';

const styles = `
<style>
  body{font-family:sans-serif;background:#f0f2f5;display:flex;flex-direction:column;align-items:center;margin:0;padding:10px 10px 100px 10px}
  .container{width:98%;text-align:center}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:15px;width:100%;justify-content:center}
  .card{background:#fff;padding:15px;border-radius:18px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.05);max-width:200px;margin:0 auto}
  .avatar{width:75px;height:75px;border-radius:50%;border:4px solid #fff;object-fit:cover}
  .border-active{border-color:#28a745}
  .border-home{border-color:#ffc107}
  .border-away{border-color:#d1d1d6;filter:grayscale(1);opacity:0.5}
  .status-badge{margin-top:8px;padding:6px;border-radius:15px;font-size:0.75rem;font-weight:700;display:flex;justify-content:center;align-items:center}
  .bg-active{background:#e6f4ea;color:#1e7e34}
  .bg-home{background:#fff9e6;color:#947600}
  .bg-away{background:#f5f5f7;color:#86868b}
  .info{margin-top:20px;font-size:0.7rem;color:#888}
  
  /* Fixierte Leiste unten */
  .footer-bar {
    position: fixed; bottom: 0; left: 0; width: 100%;
    background: #fff; border-top: 1px solid #ddd;
    padding: 15px; display: flex; justify-content: center; align-items: center;
    gap: 10px; box-shadow: 0 -2px 10px rgba(0,0,0,0.05); z-index: 1000;
  }
  select, button {
    padding: 10px; border-radius: 8px; border: 1px solid #ccc; font-size: 0.9rem;
  }
  button {
    background: #007aff; color: #fff; border: none; cursor: pointer; font-weight: bold;
  }
  button:hover { background: #0056b3; }
</style>`;

async function getStatus(id) {
    if (!id) return { t: "ID fehlt", e: "❓", c: "bg-away", b: "border-away", p: "", r: 9 };
    try {
        const h = { Authorization: `Bearer ${SLACK_TOKEN}` };
        const [p, s] = await Promise.all([
            axios.get(`https://slack.com/api/users.profile.get?user=${id}`, { headers: h, timeout: 4000 }).catch(() => ({data:{}})),
            axios.get(`https://slack.com/api/users.getPresence?user=${id}`, { headers: h, timeout: 4000 }).catch(() => ({data:{}}))
        ]);
        const prof = p.data.profile || {};
        const online = s.data.presence === 'active';
        const txt = prof.status_text || "";
        let res = { t: txt || (online ? "Online" : "Abwesend"), e: "📍", c: "bg-away", b: "border-away", p: prof.image_192, r: 5 };
        
        if (txt.toLowerCase().includes("büro") || txt.toLowerCase().includes("da")) { res.c="bg-active"; res.b="border-active"; res.r=1; res.e="🏢"; }
        else if (online && !txt) { res.c="bg-active"; res.b="border-active"; res.r=2; res.e="🟢"; }
        else if (txt.toLowerCase().includes("home") || txt.toLowerCase().includes("unterwegs") || txt.toLowerCase().includes("auto")) { 
            res.c="bg-home"; res.b="border-home"; res.r=3; res.e = txt.toLowerCase().includes("home") ? "🏡" : "🚗";
        }
        return res;
    } catch (e) { return { t: "Fehler", e: "⚠️", c: "bg-away", b: "border-away", r: 9 }; }
}

app.get('/dashboard', async (req, res) => {
    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const data = await Promise.all(rows.map(async r => ({ n: r[0], id: r[1], ...(await getStatus(r[1])) })));
        
        // Alphabetische Liste für das Dropdown (unabhängig von der Präsenz-Sortierung)
        const nameList = [...data].sort((a, b) => a.n.localeCompare(b.n));
        
        data.sort((a, b) => a.r - b.r);
        
        const cards = data.map(p => `
            <div class="card">
                <img src="${p.p}" class="avatar ${p.b}" onerror="this.src='https://via.placeholder.com/70'">
                <div style="margin:8px 0;font-weight:bold">${p.n}</div>
                <div class="status-badge ${p.c}">${p.e} ${p.t}</div>
            </div>`).join('');
        
        const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

        // HTML für die Dropdowns
        const userOptions = nameList.map(u => `<option value="${u.n}">${u.n}</option>`).join('');
        
        const footerForm = `
            <form action="/update" method="get" class="footer-bar">
                <select name="user" required>
                    <option value="" disabled selected>Mitarbeiter wählen</option>
                    ${userOptions}
                </select>
                <select name="status" required>
                    <option value="da">Im Büro</option>
                    <option value="homeoffice">Homeoffice</option>
                    <option value="krank">Krank</option>
                    <option value="urlaub">Urlaub</option>
                    <option value="weg">Abwesend</option>
                </select>
                <button type="submit">Update</button>
            </form>
        `;

        res.send(`<html><head><meta http-equiv="refresh" content="60"></head>${styles}<body><div class="container"><h1>Team Präsenz</h1><div class="grid">${cards}</div><div class="info">Letzte Aktualisierung: ${time} Uhr</div></div>${footerForm}</body></html>`);
    } catch (e) { res.send("Fehler"); }
});

app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    const map = { da: ["Im Büro", ":office:"], homeoffice: ["Homeoffice", ":house_with_garden:"], krank: ["Krank", ":face_with_thermometer:"], urlaub: ["Urlaub", ":palm_tree:"], weg: ["Abwesend", ":wave:"] };
    const val = map[status] || ["Abwesend", ":wave:"];
    try {
        // Person im CSV suchen, um Slack-ID zu finden (falls nötig, hier nutzen wir den Namen zum Matching)
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        const person = rows.find(r => r[0] === user);
        
        if (person) {
            await axios.post('https://slack.com/api/users.profile.set', { 
                user: person[1].trim(), // Falls dein Bot fremde Profile ändern darf (Admin-Scope nötig)
                profile: { status_text: val[0], status_emoji: val[1] } 
            }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
        }
        
        res.redirect('/dashboard');
    } catch (e) { res.send("Fehler beim Update."); }
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(port, '0.0.0.0', () => console.log("Live"));
