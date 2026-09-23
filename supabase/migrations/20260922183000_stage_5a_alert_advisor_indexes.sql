-- Cover the optional acknowledgement audit foreign key reported by the performance advisor.
create index care_alerts_acknowledged_by_idx
  on public.care_alerts(acknowledged_by)
  where acknowledged_by is not null;
