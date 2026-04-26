# 기여 가이드

이 저장소는 **GitHub Flow**를 따릅니다. `main`은 항상 배포 가능한 상태를 유지하고, 모든 변경은 짧은 수명의 피처 브랜치와 풀 리퀘스트를 통해 들어옵니다.

## 언어 정책

- 모든 **커밋 메시지**, **PR 제목과 본문**, **이슈 제목과 본문**은 **한글 기반**으로 작성합니다.
- **Conventional Commits의 `type`과 `scope`는 영문 그대로** 둡니다(`feat`, `fix`, `docs`, `camera`, `vlog-state` 등). 제목의 설명(subject)과 본문을 한글로 쓰세요.
- 코드 내부의 식별자(함수·변수·파일명·테스트명)는 기존대로 **영문**입니다. 도메인 용어는 PRD의 영어 표기를 그대로 사용합니다(`slot`, `prompt`, `clip`, `vlog`, `grace window` 등).
- 불가피하게 외부 인용이나 영어 감사 로그가 포함될 때는 그대로 두되, 해당 문단 앞뒤 맥락은 한글로 작성합니다.

## 브랜치 전략

- `main` 은 보호되어 있습니다. 직접 푸시할 수 없습니다.
- 작업은 수명이 짧은 **피처 브랜치**에서 진행합니다. 권장 네이밍:
  - `feat/<slug>` — 새 기능
  - `fix/<slug>` — 버그 수정
  - `chore/<slug>` — 도구·의존성·설정 변경
  - `docs/<slug>` — 문서 변경
  - `refactor/<slug>` — 동작 보존 리팩토링
  - `test/<slug>` — 테스트만
- 브랜치 수명은 이상적으로 **3일 미만**. 그 이상 갈 것 같으면 main 최신을 다시 얹으세요(rebase).
- **하나의 PR은 하나의 원자적 변경**을 다룹니다.

## 커밋 — Conventional Commits (한글 본문)

형식:

```
<type>(<scope>): <한글 subject>

<선택: 한글 본문, 한 줄 120자 이하>

<선택: footer — BREAKING CHANGE, Closes #N 등>
```

허용 `type`:

| type       | 의미                       |
| ---------- | -------------------------- |
| `feat`     | 사용자에게 보이는 새 기능  |
| `fix`      | 버그 수정                  |
| `chore`    | 도구, 의존성, 무시 파일 등 |
| `docs`     | 문서만                     |
| `refactor` | 동작을 보존하는 코드 변경  |
| `test`     | 테스트만                   |
| `perf`     | 성능 개선                  |
| `ci`       | CI 설정                    |
| `build`    | 빌드 시스템·패키징         |
| `style`    | 포매팅·공백                |
| `revert`   | 이전 커밋 되돌리기         |

`commitlint` 규칙:

- `type` 은 소문자.
- `scope` 는 kebab-case (예: `camera`, `vlog-state`, `cron-hourly-tick`).
- 제목은 100자 이하, 마침표 금지.
- 본문은 한 줄 120자 이하.

### 좋은 예

```
feat(camera): 3초 촬영 제한 구현

fix(worker): FFmpeg 타임아웃 시 좀비 프로세스 방지

chore(deps): @supabase/supabase-js 2.45.4로 업그레이드

docs(contributing): squash merge 정책 추가

refactor(vlog-state): 종료 상태 헬퍼 함수로 분리

test(domain): raw_expired 경계 케이스 커버리지 추가
```

### 나쁜 예

```
update stuff                 ← type 없음, 모호
Fix camera bug               ← 대문자 시작, scope 없음, 영문(한글 정책 위반)
feat: 여러 가지를 한꺼번에 추가함.   ← 너무 광범위, 마침표
WIP                          ← 원자적이지 않음
```

## 풀 리퀘스트

1. 브랜치를 푸시: `git push -u origin feat/<slug>`
2. `main`을 대상으로 PR을 엽니다. 템플릿을 사용합니다.
3. 리뷰 요청 전에 **셀프 리뷰**로 diff를 한 번 훑습니다.
4. 리뷰 코멘트는 **fixup 커밋**으로 반영합니다(main 최신에 리베이스하는 경우가 아니면 force push 지양).
5. CI가 초록이고 승인되면 **squash merge** 합니다. squash의 제목은 그 자체로 Conventional Commit이 되어야 합니다.

## 로컬 git 훅 (Husky)

`pnpm install` 이후 다음 훅이 자동으로 동작합니다.

| 훅           | 동작                                              |
| ------------ | ------------------------------------------------- |
| `pre-commit` | `lint-staged`로 스테이지된 파일을 prettier 포매팅 |
| `commit-msg` | `commitlint`로 커밋 메시지 검증                   |
| `pre-push`   | `packages/domain` 테스트 실행                     |

우회는 강력히 지양합니다. 정말 필요할 때만 `git commit --no-verify`를 쓰고, 이후 별도 이슈로 기록하세요.

## 머지 전략

- 기본은 **squash merge** 입니다. PR 하나가 `main`의 커밋 하나가 됩니다.
- squash 결과 커밋 메시지는 **PR 제목을 그대로** 받으므로, PR 제목은 반드시 Conventional Commit 형식이어야 합니다.
- **merge commit** 과 **rebase merge** 는 브랜치 보호 설정에서 비활성화되어 있습니다.

## 릴리즈

- 태그 형식: `v<MAJOR>.<MINOR>.<PATCH>` (SemVer). 프리릴리즈: `v1.0.0-alpha.1`.
- GitHub Releases로 릴리즈 노트를 작성합니다. 첫 배포 빌드에 다가갈 때 상세화합니다.

## 저장소에 올리지 않는 파일 (민감·내부 문서)

`.gitignore` 로 자동 차단되어 있습니다. 실수로 add 하지 않도록 주의하세요.

- `PRD.md`
- `ARCHITECTURE.md`
- `CODING_STANDARDS.md`
- `docs/style/`
- `docs/adr/`
- `.sisyphus/`

내부 문서 공유가 필요하면 저장소 밖 채널을 이용합니다.

## PR 체크리스트 (열기 전 자가 확인)

- [ ] 브랜치 이름이 `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/` 로 시작.
- [ ] 커밋 메시지가 Conventional Commits 형식.
- [ ] 커밋/PR 메시지 본문이 **한글**로 작성됨 (`type`과 `scope`만 영문).
- [ ] `pnpm typecheck` 통과.
- [ ] 영향받는 패키지의 `pnpm test` 통과.
- [ ] `packages/domain` 을 건드렸다면 커버리지가 여전히 100%.
- [ ] `git diff --cached --name-only` 로 금지된 파일이 스테이징되지 않음을 확인.
- [ ] PR 본문이 템플릿을 따름.
