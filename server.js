const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {exec} = require('child_process');
const cors = require('cors');
const scanBox = require('./scan-to-counter');

//const parseContainers = require('./parser-containers');
//const generateChamberReport = require('./fill-chamber-report');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

const inputDir = path.join(__dirname, 'input');
const outputDir = path.join(__dirname, 'output');
const publicDir = path.join(__dirname, 'public');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, inputDir),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({storage});

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, {recursive: true});
}

/* ---------------- UPLOAD ---------------- */
app.post('/upload', upload.array('files', 2), (req, res) => {
  const userDate = req.query.date;

  if (!userDate || !/^\d{4}-\d{2}-\d{2}$/.test(userDate)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or missing date parameter',
    });
  }

  const tempDir = path.join(__dirname, 'temp', userDate);
  fs.mkdirSync(tempDir, {recursive: true});

  try {
    for (const file of req.files) {
      const src = file.path;
      const dest = path.join(tempDir, file.originalname);
      fs.copyFileSync(src, dest);
    }
  } catch (err) {
    console.error('❌ Failed to copy files:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to copy files to temp',
    });
  }

  const cmd = `node run-all.js ${userDate} "${tempDir}"`;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Error during script run:', stderr);
      cleanupTemp(tempDir);
      return res.status(500).json({
        success: false,
        message: 'Script execution error',
      });
    }

    const match = stdout.match(/@@@DONE:(\d{4}-\d{2}-\d{2})/);
    const resultDate = match ? match[1] : null;

    if (!resultDate) {
      cleanupTemp(tempDir);
      return res.status(500).json({
        success: false,
        message: 'No completion confirmation found',
      });
    }

    const folderPath = path.join(outputDir, resultDate);
    exec(`start "" "${folderPath}"`, () => {});

    cleanupTemp(tempDir);

    res.json({
      success: true,
      message: 'Report generated successfully',
      date: resultDate,
    });
  });
});

function cleanupTemp(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, {recursive: true, force: true});
      console.log(`🧹 Temp cleaned: ${dir}`);
    }
  } catch (err) {
    console.error('⚠️ Failed to clean temp:', err);
  }
}

/* ---------------- SCANNER API ---------------- */

// Clients list
app.get('/api/orders/:date', (req, res) => {
  const {date} = req.params;
  const filePath = path.join(outputDir, date, 'data.json');

  if (!fs.existsSync(filePath)) return res.json([]);

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const rows = JSON.parse(raw);

    const clients = rows
      .filter((r) => r['Data wysyłki'] === date)
      .map((r) => r['Odbiorca'])
      .filter(Boolean);

    res.json([...new Set(clients)]);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

// Add scan
app.post('/api/scan', async (req, res) => {
  const {date, client, container, qty} = req.body;

  try {
    const result = await scanBox({
      date,
      client,
      containerNumber: container,
      quantity: qty,
    });

    res.json({
      message: `✔ Додано ${qty} у ${container}`,
      total: result.total,
      scanned: result.scanned,
      remaining: result.remaining,
    });
  } catch (err) {
    res.json({message: '❌ Помилка: ' + err.message});
  }
});

// Finish client
app.post('/api/finish', (req, res) => {
  const {client} = req.body;
  if (!client) return res.status(400).json({ok: false});
  console.log(`✅ FINISHED ORDER: ${client}`);
  res.json({ok: true});
});

/* ---------------- QR SERVER INFO ---------------- */

const os = require('os');

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();

app.get('/api/server-info', (req, res) => {
  res.json({
    ip: LOCAL_IP,
    port: PORT,
    url: `http://${LOCAL_IP}:${PORT}/components/scanner.html`,
  });
});

/* ---------------- STATIC FILES (MUST BE LAST) ---------------- */

app.use(express.static(publicDir));
app.use('/output', express.static(outputDir));

/* ---------------- START SERVER ---------------- */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://${LOCAL_IP}:${PORT}`);
});
