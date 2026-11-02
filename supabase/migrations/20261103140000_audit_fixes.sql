-- Audit fixes (D-091…D-093): immutable timeline actor names, unique staff names, the dashboard workload
-- keeps deactivated mechanics who still hold open jobs, and "last viewed" ignores staff and link previews.

-- ---------------------------------------------------------------------------
-- 1. Who did a past step is a snapshot (D-091). A later rename never changes the timeline.
-- ---------------------------------------------------------------------------

alter table public.job_events add column actor_name text;

update public.job_events e
set actor_name = case
  when e.actor_id is null then 'Customer'
  else (select p.full_name from public.profiles p where p.id = e.actor_id)
end;

alter table public.job_events alter column actor_name set not null;

-- Always derived here, whatever the insert says: staff → their name at that moment, customer → 'Customer'.
create function private.job_events_actor_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actor_name := case
    when new.actor_id is null then 'Customer'
    else (select p.full_name from public.profiles p where p.id = new.actor_id)
  end;
  return new;
end;
$$;

revoke all on function private.job_events_actor_name() from public, anon, authenticated;

create trigger job_events_actor_name before insert on public.job_events
  for each row execute function private.job_events_actor_name();

-- No two staff members share a name (case and surrounding spaces ignored), so nobody can pose as a colleague.
create unique index profiles_full_name_unique on public.profiles (lower(btrim(full_name)));

-- ---------------------------------------------------------------------------
-- 2. Dashboard workload (D-092): unchanged, except that a deactivated mechanic still holding open jobs stays
--    in the list (flagged `active: false`), so the workload always adds up to the open-job count.
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
        'active', p.active,
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
      where p.role = 'mechanic' and (p.active or exists (
        select 1 from public.jobs j where j.assigned_mechanic_id = p.id and j.status not in ('collected', 'cancelled')
      ))
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Customer link lookup (D-093): unchanged, except that the server can look up without stamping
--    last_viewed_at (staff checking the link, link-preview bots). Service role only, as before.
-- ---------------------------------------------------------------------------

drop function public.public_job_by_token_hash(text);

create function public.public_job_by_token_hash(p_token_hash text, p_count_view boolean default true) returns jsonb
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
  if p_count_view then
    update public.job_links set last_viewed_at = now() where id = v_link_id;
  end if;

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

revoke all on function public.public_job_by_token_hash(text, boolean) from public, anon, authenticated;
grant execute on function public.public_job_by_token_hash(text, boolean) to service_role;
