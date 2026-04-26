<!--
  PR 제목은 Conventional Commits 형식을 따릅니다. subject(설명)는 한글로 작성합니다.
  예:
    feat(camera): 3초 촬영 제한 구현
    fix(worker): FFmpeg 타임아웃 시 좀비 프로세스 방지
    chore(deps): expo-router 4.0.7로 업그레이드
    docs(readme): pnpm workspace 셋업 안내 보강
-->

## 요약

<!-- 이 PR이 무엇을 하는지 1~3줄의 불릿으로. "무엇"이 아니라 "왜"를 설명하세요. -->

-

## 변경 사항

<!-- 주요 파일/모듈 변경의 짧은 목록. 리뷰어의 지도 역할을 합니다. -->

-

## 검증

<!-- 어떻게 확인했는지. 유용하면 명령과 출력을 붙이세요. -->

-

## 체크리스트

- [ ] 제목이 Conventional Commits 형식 (`feat|fix|chore|docs|refactor|test|perf|ci|build`)
- [ ] 제목과 본문이 한글 기반으로 작성됨 (`type`·`scope`만 영문)
- [ ] 원자적 범위 (하나의 논리적 변경)
- [ ] `pnpm typecheck` 통과
- [ ] `pnpm lint` 통과 (lint 연결 후 해당)
- [ ] 영향받는 패키지의 `pnpm test` 통과
- [ ] `packages/domain` 을 건드렸다면 커버리지 100% 유지
- [ ] `any`, `@ts-ignore`, non-null `!` 사용 없음
- [ ] 프로덕션 경로에 `console.log` / `console.error` 없음
- [ ] PII/시크릿/서명된 URL이 로그에 없음
- [ ] 내부 문서(`PRD.md`, `ARCHITECTURE.md`, `CODING_STANDARDS.md`, `docs/style/`, `docs/adr/`, `.sisyphus/`)가 커밋에 포함되지 않음
- [ ] `main`에 squash-merge할 준비 완료

## 관련

<!-- Closes #123 / Part of #456 / Follows #789 -->
