-- Client answers (PRD §12, D-047…D-056, D-057…): EUR/Sofia, exact line amounts, immutable quote
-- versions, decline/cancel/rework/phone approval, automatic re-quote, mechanics create
-- customers/vehicles/jobs, links never expire, net revenue.

create type public.approval_channel as enum ('link', 'phone');

-- ---------------------------------------------------------------------------
-- Settings: EUR, Europe/Sofia, VAT 20% (D-055). Demo garage until the seed sets its own values.
-- ---------------------------------------------------------------------------

alter table public.settings
  alter column currency set default 'EUR',
  alter column timezone set default 'Europe/Sofia',
  alter column vat_bps set default 2000;

update public.settings
set currency = 'EUR', timezone = 'Europe/Sofia', vat_bps = 2000, hourly_rate_cents = 4500,
    garage_name = 'Petrov Auto Service', garage_address = '27 Tsarigradsko Shose Blvd, 1113 Sofia',
    garage_phone = '+359 2 812 3456'
where id = 1;

-- Phones: digits only; a national 10-digit 0… number becomes 359… (D-055, matches normalisePhone()).
create or replace function private.normalise_customer() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.phone := regexp_replace(new.phone, '\D', '', 'g');
  if new.phone ~ '^0[0-9]{9}$' then
    new.phone := '359' || substr(new.phone, 2);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Money: exact line amounts, one rounding at the end (D-048).
-- ---------------------------------------------------------------------------

alter table public.job_line_items drop column line_total_cents;
alter table public.job_line_items
  add column line_total_cents numeric(16, 2) generated always as (quantity * unit_price_cents) stored;

create or replace function public.compute_job_totals(p_job_id uuid)
returns table (subtotal_cents bigint, vat_cents bigint, total_cents bigint)
language sql stable set search_path = '' as $$
  select t.net, t.vat, t.net + t.vat
  from public.jobs j
  cross join lateral (
    select coalesce(sum(li.line_total_cents), 0) as exact
    from public.job_line_items li
    where li.job_id = j.id
  ) s
  cross join lateral (
    -- round(numeric) is half away from zero; VAT from the exact sum, not the rounded net.
    select round(s.exact)::bigint as net, round(s.exact * j.vat_bps / 10000)::bigint as vat
  ) t
  where j.id = p_job_id
$$;

-- ---------------------------------------------------------------------------
-- Quote versions (D-049) and approval evidence.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column quote_version integer check (quote_version > 0),
  add column approved_quote_version integer,
  add column approved_subtotal_cents bigint,
  add column approved_vat_cents bigint;

-- Rows from before versioning (D-057): their only quote is version 1.
update public.jobs set quote_version = 1 where quoted_at is not null;
update public.jobs
set approved_quote_version = 1, approved_subtotal_cents = quoted_subtotal_cents, approved_vat_cents = quoted_vat_cents
where approved_at is not null;

alter table public.jobs
  drop constraint jobs_quoted_all_or_none,
  drop constraint jobs_approved_all_or_none,
  add constraint jobs_quoted_all_or_none
    check (num_nulls(quote_version, quoted_subtotal_cents, quoted_vat_cents, quoted_total_cents, quoted_at) in (0, 5)),
  add constraint jobs_approved_all_or_none
    check (num_nulls(approved_quote_version, approved_subtotal_cents, approved_vat_cents, approved_total_cents, approved_at) in (0, 5));

create table public.job_quotes (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  version integer not null check (version > 0),
  subtotal_cents bigint not null,
  vat_cents bigint not null,
  total_cents bigint not null,
  vat_bps integer not null,
  lines jsonb not null, -- [{id, kind, description, quantity, unit_price_cents, line_total_cents}]
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (job_id, version)
);
create index job_quotes_created_by_idx on public.job_quotes (created_by);

alter table public.job_events
  add column channel public.approval_channel,
  add column quote_version integer,
  add column total_cents bigint,
  add constraint job_events_channel check (channel is null or to_status in ('approved', 'declined'));

-- Snapshot of a job's lines, in display order.
create function private.quote_lines(p_job_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', li.id,
    'kind', li.kind,
    'description', li.description,
    'quantity', li.quantity::text,
    'unit_price_cents', li.unit_price_cents,
    'line_total_cents', li.line_total_cents
  ) order by li.created_at, li.id), '[]'::jsonb)
  from public.job_line_items li
  where li.job_id = p_job_id
$$;

insert into public.job_quotes (job_id, version, subtotal_cents, vat_cents, total_cents, vat_bps, lines, created_by, created_at)
select j.id, 1, j.quoted_subtotal_cents, j.quoted_vat_cents, j.quoted_total_cents, j.vat_bps,
       private.quote_lines(j.id), j.created_by, j.quoted_at
from public.jobs j
where j.quote_version = 1;

-- Freezes the next quote version and moves the job to `quoted` (D-049, D-050). Callers hold the
-- job row lock and have checked the caller and the transition.
create function private.quote_job(p_job_id uuid, p_from public.job_status, p_actor_id uuid, p_note text)
returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
begin
  if not exists (select 1 from public.job_line_items li where li.job_id = p_job_id) then
    raise exception 'no_line_items';
  end if;

  update public.jobs j
  set status = 'quoted',
      quote_version = coalesce(j.quote_version, 0) + 1,
      quoted_subtotal_cents = t.subtotal_cents,
      quoted_vat_cents = t.vat_cents,
      quoted_total_cents = t.total_cents,
      quoted_at = now()
  from public.compute_job_totals(p_job_id) t
  where j.id = p_job_id
  returning j.* into v_job;

  insert into public.job_quotes (job_id, version, subtotal_cents, vat_cents, total_cents, vat_bps, lines, created_by, created_at)
  values (p_job_id, v_job.quote_version, v_job.quoted_subtotal_cents, v_job.quoted_vat_cents, v_job.quoted_total_cents,
          v_job.vat_bps, private.quote_lines(p_job_id), p_actor_id, v_job.quoted_at);

  insert into public.job_events (job_id, from_status, to_status, actor_type, actor_id, quote_version, total_cents, note)
  values (p_job_id, p_from, 'quoted', 'staff', p_actor_id, v_job.quote_version, v_job.quoted_total_cents,
          nullif(left(btrim(p_note), 500), ''));
  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jobs: mechanics create their own jobs; reassignment is owner only (D-054).
-- ---------------------------------------------------------------------------

create or replace function private.jobs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.vat_bps := (select s.vat_bps from public.settings s where s.id = 1);
    new.status := 'new';
    new.created_by := coalesce(new.created_by, auth.uid());
    new.quote_version := null;
    new.quoted_subtotal_cents := null;
    new.quoted_vat_cents := null;
    new.quoted_total_cents := null;
    new.quoted_at := null;
    new.approved_quote_version := null;
    new.approved_subtotal_cents := null;
    new.approved_vat_cents := null;
    new.approved_total_cents := null;
    new.approved_at := null;
    new.collected_at := null;
    if private.staff_role() = 'mechanic' then
      new.assigned_mechanic_id := auth.uid();
    end if;
  else
    if old.status in ('collected', 'cancelled') then
      raise exception 'job_locked';
    end if;
    if new.assigned_mechanic_id is not distinct from old.assigned_mechanic_id then
      return new;
    end if;
    if private.staff_role() = 'mechanic' then
      raise exception 'forbidden';
    end if;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = new.assigned_mechanic_id and p.role = 'mechanic' and p.active
  ) then
    raise exception 'invalid_mechanic';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Line items: editable until Ready; a change on a quoted/approved/in-progress job re-quotes (D-050).
-- ---------------------------------------------------------------------------

-- FOR UPDATE (not SHARE): the statement trigger below re-quotes under the same lock, and two
-- concurrent edits of one job must queue instead of deadlocking on a lock upgrade.
create or replace function private.line_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.job_status;
begin
  if tg_op = 'DELETE' then
    select j.status into v_status from public.jobs j where j.id = old.job_id for update;
    -- Parent row missing = the job itself is being deleted (cascade).
    if found and v_status not in ('new', 'quoted', 'declined', 'approved', 'in_progress') then
      raise exception 'job_locked';
    end if;
    return old;
  end if;

  -- Staff context: inaccessible jobs look missing, before RLS WITH CHECK would run.
  if tg_op = 'INSERT' and auth.uid() is not null and not private.can_access_job(new.job_id) then
    raise exception 'not_found';
  end if;

  select j.status into v_status from public.jobs j where j.id = new.job_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status not in ('new', 'quoted', 'declined', 'approved', 'in_progress') then
    raise exception 'job_locked';
  end if;

  if tg_op = 'INSERT' then
    if new.kind = 'labour' then
      new.unit_price_cents := (select s.hourly_rate_cents from public.settings s where s.id = 1);
    end if;
  else
    if new.kind <> old.kind then
      raise exception 'kind_immutable';
    end if;
    if new.kind = 'labour' then
      new.unit_price_cents := old.unit_price_cents;
    end if;
  end if;
  return new;
end;
$$;

-- One new version per job per statement. Removing the last line raises no_line_items (quote_job).
create function private.line_items_requote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_job_ids uuid[];
  v_job record;
begin
  if tg_op = 'DELETE' then
    select array_agg(distinct o.job_id) into v_job_ids from old_lines o;
  else
    select array_agg(distinct n.job_id) into v_job_ids from new_lines n; -- job_id is not updatable
  end if;

  for v_job in
    select j.id, j.status from public.jobs j
    where j.id = any (v_job_ids) and j.status in ('quoted', 'approved', 'in_progress')
    order by j.id
    for update
  loop
    -- The new version needs a staff author; the service role edits lines only before a quote (D-057).
    if private.staff_role() is null then
      raise exception 'forbidden';
    end if;
    perform private.quote_job(v_job.id, v_job.status, auth.uid(), 'Lines changed — new quote');
  end loop;
  return null;
end;
$$;

create trigger job_line_items_requote_insert after insert on public.job_line_items
  referencing new table as new_lines for each statement execute function private.line_items_requote();
create trigger job_line_items_requote_update after update on public.job_line_items
  referencing old table as old_lines new table as new_lines for each statement execute function private.line_items_requote();
create trigger job_line_items_requote_delete after delete on public.job_line_items
  referencing old table as old_lines for each statement execute function private.line_items_requote();

-- ---------------------------------------------------------------------------
-- State machine (PRD FR5, D-049…D-052). The only writer of jobs.status besides quote_job().
-- ---------------------------------------------------------------------------

drop function public.transition_job(uuid, public.job_status, text, text, bigint);

create function public.transition_job(
  p_job_id uuid,
  p_to_status public.job_status,
  p_note text default null,
  p_link_token_hash text default null,
  p_expected_version integer default null
) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
  v_from public.job_status;
  v_customer boolean := p_link_token_hash is not null;
  v_role public.staff_role; -- stays null for customers
  v_actor_id uuid; -- stays null for customers
  v_channel public.approval_channel;
  v_note text := nullif(left(btrim(p_note), 500), '');
begin
  -- Who is calling, decided before the job is read or locked (D-038).
  if v_customer then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'forbidden';
    end if;
  else
    v_role := private.staff_role();
    v_actor_id := auth.uid();
    if v_role is null then
      raise exception 'forbidden';
    end if;
  end if;

  if p_to_status is null then
    raise exception 'invalid_transition';
  end if;

  -- FR1: another mechanic's job looks missing, and is never locked.
  select * into v_job from public.jobs j
  where j.id = p_job_id and (v_role is distinct from 'mechanic' or j.assigned_mechanic_id = v_actor_id)
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  v_from := v_job.status;

  if v_customer then
    -- An active link of this job; links never expire (D-053).
    if not exists (
      select 1 from public.job_links l
      where l.job_id = p_job_id and l.token_hash = p_link_token_hash and l.revoked_at is null
    ) then
      raise exception 'not_found';
    end if;
    if p_to_status not in ('approved', 'declined') then
      raise exception 'invalid_transition';
    end if;
    -- Replays of a decision already taken on this version (double tap): current job, no event.
    if (p_to_status = 'approved' and v_from in ('approved', 'in_progress', 'ready', 'collected'))
       or (p_to_status = 'declined' and v_from = 'declined') then
      if p_expected_version is distinct from v_job.quote_version then
        raise exception 'quote_changed';
      end if;
      return v_job;
    end if;
    if v_from <> 'quoted' then
      raise exception 'invalid_transition';
    end if;
    -- The customer decides on the version their page showed (D-049).
    if p_expected_version is distinct from v_job.quote_version then
      raise exception 'quote_changed';
    end if;
    v_channel := 'link';
  else
    if p_to_status in ('approved', 'cancelled') and v_role <> 'owner' then
      raise exception 'forbidden'; -- phone approval and cancel are owner only (D-051, D-052)
    end if;
    if v_from::text || '>' || p_to_status::text not in (
         'new>quoted', 'declined>quoted', 'quoted>approved', 'approved>in_progress',
         'in_progress>ready', 'ready>in_progress', 'ready>collected')
       and not (p_to_status = 'cancelled' and v_from not in ('collected', 'cancelled')) then
      raise exception 'invalid_transition';
    end if;
    if p_to_status in ('approved', 'cancelled') and v_note is null then
      raise exception 'note_required';
    end if;
    if p_to_status = 'approved' then
      if p_expected_version is distinct from v_job.quote_version then
        raise exception 'quote_changed';
      end if;
      v_channel := 'phone';
    end if;
    -- Never charged for a total the customer did not approve.
    if p_to_status in ('in_progress', 'ready', 'collected')
       and v_job.approved_quote_version is distinct from v_job.quote_version then
      raise exception 'invalid_transition';
    end if;
    if p_to_status = 'quoted' then
      return private.quote_job(p_job_id, v_from, v_actor_id, v_note);
    end if;
  end if;

  case p_to_status
    when 'approved' then
      update public.jobs j
      set status = 'approved',
          approved_quote_version = j.quote_version,
          approved_subtotal_cents = j.quoted_subtotal_cents,
          approved_vat_cents = j.quoted_vat_cents,
          approved_total_cents = j.quoted_total_cents,
          approved_at = now()
      where j.id = p_job_id
      returning j.* into v_job;
    when 'collected' then
      update public.jobs j
      set status = 'collected', collected_at = now()
      where j.id = p_job_id
      returning j.* into v_job;
    else
      update public.jobs j
      set status = p_to_status
      where j.id = p_job_id
      returning j.* into v_job;
  end case;

  insert into public.job_events (job_id, from_status, to_status, actor_type, actor_id, channel, quote_version, total_cents, note)
  values (
    p_job_id, v_from, p_to_status,
    case when v_customer then 'customer' else 'staff' end::public.actor_type,
    v_actor_id, v_channel,
    case when p_to_status in ('approved', 'declined') then v_job.quote_version end,
    case when p_to_status in ('approved', 'declined') then v_job.quoted_total_cents end,
    v_note
  );

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- Links: creatable from the first quote until Ready, never expire (D-053).
-- ---------------------------------------------------------------------------

create or replace function public.create_job_link(p_job_id uuid, p_token_hash text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.job_status;
  v_created_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token_hash';
  end if;
  if private.staff_role() is null then
    raise exception 'forbidden';
  end if;
  if not private.can_access_job(p_job_id) then
    raise exception 'not_found';
  end if;

  select j.status into v_status from public.jobs j where j.id = p_job_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status not in ('quoted', 'declined', 'approved', 'in_progress', 'ready') then
    raise exception 'not_linkable';
  end if;

  update public.job_links l set revoked_at = now() where l.job_id = p_job_id and l.revoked_at is null;
  insert into public.job_links (job_id, token_hash, created_by)
  values (p_job_id, p_token_hash, auth.uid())
  returning created_at into v_created_at;
  return v_created_at;
end;
$$;

-- Whitelisted DTO for the public page (FR6, D-014, D-051, D-053). Keys must equal PUBLIC_JOB_KEYS
-- in src/lib/public-job.ts. Lines and totals come from the current quote version's snapshot, so
-- edits in progress (e.g. while Declined) never show. Unknown or revoked -> null.
create or replace function public.public_job_by_token_hash(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_link_id uuid;
  v_job public.jobs;
  v_quote public.job_quotes;
begin
  select l.id into v_link_id
  from public.job_links l
  where l.token_hash = p_token_hash and l.revoked_at is null;
  if v_link_id is null then
    return null;
  end if;

  select j.* into v_job from public.jobs j join public.job_links l on l.job_id = j.id where l.id = v_link_id;
  select q.* into v_quote from public.job_quotes q where q.job_id = v_job.id and q.version = v_job.quote_version;
  update public.job_links set last_viewed_at = now() where id = v_link_id;

  return jsonb_build_object(
    'garage', (
      select jsonb_build_object('name', s.garage_name, 'address', s.garage_address, 'phone', s.garage_phone)
      from public.settings s where s.id = 1
    ),
    'job', jsonb_build_object('ref', v_job.ref, 'status', v_job.status, 'quote_version', v_job.quote_version),
    'vehicle', (
      select jsonb_build_object('make', v.make, 'model', v.model, 'plate', v.plate)
      from public.vehicles v where v.id = v_job.vehicle_id
    ),
    'customer', (
      select jsonb_build_object('first_name', split_part(btrim(c.full_name), ' ', 1))
      from public.vehicles v join public.customers c on c.id = v.customer_id
      where v.id = v_job.vehicle_id
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', x.l -> 'description',
        'quantity', x.l -> 'quantity',
        'unit_price_cents', x.l -> 'unit_price_cents',
        'line_total_cents', x.l -> 'line_total_cents'
      ) order by x.ord)
      from jsonb_array_elements(v_quote.lines) with ordinality as x(l, ord)
    ), '[]'::jsonb),
    'totals', case when v_quote.id is null then null else jsonb_build_object(
      'subtotal_cents', v_quote.subtotal_cents,
      'vat_cents', v_quote.vat_cents,
      'total_cents', v_quote.total_cents,
      'vat_bps', v_quote.vat_bps
    ) end,
    -- Status and date only; channel marks phone approvals, never who recorded them.
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at, 'channel', e.channel)
                       order by e.created_at, e.id)
      from public.job_events e where e.job_id = v_job.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard (FR8, D-052, D-056): net revenue of jobs collected this month (garage timezone);
-- open = not collected/cancelled.
-- ---------------------------------------------------------------------------

create or replace function public.get_dashboard(p_now timestamptz default now()) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_tz text;
  v_local_month timestamp;
  v_month_start timestamptz;
  v_month_end timestamptz; -- exclusive: first instant of next month (D-027)
  v_today date;
begin
  if not private.is_owner() then
    raise exception 'forbidden';
  end if;

  select s.timezone into v_tz from public.settings s where s.id = 1;
  v_local_month := date_trunc('month', p_now at time zone v_tz);
  v_month_start := v_local_month at time zone v_tz;
  v_month_end := (v_local_month + interval '1 month') at time zone v_tz;
  v_today := (p_now at time zone v_tz)::date;

  return jsonb_build_object(
    'counts_by_status', (
      select jsonb_object_agg(st.s::text, (select count(*) from public.jobs j where j.status = st.s))
      from unnest(enum_range(null::public.job_status)) as st(s)
    ),
    'revenue', (
      select jsonb_build_object(
        'net_cents', coalesce(sum(j.approved_subtotal_cents), 0),
        'jobs_count', count(*),
        'month_start', v_month_start,
        'month_end', v_month_end
      )
      from public.jobs j
      where j.status = 'collected' and j.collected_at >= v_month_start and j.collected_at < v_month_end
    ),
    'ready_jobs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id,
        'ref', j.ref,
        'customer_name', c.full_name,
        'plate', v.plate,
        'total_cents', j.quoted_total_cents,
        'ready_since', r.ready_since,
        'days_waiting', v_today - (r.ready_since at time zone v_tz)::date
      ) order by r.ready_since, j.ref), '[]'::jsonb)
      from public.jobs j
      join public.vehicles v on v.id = j.vehicle_id
      join public.customers c on c.id = v.customer_id
      cross join lateral (
        select max(e.created_at) as ready_since
        from public.job_events e
        where e.job_id = j.id and e.to_status = 'ready'
      ) r
      where j.status = 'ready'
    ),
    'workload', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'mechanic_id', p.id,
        'mechanic_name', p.full_name,
        'total_open', (
          select count(*) from public.jobs j
          where j.assigned_mechanic_id = p.id and j.status not in ('collected', 'cancelled')
        ),
        'by_status', (
          select jsonb_object_agg(st.s::text, (
            select count(*) from public.jobs j where j.assigned_mechanic_id = p.id and j.status = st.s
          ))
          from unnest(enum_range(null::public.job_status)) as st(s)
          where st.s not in ('collected', 'cancelled')
        )
      ) order by p.full_name), '[]'::jsonb)
      from public.profiles p
      where p.role = 'mechanic' and p.active
    )
  );
end;
$$;

-- Search (FR2): a national-format digit query ("0881 234") also matches the stored 359… form.
create or replace function public.search_customers(p_query text)
returns table (id uuid, full_name text, phone text, email text, vehicles jsonb)
language sql stable set search_path = '' as $$
  with q as (
    select
      '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as name_pattern,
      regexp_replace(regexp_replace(coalesce(p_query, ''), '\D', '', 'g'), '^0', '') as digits,
      replace(replace(upper(regexp_replace(coalesce(p_query, ''), '[\s-]', '', 'g')), '%', '\%'), '_', '\_') as plate
  )
  select
    c.id,
    c.full_name,
    c.phone,
    c.email,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'plate', v.plate, 'make', v.make, 'model', v.model, 'year', v.year)
                       order by v.plate)
      from public.vehicles v where v.customer_id = c.id
    ), '[]'::jsonb)
  from public.customers c, q
  where c.full_name ilike q.name_pattern
     or (length(q.digits) >= 3 and c.phone like '%' || q.digits || '%')
     or (q.plate <> '' and exists (
           select 1 from public.vehicles v
           where v.customer_id = c.id and v.plate like '%' || q.plate || '%'
         ))
  order by c.full_name, c.id
$$;

-- ---------------------------------------------------------------------------
-- RLS (D-054): every active staff member works with customers and vehicles; delete is owner only.
-- Mechanics insert jobs (assigned to themselves by jobs_guard) and edit their own.
-- ---------------------------------------------------------------------------

drop policy customers_select on public.customers;
drop policy customers_insert on public.customers;
drop policy customers_update on public.customers;
create policy customers_select on public.customers for select to authenticated
  using ((select private.is_staff()));
create policy customers_insert on public.customers for insert to authenticated
  with check ((select private.is_staff()));
create policy customers_update on public.customers for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

drop policy vehicles_select on public.vehicles;
drop policy vehicles_insert on public.vehicles;
drop policy vehicles_update on public.vehicles;
create policy vehicles_select on public.vehicles for select to authenticated
  using ((select private.is_staff()));
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check ((select private.is_staff()));
create policy vehicles_update on public.vehicles for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

drop function private.my_customer_ids();
drop function private.my_vehicle_ids();

-- Deleting a customer takes their vehicles with it, and fails as a whole if any vehicle has jobs.
alter table public.vehicles
  drop constraint vehicles_customer_id_fkey,
  add constraint vehicles_customer_id_fkey foreign key (customer_id) references public.customers (id) on delete cascade;

-- New customer and first vehicle in one transaction (FR2). Security invoker: RLS applies.
create function public.create_customer(
  p_full_name text, p_phone text, p_plate text, p_make text, p_model text,
  p_email text default null, p_year integer default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.customers (full_name, phone, email)
  values (p_full_name, p_phone, p_email)
  returning id into v_id;
  insert into public.vehicles (customer_id, plate, make, model, year)
  values (v_id, p_plate, p_make, p_model, p_year);
  return v_id;
end;
$$;

drop policy jobs_insert on public.jobs;
drop policy jobs_update on public.jobs;
create policy jobs_insert on public.jobs for insert to authenticated
  with check (
    (select private.is_owner())
    or (assigned_mechanic_id = (select auth.uid()) and (select private.staff_role()) = 'mechanic')
  );
create policy jobs_update on public.jobs for update to authenticated
  using (
    (select private.is_owner())
    or (assigned_mechanic_id = (select auth.uid()) and (select private.staff_role()) = 'mechanic')
  )
  with check (
    (select private.is_owner())
    or (assigned_mechanic_id = (select auth.uid()) and (select private.staff_role()) = 'mechanic')
  );

-- Quote versions: read-only for staff who can see the job; written only by quote_job() (D-049).
alter table public.job_quotes enable row level security;
create policy job_quotes_select on public.job_quotes for select to authenticated
  using (private.can_access_job(job_id));

-- ---------------------------------------------------------------------------
-- Privileges (explicit, D-041)
-- ---------------------------------------------------------------------------

revoke all on public.job_quotes from anon, authenticated;
grant select on public.job_quotes to authenticated;

revoke all on function public.create_customer(text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_customer(text, text, text, text, text, text, integer) to authenticated;

revoke all on function public.transition_job(uuid, public.job_status, text, text, integer) from public, anon, authenticated;
grant execute on function public.transition_job(uuid, public.job_status, text, text, integer) to authenticated, service_role;

-- Internal: called only from security definer functions and triggers.
revoke all on function private.quote_lines(uuid) from public, anon, authenticated;
revoke all on function private.quote_job(uuid, public.job_status, uuid, text) from public, anon, authenticated;
revoke all on function private.line_items_requote() from public, anon, authenticated;
