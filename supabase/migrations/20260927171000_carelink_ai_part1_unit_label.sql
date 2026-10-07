-- Correct the temperature unit label stored by the initially deployed migration.
update private.carelink_personalized_metric_config
set unit = '°C'
where algorithm_version = 'carelink_personalized_mad_v1'
  and metric = 'temperature';
