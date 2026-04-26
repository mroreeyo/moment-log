# Cloud Scheduler setup

Task 21 configures two HTTP Cloud Scheduler jobs that invoke Supabase Edge Functions with Google OIDC tokens:

| Job           | Schedule        | Target                           |
| ------------- | --------------- | -------------------------------- |
| `hourly-tick` | `0 * * * *` UTC | `/functions/v1/cron-hourly-tick` |
| `raw-delete`  | `5 * * * *` UTC | `/functions/v1/cron-raw-delete`  |

## Required environment

```bash
export GCP_PROJECT_ID="momentlog-prod"
export REGION="asia-northeast2"
export SUPABASE_FUNCTIONS_BASE_URL="https://<project-ref>.supabase.co/functions/v1"
export SCHEDULER_SERVICE_ACCOUNT_EMAIL="cloud-scheduler-invoker@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
```

The Edge Functions must validate:

- JWT signature using Google OIDC public keys
- `iss=https://accounts.google.com`
- `aud=<exact function URL>`
- `email=$SCHEDULER_SERVICE_ACCOUNT_EMAIL`

Do not use service-role fallback for production scheduler calls.

## Deploy or update jobs

```bash
infra/scripts/deploy-scheduler.sh
```

The script is idempotent: it updates an existing job, otherwise it creates it.

## Verification

```bash
gcloud scheduler jobs describe hourly-tick \
  --project="$GCP_PROJECT_ID" \
  --location="$REGION"

gcloud scheduler jobs run hourly-tick \
  --project="$GCP_PROJECT_ID" \
  --location="$REGION"
```

Then check Supabase function logs for a `200` response from `cron-hourly-tick`.

## Local unauthenticated negative check

Direct calls without a Bearer token must fail:

```bash
curl -i -X POST \
  "$SUPABASE_FUNCTIONS_BASE_URL/cron-hourly-tick" \
  -H 'content-type: application/json' \
  -d '{}'
```

Expected: `401`.
