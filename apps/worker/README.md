# @momentlog/worker

Cloud Run worker that compiles vlogs via FFmpeg. Hexagonal architecture.

## Structure

```
apps/worker/
├── src/
│   ├── domain/        # Re-export from @momentlog/domain (pure)
│   ├── ports/
│   │   └── driven/    # VlogRepository, VideoProcessor, Storage, Clock
│   ├── use-cases/     # CompileVlogUseCase
│   ├── adapters/
│   │   ├── supabase/  # Supabase-backed repository + storage
│   │   ├── ffmpeg/    # FFmpeg video processor
│   │   ├── storage/
│   │   └── clock/
│   ├── http/          # Express route: POST /compile → use case
│   ├── di/            # Awilix container wiring
│   └── index.ts       # Express bootstrap
├── tests/
│   └── fakes/         # In-memory adapters for use-case tests
└── package.json
```

## Rules

- `domain/` and `ports/driven/` must not import anything from `adapters/`, `http/`, or SDKs.
- `use-cases/` depend on ports only.
- `adapters/` implement ports and may import SDKs (`@supabase/supabase-js`, `fluent-ffmpeg`).
- `http/` and `di/` are the outermost layer.

## Testing

- Unit tests against use cases use `tests/fakes/*` (in-memory adapters).
- `@supabase/supabase-js` is never mocked directly — only through the repository port.
- FFmpeg subprocess is abstracted behind `VideoProcessor` port.

See `ARCHITECTURE.md` §5.2 at repo root.
