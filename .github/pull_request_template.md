<!--
  Title convention: Conventional Commits
  Examples:
    feat(camera): add 3-second recording limit
    fix(worker): prevent FFmpeg zombie processes
    chore(deps): bump expo-router to 4.0.7
    docs(readme): clarify pnpm workspace setup
-->

## Summary

<!-- What does this PR do? Keep it to 1-3 bullets. Explain *why*, not *what*. -->

-

## Changes

<!-- Brief list of notable file/module changes. Reviewers use this as a map. -->

-

## Testing

<!-- How was this verified? Paste commands + output where useful. -->

-

## Checklist

- [ ] Title follows Conventional Commits (`feat|fix|chore|docs|refactor|test|perf|ci|build`)
- [ ] Scope is atomic (one logical change)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean (when lint is wired)
- [ ] `pnpm test` passes for affected packages
- [ ] `packages/domain` coverage remains 100% (if touched)
- [ ] No `any`, `@ts-ignore`, or non-null `!`
- [ ] No `console.log` / `console.error` in production paths
- [ ] No PII / secrets / signed URLs in logs
- [ ] No internal docs (`PRD.md`, `ARCHITECTURE.md`, `CODING_STANDARDS.md`, `docs/style/`, `docs/adr/`, `.sisyphus/`) committed
- [ ] Ready to be squash-merged into `main`

## Related

<!-- Closes #123 / Part of #456 / Follows #789 -->
