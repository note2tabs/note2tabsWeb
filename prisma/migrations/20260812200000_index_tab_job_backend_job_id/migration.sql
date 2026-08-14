ALTER TABLE "TabJob"
ADD COLUMN "backendJobId" TEXT;

-- Backfill the legacy identifier embedded in resultJson. If historical retry
-- races produced duplicates, retain the oldest durable row as the canonical
-- job result and leave later duplicates unlinked for manual review.
WITH extracted AS (
    SELECT
        "id",
        substring(
            "resultJson"
            FROM '"backendJobId"[[:space:]]*:[[:space:]]*"([^"]+)"'
        ) AS backend_job_id,
        "createdAt"
    FROM "TabJob"
    WHERE "resultJson" LIKE '%"backendJobId"%'
), ranked AS (
    SELECT
        "id",
        backend_job_id,
        row_number() OVER (
            PARTITION BY backend_job_id
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS duplicate_rank
    FROM extracted
    WHERE backend_job_id IS NOT NULL
)
UPDATE "TabJob" AS tab_job
SET "backendJobId" = ranked.backend_job_id
FROM ranked
WHERE tab_job."id" = ranked."id"
  AND ranked.duplicate_rank = 1;

CREATE UNIQUE INDEX "TabJob_backendJobId_key"
ON "TabJob"("backendJobId");
