const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const stripe = require('stripe')('YOUR_STRIPE_SECRET_KEY');
const paypal = require('@paypal/checkout-server-sdk');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Database Setup
const db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
    if (err) console.error('Database opening error: ', err.message);
    else console.log('Connected to SQLite database.');
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    device_id TEXT PRIMARY KEY,
    render_count INTEGER DEFAULT 0,
    last_date TEXT,
    is_vip INTEGER DEFAULT 0
)`);

// PayPal Setup
const configurePayPal = () => {
    let clientId = 'YOUR_PAYPAL_CLIENT_ID';
    let clientSecret = 'YOUR_PAYPAL_CLIENT_SECRET';
    let environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
    return new paypal.core.PayPalHttpClient(environment);
};
const paypalClient = configurePayPal();

// Stripe Checkout Endpoint
app.post('/api/create-stripe-session', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: 'AI Video Generator VIP Subscription' },
                    unit_amount: 1000,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'http://localhost:3000/?vip=success',
            cancel_url: 'http://localhost:3000/?vip=cancel',
        });
        res.json({ url: session.url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PayPal Order Endpoint
app.post('/api/create-paypal-order', async (req, res) => {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: { currency_code: 'USD', value: '10.00' }
        }],
        application_context: {
            return_url: 'http://localhost:3000/?paypal=success',
            cancel_url: 'http://localhost:3000/?paypal=cancel'
        }
    });
    try {
        const order = await paypalClient.execute(request);
        const approvalUrl = order.result.links.find(link => link.rel === 'approve').href;
        res.json({ approvalUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Render Video Endpoint
app.post('/api/render-video', (req, res) => {
    const { storyTitle, cartoonStyle, videoResolution, videoLength, subLang, soundToggle, isAdmin, deviceId } = req.body;
    
    if (!storyTitle || typeof storyTitle !== 'string' || storyTitle.length > 200) {
        return res.json({ success: false, message: "ဇာတ်လမ်းခေါင်းစဉ် ပုံစံမမှန်ပါ။" });
    }

    if (videoLength > 1 && !isAdmin) {
        return res.json({ success: false, message: "Free အသုံးပြုသူများအတွက် ၁ မိနစ်စာသာ ခွင့်ပြုထားပါသည်။" });
    }
    if ((videoResolution === '4k') && !isAdmin) {
        return res.json({ success: false, message: "4K ရုပ်ထွက်အတွက် VIP လိုအပ်ပါသည်။" });
    }

    const today = new Date().toISOString().slice(0, 10);

    db.get(`SELECT * FROM users WHERE device_id = ?`, [deviceId], (err, user) => {
        if (err) return res.json({ success: false, message: "Database error" });

        let renderCount = 0;
        if (user) {
            if (user.last_date === today) {
                renderCount = user.render_count;
            } else {
                db.run(`UPDATE users SET render_count = 0, last_date = ? WHERE device_id = ?`, [today, deviceId]);
            }
        }

        const maxLimit = (user && user.is_vip === 1) ? 10 : 3;

        if (renderCount >= maxLimit && !isAdmin) {
            return res.json({ success: false, message: `ယနေ့အတွက် အသုံးပြုခွင့် (${maxLimit} ပုဒ်) ပြည့်သွားပါပြီ။ ကျေးဇူးပြု၍ VIP ဝယ်ယူပါ သို့မဟုတ် မနက်ဖြန်မှ ထပ်မံကြိုးစားပါ။` });
        }

        const inputVideo = path.join(__dirname, 'assets', 'base_video.mp4'); 
        const inputAudio = path.join(__dirname, 'assets', 'background_music.mp3');
        const safeTitle = storyTitle.replace(/[^a-zA-Z0-9က-အမြန်မာ\s]/g, '');
        const outputFilename = `crystal_hq_${cartoonStyle}_${Date.now()}.mp4`;
        const outputPath = path.join(__dirname, 'outputs', outputFilename);
        const srtPath = path.join(__dirname, 'uploads', `sub_${Date.now()}.srt`);

        let styleName = cartoonStyle === 'anime' ? '2D Anime Style' : '3D Pixar Style';
        let subtitleContent = `1\n00:00:00,000 --> 00:00:05,000\n[${styleName} | ${subLang.toUpperCase()}] ${safeTitle}\n\n2\n00:00:05,000 --> 00:00:10,000\nCrystal Clear Audio & Video Quality`;
        fs.writeFileSync(srtPath, subtitleContent, 'utf8');

        let ffmpegCommand = ffmpeg(inputVideo);
        if (soundToggle && fs.existsSync(inputAudio)) {
            ffmpegCommand = ffmpegCommand
                .input(inputAudio)
                .outputOptions([
                    '-map 0:v:0', '-map 1:a:0', '-c:v libx264', '-preset medium', '-crf 15', '-c:a aac', '-b:a 320k', '-shortest'
                ]);
        } else {
            ffmpegCommand = ffmpegCommand.outputOptions([
                '-map 0:v:0', '-map 0:a:0', '-c:v libx264', '-preset medium', '-crf 15', '-c:a aac', '-b:a 320k'
            ]);
        }

        if (videoResolution === '4k') {
            ffmpegCommand = ffmpegCommand.size('3840x2160');
        } else {
            ffmpegCommand = ffmpegCommand.size('1920x1080');
        }

        if (fs.existsSync(srtPath)) {
            const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            ffmpegCommand = ffmpegCommand.outputOptions(`-vf subtitles='${escapedSrtPath}'`);
        }

        ffmpegCommand
            .save(outputPath)
            .on('end', () => {
                if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
                
                if (!isAdmin) {
                    if (user) {
                        db.run(`UPDATE users SET render_count = render_count + 1, last_date = ? WHERE device_id = ?`, [today, deviceId]);
                    } else {
                        db.run(`INSERT INTO users (device_id, render_count, last_date) VALUES (?, 1, ?)`, [deviceId, today]);
                    }
                }

                const remainingFree = isAdmin ? 'Unlimited' : (maxLimit - (renderCount + 1));
                res.json({ success: true, message: "ဗီဒီယို ဖန်တီးပြီးပါပြီ", downloadUrl: `/download/${outputFilename}`, remaining: remainingFree });
            })
            .on('error', (err) => {
                console.error("FFmpeg Error:", err);
                if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
                res.json({ success: false, message: "ဗီဒီယိုဖန်တီးမှု အမှားအယွင်းရှိသည်။" });
            });
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
    console.log(`Server Worker ${process.pid} started on port ${PORT}`);
});
