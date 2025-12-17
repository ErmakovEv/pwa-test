const express = require('express');
const webpush = require('web-push');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.use(express.json({ limit: '100kb' }));

// === VAPID ключи из переменных окружения ===
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:you@example.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Error: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in environment variables');
  process.exit(1);
}

webpush.setVapidDetails(
  VAPID_EMAIL,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// userId -> [subscriptions]
const subscriptionsByUser = {};

// отдать public key фронту
app.get('/api/vapidPublicKey', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// сохранить подписку
app.post('/api/subscribe', (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) {
    return res.status(400).json({ error: 'userId and subscription required' });
  }

  if (!subscriptionsByUser[userId]) {
    subscriptionsByUser[userId] = [];
  }

  const existingIndex = subscriptionsByUser[userId].findIndex(
    (sub) => sub.endpoint === subscription.endpoint
  );

  if (existingIndex === -1) {
    subscriptionsByUser[userId].push(subscription);
    console.log(`New subscription for user ${userId}. Total: ${subscriptionsByUser[userId].length}`);
  } else {
    subscriptionsByUser[userId][existingIndex] = subscription;
    console.log(`Updated subscription for user ${userId}, index ${existingIndex}`);
  }

  res.status(201).json({ ok: true });
});

// планирование пуша
app.post('/api/schedule', (req, res) => {
  const { userId, sendAt, title, body, vibrationPattern } = req.body;
  if (!userId || !sendAt) {
    return res.status(400).json({ error: 'userId and sendAt required' });
  }

  const delay = Math.max(0, sendAt - Date.now());
  console.log(`Schedule push for user ${userId} in ${delay} ms`);

  setTimeout(() => {
    const subs = subscriptionsByUser[userId] || [];
    if (!subs.length) {
      console.log(`No subscriptions for user ${userId}`);
      return;
    }

    const payload = JSON.stringify({
      title: title || 'Напоминание',
      body: body || '',
      vibrationPattern: vibrationPattern || [200, 100, 200],
    });

    subs.forEach((sub, index) => {
      webpush
        .sendNotification(sub, payload)
        .then(() => {
          console.log(`Push sent to user ${userId}, sub #${index}`);
        })
        .catch((err) => {
          console.error('Push send error', err);
        });
    });
  }, delay);

  res.status(201).json({ ok: true, scheduledInMs: delay });
});

// JSON 404 для неизвестных API‑маршрутов
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found!' });
});

// раздача собранного фронта (позже будем билдить в frontend/dist)
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

