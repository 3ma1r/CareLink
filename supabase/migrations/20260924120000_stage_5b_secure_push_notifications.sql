-- CareLink Stage 5B: caregiver-owned Web Push subscriptions and a durable delivery outbox.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (
    char_length(endpoint) between 20 and 2048
    and endpoint ~ '^https://'
  ),
  p256dh text not null check (char_length(p256dh) between 40 and 180),
  auth_key text not null check (char_length(auth_key) between 12 and 80),
  device_label text check (
    device_label is null or char_length(btrim(device_label)) between 1 and 80
  ),
  active boolean not null default true,
  last_successful_delivery_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((active and revoked_at is null) or not active)
);

create index push_subscriptions_caregiver_active_idx
  on public.push_subscriptions(caregiver_id, active);

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function private.set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own
on public.push_subscriptions for select to authenticated
using ((select auth.uid()) = caregiver_id);

create policy push_subscriptions_delete_own
on public.push_subscriptions for delete to authenticated
using ((select auth.uid()) = caregiver_id);

create table private.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.care_alerts(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending','processing','retryable','delivered','permanent_failure')
  ),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_http_status integer check (last_http_status is null or last_http_status between 100 and 599),
  last_error_category text check (
    last_error_category is null
    or last_error_category in ('temporary','expired_endpoint','invalid_request','configuration','max_attempts')
  ),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(alert_id, subscription_id)
);

create index push_delivery_claim_idx
  on private.push_notification_deliveries(next_attempt_at, created_at)
  where status in ('pending','retryable','processing');

create trigger push_notification_deliveries_set_updated_at
before update on private.push_notification_deliveries
for each row execute function private.set_updated_at();

revoke all on private.push_notification_deliveries from public, anon, authenticated;

create or replace function private.enqueue_care_alert_push_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  insert into private.push_notification_deliveries(alert_id, subscription_id, caregiver_id)
  select new.id, subscription.id, subscription.caregiver_id
  from public.patients patient
  join public.push_subscriptions subscription
    on subscription.caregiver_id = patient.caregiver_id
   and subscription.active
  where patient.id = new.patient_id
  on conflict (alert_id, subscription_id) do nothing;

  return new;
end;
$$;

create trigger care_alerts_enqueue_push_after_insert
after insert on public.care_alerts
for each row execute function private.enqueue_care_alert_push_deliveries();

revoke all on function private.enqueue_care_alert_push_deliveries() from public, anon, authenticated;

-- The worker claims rows atomically. Expired processing leases can be reclaimed.
create or replace function public.claim_carelink_push_deliveries(
  p_worker_token uuid,
  p_limit integer default 20
) returns table (
  delivery_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  attempt_number integer
)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select delivery.id
    from private.push_notification_deliveries delivery
    join public.push_subscriptions subscription on subscription.id = delivery.subscription_id
    where subscription.active
      and delivery.attempt_count < 5
      and (
        (delivery.status in ('pending','retryable') and delivery.next_attempt_at <= now())
        or (delivery.status = 'processing' and delivery.lease_expires_at <= now())
      )
    order by delivery.next_attempt_at, delivery.created_at
    for update of delivery skip locked
    limit least(greatest(p_limit, 1), 100)
  ), claimed as (
    update private.push_notification_deliveries delivery
    set status = 'processing',
        attempt_count = delivery.attempt_count + 1,
        lease_token = p_worker_token,
        lease_expires_at = now() + interval '5 minutes'
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.subscription_id, delivery.attempt_count
  )
  select claimed.id, subscription.id, subscription.endpoint,
         subscription.p256dh, subscription.auth_key, claimed.attempt_count
  from claimed
  join public.push_subscriptions subscription on subscription.id = claimed.subscription_id
  order by claimed.id;
$$;

create or replace function public.complete_carelink_push_delivery(
  p_delivery_id uuid,
  p_worker_token uuid,
  p_outcome text,
  p_http_status integer default null,
  p_error_category text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery private.push_notification_deliveries%rowtype;
  final_status text;
begin
  if p_outcome not in ('delivered','retryable','permanent_failure') then
    raise exception 'invalid delivery outcome' using errcode = '22023';
  end if;
  if p_http_status is not null and (p_http_status < 100 or p_http_status > 599) then
    raise exception 'invalid HTTP status' using errcode = '22023';
  end if;
  if p_error_category is not null and p_error_category not in (
    'temporary','expired_endpoint','invalid_request','configuration','max_attempts'
  ) then
    raise exception 'invalid error category' using errcode = '22023';
  end if;

  select * into delivery
  from private.push_notification_deliveries
  where id = p_delivery_id and status = 'processing' and lease_token = p_worker_token
  for update;
  if not found then return false; end if;

  if p_outcome = 'delivered' then
    update private.push_notification_deliveries set
      status = 'delivered', delivered_at = now(), next_attempt_at = now(),
      lease_token = null, lease_expires_at = null, last_http_status = p_http_status,
      last_error_category = null
    where id = delivery.id;
    update public.push_subscriptions set
      last_successful_delivery_at = now(), failure_count = 0
    where id = delivery.subscription_id;
    return true;
  end if;

  final_status := case
    when p_outcome = 'permanent_failure' or delivery.attempt_count >= 5
      then 'permanent_failure'
    else 'retryable'
  end;

  update private.push_notification_deliveries set
    status = final_status,
    next_attempt_at = case when final_status = 'retryable'
      then now() + make_interval(secs => least(3600, 30 * power(2, delivery.attempt_count - 1)::integer))
      else now() end,
    lease_token = null,
    lease_expires_at = null,
    last_http_status = p_http_status,
    last_error_category = case
      when delivery.attempt_count >= 5 and p_outcome <> 'permanent_failure' then 'max_attempts'
      else p_error_category end
  where id = delivery.id;

  update public.push_subscriptions set failure_count = failure_count + 1
  where id = delivery.subscription_id;

  if p_http_status in (404,410) or p_error_category = 'expired_endpoint' then
    update public.push_subscriptions set active = false, revoked_at = now()
    where id = delivery.subscription_id;
  end if;
  return true;
end;
$$;

revoke all on function public.claim_carelink_push_deliveries(uuid,integer) from public, anon, authenticated;
revoke all on function public.complete_carelink_push_delivery(uuid,uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.claim_carelink_push_deliveries(uuid,integer) to service_role;
grant execute on function public.complete_carelink_push_delivery(uuid,uuid,text,integer,text) to service_role;

-- Cron invokes the worker only after both named Vault secrets are configured.
create or replace function private.invoke_carelink_push_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  worker_secret text;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets where name = 'CARELINK_PUSH_WORKER_URL';
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets where name = 'CARELINK_PUSH_WORKER_SECRET';
  if nullif(worker_url, '') is null or nullif(worker_secret, '') is null then return null; end if;

  return net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || worker_secret
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke all on function private.invoke_carelink_push_worker() from public, anon, authenticated;

select cron.schedule(
  'carelink-push-worker-every-minute',
  '* * * * *',
  'select private.invoke_carelink_push_worker();'
);
