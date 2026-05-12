const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(__dirname));

app.post('/save', (req, res) => {
  fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
    if (err) return res.status(500).json({ error: 'Failed to save data' });
    res.json({ ok: true });
  });
});

app.listen(PORT, () => {
  console.log(`Israel Travel Map running at http://localhost:${PORT}`);
});
