-- Stage 5B defense in depth and foreign-key indexes.

alter table private.push_notification_deliveries enable row level security;
alter table private.push_notification_deliveries force row level security;

create index push_delivery_subscription_idx
  on private.push_notification_deliveries(subscription_id);
create index push_delivery_caregiver_idx
  on private.push_notification_deliveries(caregiver_id);
