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

// Home Route with Modern UI
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="my">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AI Video Generator Studio</title>
      <style>
        body {
          margin: 0;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #0f172a;
          color: #ffffff;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        .container {
          background: rgba(30, 41, 59, 0.7);
          backdrop-filter: blur(10px);
          padding: 40px;
          border-radius: 16px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
          width: 100%;
          max-width: 450px;
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        h2 {
          margin-top: 0;
          color: #38bdf8;
          text-align: center;
          font-size: 24px;
        }
        p {
          text-align: center;
          color: #94a3b8;
          font-size: 14px;
          margin-bottom: 30px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          color: #cbd5e1;
        }
        input, select {
          width: 100%;
          padding: 12px;
          background: #0f172a;
          border: 1px solid #334155;
          color: #fff;
          border-radius: 8px;
          box-sizing: border-box;
          font-size: 14px;
        }
        input:focus, select:focus {
          outline: none;
          border-color: #38bdf8;
        }
        button {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: opacity 0.2s;
          margin-top: 10px;
        }
        button:hover {
          opacity: 0.9;
        }
        #result {
          margin-top: 20px;
          padding: 12px;
          background: #1e293b;
          border-radius: 8px;
          font-size: 13px;
          word-break: break-all;
          display: none;
          border: 1px solid #334155;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>AI Video Studio</h2>
        <p>သင့်ရဲ့ AI ဗီဒီယိုနှင့် စာတန်းထိုးများကို ဤနေရာမှ တည်ဆောက်ပါ</p>
        
        <div class="form-group">
          <label>ဗီဒီယိုခေါင်းစဉ် (Story Title)</label>
          <input type="text" id="storyTitle" placeholder="ဥပမာ - Space Adventure..." />
        </div>

        <div class="form-group">
          <label>ကာတွန်ပုံစံ (Cartoon Style)</label>
          <select id="cartoonStyle">
            <option value="3d animation">3D Animation</option>
            <option value="anime">Anime Style</option>
            <option value="cyberpunk">Cyberpunk</option>
          </select>
        </div>

        <button onclick="generateVideo()">ဗီဒီယို စတင်ဖန်တီးရန် 🚀</button>
        <div id="result"></div>
      </div>
၏
      <script>
        async function generateVideo() {
          const title = document.getElementById('storyTitle').value;
          const style = document.getElementById('cartoonStyle').value;
          const resultDiv = document.getElementById('result');

          if (!title) {
            alert('ကျေးဇူးပြု၍ ဗီဒီယိုခေါင်းစဉ် ထည့်ပါ။');
            return;
          }

          resultDiv.style.display = 'block';
          resultDiv.innerHTML = '⏳ ဗီဒီယိုကို ဖန်တီးနေပါပြီ၊ ခဏစောင့်ပါ...';

          try {
            const response = await fetch('/api/render-video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                storyTitle: title,
                cartoonStyle: style,
                videoResolution: '1080p',
                videoLength: 30,
                subLang: 'en',
                soundToggle: true,
                isVip: false,
                device_id: 'user_device_123'
              })
            });

            const data = await response.json();
            resultDiv.innerHTML = '✅ အောင်မြင်ပါပြီ! တုံ့ပြန်ချက်: <br>' + JSON.stringify(data);
          } catch (error) {
            resultDiv.innerHTML = '❌ အမှားအယွင်း ဖြစ်ပွားis: ဆာဗာသို့ ချိတ်ဆက်၍ မရပါ။';
          }
        }
      </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server is running on port ' + PORT);
});
});
