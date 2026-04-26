# @momentlog/mobile

React Native + Expo SDK 52 app for MomentLog, organized with Feature-Sliced Design.

## Structure

```
apps/mobile/
├── app/                          # Expo Router routes (file-based)
│   └── _layout.tsx               # (stub — to be created in Wave 1/3)
└── src/                          # FSD architecture
    ├── app/                      # FSD app layer (providers, styles, global config)
    ├── pages/                    # Route composition
    ├── widgets/                  # Self-contained UI blocks
    ├── features/                 # User-facing interactions
    ├── entities/                 # Business entities (user, group, vlog, clip, slot)
    └── shared/                   # Generic UI, lib, api, config
```

## FSD Layer Rules

Dependencies flow top-down only:
`app → pages → widgets → features → entities → shared`

- A feature may import entities and shared, but never another feature.
- All slices expose a public API via `index.ts`; internal files are not to be imported directly.
- Cross-slice shared types use the `@x/` pattern (see ARCHITECTURE.md §4.5).

See `ARCHITECTURE.md` at the repo root for the full contract.

## Scripts

- `pnpm start` — Expo dev server (requires dev client build)
- `pnpm test` — Jest unit tests
- `pnpm typecheck` — tsc no-emit
- `pnpm lint` — ESLint with FSD boundaries
