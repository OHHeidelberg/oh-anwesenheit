const express = require('express');
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Beispieldaten aus der Datenbank
const employeeData = [
  { id: 1, name: 'Anna Schmidt', status: 'Urlaub' },
  { id: 2, name: 'Markus Weber', status: 'Krankheit' },
  { id: 3, name: 'Julia Fischer', status: null }, // Anwesend
  { id: 4, name: 'Stefan Meyer', status: 'Urlaub' }
];

// 1. ROUTE: /empfang (Anonymisierte Ansicht)
app.get('/empfang', (req, res) => {
  const empfangData = employeeData.map(emp => ({
    id: emp.id,
    name: emp.name,
    // Wenn ein Status existiert (Urlaub/Krankheit), wird er zu "Abwesend" maskiert
    displayStatus: emp.status ? 'Abwesend' : 'Anwesend',
    isAbsent: Boolean(emp.status)
  }));

  res.render('empfang', { employees: empfangData });
});

// 2. ROUTE: /dashboard (Detailansicht für interne Übersicht)
app.get('/dashboard', (req, res) => {
  const dashboardData = employeeData.map(emp => ({
    id: emp.id,
    name: emp.name,
    // Der konkrete Grund (Urlaub / Krankheit) bleibt vollständig erhalten
    displayStatus: emp.status || 'Anwesend',
    isAbsent: Boolean(emp.status)
  }));

  res.render('dashboard', { employees: dashboardData });
});

app.listen(3000, () => {
  console.log('Server läuft auf http://localhost:3000');
});
