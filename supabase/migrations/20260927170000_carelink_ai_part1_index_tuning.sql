-- Align the deployed AI Part 1 indexes with the queries the application runs.
-- Audit foreign keys intentionally remain unindexed because the analysis path
-- never searches by those columns and their referenced rows are delete-restricted.

drop index if exists private.personalized_evaluations_device_time_idx;
drop index if exists public.personalized_insights_patient_status_time_idx;

create index if not exists personalized_insights_patient_time_idx
  on public.personalized_insights(patient_id,last_observed_at desc);
