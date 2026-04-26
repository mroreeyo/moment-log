# moment-log

> A private shared video journaling app — small groups capture 3-second moments on the hour, and the server automatically stitches them into a joint micro-vlog.

## Concept

- **Group size**: 2–4 members, invite-only.
- **Rhythm**: every hour on the hour, during each group's active window (default 09:00–22:00, group-local time).
- **Capture**: a single 3-second vertical front-camera clip.
- **Outcome** per hourly slot:
  - **2+ clips** → server normalizes and concatenates them into a shared vlog.
  - **1 clip** → the raw clip is shown alone (no vlog synthesis).
  - **0 clips** → empty slot.
- **Privacy-first**: private-by-default groups, short-retention raw clips, no public feed.

## Tech Stack

| Layer       | Choice                                               |
| ----------- | ---------------------------------------------------- |
| Mobile      | React Native + Expo SDK 52 + Expo Router             |
| Backend     | Supabase (Auth, Postgres, Storage, Realtime, Edge)   |
| Scheduler   | Google Cloud Scheduler (hourly tick, OIDC-auth)      |
| Worker      | Google Cloud Run Service (FFmpeg normalize + concat) |
| Language    | TypeScript (strict), Deno runtime for Edge Functions |
| Package mgr | pnpm workspace (monorepo)                            |

## Repository Layout

```
moment-log/
├── apps/
│   ├── mobile/                    # React Native + Expo (Feature-Sliced Design)
│   │   ├── app/                   # Expo Router routes
│   │   └── src/                   # FSD layers (app / pages / widgets / features / entities / shared)
│   └── worker/                    # Cloud Run worker (Hexagonal / Ports & Adapters)
│       └── src/                   # domain / ports / use-cases / adapters / http / di
├── packages/
│   └── domain/                    # Pure TypeScript domain — zero runtime dependencies
│       └── src/                   # vlog state machine, shared Result/assertNever, time utilities
├── supabase/
│   ├── functions/                 # Edge Functions (Deno, Hexagonal)
│   │   └── _shared/               # shared ports, use-cases, adapters
│   └── migrations/                # SQL migrations
├── package.json                   # pnpm workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json             # strict TS config inherited by all packages
```

## Architecture Highlights

- **Clean Architecture dependency rule** — domain never depends on infrastructure.
- **Hexagonal (Ports & Adapters)** for the backend — Supabase and FFmpeg are interchangeable adapters behind domain-owned interfaces.
- **Feature-Sliced Design** for the mobile app — feature slices with explicit public APIs.
- **Shared domain package** (`@momentlog/domain`) — pure, runtime-agnostic TypeScript consumed identically by Deno (Edge Functions) and Node (Worker) and React Native.
- **Discriminated unions + exhaustive matching** for every state machine (e.g. the vlog lifecycle).
- **TDD-first** for the domain layer; coverage gate is 100% on `packages/domain`.

## Requirements

- Node.js **≥ 20.11**
- pnpm **≥ 9.0**
- (Later) Deno 2.x for Edge Functions, Expo EAS CLI, Supabase CLI

## Getting Started

Clone and install workspace dependencies:

```bash
git clone https://github.com/mroreeyo/moment-log.git
cd moment-log
pnpm install
```

### Run the domain test suite

The shared domain package is fully test-driven. It has no runtime dependencies and runs in seconds:

```bash
pnpm --filter @momentlog/domain test
pnpm --filter @momentlog/domain test:coverage
```

Expected: **100 % coverage** across statements, branches, functions, and lines.

### Typecheck everything

```bash
pnpm typecheck
```

## Scripts

| Command                                         | Description                          |
| ----------------------------------------------- | ------------------------------------ |
| `pnpm test`                                     | Run tests in every workspace package |
| `pnpm test:domain`                              | Run only the shared domain tests     |
| `pnpm --filter @momentlog/domain test:coverage` | Enforce the 100 % coverage gate      |
| `pnpm typecheck`                                | `tsc --noEmit` across all packages   |
| `pnpm lint`                                     | ESLint (to be configured in Wave 1)  |
| `pnpm build`                                    | Build every package                  |

## Status

Early scaffold. The public surface at the moment is:

- Monorepo wiring (pnpm workspace, strict TypeScript base config).
- `packages/domain` with the vlog state machine implemented test-first (28 tests passing, 100 % coverage).
- Empty but architected scaffolds for `apps/mobile`, `apps/worker`, and `supabase/functions`.

Product and planning documents are kept private and are not part of this repository.

## License

TBD.
