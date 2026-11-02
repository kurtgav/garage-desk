-- Client answers (D-047, D-052): Declined and Cancelled. New enum values must be committed
-- before any use, so they get their own migration.
alter type public.job_status add value 'declined' after 'quoted';
alter type public.job_status add value 'cancelled' after 'collected';
