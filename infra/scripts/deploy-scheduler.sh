#!/usr/bin/env bash
set -euo pipefail

# Deploy MomentLog Cloud Scheduler jobs for Supabase Edge Function cron endpoints.
# Required environment variables:
#   GCP_PROJECT_ID                  Google Cloud project id
#   SUPABASE_FUNCTIONS_BASE_URL     https://<project-ref>.supabase.co/functions/v1
#   SCHEDULER_SERVICE_ACCOUNT_EMAIL cloud-scheduler-invoker@<project>.iam.gserviceaccount.com
# Optional:
#   REGION                          Scheduler region (default: asia-northeast2)
#   HOURLY_TICK_JOB_NAME            default: hourly-tick
#   RAW_DELETE_JOB_NAME             default: raw-delete

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
SUPABASE_FUNCTIONS_BASE_URL="${SUPABASE_FUNCTIONS_BASE_URL:?Set SUPABASE_FUNCTIONS_BASE_URL}"
SCHEDULER_SERVICE_ACCOUNT_EMAIL="${SCHEDULER_SERVICE_ACCOUNT_EMAIL:?Set SCHEDULER_SERVICE_ACCOUNT_EMAIL}"
REGION="${REGION:-asia-northeast2}"
HOURLY_TICK_JOB_NAME="${HOURLY_TICK_JOB_NAME:-hourly-tick}"
RAW_DELETE_JOB_NAME="${RAW_DELETE_JOB_NAME:-raw-delete}"

HOURLY_TICK_URI="${SUPABASE_FUNCTIONS_BASE_URL%/}/cron-hourly-tick"
RAW_DELETE_URI="${SUPABASE_FUNCTIONS_BASE_URL%/}/cron-raw-delete"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 127
  fi
}

upsert_http_job() {
  local name="$1"
  local schedule="$2"
  local uri="$3"

  if gcloud scheduler jobs describe "$name" \
    --project="$GCP_PROJECT_ID" \
    --location="$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$name" \
      --project="$GCP_PROJECT_ID" \
      --location="$REGION" \
      --schedule="$schedule" \
      --time-zone="UTC" \
      --uri="$uri" \
      --http-method="POST" \
      --oidc-service-account-email="$SCHEDULER_SERVICE_ACCOUNT_EMAIL" \
      --oidc-token-audience="$uri" \
      --attempt-deadline="540s" \
      --max-retry-attempts="3"
  else
    gcloud scheduler jobs create http "$name" \
      --project="$GCP_PROJECT_ID" \
      --location="$REGION" \
      --schedule="$schedule" \
      --time-zone="UTC" \
      --uri="$uri" \
      --http-method="POST" \
      --oidc-service-account-email="$SCHEDULER_SERVICE_ACCOUNT_EMAIL" \
      --oidc-token-audience="$uri" \
      --attempt-deadline="540s" \
      --max-retry-attempts="3"
  fi
}

require_cmd gcloud

gcloud config set project "$GCP_PROJECT_ID" >/dev/null

upsert_http_job "$HOURLY_TICK_JOB_NAME" "0 * * * *" "$HOURLY_TICK_URI"
upsert_http_job "$RAW_DELETE_JOB_NAME" "5 * * * *" "$RAW_DELETE_URI"

cat <<SUMMARY
Cloud Scheduler jobs are configured:
- $HOURLY_TICK_JOB_NAME -> $HOURLY_TICK_URI (0 * * * * UTC)
- $RAW_DELETE_JOB_NAME -> $RAW_DELETE_URI (5 * * * * UTC)
Region: $REGION
OIDC service account: $SCHEDULER_SERVICE_ACCOUNT_EMAIL
SUMMARY
