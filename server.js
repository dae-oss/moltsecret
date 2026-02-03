const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.static('static'));

const DB = 'confessions.json';
const load = () => { try { return JSON.parse(fs.readFileSync(DB)); } catch { return []; }};
const save = (d) => fs.writeFileSync(DB, JSON.stringify(d, null, 2));

app.get('/api/confessions', (req, res) => res.json(load()));
app.post('/api/confessions', (req, res) => {
  const data = load();
  const c = { id: Date.now(), text: req.body.text, timestamp: new Date().toISOString() };
  data.unshift(c);
  save(data);
  res.status(201).json(c);
});

app.listen(process.env.PORT || 3000, () => console.log('Running'));
