/**
 * Simuliertes Supabase (Auth + PostgREST + RPC + Storage) für Klick-Tests. Läuft komplett im Test, nichts geht ins Internet.
 * Bildet die echten Regeln der Migrationen nach:
 *  - E-Mail-Bestätigung, owner_id = angemeldeter Nutzer
 *  - Betreuer (pet_members) mit Rollen owner / carer / viewer; Lesen für alle Betreuer, Schreiben für owner + carer
 *  - Einladungen nur über create_pet_invite, Vorschau, Annehmen, Grenze 5 Personen
 *  - Fotos im privaten Bucket pet-photos, Pfad <pet_id>/<datei>
 *  - Tierakte: weights, vaccinations (Praxis-Einträge unveränderbar), pet_documents + privater Bucket pet-documents
 *    (PDF/JPEG/PNG/WebP, höchstens 10 MB, kein Überschreiben); nachträglich änderbar nur title, category, doc_date
 *  - Termine (appointments) und Erinnerungen (reminders) mit RPC complete_reminder; pet_id nachträglich nicht änderbar
 *  - Unique-Regeln, Löschen mit Kaskade, Uhrzeiten als "HH:MM:SS"
 */
import type { BrowserContext, Page, Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const SB = 'https://cpnbkegojxagbzkomzap.supabase.co';

type Row = Record<string, unknown>;
interface User { id: string; email: string; password: string; confirmed: boolean; meta: Row }

/** 1×1-PNG, damit Fotos im Browser „laden“ */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

class HttpError extends Error { constructor(public status: number, public code: string, msg: string) { super(msg); } }

export class FakeSupabase {
  users: User[] = [];
  tokens = new Map<string, string>(); // access_token → user id
  db: Record<string, Row[]> = { profiles: [], pets: [], pet_members: [], pet_invites: [], pet_invite_pets: [], routine_items: [], routine_done: [], weights: [], vaccinations: [], pet_documents: [], appointments: [], reminders: [] };
  files = new Map<string, { bytes: Buffer; type: string }>(); // "pet-photos/<pet>/<datei>"
  calls: { method: string; path: string; body?: unknown }[] = [];
  /** Nächste Anfrage an diese Tabelle schlägt fehl (Fehlerpfad testen) */
  failNext: Record<string, boolean> = {};
  /** Optional: alle Konsolen-Log-Ausgaben, in denen ein Einladungscode vorkommt */
  constructor(public today = '2026-10-16') {}

  // ---------- Testdaten ----------
  seedUser(email: string, password: string, display_name: string, language = 'de', confirmed = true): User {
    const u: User = { id: randomUUID(), email, password, confirmed, meta: { display_name, language } };
    this.users.push(u);
    this.db.profiles!.push({ id: u.id, display_name, language, created_at: new Date().toISOString() });
    return u;
  }
  confirm(email: string) { const u = this.users.find((x) => x.email === email); if (u) u.confirmed = true; }
  user(email: string) { return this.users.find((u) => u.email === email)!; }
  seedPet(owner: User, fields: Row): Row {
    const p = this.withDefaults('pets', fields, owner.id);
    this.db.pets!.push(p);
    this.db.pet_members!.push({ pet_id: p.id, user_id: owner.id, role: 'owner', created_at: new Date().toISOString() });
    return p;
  }
  addMember(petId: unknown, u: User, role: 'carer' | 'viewer') { this.db.pet_members!.push({ pet_id: petId, user_id: u.id, role, created_at: new Date().toISOString() }); }
  /** Zeilen, die ein Nutzer sehen würde (ohne uid: alle) */
  rows(table: string, uid?: string) { return uid ? this.db[table]!.filter((r) => this.canSee(table, r, uid)) : this.db[table]!; }

  // ---------- Regeln (wie die Zugriffsregeln der Datenbank) ----------
  private role(pet: unknown, uid: string) { return this.db.pet_members!.find((m) => m.pet_id === pet && m.user_id === uid)?.role as string | undefined; }
  private member(pet: unknown, uid: string) { return !!this.role(pet, uid); }
  private editor(pet: unknown, uid: string) { const r = this.role(pet, uid); return r === 'owner' || r === 'carer'; }
  private owner(pet: unknown, uid: string) { return this.role(pet, uid) === 'owner'; }
  private itemPet(item: unknown) { return this.db.routine_items!.find((r) => r.id === item)?.pet_id; }
  private sharesPet(a: string, b: string) {
    return this.db.pet_members!.some((m) => m.user_id === a && this.db.pet_members!.some((n) => n.pet_id === m.pet_id && n.user_id === b));
  }
  private canSee(table: string, r: Row, uid: string): boolean {
    switch (table) {
      case 'profiles': return r.id === uid || this.sharesPet(uid, String(r.id));
      case 'pets': return r.owner_id === uid || this.member(r.id, uid);
      case 'pet_members': case 'routine_items': case 'weights': case 'vaccinations': case 'pet_documents': case 'appointments': case 'reminders': return this.member(r.pet_id, uid);
      case 'routine_done': return this.member(this.itemPet(r.routine_item_id), uid);
      case 'pet_invites': return r.created_by === uid;
      case 'pet_invite_pets': return this.db.pet_invites!.some((i) => i.id === r.invite_id && i.created_by === uid);
      default: return false;
    }
  }
  private canUpdate(table: string, r: Row, uid: string, patch: Row): boolean {
    switch (table) {
      case 'profiles': return r.id === uid;
      case 'pets':
        if ('owner_id' in patch && patch.owner_id !== r.owner_id) throw new HttpError(403, '42501', 'owner_change_not_allowed');
        return this.editor(r.id, uid);
      case 'routine_items': case 'weights': return this.editor(r.pet_id, uid);
      case 'vaccinations':
        if ('source' in patch && patch.source !== 'owner') return false;
        return this.editor(r.pet_id, uid) && r.source === 'owner';
      case 'appointments': case 'reminders': {
        const allowed = table === 'appointments' ? ['title', 'kind', 'starts_at', 'ends_at', 'location', 'note', 'status'] : ['title', 'kind', 'due_on', 'repeat_days', 'note', 'last_done_on', 'done_at'];
        if (Object.keys(patch).some((k) => !allowed.includes(k))) throw new HttpError(403, '42501', `permission denied for table ${table}`);
        return this.editor(r.pet_id, uid);
      }
      case 'pet_documents':
        // Spaltenrechte: nur title, category, doc_date
        if (Object.keys(patch).some((k) => !['title', 'category', 'doc_date'].includes(k))) throw new HttpError(403, '42501', 'permission denied for table pet_documents');
        return this.editor(r.pet_id, uid);
      case 'pet_members':
        if (r.role === 'owner' || !this.owner(r.pet_id, uid)) return false;
        if ('role' in patch && !['carer', 'viewer'].includes(String(patch.role))) throw new HttpError(403, '42501', 'new row violates row-level security policy');
        return true;
      default: return false;
    }
  }
  private canDelete(table: string, r: Row, uid: string): boolean {
    switch (table) {
      case 'pets': return this.owner(r.id, uid);
      case 'routine_items': case 'weights': return this.editor(r.pet_id, uid);
      case 'vaccinations': return this.editor(r.pet_id, uid) && r.source === 'owner';
      case 'pet_documents': case 'appointments': case 'reminders': return this.editor(r.pet_id, uid);
      case 'routine_done': return this.editor(this.itemPet(r.routine_item_id), uid);
      case 'pet_members': return r.role !== 'owner' && (r.user_id === uid || this.owner(r.pet_id, uid));
      case 'pet_invites': return r.created_by === uid;
      default: return false;
    }
  }
  private canInsert(table: string, r: Row, uid: string): boolean {
    switch (table) {
      case 'pets': return r.owner_id === uid;
      case 'routine_items': case 'weights': return r.owner_id === uid && this.editor(r.pet_id, uid);
      case 'vaccinations': return r.owner_id === uid && r.source === 'owner' && this.editor(r.pet_id, uid);
      case 'pet_documents': case 'appointments': case 'reminders': return r.owner_id === uid && this.editor(r.pet_id, uid);
      case 'routine_done': return r.owner_id === uid && this.editor(this.itemPet(r.routine_item_id), uid);
      default: return false; // profiles, pet_members, pet_invites, pet_invite_pets: nur über Trigger/RPC
    }
  }

  async install(page: Page) {
    await page.route(`${SB}/**`, (route) => this.handle(route));
  }
  /** Für den ganzen Browser-Kontext, damit auch neue Tabs (z. B. signierte Dokument-Links) im Fake landen */
  async installContext(ctx: BrowserContext) {
    await ctx.route(`${SB}/**`, (route) => this.handle(route));
  }

  // ---------- Auth ----------
  private userJson(u: User) {
    return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null,
      user_metadata: u.meta, app_metadata: { provider: 'email' }, identities: [{ id: u.id, provider: 'email' }], created_at: new Date().toISOString() };
  }
  private session(u: User) {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, role: 'authenticated', aud: 'authenticated', exp, email: u.email })}.sig${randomUUID()}`;
    this.tokens.set(token, u.id);
    return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: randomUUID(), user: this.userJson(u) };
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    let body: unknown;
    try { body = req.postDataJSON(); } catch { body = undefined; }
    this.calls.push({ method, path: url.pathname + url.search, body: url.pathname.startsWith('/storage/') ? undefined : body });
    const cors = { 'access-control-allow-origin': '*' };
    const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: data === undefined ? '' : JSON.stringify(data) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    const auth = req.headers()['authorization']?.replace(/^Bearer /, '');
    const uid = auth ? this.tokens.get(auth) : undefined;

    if (url.pathname.startsWith('/auth/v1/')) {
      const p = url.pathname.slice(9);
      const b = (body ?? {}) as Row;
      if (p === 'signup') {
        const email = String(b.email).toLowerCase();
        if (String(b.password).length < 8) return json(422, { code: 'weak_password', error_code: 'weak_password', msg: 'weak' });
        if (this.users.some((u) => u.email === email)) return json(200, { ...this.userJson(this.users.find((u) => u.email === email)!), identities: [] });
        const meta = (b.data ?? {}) as Row;
        const u = this.seedUser(email, String(b.password), String(meta.display_name ?? ''), String(meta.language ?? 'de'), false);
        return json(200, this.userJson(u));
      }
      if (p === 'token') {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'password') {
          const u = this.users.find((x) => x.email === String(b.email).toLowerCase());
          if (!u || u.password !== b.password) return json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
          if (!u.confirmed) return json(400, { code: 'email_not_confirmed', error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
          return json(200, this.session(u));
        }
        return json(400, { code: 'refresh_token_not_found', msg: 'no' });
      }
      if (p === 'user') { const u = this.users.find((x) => x.id === uid); return u ? json(200, this.userJson(u)) : json(401, { code: 'bad_jwt', msg: 'unauthorized' }); }
      if (p === 'logout') { if (auth) this.tokens.delete(auth); return route.fulfill({ status: 204, headers: cors }); }
      if (p === 'recover') return json(200, {});
      return json(404, { msg: `unbekannt: ${p}` });
    }

    try {
      if (url.pathname.startsWith('/storage/v1/')) return await this.storage(route, url, method, uid, body);
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        if (!uid) return json(401, { code: '42501', message: 'permission denied' });
        return json(200, this.rpc(url.pathname.slice(13), (body ?? {}) as Row, uid));
      }
      if (url.pathname.startsWith('/rest/v1/')) return await this.rest(route, url, method, uid, body);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { code: e.code, message: e.message, details: null, hint: null });
      console.error('[fake] unerwartet', method, url.pathname + url.search, e);
      return json(500, { code: 'FAKE', message: String(e) });
    }
    return route.fulfill({ status: 404, body: 'nicht simuliert' });
  }

  // ---------- RPC ----------
  private householdCount(owner: string) {
    const myPets = new Set(this.db.pet_members!.filter((m) => m.user_id === owner && m.role === 'owner').map((m) => m.pet_id));
    const people = new Set(this.db.pet_members!.filter((m) => myPets.has(m.pet_id) && m.user_id !== owner).map((m) => m.user_id));
    const open = this.db.pet_invites!.filter((i) => i.created_by === owner && !i.accepted_at && String(i.expires_at) > new Date().toISOString()).length;
    return people.size + open;
  }
  private rpc(fn: string, a: Row, uid: string): unknown {
    const fail = (m: string, status = 400, code = 'P0001') => { throw new HttpError(status, code, m); };
    if (fn === 'complete_reminder') {
      const doneOn = String(a.p_done_on ?? this.today);
      const plus = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number) as [number, number, number]; return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
      if (doneOn > plus(this.today, 1)) fail('reminder_future');
      const r = this.db.reminders!.find((x) => x.id === a.p_id && this.member(x.pet_id, uid));
      if (!r) fail('reminder_not_found', 404, 'P0002');
      if (!this.editor(r!.pet_id, uid)) fail('reminder_not_allowed', 403, '42501');
      if (r!.repeat_days == null) Object.assign(r!, { last_done_on: doneOn, done_at: new Date().toISOString() });
      else Object.assign(r!, { last_done_on: doneOn, due_on: plus(doneOn, Number(r!.repeat_days)), done_at: null });
      return r;
    }
    if (fn === 'create_pet_invite') {
      const name = String(a.p_name ?? '').trim(); const role = String(a.p_role); const pets = (a.p_pet_ids ?? []) as string[];
      if (name.length < 1 || name.length > 60) fail('invite_name');
      if (!['carer', 'viewer'].includes(role)) fail('invite_role');
      if (!pets.length) fail('invite_no_pets');
      if (pets.some((p) => !this.owner(p, uid))) fail('invite_not_owner', 403, '42501');
      if (this.db.pet_invites!.some((i) => i.created_by === uid && !i.accepted_at && String(i.expires_at) > new Date().toISOString() && String(i.invitee_name).toLowerCase() === name.toLowerCase())) fail('invite_duplicate');
      if (this.householdCount(uid) >= 5) fail('invite_max');
      const inv = { id: randomUUID(), created_by: uid, invitee_name: name, role, token: (randomUUID() + randomUUID()).replace(/-/g, ''),
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), accepted_by: null, accepted_at: null, created_at: new Date().toISOString() };
      this.db.pet_invites!.push(inv);
      for (const p of new Set(pets)) this.db.pet_invite_pets!.push({ invite_id: inv.id, pet_id: p });
      return [{ id: inv.id, token: inv.token, expires_at: inv.expires_at }];
    }
    const inv = this.db.pet_invites!.find((i) => i.token === a.p_token);
    const invPets = inv ? this.db.pet_invite_pets!.filter((x) => x.invite_id === inv.id).map((x) => x.pet_id) : [];
    if (fn === 'invite_preview') {
      if (!inv) return null;
      const pets = invPets.map((id) => this.db.pets!.find((p) => p.id === id)!).filter(Boolean).sort((x, y) => String(x.name).localeCompare(String(y.name)));
      const status = !invPets.length ? 'empty' : invPets.every((p) => this.member(p, uid)) ? 'member' : inv.accepted_at ? 'used' : String(inv.expires_at) < new Date().toISOString() ? 'expired' : 'open';
      return { inviter_name: this.db.profiles!.find((p) => p.id === inv.created_by)?.display_name ?? null, invitee_name: inv.invitee_name, role: inv.role,
        expires_at: inv.expires_at, pets: pets.map((p) => ({ name: p.name, species: p.species, species_other: p.species_other })), status };
    }
    if (fn === 'accept_pet_invite') {
      if (!inv || !invPets.length) fail('invite_not_found', 404, 'P0002');
      if (inv!.accepted_by === uid) return invPets;
      if (inv!.accepted_at) fail('invite_used');
      if (String(inv!.expires_at) < new Date().toISOString()) fail('invite_expired');
      if (inv!.created_by === uid) fail('invite_own');
      for (const p of invPets) if (!this.member(p, uid)) this.db.pet_members!.push({ pet_id: p, user_id: uid, role: inv!.role, created_at: new Date().toISOString() });
      inv!.accepted_by = uid; inv!.accepted_at = new Date().toISOString();
      return invPets;
    }
    throw new HttpError(404, 'PGRST202', `Funktion ${fn} unbekannt`);
  }

  // ---------- Storage ----------
  private async storage(route: Route, url: URL, method: string, uid: string | undefined, body: unknown) {
    const cors = { 'access-control-allow-origin': '*' };
    const json = (status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    const rest = decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length));
    // signierte Datei abrufen (ohne Anmeldung, mit token)
    if (method === 'GET' && rest.startsWith('sign/')) {
      const f = this.files.get(rest.slice(5));
      if (!f || !url.searchParams.get('token')) return route.fulfill({ status: 400, headers: cors, body: 'invalid' });
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': f.type }, body: f.bytes });
    }
    if (!uid) return json(400, { statusCode: '403', error: 'Unauthorized', message: 'not signed in' });
    const petOf = (path: string) => path.split('/').length >= 2 ? path.split('/')[0] : null;
    const deny = () => json(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    if (method === 'POST' && rest.startsWith('sign/')) {
      const p = rest.slice(5);
      const bucket = p.split('/')[0]!;
      const signOne = (path: string) => {
        const key = `${bucket}/${path}`;
        if (!this.files.has(key) || !this.member(petOf(path), uid)) return { path, signedURL: null, error: 'Object not found' };
        return { path, signedURL: `/object/sign/${key}?token=t${randomUUID()}`, error: null };
      };
      if (!p.includes('/')) { const b = body as { paths: string[] }; return json(200, b.paths.map(signOne)); }
      const one = signOne(p.slice(bucket.length + 1));
      return one.signedURL ? json(200, { signedURL: one.signedURL }) : json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    }
    if ((method === 'POST' || method === 'PUT') && !rest.startsWith('sign/')) {
      const [bucket, ...pp] = rest.split('/'); const path = pp.join('/');
      if (bucket === 'pet-documents') return this.uploadDocument(route, json, deny, path, uid);
      if (bucket !== 'pet-photos' || !this.editor(petOf(path), uid)) return deny();
      const type = route.request().headers()['content-type'] ?? 'application/octet-stream';
      if (!/^image\/(jpeg|png|webp)/.test(type) && !/multipart/.test(type)) return json(400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${type} is not supported` });
      const bytes = route.request().postDataBuffer() ?? Buffer.alloc(0);
      if (bytes.length > 5 * 1024 * 1024) return json(400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
      const key = `${bucket}/${path}`;
      if (this.files.has(key) && route.request().headers()['x-upsert'] !== 'true') return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      this.files.set(key, { bytes: PNG, type: 'image/png' });
      return json(200, { Key: key, Id: randomUUID() });
    }
    if (method === 'DELETE') {
      const bucket = rest.split('/')[0]!; const b = body as { prefixes: string[] };
      const out: Row[] = [];
      for (const path of b?.prefixes ?? []) {
        const key = `${bucket}/${path}`;
        if (this.files.has(key) && this.editor(petOf(path), uid)) { this.files.delete(key); out.push({ name: path, bucket_id: bucket }); }
      }
      return json(200, out);
    }
    return json(400, { statusCode: '400', error: 'nicht simuliert', message: `${method} ${rest}` });
  }

  /** Upload in den Bucket pet-documents: echte Bytes und Typ speichern (für signierte Abrufe), Grenzen wie der Bucket */
  private uploadDocument(route: Route, json: (s: number, d: unknown) => Promise<void>, deny: () => Promise<void>, path: string, uid: string) {
    const petId = path.split('/').length >= 2 ? path.split('/')[0] : null;
    if (!this.editor(petId, uid)) return deny();
    const headers = route.request().headers();
    let type = headers['content-type'] ?? 'application/octet-stream';
    let bytes = route.request().postDataBuffer() ?? Buffer.alloc(0);
    const mp = /multipart\/form-data;\s*boundary=(.+)$/i.exec(type);
    if (mp) {
      // supabase-js schickt Blobs als FormData: Teil mit Dateiinhalt heraussuchen
      const boundary = Buffer.from(`--${mp[1]!.replace(/^"|"$/g, '')}`);
      const parts: Buffer[] = [];
      let i = bytes.indexOf(boundary);
      while (i !== -1) { const j = bytes.indexOf(boundary, i + boundary.length); if (j === -1) break; parts.push(bytes.subarray(i + boundary.length + 2, j - 2)); i = j; }
      const file = parts.find((x) => /filename=/i.test(x.subarray(0, 400).toString('latin1')));
      if (!file) return json(400, { statusCode: '400', error: 'invalid', message: 'no file' });
      const sep = file.indexOf('\r\n\r\n');
      const head = file.subarray(0, sep).toString('latin1');
      type = /content-type:\s*([^\r\n;]+)/i.exec(head)?.[1]?.trim() ?? 'application/octet-stream';
      bytes = file.subarray(sep + 4);
    }
    // Playwright sieht den Inhalt von Blob-Bodies nicht: dann Platzhalter speichern, damit signierte Abrufe etwas liefern
    if (bytes.length === 0) bytes = type === 'application/pdf' ? Buffer.from('%PDF-1.4\n%%EOF\n') : PNG;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(type)) return json(400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${type} is not supported` });
    if (bytes.length > 10 * 1024 * 1024) return json(400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    const key = `pet-documents/${path}`;
    // Kein Überschreiben, auch nicht mit x-upsert
    if (this.files.has(key)) return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    this.files.set(key, { bytes: Buffer.from(bytes), type });
    return json(200, { Key: key, Id: randomUUID() });
  }

  // ---------- PostgREST ----------
  private async rest(route: Route, url: URL, method: string, uid: string | undefined, body: unknown) {
    const cors = { 'access-control-allow-origin': '*' };
    const json = (status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: data === undefined ? '' : JSON.stringify(data) });
    const table = url.pathname.slice(9);
    if (!this.db[table]) throw new HttpError(404, '42P01', `relation ${table} does not exist`);
    if (!uid) throw new HttpError(401, '42501', 'permission denied');
    if (this.failNext[table]) { this.failNext[table] = false; throw new HttpError(500, 'XX000', 'simulierter Fehler'); }
    const prefer = route.request().headers()['prefer'] ?? '';
    const accept = route.request().headers()['accept'] ?? '';
    const wantRep = prefer.includes('return=representation');
    const single = accept.includes('vnd.pgrst.object');
    const filters: [string, string, string][] = [];
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'on_conflict', 'columns', 'limit', 'offset'].includes(k)) continue;
      const i = v.indexOf('.');
      filters.push([k, v.slice(0, i), v.slice(i + 1)]);
    }
    const norm = (x: unknown) => (x === null || x === undefined ? 'null' : String(x));
    const match = (r: Row) => filters.every(([k, op, val]) => {
      if (k === 'or' || k === 'and') throw new Error(`Filter ${k} nicht simuliert`);
      const v = norm(r[k]);
      switch (op) {
        case 'eq': return v === val;
        case 'neq': return v !== val;
        case 'is': return val === 'null' ? r[k] == null : v === val;
        case 'not.is': return val === 'null' ? r[k] != null : v !== val;
        case 'in': return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(v);
        case 'gt': return r[k] != null && v > val;
        case 'gte': return r[k] != null && v >= val;
        case 'lt': return r[k] != null && v < val;
        case 'lte': return r[k] != null && v <= val;
        default: throw new Error(`Filter ${op} nicht simuliert`);
      }
    });
    const visible = () => this.db[table]!.filter((r) => this.canSee(table, r, uid));
    const project = (r: Row, tbl = table, sel = url.searchParams.get('select') ?? '*') => this.project(r, tbl, sel, uid);
    const order = (rows: Row[]) => {
      const o = url.searchParams.get('order');
      if (!o) return rows;
      const keys = o.split(',').map((s) => s.split('.'));
      return [...rows].sort((a, b) => { for (const [col, dir] of keys) { const x = String(a[col!] ?? ''), y = String(b[col!] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1); } return 0; });
    };
    const respond = (rows: Row[], status = 200) => {
      if (single) {
        if (rows.length !== 1) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
        return json(status, project(rows[0]!));
      }
      return json(status, rows.map((r) => project(r)));
    };

    if (method === 'GET' || method === 'HEAD') return respond(order(visible().filter(match)));

    if (method === 'POST') {
      const list = (Array.isArray(body) ? body : [body]) as Row[];
      const ignoreDup = prefer.includes('resolution=ignore-duplicates');
      const out: Row[] = [];
      for (const input of list) {
        const r = this.withDefaults(table, input, uid);
        if (!this.canInsert(table, r, uid)) throw new HttpError(403, '42501', `new row violates row-level security policy for table "${table}"`);
        const v = this.violates(table, r);
        if (v === 'dup') { if (ignoreDup) continue; throw new HttpError(409, '23505', 'duplicate key value violates unique constraint'); }
        if (v) throw new HttpError(400, '23514', v);
        this.db[table]!.push(r);
        if (table === 'pets') this.db.pet_members!.push({ pet_id: r.id, user_id: uid, role: 'owner', created_at: new Date().toISOString() });
        out.push(r);
      }
      return wantRep ? respond(out, 201) : json(201, undefined);
    }
    if (method === 'PATCH') {
      const patch = this.normalize(table, body as Row);
      const target = visible().filter(match).filter((r) => this.canUpdate(table, r, uid, patch));
      for (const r of target) { const v = this.violates(table, { ...r, ...patch }, r); if (v && v !== 'dup') throw new HttpError(400, '23514', v); }
      for (const r of target) Object.assign(r, patch, table === 'pets' ? { updated_at: new Date().toISOString() } : {});
      return wantRep ? respond(target) : json(204, undefined);
    }
    if (method === 'DELETE') {
      const target = visible().filter(match).filter((r) => this.canDelete(table, r, uid));
      for (const r of target) this.cascadeDelete(table, r);
      return wantRep ? respond(target) : json(204, undefined);
    }
    throw new HttpError(405, 'PGRST', 'method');
  }

  /** select-Parameter mit einfacher Einbettung, z. B. "id, role, pet_invite_pets(pet_id)" oder "*, pets(name)" */
  private project(r: Row, table: string, sel: string, uid: string): Row {
    const parts: string[] = []; let depth = 0, cur = '';
    for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch; }
    if (cur.trim()) parts.push(cur.trim());
    const out: Row = {};
    for (const p of parts) {
      const m = /^(?:(\w+):)?([\w]+)(?:!\w+)?\((.*)\)$/.exec(p);
      if (!m) { if (p === '*') Object.assign(out, r); else { const [alias, col] = p.includes(':') ? p.split(':') : [p, p]; out[alias!.trim()] = r[col!.trim()]; } continue; }
      const alias = m[1] ?? m[2]!, rel = m[2]!, inner = m[3]!;
      const REL: Record<string, Record<string, [string, string, boolean]>> = {
        pet_invites: { pet_invite_pets: ['invite_id', 'id', true] },
        pet_invite_pets: { pets: ['id', 'pet_id', false], pet_invites: ['id', 'invite_id', false] },
        pets: { pet_members: ['pet_id', 'id', true], routine_items: ['pet_id', 'id', true] },
        pet_members: { pets: ['id', 'pet_id', false] },
        routine_done: { routine_items: ['id', 'routine_item_id', false] },
        routine_items: { pets: ['id', 'pet_id', false], routine_done: ['routine_item_id', 'id', true] },
      };
      const def = REL[table]?.[rel];
      if (!def) throw new HttpError(400, 'PGRST200', `Could not find a relationship between '${table}' and '${rel}'`);
      const [childKey, parentKey, many] = def;
      const kids = this.db[rel]!.filter((x) => x[childKey] === r[parentKey] && this.canSee(rel, x, uid)).map((x) => this.project(x, rel, inner, uid));
      out[alias] = many ? kids : (kids[0] ?? null);
    }
    return out;
  }

  private normalize(table: string, r: Row): Row {
    const out = { ...r };
    if (table === 'routine_items' && typeof out.time_of_day === 'string' && /^\d{2}:\d{2}$/.test(out.time_of_day)) out.time_of_day += ':00';
    return out;
  }
  private withDefaults(table: string, input: Row, uid: string): Row {
    const now = new Date().toISOString();
    const base: Row = { id: randomUUID(), created_at: now };
    if (!['profiles', 'pet_members', 'pet_invite_pets'].includes(table)) base.owner_id = uid;
    if (table === 'pets') Object.assign(base, { deceased: false, updated_at: now, species_other: null, breed: null, sex: null, birth_date: null, chip_no: null, cat_outdoor: null, stable: null, allergies: null, medications: null, emergency_contact: null, photo_path: null });
    if (table === 'routine_items') Object.assign(base, { repeat: 'daily', reminder_on: true, label: null });
    if (table === 'routine_done') base.done_on = this.today;
    if (table === 'weights') base.measured_on = this.today;
    if (table === 'vaccinations') Object.assign(base, { source: 'owner', given_on: null, valid_until: null });
    if (table === 'pet_documents') Object.assign(base, { category: 'other', doc_date: null });
    if (table === 'appointments') Object.assign(base, { kind: 'vet', ends_at: null, location: null, note: null, status: 'planned' });
    if (table === 'reminders') Object.assign(base, { kind: 'other', repeat_days: null, note: null, last_done_on: null, done_at: null });
    return this.normalize(table, { ...base, ...input });
  }
  private violates(table: string, r: Row, self?: Row): string | 'dup' | null {
    if (table === 'pets') {
      if (!['dog', 'cat', 'rabbit', 'guinea', 'bird', 'reptile', 'horse', 'other'].includes(String(r.species))) return 'pets_species_check';
      if (r.species === 'other' && !r.species_other) return 'other_needs_name';
      if (!r.name || String(r.name).length > 60) return 'pets_name_check';
      if (r.sex != null && !['female', 'male'].includes(String(r.sex))) return 'pets_sex_check';
    }
    if (table === 'routine_items') {
      if (!['walk', 'feed', 'med', 'litter', 'cage', 'terra', 'muck', 'own'].includes(String(r.kind))) return 'routine_items_kind_check';
      if (!['daily', 'weekdays', 'weekends'].includes(String(r.repeat))) return 'routine_items_repeat_check';
      if (r.label != null && String(r.label).length > 40) return 'routine_items_label_check';
      if (r.label != null && this.db.routine_items!.some((x) => x.pet_id === r.pet_id && x.kind === r.kind && x.time_of_day === r.time_of_day && x.label === r.label)) return 'dup';
    }
    if (table === 'weights') {
      const kg = Number(r.kg);
      if (!Number.isFinite(kg) || kg <= 0 || kg >= 2000) return 'weights_kg_check';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.measured_on))) return 'weights_measured_on';
    }
    if (table === 'vaccinations') {
      const n = String(r.name ?? '').trim();
      if (n.length < 1 || n.length > 80) return 'vaccinations_name_check';
      if (!['owner', 'practice'].includes(String(r.source))) return 'vaccinations_source_check';
    }
    if (table === 'pet_documents') {
      const t = String(r.title ?? '').trim();
      if (t.length < 1 || t.length > 120) return 'pet_documents_title_check';
      if (!['finding', 'vaccination', 'invoice', 'insurance', 'prescription', 'other'].includes(String(r.category))) return 'pet_documents_category_check';
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(String(r.mime_type))) return 'pet_documents_mime_type_check';
      const size = Number(r.size_bytes);
      if (!Number.isInteger(size) || size <= 0 || size > 10485760) return 'pet_documents_size_bytes_check';
      if (String(r.storage_path).split('/')[0] !== String(r.pet_id)) return 'pet_documents_path_check';
      if (this.db.pet_documents!.some((x) => x !== self && x.storage_path === r.storage_path)) return 'dup';
    }
    if (table === 'appointments') {
      const t = String(r.title ?? '').trim();
      if (t.length < 1 || t.length > 120) return 'appointments_title_check';
      if (!['vet', 'vaccination', 'grooming', 'training', 'other'].includes(String(r.kind))) return 'appointments_kind_check';
      if (!['planned', 'done', 'cancelled'].includes(String(r.status))) return 'appointments_status_check';
      if (Number.isNaN(Date.parse(String(r.starts_at)))) return 'appointments_starts_at';
      if (r.ends_at != null && !(Date.parse(String(r.ends_at)) > Date.parse(String(r.starts_at)))) return 'appointments_end_check';
      if (r.location != null && String(r.location).length > 200) return 'appointments_location_check';
      if (r.note != null && String(r.note).length > 1000) return 'appointments_note_check';
    }
    if (table === 'reminders') {
      const t = String(r.title ?? '').trim();
      if (t.length < 1 || t.length > 120) return 'reminders_title_check';
      if (!['deworming', 'flea_tick', 'medication', 'vaccination', 'checkup', 'grooming', 'other'].includes(String(r.kind))) return 'reminders_kind_check';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.due_on))) return 'reminders_due_on';
      if (r.repeat_days != null && !(Number.isInteger(r.repeat_days) && Number(r.repeat_days) >= 1 && Number(r.repeat_days) <= 3650)) return 'reminders_repeat_days_check';
      if (r.note != null && String(r.note).length > 1000) return 'reminders_note_check';
    }
    if (table === 'routine_done' && this.db.routine_done!.some((x) => x.routine_item_id === r.routine_item_id && x.done_on === r.done_on)) return 'dup';
    return null;
  }
  private cascadeDelete(table: string, r: Row) {
    this.db[table] = this.db[table]!.filter((x) => x !== r);
    if (table === 'pets') {
      for (const t of ['routine_items', 'weights', 'vaccinations', 'pet_documents', 'appointments', 'reminders', 'pet_members', 'pet_invite_pets']) for (const c of this.db[t]!.filter((x) => x.pet_id === r.id)) this.cascadeDelete(t, c);
    }
    if (table === 'routine_items') this.db.routine_done = this.db.routine_done!.filter((x) => x.routine_item_id !== r.id);
    if (table === 'pet_invites') this.db.pet_invite_pets = this.db.pet_invite_pets!.filter((x) => x.invite_id !== r.id);
  }
}
