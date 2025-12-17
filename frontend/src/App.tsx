import React, { useEffect, useState } from 'react';

function generateUserId() {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeUser(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push не поддерживается в этом браузере');
  }

  const reg = await navigator.serviceWorker.ready;

  const resp = await fetch('/api/vapidPublicKey');
  const { publicKey } = await resp.json();

  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, subscription }),
  });
}

const App: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(Notification.permission);
  const [scheduledTime, setScheduledTime] = useState('');
  const [title, setTitle] = useState('Напоминание');
  const [body, setBody] = useState('Это тестовое push‑уведомление');
  const [vibration, setVibration] = useState('200,100,200');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [loadingSubscribe, setLoadingSubscribe] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  useEffect(() => {
    // userId в localStorage
    let uid = localStorage.getItem('pushDemoUserId');
    if (!uid) {
      uid = generateUserId();
      localStorage.setItem('pushDemoUserId', uid);
    }
    setUserId(uid);

    // beforeinstallprompt для кнопки "Установить"
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const requestPermissionAndSubscribe = async () => {
    if (!userId) return;

    try {
      setLoadingSubscribe(true);
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        await subscribeUser(userId);
        alert('Подписка на push оформлена');
      } else {
        alert('Без разрешения на уведомления push не будет работать');
      }
    } catch (e) {
      console.error(e);
      alert('Ошибка при подписке на push (смотри консоль)');
    } finally {
      setLoadingSubscribe(false);
    }
  };

  const handleSchedule = async () => {
    if (!userId) return;

    const sendAtMs = new Date(scheduledTime).getTime();
    if (isNaN(sendAtMs) || sendAtMs <= Date.now()) {
      alert('Выбери время в будущем');
      return;
    }

    const vibrationPattern = vibration
      .split(',')
      .map((v) => parseInt(v.trim(), 10))
      .filter((v) => !isNaN(v));

    try {
      setLoadingSchedule(true);
      const resp = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sendAt: sendAtMs,
          title,
          body,
          vibrationPattern,
        }),
      });

      if (!resp.ok) {
        throw new Error('schedule failed');
      }

      alert('Пуш запланирован');
    } catch (e) {
      console.error(e);
      alert('Ошибка при планировании пуша (смотри консоль)');
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    console.log('Install choice', choiceResult.outcome);
    setDeferredPrompt(null);
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: 16,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <h1 style={{ textAlign: 'center' }}>PWA Push Demo</h1>

      <section style={{ marginBottom: 24, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2>Разрешение на уведомления</h2>
        <p>Текущее состояние: <b>{permission}</b></p>
        <button onClick={requestPermissionAndSubscribe} disabled={loadingSubscribe}>
          {loadingSubscribe ? 'Подписываем...' : 'Разрешить и подписаться'}
        </button>
        <p style={{ fontSize: 12, color: '#666' }}>
          После подписки этот браузер/устройство будет получать запланированные push‑уведомления.
        </p>
      </section>

      <section style={{ marginBottom: 24, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2>Установить на главный экран</h2>
        <button onClick={handleInstallClick} disabled={!deferredPrompt}>
          {deferredPrompt ? 'Установить приложение' : 'Установка сейчас недоступна'}
        </button>
        <p style={{ fontSize: 12, color: '#666' }}>
          Кнопка активируется, когда браузер предложит установить PWA (событие beforeinstallprompt).
        </p>
      </section>

      <section style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2>Запланировать push</h2>

        <div style={{ marginBottom: 8 }}>
          <label>
            Время (локальное):{' '}
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Заголовок:{' '}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Текст:{' '}
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Вибрация (мс, через запятую):{' '}
            <input
              value={vibration}
              onChange={(e) => setVibration(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <button onClick={handleSchedule} disabled={loadingSchedule}>
          {loadingSchedule ? 'Планируем...' : 'Запланировать'}
        </button>

        <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Чтобы пуш пришёл: сервер должен работать, браузер должен быть подписан на уведомления,
          время должно быть в будущем.
        </p>
      </section>
    </div>
  );
};

export default App;