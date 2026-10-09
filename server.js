
});
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const stripe = require('stripe')('sk_test_YOUR_STRIPE_SECRET_KEY');
const paypal = require('@paypal/checkout-server-sdk');

const Environment = process.env.NODE_ENV === 'production' 
    ? paypal.core.LiveEnvironment 
    : paypal.core.SandboxEnvironment;
const paypalClient = new paypal.core.PayPalHttpClient(new Environment('YOUR_PAYPAL_CLIENT_ID', 'YOUR_PAYPAL_SECRET'));

const numCPUs = os.cpus().length;

if (cluster.isMaster) {
    console.log(`Master Server Cluster ${process.pid} is running.`);
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    cluster.on('exit', (worker) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
} else {
    const app = express();
    app.use(express.json());

    // 🛡️ Security Middlewares
    app.use(helmet({
        contentSecurityPolicy: false
    }));

    const globalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: { success: false, message: "လုံခြုံရေးအရ ခေတ္တပိတ်ပင်ထားပါသည် (Too many requests)." }
    });
    app.use('/api/', globalLimiter);

    const renderLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 5,
        message: { success: false, message: "ဗီဒီယိုဖန်တီးမှုနှုန်း အလွန်မြန်နေပါသည်။ ခေတ္တစောင့်ဆိုင်းပါ။" }
    });
    app.use('/api/render-video', renderLimiter);

    const upload = multer({ 
        dest: 'uploads/',
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('ပုံဖိုင်သာ လက်ခံပါသည်။'), false);
            }
        }
    });

    if (!fs.existsSync('outputs')) fs.mkdirSync('outputs');
    if (!fs.existsSync('assets')) fs.mkdirSync('assets');
    if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

    const db = new sqlite3.Database('./database.sqlite', (err) => {
        if (err) console.error('Database connection error:', err.message);
    });

    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT UNIQUE,
            is_vip INTEGER DEFAULT 0,
            render_count INTEGER DEFAULT 0,
            last_date TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slip_path TEXT,
            gateway TEXT DEFAULT 'Local',
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });

    // Serve Frontend HTML or Status message
    app.get('/', (req, res) => {
        res.send('AI Video Generator Server is Live & Running! 🚀');
    });

    app.get('/api/admin/payments', (req, res) => {
        db.all(`SELECT * FROM payments ORDER BY id DESC`, [], (err, rows) => {
            if (err) return res.json({ success: false, message: "Database error" });
            res.json({ success: true, payments: rows });
        });
    });

    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    app.post('/api/upload-slip', upload.single('paymentSlip'), (req, res) => {
        if (!req.file) return res.json({ success: false, message: "ဖိုင်မပါရှိပါ သို့မဟုတ် ပုံစံမမှန်ပါ။" });
        const slipPath = req.file.path;
        db.run(`INSERT INTO payments (slip_path) VALUES (?)`, [slipPath], function(err) {
            if (err) return res.json({ success: false, message: "Database error" });
            res.json({ success: true, message: "ငွေလွှဲစလစ် တင်သွင်းပြီးပါပြီ။ အတည်ပြုရန် စောင့်ဆိုင်းပါ။", paymentId: this.lastID });
        });
    });

    app.get('/download/:filename', (req, res) => {
        const filename = path.basename(req.params.filename);
        const file = path.join(__dirname, 'outputs', filename);
        if (fs.existsSync(file)) res.download(file);
        else res.status(404).send("ဖိုင် မတွေ့ရှိပါ။");
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server Worker ${process.pid} started on http://localhost:${PORT}`);
    });
