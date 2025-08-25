require('dotenv').config(); 

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const twilio = require('twilio');

const app = express();
const PORT = 5000;
const SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

if (!SECRET) {
  console.error('❗ Missing JWT_SECRET in env');
  process.exit(1);
}

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!VERIFY_SERVICE_SID) {
  console.error('❗ Missing TWILIO_VERIFY_SERVICE_SID in env');
  process.exit(1);
}

const USERS = [
  { username: 'admin', passwordHash: '', role: 'admin' },
  { username: 'user', passwordHash: '', role: 'guest' },
];

async function initUsers() {
  USERS[0].passwordHash = await bcrypt.hash('admin123', SALT_ROUNDS);
  USERS[1].passwordHash = await bcrypt.hash('user123', SALT_ROUNDS);
}
initUsers();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    res.set('Content-Disposition', 'attachment');
  }
}));


app.post('/login', async (req, res) => {
  const { username, password, phone } = req.body;
  const user = USERS.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  if (!phone) {
    // Step 1: password correct, but need phone SMS
    return res.json({ step: 'need_sms', message: 'Enter phone to receive SMS code' });
  }

  // password + phone both provided — expect client to handle verifying SMS
  return res.json({ step: 'verify_sms' });
});

// -----------------------------------------
// 📩 SEND SMS CODE
// -----------------------------------------
app.post('/send-code', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  try {
    const verification = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verifications.create({ to: phone, channel: 'sms' });
    console.log('Twilio verification sent:', verification);
    res.json({ status: verification.status });
  } catch (err) {
    console.error('🔴 Send-code error details:', err);
    res.status(500).json({ error: 'Failed to send code', details: err.message });
  }
});


app.post('/verify-code', async (req, res) => {
  const { phone, code, username } = req.body;
  if (!phone || !code || !username) {
    return res.status(400).json({ error: 'Missing phone, code or username' });
  }

  try {
    const check = await twilioClient.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phone, code });

    if (check.status !== 'approved') {
      return res.status(401).json({ error: 'Invalid or expired code' });
    }

    const user = USERS.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid user' });

    const token = jwt.sign({ username: user.username, role: user.role }, SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error('Verify code error', err);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// -----------------------------------------
// 🔐 MIDDLEWARE FOR JWT PROTECTION
// -----------------------------------------
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET, (err, usr) => {
    if (err) return res.sendStatus(403);
    req.user = usr;
    next();
  });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Ensure uploads/ exists
      const dir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      cb(null, 'uploads/');
    },
    filename: (req, f, cb) => cb(null, Date.now() + '-' + f.originalname),
  }),
});

app.get('/files', (req, res) => {
  fs.readdir(path.join(__dirname, 'uploads'), (err, files) => {
    if (err) return res.status(500).json({ error: 'Could not list' });
    const urls = files.map(n => `http://localhost:${PORT}/uploads/${n}`);
    res.json(urls);
  });
});

app.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `http://localhost:${PORT}/uploads/${req.file.filename}`;
  res.json({ url });
});

app.delete('/files', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Need filename' });

  fs.unlink(path.join(__dirname, 'uploads', filename), err => {
    if (err) return res.status(500).json({ error: 'Delete failed' });
    res.json({ success: true });
  });
});

app.post('/rename-file', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'Both oldName and newName are required' });

  const oldPath = path.join(__dirname, 'uploads', oldName);
  const newPath = path.join(__dirname, 'uploads', newName);

  fs.rename(oldPath, newPath, (err) => {
    if (err) return res.status(500).json({ error: 'Rename failed' });
    res.json({ success: true });
  });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
