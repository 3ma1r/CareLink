-- CareLink AI Part 1: deterministic, quality-aware personalized insights.
-- Version 1 uses a rolling median/MAD baseline and runs out of band from ingestion.

create table private.carelink_personalized_analysis_config (
  algorithm_version text primary key,
  activated_at timestamptz not null default statement_timestamp(),
  baseline_window interval not null,
  evaluation_window interval not null,
  resolution_window interval not null,
  minimum_baseline_samples integer not null check (minimum_baseline_samples > 0),
  minimum_baseline_days integer not null check (minimum_baseline_days > 0),
  minimum_baseline_coverage interval not null,
  minimum_recent_samples integer not null check (minimum_recent_samples > 1),
  maximum_recent_samples integer not null check (maximum_recent_samples >= minimum_recent_samples),
  unusual_score_threshold numeric not null check (unusual_score_threshold > 0),
  minimum_direction_consistency numeric not null check (minimum_direction_consistency between 0.5 and 1),
  resolution_score_threshold numeric not null check (resolution_score_threshold > 0),
  resolution_sample_count integer not null check (resolution_sample_count > 1),
  high_confidence_baseline_samples integer not null,
  high_confidence_days integer not null,
  high_confidence_recent_samples integer not null,
  high_confidence_consistency numeric not null check (high_confidence_consistency between 0.5 and 1),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index carelink_personalized_one_active_config
  on private.carelink_personalized_analysis_config(active) where active;

create table private.carelink_personalized_metric_config (
  algorithm_version text not null references private.carelink_personalized_analysis_config(algorithm_version) on delete restrict,
  metric text not null check (metric in ('heart_rate','spo2','temperature')),
  unit text not null,
  valid_minimum numeric not null,
  valid_maximum numeric not null,
  noise_scale_floor numeric not null check (noise_scale_floor > 0),
  absolute_deviation_floor numeric not null check (absolute_deviation_floor > 0),
  resolution_absolute_floor numeric not null check (resolution_absolute_floor > 0),
  primary key (algorithm_version,metric),
  check (valid_minimum < valid_maximum),
  check (resolution_absolute_floor <= absolute_deviation_floor)
);

insert into private.carelink_personalized_analysis_config (
  algorithm_version,baseline_window,evaluation_window,resolution_window,
  minimum_baseline_samples,minimum_baseline_days,minimum_baseline_coverage,
  minimum_recent_samples,maximum_recent_samples,unusual_score_threshold,
  minimum_direction_consistency,resolution_score_threshold,resolution_sample_count,
  high_confidence_baseline_samples,high_confidence_days,
  high_confidence_recent_samples,high_confidence_consistency
) values (
  'carelink_personalized_mad_v1',interval '14 days',interval '15 minutes',interval '30 minutes',
  30,3,interval '48 hours',3,5,3.5,0.75,1.5,3,60,5,5,0.90
);

insert into private.carelink_personalized_metric_config (
  algorithm_version,metric,unit,valid_minimum,valid_maximum,
  noise_scale_floor,absolute_deviation_floor,resolution_absolute_floor
) values
  ('carelink_personalized_mad_v1','heart_rate','bpm',30,220,2,10,5),
  ('carelink_personalized_mad_v1','spo2','%',70,100,1,3,1.5),
  ('carelink_personalized_mad_v1','temperature','°C',25,45,0.2,0.5,0.25);

revoke all on private.carelink_personalized_analysis_config,
  private.carelink_personalized_metric_config from public,anon,authenticated,service_role;

create table public.personalized_baselines (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  metric text not null check (metric in ('heart_rate','spo2','temperature')),
  readiness text not null check (readiness in ('learning','ready')),
  sample_count integer not null check (sample_count >= 0),
  required_sample_count integer not null check (required_sample_count > 0),
  distinct_day_count integer not null check (distinct_day_count >= 0),
  required_day_count integer not null check (required_day_count > 0),
  coverage_hours numeric(12,2) not null default 0 check (coverage_hours >= 0),
  required_coverage_hours numeric(12,2) not null check (required_coverage_hours > 0),
  baseline_median numeric,
  median_absolute_deviation numeric,
  robust_scale numeric,
  baseline_window_start timestamptz,
  baseline_window_end timestamptz,
  baseline_excluded_before timestamptz not null,
  latest_evaluation_state text check (
    latest_evaluation_state is null
    or latest_evaluation_state in ('learning','usual','unusual','insufficient_recent_data')
  ),
  latest_recent_sample_count integer check (latest_recent_sample_count is null or latest_recent_sample_count >= 0),
  latest_evaluated_at timestamptz,
  algorithm_version text not null,
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id,metric,algorithm_version),
  check (baseline_window_start is null or baseline_window_end is null or baseline_window_start <= baseline_window_end),
  check ((sample_count = 0 and baseline_median is null) or sample_count > 0)
);

create index personalized_baselines_patient_metric_idx
  on public.personalized_baselines(patient_id,metric);

create table private.personalized_anomaly_evaluations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  source_measurement_id bigint not null references public.device_measurements(id) on delete restrict,
  metric text not null check (metric in ('heart_rate','spo2','temperature')),
  result_state text not null check (result_state in ('learning','usual','unusual','insufficient_recent_data')),
  direction text check (direction is null or direction in ('higher','lower')),
  confidence text not null check (confidence in ('low','moderate','high')),
  evaluation_window_start timestamptz,
  evaluation_window_end timestamptz not null,
  baseline_sample_count integer not null check (baseline_sample_count >= 0),
  recent_sample_count integer not null check (recent_sample_count >= 0),
  baseline_median numeric,
  recent_median numeric,
  deviation numeric,
  robust_score numeric,
  direction_consistency numeric check (direction_consistency is null or direction_consistency between 0 and 1),
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  unique (source_measurement_id,metric,algorithm_version)
);

create table public.personalized_insights (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  metric text not null check (metric in ('heart_rate','spo2','temperature')),
  direction text not null check (direction in ('higher','lower')),
  status text not null default 'active' check (status in ('active','resolved')),
  confidence text not null check (confidence in ('low','moderate','high')),
  evaluation_window_start timestamptz not null,
  evaluation_window_end timestamptz not null,
  baseline_sample_count integer not null check (baseline_sample_count > 0),
  recent_sample_count integer not null check (recent_sample_count > 0),
  baseline_median numeric not null,
  recent_median numeric not null,
  deviation numeric not null,
  robust_score numeric not null check (robust_score >= 0),
  direction_consistency numeric not null check (direction_consistency between 0 and 1),
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_source_measurement_id bigint not null references public.device_measurements(id) on delete restrict,
  last_source_measurement_id bigint not null references public.device_measurements(id) on delete restrict,
  first_evaluation_id uuid not null references private.personalized_anomaly_evaluations(id) on delete restrict,
  last_evaluation_id uuid not null references private.personalized_anomaly_evaluations(id) on delete restrict,
  resolved_at timestamptz,
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (evaluation_window_start <= evaluation_window_end),
  check (first_observed_at <= last_observed_at),
  check ((status = 'active' and resolved_at is null) or (status = 'resolved' and resolved_at is not null))
);

create unique index personalized_insights_one_active_metric
  on public.personalized_insights(device_id,metric,algorithm_version) where status = 'active';
create index personalized_insights_patient_time_idx
  on public.personalized_insights(patient_id,last_observed_at desc);

alter table public.personalized_baselines enable row level security;
alter table public.personalized_baselines force row level security;
alter table public.personalized_insights enable row level security;
alter table public.personalized_insights force row level security;

revoke all on public.personalized_baselines,public.personalized_insights
  from public,anon,authenticated,service_role;
grant select on public.personalized_baselines,public.personalized_insights to authenticated;
revoke all on private.personalized_anomaly_evaluations from public,anon,authenticated,service_role;

create policy personalized_baselines_select_owned
on public.personalized_baselines for select to authenticated
using (exists (
  select 1 from public.patients p
  where p.id = personalized_baselines.patient_id
    and p.caregiver_id = (select auth.uid())
));

create policy personalized_insights_select_owned
on public.personalized_insights for select to authenticated
using (exists (
  select 1 from public.patients p
  where p.id = personalized_insights.patient_id
    and p.caregiver_id = (select auth.uid())
));

create or replace function private.calculate_carelink_personalized_baseline(
  p_device_id uuid,p_metric text,p_as_of timestamptz
) returns table (
  sample_count integer,
  distinct_day_count integer,
  coverage_seconds bigint,
  baseline_median numeric,
  median_absolute_deviation numeric,
  robust_scale numeric,
  window_start timestamptz,
  window_end timestamptz,
  ready boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with settings as (
    select c.*,m.valid_minimum,m.valid_maximum,m.noise_scale_floor
    from private.carelink_personalized_analysis_config c
    join private.carelink_personalized_metric_config m using (algorithm_version)
    where c.active and m.metric = p_metric
  ), candidates as (
    select measurement.measured_at,
      case p_metric
        when 'heart_rate' then measurement.heart_rate::numeric
        when 'spo2' then measurement.spo2
        when 'temperature' then measurement.sensor_temperature
      end as metric_value
    from public.device_measurements measurement
    cross join settings
    where measurement.device_id = p_device_id
      and measurement.measured_at >= p_as_of - settings.baseline_window
      and measurement.measured_at < p_as_of - settings.evaluation_window
      and case p_metric
        when 'heart_rate' then coalesce(measurement.heart_rate_quality,measurement.quality) = 'good'
          and measurement.heart_rate is not null
          and measurement.heart_rate between settings.valid_minimum and settings.valid_maximum
        when 'spo2' then coalesce(measurement.spo2_quality,measurement.quality) = 'good'
          and measurement.spo2 is not null
          and measurement.spo2 between settings.valid_minimum and settings.valid_maximum
        when 'temperature' then coalesce(measurement.temperature_quality,measurement.quality) = 'good'
          and measurement.sensor_temperature is not null
          and measurement.sensor_temperature between settings.valid_minimum and settings.valid_maximum
      end
      and not exists (
        select 1 from public.care_alerts alert
        where alert.device_id = measurement.device_id
          and alert.metric = p_metric
          and measurement.measured_at >= alert.first_triggered_at
          and measurement.measured_at <= case
            when alert.status = 'resolved' then coalesce(alert.resolved_at,alert.last_seen_at)
            else p_as_of
          end
      )
      and not exists (
        select 1 from public.personalized_insights insight
        where insight.device_id = measurement.device_id
          and insight.metric = p_metric
          and measurement.measured_at >= insight.first_observed_at
          and measurement.measured_at <= case
            when insight.status = 'resolved' then insight.resolved_at
            else p_as_of
          end
      )
  ), center as (
    select count(*)::integer as sample_count,
      count(distinct ((measured_at at time zone 'UTC')::date))::integer as distinct_day_count,
      coalesce(extract(epoch from max(measured_at)-min(measured_at))::bigint,0) as coverage_seconds,
      percentile_cont(0.5) within group (order by metric_value)::numeric as baseline_median,
      min(measured_at) as window_start,max(measured_at) as window_end
    from candidates
  ), dispersion as (
    select center.sample_count,center.distinct_day_count,center.coverage_seconds,
      center.baseline_median,center.window_start,center.window_end,
      percentile_cont(0.5) within group (
        order by abs(candidates.metric_value-center.baseline_median)
      )::numeric as median_absolute_deviation
    from center left join candidates on true
    group by center.sample_count,center.distinct_day_count,center.coverage_seconds,
      center.baseline_median,center.window_start,center.window_end
  )
  select dispersion.sample_count,dispersion.distinct_day_count,dispersion.coverage_seconds,
    dispersion.baseline_median,dispersion.median_absolute_deviation,
    case when dispersion.sample_count = 0 then null
      else greatest(1.4826*dispersion.median_absolute_deviation,settings.noise_scale_floor) end,
    dispersion.window_start,dispersion.window_end,
    dispersion.sample_count >= settings.minimum_baseline_samples
      and dispersion.distinct_day_count >= settings.minimum_baseline_days
      and dispersion.coverage_seconds >= extract(epoch from settings.minimum_baseline_coverage)
  from dispersion cross join settings;
$$;

create or replace function private.refresh_carelink_personalized_baseline(
  p_device_id uuid,p_patient_id uuid,p_metric text,p_as_of timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_baseline record;
  v_config private.carelink_personalized_analysis_config%rowtype;
begin
  select * into v_config from private.carelink_personalized_analysis_config where active;
  select * into v_baseline
  from private.calculate_carelink_personalized_baseline(p_device_id,p_metric,p_as_of);
  if v_baseline.sample_count is null then return; end if;

  insert into public.personalized_baselines (
    patient_id,device_id,metric,readiness,sample_count,required_sample_count,
    distinct_day_count,required_day_count,coverage_hours,required_coverage_hours,
    baseline_median,median_absolute_deviation,robust_scale,baseline_window_start,
    baseline_window_end,baseline_excluded_before,algorithm_version,calculated_at,updated_at
  ) values (
    p_patient_id,p_device_id,p_metric,case when v_baseline.ready then 'ready' else 'learning' end,
    v_baseline.sample_count,v_config.minimum_baseline_samples,v_baseline.distinct_day_count,
    v_config.minimum_baseline_days,round(v_baseline.coverage_seconds::numeric/3600,2),
    round(extract(epoch from v_config.minimum_baseline_coverage)::numeric/3600,2),
    v_baseline.baseline_median,v_baseline.median_absolute_deviation,v_baseline.robust_scale,
    v_baseline.window_start,v_baseline.window_end,p_as_of-v_config.evaluation_window,
    v_config.algorithm_version,now(),now()
  ) on conflict (device_id,metric,algorithm_version) do update set
    patient_id=excluded.patient_id,readiness=excluded.readiness,
    sample_count=excluded.sample_count,required_sample_count=excluded.required_sample_count,
    distinct_day_count=excluded.distinct_day_count,required_day_count=excluded.required_day_count,
    coverage_hours=excluded.coverage_hours,required_coverage_hours=excluded.required_coverage_hours,
    baseline_median=excluded.baseline_median,
    median_absolute_deviation=excluded.median_absolute_deviation,
    robust_scale=excluded.robust_scale,baseline_window_start=excluded.baseline_window_start,
    baseline_window_end=excluded.baseline_window_end,
    baseline_excluded_before=excluded.baseline_excluded_before,
    calculated_at=excluded.calculated_at,updated_at=excluded.updated_at
  where excluded.baseline_excluded_before >= public.personalized_baselines.baseline_excluded_before;
end;
$$;

create or replace function private.analyze_carelink_personalized_measurement(p_measurement_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_measurement public.device_measurements%rowtype;
  v_patient_id uuid;
  v_config private.carelink_personalized_analysis_config%rowtype;
  v_metric_config private.carelink_personalized_metric_config%rowtype;
  v_metric text;
  v_value numeric;
  v_quality text;
  v_baseline record;
  v_recent record;
  v_recovery record;
  v_active public.personalized_insights%rowtype;
  v_state text;
  v_direction text;
  v_confidence text;
  v_deviation numeric;
  v_score numeric;
  v_consistency numeric;
  v_evaluation_id uuid;
begin
  select * into v_measurement from public.device_measurements where id=p_measurement_id;
  if v_measurement.id is null then return; end if;
  select paired_patient_id into v_patient_id from public.devices where id=v_measurement.device_id;
  if v_patient_id is null then return; end if;
  select * into v_config from private.carelink_personalized_analysis_config where active;
  if v_config.algorithm_version is null then return; end if;

  foreach v_metric in array array['heart_rate','spo2','temperature'] loop
    if exists (
      select 1 from private.personalized_anomaly_evaluations evaluation
      where evaluation.source_measurement_id=p_measurement_id
        and evaluation.metric=v_metric
        and evaluation.algorithm_version=v_config.algorithm_version
    ) then continue; end if;

    select * into v_metric_config
    from private.carelink_personalized_metric_config
    where algorithm_version=v_config.algorithm_version and metric=v_metric;
    select * into v_baseline
    from private.calculate_carelink_personalized_baseline(
      v_measurement.device_id,v_metric,v_measurement.measured_at
    );
    perform private.refresh_carelink_personalized_baseline(
      v_measurement.device_id,v_patient_id,v_metric,v_measurement.measured_at
    );

    v_value:=case v_metric when 'heart_rate' then v_measurement.heart_rate::numeric
      when 'spo2' then v_measurement.spo2
      when 'temperature' then v_measurement.sensor_temperature end;
    v_quality:=case v_metric when 'heart_rate' then coalesce(v_measurement.heart_rate_quality,v_measurement.quality)
      when 'spo2' then coalesce(v_measurement.spo2_quality,v_measurement.quality)
      when 'temperature' then coalesce(v_measurement.temperature_quality,v_measurement.quality) end;

    if v_quality <> 'good' or v_value is null
       or v_value < v_metric_config.valid_minimum or v_value > v_metric_config.valid_maximum then
      insert into private.personalized_anomaly_evaluations (
        patient_id,device_id,source_measurement_id,metric,result_state,confidence,
        evaluation_window_end,baseline_sample_count,recent_sample_count,baseline_median,
        algorithm_version
      ) values (
        v_patient_id,v_measurement.device_id,v_measurement.id,v_metric,
        'insufficient_recent_data','low',v_measurement.measured_at,
        coalesce(v_baseline.sample_count,0),0,v_baseline.baseline_median,v_config.algorithm_version
      ) returning id into v_evaluation_id;
      update public.personalized_baselines set
        latest_evaluation_state='insufficient_recent_data',latest_recent_sample_count=0,
        latest_evaluated_at=v_measurement.measured_at,updated_at=now()
      where device_id=v_measurement.device_id and metric=v_metric
        and algorithm_version=v_config.algorithm_version
        and (latest_evaluated_at is null or latest_evaluated_at <= v_measurement.measured_at);
      continue;
    end if;

    if not coalesce(v_baseline.ready,false) then
      insert into private.personalized_anomaly_evaluations (
        patient_id,device_id,source_measurement_id,metric,result_state,confidence,
        evaluation_window_end,baseline_sample_count,recent_sample_count,baseline_median,
        algorithm_version
      ) values (
        v_patient_id,v_measurement.device_id,v_measurement.id,v_metric,'learning','low',
        v_measurement.measured_at,coalesce(v_baseline.sample_count,0),0,
        v_baseline.baseline_median,v_config.algorithm_version
      ) returning id into v_evaluation_id;
      update public.personalized_baselines set latest_evaluation_state='learning',
        latest_recent_sample_count=0,latest_evaluated_at=v_measurement.measured_at,updated_at=now()
      where device_id=v_measurement.device_id and metric=v_metric
        and algorithm_version=v_config.algorithm_version
        and (latest_evaluated_at is null or latest_evaluated_at <= v_measurement.measured_at);
      continue;
    end if;

    with recent_values as (
      select measurement.id,measurement.measured_at,
        case v_metric when 'heart_rate' then measurement.heart_rate::numeric
          when 'spo2' then measurement.spo2
          when 'temperature' then measurement.sensor_temperature end as metric_value
      from public.device_measurements measurement
      where measurement.device_id=v_measurement.device_id
        and measurement.measured_at<=v_measurement.measured_at
        and measurement.measured_at>=v_measurement.measured_at-v_config.evaluation_window
        and case v_metric
          when 'heart_rate' then coalesce(measurement.heart_rate_quality,measurement.quality)='good'
            and measurement.heart_rate between v_metric_config.valid_minimum and v_metric_config.valid_maximum
          when 'spo2' then coalesce(measurement.spo2_quality,measurement.quality)='good'
            and measurement.spo2 between v_metric_config.valid_minimum and v_metric_config.valid_maximum
          when 'temperature' then coalesce(measurement.temperature_quality,measurement.quality)='good'
            and measurement.sensor_temperature between v_metric_config.valid_minimum and v_metric_config.valid_maximum
        end
      order by measurement.measured_at desc,measurement.id desc
      limit v_config.maximum_recent_samples
    )
    select count(*)::integer as sample_count,min(measured_at) as window_start,
      max(measured_at) as window_end,
      percentile_cont(0.5) within group(order by metric_value)::numeric as recent_median,
      count(*) filter(where metric_value>v_baseline.baseline_median)::integer as higher_count,
      count(*) filter(where metric_value<v_baseline.baseline_median)::integer as lower_count
    into v_recent from recent_values;

    if v_recent.sample_count < v_config.minimum_recent_samples then
      v_state:='insufficient_recent_data';v_direction:=null;v_confidence:='low';
      v_deviation:=null;v_score:=null;v_consistency:=null;
    else
      v_deviation:=v_recent.recent_median-v_baseline.baseline_median;
      v_direction:=case when v_deviation>0 then 'higher' when v_deviation<0 then 'lower' else null end;
      v_score:=abs(v_deviation)/v_baseline.robust_scale;
      v_consistency:=greatest(v_recent.higher_count,v_recent.lower_count)::numeric/v_recent.sample_count;
      if abs(v_deviation)>=v_metric_config.absolute_deviation_floor
         and v_score>=v_config.unusual_score_threshold
         and v_consistency>=v_config.minimum_direction_consistency then
        v_state:='unusual';
      else v_state:='usual'; end if;
      v_confidence:=case
        when v_baseline.sample_count>=v_config.high_confidence_baseline_samples
          and v_baseline.distinct_day_count>=v_config.high_confidence_days
          and v_recent.sample_count>=v_config.high_confidence_recent_samples
          and v_consistency>=v_config.high_confidence_consistency then 'high'
        else 'moderate' end;
    end if;

    insert into private.personalized_anomaly_evaluations (
      patient_id,device_id,source_measurement_id,metric,result_state,direction,confidence,
      evaluation_window_start,evaluation_window_end,baseline_sample_count,recent_sample_count,
      baseline_median,recent_median,deviation,robust_score,direction_consistency,algorithm_version
    ) values (
      v_patient_id,v_measurement.device_id,v_measurement.id,v_metric,v_state,v_direction,v_confidence,
      v_recent.window_start,v_measurement.measured_at,v_baseline.sample_count,v_recent.sample_count,
      v_baseline.baseline_median,v_recent.recent_median,v_deviation,v_score,v_consistency,
      v_config.algorithm_version
    ) returning id into v_evaluation_id;

    update public.personalized_baselines set latest_evaluation_state=v_state,
      latest_recent_sample_count=v_recent.sample_count,latest_evaluated_at=v_measurement.measured_at,
      updated_at=now()
    where device_id=v_measurement.device_id and metric=v_metric
      and algorithm_version=v_config.algorithm_version
      and (latest_evaluated_at is null or latest_evaluated_at <= v_measurement.measured_at);

    if v_state='unusual' then
      v_active.id:=null;
      select * into v_active from public.personalized_insights insight
      where insight.device_id=v_measurement.device_id and insight.metric=v_metric
        and insight.algorithm_version=v_config.algorithm_version and insight.status='active'
      for update;
      if v_active.id is not null and v_active.direction<>v_direction
         and v_measurement.measured_at>=v_active.last_observed_at then
        update public.personalized_insights set status='resolved',
          resolved_at=v_measurement.measured_at,updated_at=now() where id=v_active.id;
      end if;
      insert into public.personalized_insights (
        patient_id,device_id,metric,direction,status,confidence,evaluation_window_start,
        evaluation_window_end,baseline_sample_count,recent_sample_count,baseline_median,
        recent_median,deviation,robust_score,direction_consistency,first_observed_at,
        last_observed_at,occurrence_count,first_source_measurement_id,last_source_measurement_id,
        first_evaluation_id,last_evaluation_id,algorithm_version
      ) values (
        v_patient_id,v_measurement.device_id,v_metric,v_direction,'active',v_confidence,
        v_recent.window_start,v_measurement.measured_at,v_baseline.sample_count,v_recent.sample_count,
        v_baseline.baseline_median,v_recent.recent_median,v_deviation,v_score,v_consistency,
        v_recent.window_start,v_measurement.measured_at,1,v_measurement.id,v_measurement.id,
        v_evaluation_id,v_evaluation_id,v_config.algorithm_version
      ) on conflict (device_id,metric,algorithm_version) where status='active' do update set
        confidence=excluded.confidence,evaluation_window_start=excluded.evaluation_window_start,
        evaluation_window_end=excluded.evaluation_window_end,
        baseline_sample_count=excluded.baseline_sample_count,
        recent_sample_count=excluded.recent_sample_count,baseline_median=excluded.baseline_median,
        recent_median=excluded.recent_median,deviation=excluded.deviation,
        robust_score=excluded.robust_score,direction_consistency=excluded.direction_consistency,
        last_observed_at=excluded.last_observed_at,
        occurrence_count=public.personalized_insights.occurrence_count+1,
        last_source_measurement_id=excluded.last_source_measurement_id,
        last_evaluation_id=excluded.last_evaluation_id,updated_at=now()
      where public.personalized_insights.direction=excluded.direction
        and public.personalized_insights.last_observed_at<=excluded.last_observed_at;
    elsif v_state='usual' then
      v_active.id:=null;
      select * into v_active from public.personalized_insights insight
      where insight.device_id=v_measurement.device_id and insight.metric=v_metric
        and insight.algorithm_version=v_config.algorithm_version and insight.status='active'
      for update;
      if v_active.id is not null and v_measurement.measured_at>v_active.last_observed_at
         and v_score<=v_config.resolution_score_threshold then
        with recovery_values as (
          select case v_metric when 'heart_rate' then measurement.heart_rate::numeric
              when 'spo2' then measurement.spo2
              when 'temperature' then measurement.sensor_temperature end as metric_value
          from public.device_measurements measurement
          where measurement.device_id=v_measurement.device_id
            and measurement.measured_at>v_active.last_observed_at
            and measurement.measured_at<=v_measurement.measured_at
            and measurement.measured_at>=v_measurement.measured_at-v_config.resolution_window
            and case v_metric
              when 'heart_rate' then coalesce(measurement.heart_rate_quality,measurement.quality)='good'
                and measurement.heart_rate between v_metric_config.valid_minimum and v_metric_config.valid_maximum
              when 'spo2' then coalesce(measurement.spo2_quality,measurement.quality)='good'
                and measurement.spo2 between v_metric_config.valid_minimum and v_metric_config.valid_maximum
              when 'temperature' then coalesce(measurement.temperature_quality,measurement.quality)='good'
                and measurement.sensor_temperature between v_metric_config.valid_minimum and v_metric_config.valid_maximum
            end
          order by measurement.measured_at desc,measurement.id desc
          limit v_config.resolution_sample_count
        )
        select count(*)::integer as sample_count,
          bool_and(abs(metric_value-v_baseline.baseline_median)<=v_metric_config.resolution_absolute_floor) as all_close
        into v_recovery from recovery_values;
        if v_recovery.sample_count=v_config.resolution_sample_count and coalesce(v_recovery.all_close,false) then
          update public.personalized_insights set status='resolved',resolved_at=v_measurement.measured_at,
            last_evaluation_id=v_evaluation_id,updated_at=now() where id=v_active.id;
        end if;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function private.run_carelink_personalized_analysis(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config private.carelink_personalized_analysis_config%rowtype;
  v_measurement record;
  v_processed integer:=0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('carelink-personalized-analysis',0)) then return 0; end if;
  select * into v_config from private.carelink_personalized_analysis_config where active;
  if v_config.algorithm_version is null then return 0; end if;
  for v_measurement in
    select measurement.id
    from public.device_measurements measurement
    join public.devices device on device.id=measurement.device_id and device.paired_patient_id is not null
    where measurement.created_at>=v_config.activated_at
      and (select count(*) from private.personalized_anomaly_evaluations evaluation
        where evaluation.source_measurement_id=measurement.id
          and evaluation.algorithm_version=v_config.algorithm_version)<3
    order by measurement.measured_at,measurement.id
    limit least(greatest(p_limit,1),500)
  loop
    begin
      perform private.analyze_carelink_personalized_measurement(v_measurement.id);
      v_processed:=v_processed+1;
    exception when others then
      -- This subtransaction isolates analysis failures. The unprocessed row is retried next run.
      null;
    end;
  end loop;
  return v_processed;
end;
$$;

create index device_measurements_personalized_pending_idx
  on public.device_measurements(created_at,id);

revoke execute on function private.calculate_carelink_personalized_baseline(uuid,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke execute on function private.refresh_carelink_personalized_baseline(uuid,uuid,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke execute on function private.analyze_carelink_personalized_measurement(bigint)
  from public,anon,authenticated,service_role;
revoke execute on function private.run_carelink_personalized_analysis(integer)
  from public,anon,authenticated,service_role;

-- Historical measurements establish readiness only. This deliberately creates no evaluations or insights.
do $refresh$
declare v_device record;v_metric text;
begin
  for v_device in select id,paired_patient_id from public.devices where paired_patient_id is not null loop
    foreach v_metric in array array['heart_rate','spo2','temperature'] loop
      perform private.refresh_carelink_personalized_baseline(
        v_device.id,v_device.paired_patient_id,v_metric,statement_timestamp()
      );
    end loop;
  end loop;
end;
$refresh$;

do $schedule$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='carelink-personalized-analysis';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'carelink-personalized-analysis','* * * * *',
    'select private.run_carelink_personalized_analysis(100);'
  );
end;
$schedule$;
