-- Teil 11: Tagesplan und Medikation verknüpfen, Push auch für den Tagesplan (Gassi, Füttern …)
-- 1. Medikamente gehören nur in pet_medications. Neue Tagesplan-Einträge mit kind = 'med' werden abgelehnt
--    (bestehende bleiben lesbar, damit die App sie zum Umwandeln anbieten kann).
-- 2. Tagesplan-Einträge mit reminder_on = true lösen zur Uhrzeit eine Push-Nachricht aus
--    (nicht, wenn heute schon erledigt; Wiederholung täglich / werktags / Wochenende).
-- 3. Neue Einstellung notification_prefs.routine (Standard an).

-- ---------- 1. Keine neuen Medikamente im Tagesplan ----------
create or replace function private.routine_no_med() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'med' and (tg_op = 'INSERT' or old.kind is distinct from 'med') then
    raise exception 'routine_use_medication' using errcode = '23514',
      hint = 'Medikamente bitte in der Medikation eintragen (pet_medications).';
  end if;
  return new;
end; $$;
revoke all on function private.routine_no_med() from public, anon, authenticated;
create trigger routine_items_no_med before insert or update of kind on public.routine_items
  for each row execute function private.routine_no_med();

-- ---------- 3. Einstellung ----------
alter table public.notification_prefs add column if not exists routine boolean not null default true;
grant update (routine) on public.notification_prefs to authenticated;

-- ---------- 2. Fällige Benachrichtigungen um den Tagesplan erweitern ----------
create or replace function private.due_pushes(p_now timestamptz)
returns table (user_id uuid, kind text, ref_id uuid, slot timestamptz, pet_name text, title text, info jsonb, url text)
language sql stable security definer set search_path = '' as $$
  with z as (select (p_now at time zone 'Europe/Berlin')::date as d, p_now as n, p_now - interval '10 minutes' as f),
  med as (
    select m.id, m.pet_id, m.name, m.amount, m.unit, m.intake_hint,
           ((z.d + t) at time zone 'Europe/Berlin') as slot, t
    from public.pet_medications m cross join z cross join lateral unnest(m.times) t
    where m.frequency = 'daily' and m.remind and m.starts_on <= z.d
      and (m.ends_on is null or m.ends_on >= z.d) and (m.stopped_on is null or m.stopped_on >= z.d)
  ),
  med_due as (
    select me.* from med me, z
    where me.slot > z.f and me.slot <= z.n
      and not exists (select 1 from public.medication_doses d where d.medication_id = me.id and d.scheduled_on = z.d and d.scheduled_time = me.t)
  ),
  rt as (
    select ri.id, ri.pet_id, ri.kind as rkind, ri.label, ri.time_of_day,
           ((z.d + ri.time_of_day) at time zone 'Europe/Berlin') as slot
    from public.routine_items ri cross join z
    where ri.reminder_on and ri.kind <> 'med'
      and (ri.repeat = 'daily'
           or (ri.repeat = 'weekdays' and extract(isodow from z.d) between 1 and 5)
           or (ri.repeat = 'weekends' and extract(isodow from z.d) in (6, 7)))
      and not exists (select 1 from public.routine_done rd where rd.routine_item_id = ri.id and rd.done_on = z.d)
  )
  select pm.user_id, 'medication', md.id, md.slot, p.name, md.name,
         jsonb_build_object('amount', md.amount, 'unit', md.unit, 'hint', md.intake_hint, 'time', to_char(md.t,'HH24:MI')),
         '/erinnerungen'
  from med_due md join public.pets p on p.id = md.pet_id and not coalesce(p.deceased,false)
  join public.pet_members pm on pm.pet_id = md.pet_id and pm.role in ('owner','carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where coalesce(np.medication, true)
  union all
  select pm.user_id, 'reminder', r.id, ((z.d + coalesce(np.reminder_time,'09:00')) at time zone 'Europe/Berlin'), p.name, r.title,
         jsonb_build_object('overdue', r.due_on < z.d, 'due_on', r.due_on), '/erinnerungen'
  from public.reminders r cross join z
  join public.pets p on p.id = r.pet_id and not coalesce(p.deceased,false)
  join public.pet_members pm on pm.pet_id = r.pet_id and pm.role in ('owner','carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where r.done_at is null and r.due_on <= z.d and coalesce(np.reminders, true)
    and ((z.d + coalesce(np.reminder_time,'09:00')) at time zone 'Europe/Berlin') > z.f
    and ((z.d + coalesce(np.reminder_time,'09:00')) at time zone 'Europe/Berlin') <= z.n
  union all
  select pm.user_id, 'appointment', a.id, a.starts_at - interval '60 minutes', p.name, a.title,
         jsonb_build_object('time', to_char(a.starts_at at time zone 'Europe/Berlin', 'HH24:MI'), 'location', a.location), '/termine'
  from public.appointments a cross join z
  join public.pets p on p.id = a.pet_id and not coalesce(p.deceased,false)
  join public.pet_members pm on pm.pet_id = a.pet_id and pm.role in ('owner','carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where a.status = 'planned' and coalesce(np.appointments, true)
    and a.starts_at - interval '60 minutes' > z.f and a.starts_at - interval '60 minutes' <= z.n
  union all
  select pm.user_id, 'routine', x.id, x.slot, p.name, coalesce(x.label, ''),
         jsonb_build_object('rkind', x.rkind, 'label', x.label, 'time', to_char(x.time_of_day,'HH24:MI')), '/alltag'
  from rt x cross join z
  join public.pets p on p.id = x.pet_id and not coalesce(p.deceased,false)
  join public.pet_members pm on pm.pet_id = x.pet_id and pm.role in ('owner','carer')
  left join public.notification_prefs np on np.user_id = pm.user_id
  where coalesce(np.routine, true) and x.slot > z.f and x.slot <= z.n;
$$;
revoke all on function private.due_pushes(timestamptz) from public, anon, authenticated;
