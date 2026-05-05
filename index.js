// ... (oberer Teil mit CSV_URL und INFO_URL bleibt gleich)

// --- STYLES MIT ANTI-BURN-IN & DARK MODE ---
const styles = `
<style>
  :root {
    --bg-color: #f0f2f5;
    --card-bg: #fff;
    --text-color: #1d1d1f;
  }

  /* Nachtmodus zur Schonung des Panels (20:00 - 06:00 Uhr) */
  @media (prefers-color-scheme: dark) {
    :root {
      --bg-color: #121212;
      --card-bg: #1e1e1e;
      --text-color: #e0e0e0;
    }
  }

  body {
    font-family: sans-serif;
    background: var(--bg-color);
    color: var(--text-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 0;
    padding: 10px 10px 140px 10px;
    transition: background 0.5s ease;
    /* Pixel-Shift Animation gegen Einbrennen */
    animation: pixelShift 600s infinite alternate linear;
  }

  @keyframes pixelShift {
    0% { transform: translate(0, 0); }
    25% { transform: translate(2px, 1px); }
    50% { transform: translate(-1px, 2px); }
    75% { transform: translate(-2px, -1px); }
    100% { transform: translate(1px, -2px); }
  }

  .card {
    background: var(--card-bg);
    padding: 15px;
    border-radius: 18px;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    max-width: 220px;
    margin: 0 auto;
  }

  /* ... (Rest der bestehenden Status-Farben bleibt gleich) ... */

  .info-banner {
    width: 95%;
    background: #007aff;
    color: white;
    padding: 30px;
    border-radius: 20px;
    margin: 0 auto 40px auto;
    font-size: 2.2rem;
    font-weight: bold;
    box-shadow: 0 10px 25px rgba(0,122,255,0.3);
    border-left: 12px solid #0056b3;
    text-align: center;
    /* Auch der Banner bekommt einen leichten Schimmer-Effekt gegen statische Last */
    background: linear-gradient(90deg, #007aff, #0056b3, #007aff);
    background-size: 200% 200%;
    animation: gradientShift 30s ease infinite;
  }

  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  .empfang-header { font-size: 3.5rem; margin-bottom: 30px; color: var(--text-color); }
</style>`;

// ... (In der get('/empfang') Route fügen wir ein kleines Skript hinzu, das nachts den Dark-Mode erzwingt)

app.get('/empfang', async (req, res) => {
    try {
        // (Daten laden wie bisher...)
        // ...

        res.send(`
            <html>
            <head>
                <meta http-equiv="refresh" content="60">
                <script>
                    // Nachtmodus erzwingen für Hardware-Schutz
                    function checkNightMode() {
                        const hour = new Date().getHours();
                        if (hour >= 19 || hour <= 7) {
                            document.documentElement.style.filter = "brightness(0.7) contrast(1.1)";
                        }
                    }
                    setInterval(checkNightMode, 60000);
                    window.onload = checkNightMode;
                </script>
            </head>
            <body style="padding-bottom:20px">
                ${styles}
                <div class="container">
                    <h1 class="empfang-header">Willkommen bei den Offenen Hilfen</h1>
                    ${infoBox}
                    <div class="grid">${cards}</div>
                </div>
            </body>
            </html>`);
    } catch (e) { res.status(500).send("Fehler."); }
});
