-- Ensure a worker crash during the final allowed attempt cannot strand an outbox row.

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
  with exhausted as (
    update private.push_notification_deliveries delivery
    set status = 'permanent_failure',
        next_attempt_at = now(),
        lease_token = null,
        lease_expires_at = null,
        last_error_category = 'max_attempts'
    where delivery.status = 'processing'
      and delivery.attempt_count >= 5
      and delivery.lease_expires_at <= now()
    returning delivery.id
  ), candidates as (
    select delivery.id
    from private.push_notification_deliveries delivery
    join public.push_subscriptions subscription on subscription.id = delivery.subscription_id
    where subscription.active
      and delivery.attempt_count < 5
      and (
        (delivery.status in ('pending','retryable') and delivery.next_attempt_at <= now())
        or (delivery.status = 'processing' and delivery.lease_expires_at <= now())
      )
      and (select count(*) from exhausted) >= 0
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

revoke all on function public.claim_carelink_push_deliveries(uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_carelink_push_deliveries(uuid,integer) to service_role;
