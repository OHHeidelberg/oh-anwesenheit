app.get('/update', async (req, res) => {
    const { status, user } = req.query;
    const map = { 
        da: ["Im Büro", ":office:"], 
        homeoffice: ["Homeoffice", ":house_with_garden:"], 
        krank: ["Krank", ":face_with_thermometer:"], 
        urlaub: ["Urlaub", ":palm_tree:"], 
        weg: ["Abwesend", ":wave:"] 
    };
    const val = map[status] || ["Abwesend", ":wave:"];

    try {
        const csv = await axios.get(CSV_URL);
        const rows = parse(csv.data, { from_line: 2, skip_empty_lines: true });
        
        // Wir suchen die Person im CSV, um die zugehörige Slack-ID zu finden
        const person = rows.find(r => r[0] === user);
        
        if (person) {
            const slackId = person[1].trim(); // Spalte B im Google Sheet
            
            await axios.post('https://slack.com/api/users.profile.set', { 
                // WICHTIG: Die 'user' ID muss hier mitgegeben werden
                user: slackId, 
                profile: { 
                    status_text: val[0], 
                    status_emoji: val[1] 
                } 
            }, { 
                headers: { Authorization: `Bearer ${SLACK_TOKEN}` } 
            });
            
            console.log(`Status für ${user} (${slackId}) auf ${val[0]} gesetzt.`);
        }
        res.redirect('/dashboard');
    } catch (e) {
        console.error("Update Fehler:", e.response ? e.response.data : e.message);
        res.send("Fehler beim Update. Möglicherweise fehlen dem Slack-Token die Rechte, Profile anderer Nutzer zu ändern.");
    }
});
