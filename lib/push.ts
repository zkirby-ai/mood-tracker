'use client';

export type PushSetup = {
  appSecret: string;
  apiBase: string;
  endpoint: string | null;
  enabled: boolean;
};

export const DEFAULT_PUSH_SECRET = '3598509926:ZzdnQ1mpJk_hmlzz_Pdbb3j8Ubud4IhP039';
export const DEFAULT_PUSH_API_BASE = 'https://push.zkirby.com';

const STORAGE_KEY = 'mood-tracker-push-setup';

export function loadPushSetup(): PushSetup {
  const defaults: PushSetup = { appSecret: DEFAULT_PUSH_SECRET, apiBase: DEFAULT_PUSH_API_BASE, endpoint: null, enabled: false };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PushSetup>;
    return { ...defaults, ...parsed, apiBase: DEFAULT_PUSH_API_BASE };
  } catch {
    return defaults;
  }
}

export function persistPushSetup(setup: PushSetup) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function enableBackgroundPush(setup: PushSetup): Promise<{ ok: true; setup: PushSetup } | { ok: false; reason: string }> {
  if (!setup.appSecret || !setup.apiBase) return { ok: false, reason: 'Enter your shared secret first.' };
  if (typeof window === 'undefined') return { ok: false, reason: 'Window unavailable.' };
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'Service workers unavailable.' };
  if (!('PushManager' in window)) return { ok: false, reason: 'PushManager unavailable.' };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'Notification permission was not granted.' };

    const registration = await navigator.serviceWorker.register('/sw.js');
    const keyResponse = await fetch(`${setup.apiBase}/vapid-public-key`, {
      headers: { 'x-app-secret': setup.appSecret, 'bypass-tunnel-reminder': '1' }
    });
    if (!keyResponse.ok) return { ok: false, reason: `Couldn't fetch VAPID key (${keyResponse.status}).` };
    const { publicKey } = (await keyResponse.json()) as { publicKey?: string };
    if (!publicKey) return { ok: false, reason: 'Push server did not return a VAPID public key.' };
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    const registerResponse = await fetch(`${setup.apiBase}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-secret': setup.appSecret, 'bypass-tunnel-reminder': '1' },
      body: JSON.stringify({ subscription })
    });
    if (!registerResponse.ok) return { ok: false, reason: `Push server rejected registration (${registerResponse.status}).` };
    const next: PushSetup = { ...setup, endpoint: subscription.endpoint, enabled: true };
    persistPushSetup(next);
    return { ok: true, setup: next };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error during push setup.';
    return { ok: false, reason };
  }
}

export async function schedulePush(setup: PushSetup, payload: { title: string; body: string; sendAt: Date }) {
  if (!setup.enabled || !setup.endpoint || !setup.apiBase || !setup.appSecret) return false;
  try {
    const res = await fetch(`${setup.apiBase}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-secret': setup.appSecret, 'bypass-tunnel-reminder': '1' },
      body: JSON.stringify({
        endpoint: setup.endpoint,
        title: payload.title,
        body: payload.body,
        sendAt: payload.sendAt.toISOString()
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function cancelPush(setup: PushSetup) {
  if (!setup.endpoint || !setup.apiBase || !setup.appSecret) return;
  try {
    await fetch(`${setup.apiBase}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-secret': setup.appSecret, 'bypass-tunnel-reminder': '1' },
      body: JSON.stringify({ endpoint: setup.endpoint })
    });
  } catch {
    /* noop */
  }
}

export function nextEveningReminderDate(now = new Date(), hour = 22, minute = 45): Date {
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}
