SELECT sum(issue_count) AS issue_count FROM (
SELECT count() AS issue_count FROM events
WHERE timestamp >= now() - INTERVAL 1 HOUR
 AND (properties.environment IS NULL OR properties.environment NOT IN ('preview','development','test'))
 AND (
 (event='$exception' AND properties.alert_eligible=true)
 OR event IN ('stale_chunk_recovery_failed','reminder_scheduler_backlog_detected','reminder_email_delivery_failed','reminder_email_complaint_received',
 'transcription_editor_import_failed','transcription_editor_navigation_failed','transcription_post_acceptance_failed','frustration_detected')
 OR (event='transcription_failed' AND properties.access_type='paid')
 OR (event='browser_request_failed' AND (
 (properties.endpoint IN ('/api/gte/transcriber/import','/api/gte-guest/transcriber/import') AND (toFloat(properties.http_status)>=500 OR toFloat(properties.http_status)=413 OR properties.failure_type='network_error'))
 OR (properties.endpoint IN ('/api/jobs/[id]','/api/jobs/[id]/finalize') AND toFloat(properties.http_status)>=500)
 ))
 OR (event='transcription_succeeded' AND properties.access_type='paid'
     AND toFloat(properties.total_elapsed_sec)>300
     AND toFloat(properties.total_elapsed_sec)>2*coalesce(toFloat(properties.duration_sec),toFloat(properties.durationSec),0)
     AND coalesce(toFloat(properties.duration_sec),toFloat(properties.durationSec),0)>0)
 )
UNION ALL
SELECT count() AS issue_count FROM (
SELECT properties.scheduler AS scheduler,
maxIf(timestamp,event='reminder_scheduler_failed') AS last_failure,
maxIf(timestamp,event='reminder_scheduler_run_completed' AND properties.status='healthy') AS last_healthy
FROM events WHERE timestamp>=now()-INTERVAL 1 HOUR AND event IN ('reminder_scheduler_failed','reminder_scheduler_run_completed')
GROUP BY scheduler HAVING last_failure>last_healthy
)
UNION ALL
SELECT uniq(tuple(distinct_id,coalesce(properties.job_id,properties.jobId))) AS issue_count
FROM events WHERE timestamp>=now()-INTERVAL 90 MINUTE AND timestamp<now()-INTERVAL 30 MINUTE
 AND event='transcription_succeeded' AND properties.access_type='paid'
 AND (properties.environment IS NULL OR properties.environment NOT IN ('preview','development','test'))
 AND coalesce(properties.heavy_preview,false)=false
 AND coalesce(properties.job_id,properties.jobId,'')!=''
 AND coalesce(properties.job_id,properties.jobId) NOT IN (
 SELECT coalesce(properties.job_id,properties.jobId) FROM events
 WHERE timestamp>=now()-INTERVAL 24 HOUR AND event='transcription_imported_to_editor'
 AND coalesce(properties.job_id,properties.jobId,'')!=''
 )
UNION ALL
SELECT uniq(tuple(distinct_id,coalesce(properties.job_id,properties.jobId))) AS issue_count
FROM events WHERE timestamp>=now()-INTERVAL 90 MINUTE AND timestamp<now()-INTERVAL 30 MINUTE
 AND event='transcription_started' AND properties.access_type='paid'
 AND (properties.environment IS NULL OR properties.environment NOT IN ('preview','development','test'))
 AND coalesce(properties.heavy_preview,false)=false
 AND coalesce(properties.job_id,properties.jobId,'')!=''
 AND coalesce(properties.job_id,properties.jobId) NOT IN (
 SELECT coalesce(properties.job_id,properties.jobId) FROM events
 WHERE timestamp>=now()-INTERVAL 24 HOUR AND event IN ('transcription_succeeded','transcription_failed')
 AND coalesce(properties.job_id,properties.jobId,'')!=''
 )
)
