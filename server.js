require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');

// ===================== CONFIG =====================
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/voicenet';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ===================== MONGO DB CONNECTION =====================
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ===================== SCHEMAS =====================
const userSchema = new mongoose.Schema({
registerNumber: { type: String, unique: true },
password: String,
email: String,
lastSeen: { type: Date, default: null }
});
const User = mongoose.model('User', userSchema);

const clipSchema = new mongoose.Schema({
registerNumber: String,
filename: String,
timestamp: { type: Date, default: Date.now }
});
const Clip = mongoose.model('Clip', clipSchema);

const activeUsers = new Set();
const clientMap = new Map();

// ===================== PASSWORD GENERATOR =====================
function getAlphaPassword(n) {
let s = '';
if (!Number.isFinite(n) || n <= 0) return s;
while (n > 0) {
n--;
s = String.fromCharCode(97 + (n % 26)) + s;
n = Math.floor(n / 26);
}
return s;
}
//--autoseed
(async () => {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const users = [];
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      for (let i = 0; i < 62; i++) {
        const reg = '9225232050' + String(i + 1).padStart(2, '0');
        let password = '';
        if (i < 26) {
          password = letters[i];           // a-z
        } else {
          password = 'a' + letters[i - 26]; // aa, ab, ac... for 27+
        }
        users.push({ registerNumber: reg, password });
      }
      await User.insertMany(users);
      console.log('👤 62 users created with simple passwords');
    }
  } catch (e) {
    console.error('Error seeding users:', e);
  }
})();

  


// ===================== EMAIL TRANSPORTER =====================
const emailTransporter = nodemailer.createTransport({
host: process.env.EMAIL_HOST,
port: parseInt(process.env.EMAIL_PORT),
secure: process.env.EMAIL_SECURE === 'true',
auth: {
user: process.env.EMAIL_USER,
pass: process.env.EMAIL_PASS
},
logger: true,
debug: true
});

emailTransporter.verify()
.then(() => console.log('✅ Email transporter ready'))
.catch(err => console.error('❌ Email transporter failed:', err));

// ===================== EXPRESS APP =====================
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// ===================== LOGIN =====================
app.post('/login', async (req, res) => {
  try {
    const regStr = req.body.registerNumber?.toString().trim();
    const passStr = req.body.password?.toString().trim();
    const gmail = (req.body.gmail || "").toString().trim();

    if (!regStr || !passStr)
      return res.status(400).json({ success: false, message: 'Missing fields' });

    const user = await User.findOne({ registerNumber: regStr });
    if (!user)
      return res.status(401).json({ success: false, message: 'User not found' });

    if (passStr !== user.password)
      return res.status(401).json({ success: false, message: 'Password mismatch' });

    // ✅ Skip “already active” check to allow mobile login
    // if (activeUsers.has(regStr))
    //     return res.json({ success: false, message: 'Already active elsewhere' });

    activeUsers.add(regStr);

    if (gmail && gmail.includes('@')) user.email = gmail;
    user.lastSeen = new Date();
    await user.save();

    return res.json({ success: true, message: 'Login successful' });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ===================== LOGOUT =====================
app.post('/logout', async (req, res) => {
try {
const regStr = req.body.registerNumber?.toString().trim();
if (!regStr) return res.status(400).json({ success: false, message: 'Missing register number' });
activeUsers.delete(regStr);

const user = await User.findOne({ registerNumber: regStr });
if (!user) return res.status(404).json({ success: false, message: 'User not found' });

user.lastSeen = new Date();
await user.save();

if (user.email) {
  const mailOptions = {
    from: `"VoiceNet" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `🔔 You have logged out`,
    text: `Hello ${regStr},\nYou have successfully logged out of VoiceNet at ${new Date().toLocaleString()}.`
  };
  emailTransporter.sendMail(mailOptions, (err, info) => {
    if (err) console.error('❌ Logout email failed:', err);
    else console.log('✅ Logout email sent:', info.response);
  });
}

res.json({ success: true, message: 'Logout successful' });

} catch (err) {
console.error('Logout error:', err);
res.status(500).json({ success: false, message: 'Server error' });
}
});

// ===================== MULTER UPLOAD =====================
const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, UPLOAD_DIR),
filename: (req, file, cb) => {
const ext = path.extname(file.originalname) || '.ogg';
const reg = (req.body.clientId || 'unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '');
cb(null, `${reg}-${Date.now()}${ext}`);
}
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), async (req, res) => {
try {
if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
const clientId = req.body.clientId || null;
const filename = req.file.filename;
const fileUrl = `/uploads/${filename}`;
await Clip.create({ registerNumber: clientId, filename });

if (clientId) {
  const user = await User.findOne({ registerNumber: clientId });
  if (user?.email) {
    const mailOptions = {
      from: `"VoiceNet" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `📢 New Voice Clip Uploaded`,
      text: `Hello ${clientId},\nYour clip has been uploaded.\nListen here: ${req.protocol}://${req.get('host')}${fileUrl}`
    };
    emailTransporter.sendMail(mailOptions, (err, info) => {
      if (err) console.error('❌ Email failed:', err);
      else console.log('✅ Email sent:', info.response);
    });
  }
}

const payload = JSON.stringify({ type: 'audio', clientId, url: fileUrl, ts: Date.now(), mimeType: req.file.mimetype });
wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(payload); });

res.json({ ok: true, filename, url: fileUrl });

} catch (err) {
console.error('Upload error:', err);
res.status(500).json({ error: 'Upload failed' });
}
});

// ===================== WEBSOCKET =====================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
console.log('🔗 WS client connected');

ws.on('message', msg => {
try {
const data = JSON.parse(msg);
  if (data.type === 'login' && data.registerNumber) {
    clientMap.set(ws, data.registerNumber);
    activeUsers.add(data.registerNumber); // ✅ add this line
    User.updateOne({ registerNumber: data.registerNumber }, { $set: { lastSeen: new Date() } }).catch(() => {});
}


  if (data.type === 'text' || data.type === 'audio') {
    const sender = clientMap.get(ws) || data.clientId || 'Unknown';
    const payload = JSON.stringify({
      type: data.type,
      sender,
      message: data.message || '',
      url: data.url || (data.filename ? `/uploads/${data.filename}` : null),
      ts: Date.now()
    });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(payload); });

    // --- EMAIL NOTIFICATION ---
    (async () => {
      try {
        const user = await User.findOne({ registerNumber: sender });
        if (user?.email) {
          let subject = `📢 New ${data.type === 'text' ? 'Message' : 'Voice Clip'} from ${sender}`;
          let text = data.type === 'text'
            ? `Hello,\nUser ${sender} has sent a message:\n\n"${data.message}"`
            : `Hello,\nUser ${sender} has uploaded a voice clip.\nListen here: ${data.url || '/uploads/' + data.filename}`;
          
          await emailTransporter.sendMail({
            from: `"VoiceNet" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject,
            text
          });
          console.log(`✅ Notification email sent to ${user.email}`);
        }
      } catch (err) {
        console.error('❌ Notification email failed:', err);
      }
    })();
  }

} catch (e) {
  console.error('WS message error:', e);
}

});

ws.on('close', () => {
    const reg = clientMap.get(ws);
    if (reg) activeUsers.delete(reg);
    clientMap.delete(ws);
});

});
// ===================== API ENDPOINTS =====================
app.get('/api/user-details', async (req, res) => {
  try {
    const users = await User.find({}, { registerNumber: 1, email: 1, lastSeen: 1, _id: 0 });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});
app.get('/api/active-users', (req, res) => {
  try {
    const active = Array.from(activeUsers).map(u => ({ registerNumber: u }));
    console.log('Returning active users:', active);
    res.json(active);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch active users' });
  }
});
// Get all voice clips
app.get('/api/user-clips', async (req, res) => {
  try {
    const clips = await Clip.find({});
    res.json(clips);
  } catch (err) {
    console.error('Error loading clips:', err);
    res.status(500).json({ error: 'Failed to fetch clips' });
  }
});

// Delete single clip
app.delete('/api/user-clips/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const clip = await Clip.findOne({ filename });
    if (!clip) return res.status(404).json({ success: false, message: 'Clip not found' });

    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await Clip.deleteOne({ filename });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete clip' });
  }
});

// Delete all clips of a specific user
app.delete('/api/user-clips/user/:registerNumber', async (req, res) => {
  try {
    const { registerNumber } = req.params;
    const clips = await Clip.find({ registerNumber });

    let deletedCount = 0;
    for (const c of clips) {
      const filePath = path.join(UPLOAD_DIR, c.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await Clip.deleteOne({ filename: c.filename });
      deletedCount++;
    }

    res.json({ success: true, deletedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to delete clips' });
  }
});




// ===================== START SERVER =====================
server.listen(PORT, () => console.log(`🚀 VoiceNet server running at http://localhost:${PORT}`));
