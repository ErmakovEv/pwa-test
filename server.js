const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());

// === VAPID ключи: подставь свои значения ===
const VAPID_PUBLIC_KEY = 'BIyfaI3doUmx3PX-41xhRwhxObOL56i8gHh8eIMqpHDhGGg1SyyI54eiMp1eCDUOCactiGcNws09AM-eKfBk2Ek';
const VAPID_PRIVATE_KEY = 'AHbAPBl8rV2_4P6_l5tCC4wOY8VRMvxB9rdUuP3b2uE';

webpush.setVapidDetails(
  'mailto:you@example.com',
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

  // простое добавление без дедупликации
  subscriptionsByUser[userId].push(subscription);
  console.log(`New subscription for user ${userId}. Total: ${subscriptionsByUser[userId].length}`);

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

// раздача собранного фронта (позже будем билдить в frontend/dist)
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});