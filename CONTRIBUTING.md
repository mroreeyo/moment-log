# Contributing to moment-log

This project follows **GitHub Flow**: `main` is always deployable, every change arrives through a short-lived branch and a pull request.

## Branching

- `main` is protected. No direct pushes.
- Work on **feature branches** named like:
  - `feature/<short-slug>` — new capability
  - `fix/<short-slug>` — bug fix
  - `chore/<short-slug>` — tooling, deps, refactors
  - `docs/<short-slug>` — documentation
- Branch lifetime: **< 3 days** ideally. Rebase or re-cut if you drift.
- One PR = one atomic change.

## Commits — Conventional Commits

Format:

```
<type>(<scope>): <subject>

<body — optional, wrap at 120>

<footer — optional; BREAKING CHANGE, Closes #, etc.>
```

Allowed `type`s:

| type       | meaning                         |
| ---------- | ------------------------------- |
| `feat`     | new user-visible capability     |
| `fix`      | bug fix                         |
| `chore`    | tooling, deps, ignore files     |
| `docs`     | docs only                       |
| `refactor` | behavior-preserving code change |
| `test`     | tests only                      |
| `perf`     | perf improvement                |
| `ci`       | CI config                       |
| `build`    | build system / packaging        |
| `style`    | formatting, whitespace          |
| `revert`   | reverts a previous commit       |

Rules enforced by `commitlint`:

- Lowercase `type`.
- `scope` is kebab-case (e.g. `camera`, `vlog-state`, `cron-hourly-tick`).
- Subject ≤ 100 chars, no trailing period.
- Body lines ≤ 120 chars.

### Good examples

```
feat(camera): enforce 3-second recording limit

fix(worker): prevent ffmpeg zombie processes on timeout

chore(deps): bump @supabase/supabase-js to 2.45.4

docs(contributing): add squash-merge policy

refactor(vlog-state): extract terminal-state helper

test(domain): cover raw_expired edge case
```

### Bad examples

```
update stuff                 ← no type, vague
Fix camera bug               ← uppercase, no scope
feat: add a lot of things.   ← too broad, trailing period
WIP                          ← not atomic
```

## Pull Requests

1. Push your branch: `git push -u origin feature/<slug>`.
2. Open a PR targeting `main`. Use the template.
3. Self-review the diff before requesting review.
4. Address review comments with **fixup commits**, not force-pushes (unless rebasing onto `main`).
5. Once green and approved, **squash-merge** into `main`. The squash title must itself be a Conventional Commit.

## Local git hooks (Husky)

The hooks run automatically after `pnpm install`:

| hook         | action                              |
| ------------ | ----------------------------------- |
| `pre-commit` | `lint-staged` formats touched files |
| `commit-msg` | `commitlint` validates the message  |
| `pre-push`   | runs `packages/domain` tests        |

Bypass is strongly discouraged. If absolutely necessary: `git commit --no-verify`, then open a follow-up task.

## Merge strategy

- **Squash merge** is the default. One PR becomes one commit on `main`.
- The resulting commit message inherits the PR title, so PR titles must be Conventional Commits.
- **Merge commits** and **rebase merges** are disabled at the branch-protection level.

## Releases

- Tag format: `v<MAJOR>.<MINOR>.<PATCH>` (SemVer). Pre-releases: `v1.0.0-alpha.1`.
- Released via GitHub Releases; details added as the project approaches its first deployable build.

## Private content

These paths must never be committed — the repo's `.gitignore` enforces this:

- `PRD.md`
- `ARCHITECTURE.md`
- `CODING_STANDARDS.md`
- `docs/style/`
- `docs/adr/`
- `.sisyphus/`

If you need to share internal docs, do it outside the repo.

## Checklist before opening a PR

- [ ] Branch named `feature/`, `fix/`, `chore/`, or `docs/`.
- [ ] Commits are Conventional Commits.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes for touched packages.
- [ ] `packages/domain` coverage stays 100% when touched.
- [ ] No forbidden files staged (`git diff --cached --name-only`).
- [ ] PR description follows the template.
