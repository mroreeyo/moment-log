# Supabase Edge Functions

Hexagonal (Ports & Adapters) architecture. Runtime: Deno.

## Structure

```
functions/
├── _shared/                    # Shared hexagonal core (not a deployed function)
│   ├── domain/                 # Re-exports from @momentlog/domain
│   ├── ports/
│   │   └── driven/             # Secondary ports (DB, clock, logger)
│   ├── use-cases/              # Application services
│   └── adapters/
│       ├── supabase/           # Driven adapter: Supabase client impl
│       ├── clock/              # Driven adapter: system clock
│       └── logger/             # Driven adapter: structured logging
│
├── cron-hourly-tick/           # Primary adapter: Cloud Scheduler OIDC → hourlyTick()
├── cron-raw-delete/            # Primary adapter: Cloud Scheduler OIDC → rawDelete()
├── clip-upload-sign/           # Primary adapter: mobile client → signUploadUrl()
├── slot-finalize/              # Primary adapter: mobile client → finalizeClip()
└── vlog-retry/                 # Primary adapter: mobile client → retryVlog()
```

## Rules

- Each function folder is **one deployed Edge Function**.
- The function's `index.ts` is a **primary (driving) adapter**: it handles HTTP / auth / DTO mapping, then invokes a use case from `_shared/use-cases/`.
- Use cases depend on **ports only** (interfaces in `_shared/ports/driven/`).
- Adapters implement ports against concrete SDKs (Supabase, system clock, etc.).
- Domain logic lives in `@momentlog/domain` (pure TS). Re-exported via `_shared/domain/`.

## Testing

- Unit tests: `_shared/**/*.test.ts` using `Deno.test` + in-memory fake adapters.
- Integration tests: run against local Supabase (`supabase start`).
- Never mock `@supabase/supabase-js` directly; test through the repository port with a fake.

See `ARCHITECTURE.md` §5.1 at repo root.
