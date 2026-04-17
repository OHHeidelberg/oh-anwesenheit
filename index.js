app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    try {
        const sheetRes = await axios.get(CSV_URL);
        const rows = parse(sheetRes.data, { from_line: 2, skip_empty_lines: true, trim: true });
        const person = rows.find(r => r[0].toLowerCase() === user.toLowerCase());

        if (!person) return res.status(404).send("User nicht gefunden.");

        // Mapping für die verschiedenen QR-Code Status
        const statusMap = {
            'da': { text: "Im Büro", emoji: ":office:" },
            'homeoffice': { text: "Homeoffice", emoji: ":house_with_garden:" },
            'krank': { text: "Krank", emoji: ":face_with_thermometer:" },
            'urlaub': { text: "Im Urlaub", emoji: ":palm_tree:" },
            'weg': { text: "Abwesend", emoji: ":wave:" }
        };

        const update = statusMap[status] || { text: "", emoji: "" };

        await axios.post('https://slack.com/api/users.profile.set', {
            profile: { 
                status_text: update.text, 
                status_emoji: update.emoji,
                status_expiration: 0 // Status bleibt bis zur manuellen Änderung
            }
        }, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });

        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px;">
                <h1>Erledigt!</h1>
                <p>Dein Status wurde auf <b>${update.text}</b> gesetzt.</p>
                <a href="/dashboard" style="color:#007aff;">Zum Dashboard</a>
            </div>
        `);
    } catch (e) { 
        res.status(500).send("Fehler beim Update: " + e.message); 
    }
});
