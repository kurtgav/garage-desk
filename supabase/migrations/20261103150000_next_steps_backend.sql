-- NEXT-STEPS #8 and #18 (D-099, D-101): Cyrillic look-alike letters in plates map to Latin, and the
-- settings text has the same length limits in the database as in the server action.

-- ---------------------------------------------------------------------------
-- 1. Plates (D-099). One normaliser for the trigger and for search; normalisePlate() in src/lib/format.ts
--    is the same mapping, and tests/integration/next-steps-backend.test.ts holds the two together.
-- ---------------------------------------------------------------------------

-- The 12 Cyrillic letters Bulgarian plates share with Latin (А В Е К М Н О Р С Т У Х), both cases.
create function private.normalise_plate(p text) returns text
language sql immutable set search_path = '' as $$
  select upper(translate(regexp_replace(p, '[\s-]', '', 'g'),
                         'АВЕКМНОРСТУХавекмнорстух', 'ABEKMHOPCTYXABEKMHOPCTYX'))
$$;

revoke all on function private.normalise_plate(text) from public, anon;
-- Called by the vehicles trigger (staff inserts, the seed's service role) and by search_customers (invoker).
grant execute on function private.normalise_plate(text) to authenticated, service_role;

create or replace function private.normalise_vehicle() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.plate := private.normalise_plate(new.plate);
  return new;
end;
$$;

-- Re-normalise stored plates. A plate whose new form another vehicle already has (or would get) is left
-- as it is and reported, so the deploy never fails on the unique index; staff merge those by hand.
-- Today this changes nothing: vehicles_plate_check (^[A-Z0-9]+$) has always refused Cyrillic letters.
do $$
declare
  v_skipped text;
begin
  select string_agg(v.plate, ', ' order by v.plate) into v_skipped
  from public.vehicles v
  where v.plate <> private.normalise_plate(v.plate)
    and exists (
      select 1 from public.vehicles o
      where o.id <> v.id and private.normalise_plate(o.plate) = private.normalise_plate(v.plate)
    );

  update public.vehicles v
  set plate = private.normalise_plate(v.plate)
  where v.plate <> private.normalise_plate(v.plate)
    and not exists (
      select 1 from public.vehicles o
      where o.id <> v.id and private.normalise_plate(o.plate) = private.normalise_plate(v.plate)
    );

  if v_skipped is not null then
    raise warning 'Plates left unchanged because their Latin form already exists: %', v_skipped;
  end if;
end;
$$;

-- Search (FR2): the plate part of the query goes through the same normaliser. Otherwise unchanged
-- from 20261102150100_client_answers.sql (grant to authenticated is kept by create or replace).
create or replace function public.search_customers(p_query text)
returns table (id uuid, full_name text, phone text, email text, vehicles jsonb)
language sql stable set search_path = '' as $$
  with q as (
    select
      '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as name_pattern,
      regexp_replace(regexp_replace(coalesce(p_query, ''), '\D', '', 'g'), '^0', '') as digits,
      replace(replace(private.normalise_plate(coalesce(p_query, '')), '%', '\%'), '_', '\_') as plate
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
-- 2. Settings text lengths = saveSettings' zod limits (D-101, like D-070 for the other tables).
-- ---------------------------------------------------------------------------

alter table public.settings
  add constraint settings_garage_name_length check (char_length(garage_name) <= 100),
  add constraint settings_garage_address_length check (char_length(garage_address) <= 200),
  add constraint settings_garage_phone_length check (char_length(garage_phone) <= 30);
