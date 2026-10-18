/* Edge Function „push-senden“: wird jede Minute von pg_cron (private.push_tick) angestoßen. */
/* Holt fällige Benachrichtigungen (public.push_claim), verschickt sie per Web Push und meldet das Ergebnis zurück. */
/* Schutz: Aufruf nur mit dem internen Token aus private.push_config (Header x-push-token). */
/* VAPID-Schlüssel werden beim ersten Lauf erzeugt und in private.push_config gespeichert. */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { generateVapid, sendPush, type VapidKeys } from './webpush.ts';
import { buildMessage, type Job } from './message.ts';

const SUBJECT = 'https://petconnect24.com';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let token: string | null = null;
let keys: VapidKeys | null = null;

async function getToken(): Promise<string> {
  if (token) return token;
  const { data, error } = await db.rpc('push_token');
  if (error || !data) throw new Error('token_unavailable');
  token = data as string;
  return token;
}

async function getKeys(t: string): Promise<VapidKeys> {
  if (keys) return keys;
  const { data, error } = await db.rpc('push_vapid', { p_token: t });
  if (error) throw new Error('vapid_unavailable');
  if (data?.public && data?.private_jwk) {
    keys = { publicKey: data.public, privateJwk: data.private_jwk };
    return keys;
  }
  const fresh = await generateVapid();
  const { error: e2 } = await db.rpc('push_set_vapid', { p_token: t, p_public: fresh.publicKey, p_private_jwk: fresh.privateJwk });
  if (e2) throw new Error('vapid_store_failed');
  keys = null; /* aus der DB lesen – falls ein paralleler Lauf schneller war, gilt dessen Schlüssel */
  return getKeys(t);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  let t: string;
  try { t = await getToken(); } catch { return new Response('unavailable', { status: 503 }); }
  if (req.headers.get('x-push-token') !== t) return new Response('forbidden', { status: 403 });

  try {
    const k = await getKeys(t);
    const { data, error } = await db.rpc('push_claim', { p_token: t });
    if (error) throw new Error('claim_failed');
    const jobs = (data ?? []) as Job[];
    const ok: string[] = [], gone: string[] = [], failed: string[] = [];
    await Promise.all(jobs.flatMap((job) => job.subs.map(async (s) => {
      try {
        const status = await sendPush(s, buildMessage(job), k, SUBJECT, job.kind === 'medication' ? 3 * 3600 : 12 * 3600);
        if (status >= 200 && status < 300) ok.push(s.id);
        else if (status === 404 || status === 410) gone.push(s.id);
        else failed.push(s.id);
      } catch { failed.push(s.id); }
    })));
    if (ok.length || gone.length || failed.length) {
      await db.rpc('push_result', { p_token: t, p_ok: ok, p_gone: gone, p_failed: failed });
    }
    /* Keine Inhalte, keine Adressen ins Log – nur Zahlen */
    console.log(JSON.stringify({ jobs: jobs.length, ok: ok.length, gone: gone.length, failed: failed.length }));
    return Response.json({ jobs: jobs.length, ok: ok.length, gone: gone.length, failed: failed.length });
  } catch (e) {
    console.log(JSON.stringify({ error: (e as Error).message }));
    return new Response('error', { status: 500 });
  }
});
