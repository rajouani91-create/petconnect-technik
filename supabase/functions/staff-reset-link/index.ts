/* Edge Function „staff-reset-link“: Support oder Admin löst für ein Konto den bestehenden Passwort-Reset aus. */
/* Das Passwort sieht niemand. Die Antwort enthält nur „ok“. Jeder Versand wird in staff_audit protokolliert. */
/* Schutz: Anmeldung über den Sitzungs-Token des Aufrufers, Rolle wird in staff_roles geprüft (Support oder Admin). */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const REDIRECT_TO = 'https://petconnect24.com/passwort-neu';
const ALLOWED_ORIGIN = 'https://petconnect24.com';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });

  // Wer ruft auf? Über den Sitzungs-Token des Aufrufers
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !who.user) return reply(401, { error: 'unauthorized' });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // Rolle prüfen: Support oder Admin
  const { data: role } = await db.from('staff_roles').select('role').eq('user_id', who.user.id).maybeSingle();
  if (!role || (role.role !== 'support' && role.role !== 'admin')) return reply(403, { error: 'forbidden' });

  let body: { target?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'bad_request' });
  }
  const target = typeof body.target === 'string' ? body.target : '';
  if (!/^[0-9a-f-]{36}$/i.test(target)) return reply(400, { error: 'bad_request' });

  // Adresse des Zielkontos, nur serverseitig
  const { data: targetUser, error: tErr } = await db.auth.admin.getUserById(target);
  if (tErr || !targetUser.user?.email) return reply(404, { error: 'not_found' });

  // Bestehender Reset-Mechanismus der Anmeldung
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sendErr } = await anon.auth.resetPasswordForEmail(targetUser.user.email, { redirectTo: REDIRECT_TO });
  if (sendErr) return reply(502, { error: 'send_failed' });

  await db.from('staff_audit').insert({ staff_id: who.user.id, action: 'reset_link_sent', target_user_id: target, reason: null });
  return reply(200, { ok: true });
});
