SELECT * FROM (SELECT timestamp,distinct_id,event,
multiIf(event='$exception','exception',event='transcription_succeeded','slow_paid_completion',event='browser_request_failed','request_failure',event='frustration_detected','frustration_review','delivery_failure') AS review_reason,
coalesce(properties.job_id,properties.jobId) AS job_id,
properties.error_code AS error_code,properties.endpoint AS endpoint,properties.http_status AS http_status,
properties.action AS action,properties.total_elapsed_sec AS elapsed_sec,
properties.subscription_plan AS plan,coalesce(properties.app_version,properties.$app_version) AS app_version,
properties.$session_id AS session_id
FROM events WHERE {filters}
AND (properties.environment IS NULL OR properties.environment NOT IN ('preview','development','test'))
AND (
(event='$exception' AND properties.alert_eligible=true)
OR event IN ('transcription_editor_import_failed','transcription_editor_navigation_failed','transcription_post_acceptance_failed','frustration_detected')
OR (event='transcription_failed' AND properties.access_type='paid')
OR (event='browser_request_failed' AND (
(properties.endpoint IN ('/api/gte/transcriber/import','/api/gte-guest/transcriber/import') AND (toFloat(properties.http_status)>=500 OR toFloat(properties.http_status)=413 OR properties.failure_type='network_error'))
OR (properties.endpoint IN ('/api/jobs/[id]','/api/jobs/[id]/finalize') AND toFloat(properties.http_status)>=500)))
OR (event='transcription_succeeded' AND properties.access_type='paid' AND toFloat(properties.total_elapsed_sec)>300 AND toFloat(properties.total_elapsed_sec)>2*coalesce(toFloat(properties.duration_sec),toFloat(properties.durationSec),0) AND coalesce(toFloat(properties.duration_sec),toFloat(properties.durationSec),0)>0)
) 
UNION ALL
SELECT timestamp,distinct_id,event,
if(event='transcription_started','paid_job_pending_over_30m','paid_completion_no_observed_import') AS review_reason,
coalesce(properties.job_id,properties.jobId) AS job_id,
properties.error_code AS error_code,properties.endpoint AS endpoint,properties.http_status AS http_status,
properties.action AS action,properties.total_elapsed_sec AS elapsed_sec,
properties.subscription_plan AS plan,coalesce(properties.app_version,properties.$app_version) AS app_version,
properties.$session_id AS session_id
FROM events WHERE {filters} AND timestamp<now()-INTERVAL 30 MINUTE AND timestamp>=now()-INTERVAL 24 HOUR
AND event IN ('transcription_started','transcription_succeeded') AND properties.access_type='paid'
AND (properties.environment IS NULL OR properties.environment NOT IN ('preview','development','test'))
AND coalesce(properties.heavy_preview,false)=false AND coalesce(properties.job_id,properties.jobId,'')!=''
AND (
(event='transcription_succeeded' AND coalesce(properties.job_id,properties.jobId) NOT IN (
 SELECT coalesce(properties.job_id,properties.jobId) FROM events WHERE timestamp>=now()-INTERVAL 24 HOUR AND event='transcription_imported_to_editor' AND coalesce(properties.job_id,properties.jobId,'')!=''
))
OR (event='transcription_started' AND coalesce(properties.job_id,properties.jobId) NOT IN (
 SELECT coalesce(properties.job_id,properties.jobId) FROM events WHERE timestamp>=now()-INTERVAL 24 HOUR AND event IN ('transcription_succeeded','transcription_failed') AND coalesce(properties.job_id,properties.jobId,'')!=''
))
)
) ORDER BY timestamp DESC LIMIT 200
