-- Garage Desk schema: PRD §5, DECISIONS D-008, D-013, D-017, plus rate_limits (D-012).
-- Money is integer cents. RLS, grants and helpers: 20261102120100_rls.sql. Functions: 20261102120200_functions.sql.

create extension if not exists pg_trgm with schema extensions;

create type public.job_status as enum ('new', 'quoted', 'approved', 'in_progress', 'ready', 'collected');
create type public.staff_role as enum ('owner', 'mechanic');
create type public.line_kind as enum ('labour', 'part');
create type public.actor_type as enum ('staff', 'customer');

-- Not exposed by the API: RLS helpers and trigger functions.
create schema private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (btrim(full_name) <> ''),
  role public.staff_role not null,
  active boolean not null default true
);

create table public.settings (
  id smallint primary key default 1 check (id = 1),
  garage_name text not null check (btrim(garage_name) <> ''),
  garage_address text not null check (btrim(garage_address) <> ''),
  garage_phone text not null check (btrim(garage_phone) <> ''),
  hourly_rate_cents integer not null check (hourly_rate_cents > 0),
  vat_bps integer not null check (vat_bps between 0 and 10000),
  currency text not null default 'PHP' check (btrim(currency) <> ''),
  timezone text not null default 'Asia/Manila' check (btrim(timezone) <> '')
);

insert into public.settings (garage_name, garage_address, garage_phone, hourly_rate_cents, vat_bps)
values ('Garage Desk Demo', '1450 Taft Avenue, Malate, Manila 1004', '0917 555 0142', 100000, 1200);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (btrim(full_name) <> ''),
  phone text not null check (phone ~ '^[0-9]+$'), -- normalised to digits by trigger
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+$'),
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  plate text not null unique check (plate ~ '^[A-Z0-9]+$'), -- normalised by trigger
  make text not null check (btrim(make) <> ''),
  model text not null check (btrim(model) <> ''),
  year integer check (year between 1900 and 2100)
);

create sequence public.job_ref_seq;

-- GD-0042 style ref; pads to 4 digits but never truncates (lpad would wrap GD-10000 to GD-1000).
create function public.next_job_ref() returns text
language sql volatile set search_path = ''
as $$ select 'GD-' || case when v < 10000 then lpad(v::text, 4, '0') else v::text end
          from (select nextval('public.job_ref_seq') as v) s $$;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default public.next_job_ref(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  assigned_mechanic_id uuid not null references public.profiles (id) on delete restrict,
  description text not null check (btrim(description) <> ''),
  status public.job_status not null default 'new',
  -- Snapshot of settings.vat_bps, always set by private.jobs_guard(); the default only keeps it optional on insert.
  vat_bps integer not null default 0 check (vat_bps between 0 and 10000),
  quoted_subtotal_cents bigint,
  quoted_vat_cents bigint,
  quoted_total_cents bigint,
  quoted_at timestamptz,
  approved_total_cents bigint,
  approved_at timestamptz,
  collected_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint jobs_quoted_all_or_none
    check (num_nulls(quoted_subtotal_cents, quoted_vat_cents, quoted_total_cents, quoted_at) in (0, 4)),
  constraint jobs_approved_all_or_none check (num_nulls(approved_total_cents, approved_at) in (0, 2))
);

alter sequence public.job_ref_seq owned by public.jobs.ref;

create table public.job_line_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind public.line_kind not null,
  description text not null check (btrim(description) <> ''),
  quantity numeric(10, 2) not null check (quantity > 0), -- hours for labour, qty for parts
  unit_price_cents integer not null check (unit_price_cents >= 0), -- labour: rate snapshot set by trigger
  line_total_cents bigint generated always as (round(quantity * unit_price_cents)::bigint) stored,
  created_at timestamptz not null default now()
);

create table public.job_events (
  id bigint generated always as identity primary key, -- tie-breaker for timeline order
  job_id uuid not null references public.jobs (id) on delete cascade,
  from_status public.job_status,
  to_status public.job_status not null,
  actor_type public.actor_type not null,
  actor_id uuid references public.profiles (id) on delete restrict,
  note text check (note is null or (btrim(note) <> '' and char_length(note) <= 500)),
  created_at timestamptz not null default now(),
  constraint job_events_actor check ((actor_type = 'staff') = (actor_id is not null))
);

create table public.job_links (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz
);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------
-- Indexes (every FK and RLS predicate, plus search)
-- ---------------------------------------------------------------------------

create index vehicles_customer_id_idx on public.vehicles (customer_id);
create index jobs_vehicle_id_idx on public.jobs (vehicle_id);
create index jobs_assigned_mechanic_id_idx on public.jobs (assigned_mechanic_id);
create index jobs_created_by_idx on public.jobs (created_by);
create index jobs_status_idx on public.jobs (status);
create index jobs_collected_at_idx on public.jobs (collected_at);
create index job_line_items_job_id_idx on public.job_line_items (job_id);
create index job_events_job_id_idx on public.job_events (job_id);
create index job_events_actor_id_idx on public.job_events (actor_id);
create index job_links_job_id_idx on public.job_links (job_id);
create index job_links_created_by_idx on public.job_links (created_by);
create unique index job_links_one_active_per_job on public.job_links (job_id) where revoked_at is null;
create index rate_limits_window_start_idx on public.rate_limits (window_start);

create index customers_full_name_trgm_idx on public.customers using gin (full_name extensions.gin_trgm_ops);
create index customers_phone_trgm_idx on public.customers using gin (phone extensions.gin_trgm_ops);
create index vehicles_plate_trgm_idx on public.vehicles using gin (plate extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- D-017: phone stored as digits only.
create function private.normalise_customer() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.phone := regexp_replace(new.phone, '\D', '', 'g');
  return new;
end;
$$;

create trigger customers_normalise before insert or update of phone on public.customers
  for each row execute function private.normalise_customer();

-- D-017: plate stored uppercase without spaces/dashes.
create function private.normalise_vehicle() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.plate := upper(regexp_replace(new.plate, '[\s-]', '', 'g'));
  return new;
end;
$$;

create trigger vehicles_normalise before insert or update of plate on public.vehicles
  for each row execute function private.normalise_vehicle();

-- New jobs always start clean in `new` with the current VAT snapshot (FR4 rate rule).
-- Owner edits (description, mechanic) stop once collected. The assignee must be an active mechanic.
create function private.jobs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.vat_bps := (select s.vat_bps from public.settings s where s.id = 1);
    new.status := 'new';
    new.created_by := coalesce(new.created_by, auth.uid());
    new.quoted_subtotal_cents := null;
    new.quoted_vat_cents := null;
    new.quoted_total_cents := null;
    new.quoted_at := null;
    new.approved_total_cents := null;
    new.approved_at := null;
    new.collected_at := null;
  else
    if old.status = 'collected' then
      raise exception 'job_locked';
    end if;
    if new.assigned_mechanic_id is not distinct from old.assigned_mechanic_id then
      return new;
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

create trigger jobs_guard before insert or update of description, assigned_mechanic_id on public.jobs
  for each row execute function private.jobs_guard();

-- Every job's timeline starts with null -> new, dated like the job (so backdated seed jobs stay consistent).
create function private.jobs_log_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.job_events (job_id, from_status, to_status, actor_type, actor_id, created_at)
  values (new.id, null, 'new', 'staff', new.created_by, new.created_at);
  return null;
end;
$$;

create trigger jobs_log_created after insert on public.jobs
  for each row execute function private.jobs_log_created();

-- FR3: lines change only while the job is `new`. Labour price is the settings rate at insert,
-- never the client's value, and never changes afterwards. FOR SHARE serialises with
-- transition_job's FOR UPDATE so no line slips in while a quote is being frozen.
create function private.line_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.job_status;
begin
  if tg_op = 'DELETE' then
    select j.status into v_status from public.jobs j where j.id = old.job_id for share;
    -- Parent row missing = the job itself is being deleted (cascade).
    if found and v_status <> 'new' then
      raise exception 'job_locked';
    end if;
    return old;
  end if;

  -- Staff context: inaccessible jobs look missing, before RLS WITH CHECK would run.
  if tg_op = 'INSERT' and auth.uid() is not null and not private.can_access_job(new.job_id) then
    raise exception 'not_found';
  end if;

  select j.status into v_status from public.jobs j where j.id = new.job_id for share;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status <> 'new' then
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

create trigger job_line_items_guard before insert or update or delete on public.job_line_items
  for each row execute function private.line_items_guard();
