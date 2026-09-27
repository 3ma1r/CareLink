-- Make the private outbox's browser denial explicit for database linting as well as grants/schema isolation.

create policy push_notification_deliveries_deny_browser
on private.push_notification_deliveries
for all to anon, authenticated
using (false)
with check (false);
