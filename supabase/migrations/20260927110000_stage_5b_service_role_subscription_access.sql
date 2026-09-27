-- Allow the authenticated Edge Function's trusted backend client to manage
-- caregiver subscriptions while browser roles remain constrained by RLS.

grant select, insert, update on public.push_subscriptions to service_role;
