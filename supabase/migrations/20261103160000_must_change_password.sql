-- NEXT-STEPS #6 (D-106): someone who signs in with a temporary password from the owner must choose their own
-- before the app opens. The owner's /staff actions set the flag (new mechanic, password reset); it is cleared
-- once the person sets their own password. Both writes use the service role.
--
-- No grant to `authenticated`, neither select nor update: the app reads the caller's own flag on the server,
-- keyed by the verified session user (like phone/about, D-076), so colleagues never see it and no client can
-- clear it. The seed and the e2e accounts keep the default (false).
alter table public.profiles add column must_change_password boolean not null default false;
