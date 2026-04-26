# PRD → Task Traceability Matrix

> **목적**: PRD v1.1-final 의 기능 요구사항(FR-1 ~ FR-13)과 비기능 요구사항(NFR-1 ~ NFR-6)이 어떤 구현 task 와 검증 경로에 매핑되는지 추적한다.
> **원천**: PRD §11 기능 요구사항, §12 비기능 요구사항. 내부 상세는 `.sisyphus/plans/momentlog-mvp.md` (저장소에 포함되지 않음).
> **관리**: 신규 task 추가·삭제·병합 시 본 문서도 함께 갱신한다.

## 1. 기능 요구사항 (FR)

| Req   | Summary                                                        | Implementing Tasks | Verified By                                                         |
| ----- | -------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| FR-1  | Apple 또는 Google 로그인                                       | 12                 | task-12 acceptance criteria (signInWithIdToken native flow)         |
| FR-2  | 그룹 생성 (timezone / 활동 시간대 설정)                        | 13, 35             | task-13 acceptance, task-35 invite regeneration                     |
| FR-3  | 유효한 초대코드로 그룹 참가                                    | 14, 35             | task-14 rate-limit 검증, task-35 초대 재발급                        |
| FR-4  | 매시 정각 active hour 그룹에 slot 생성                         | 20, 21             | task-20 cron-hourly-tick 단위 테스트, task-21 Cloud Scheduler 설정  |
| FR-5  | 3초 세로 전면 카메라 clip 촬영                                 | 15                 | task-15 camera screen acceptance                                    |
| FR-6  | recordingStartedAt 기준 정확한 slot 귀속 (서버 권위)           | 5, 18, 33          | task-5 type 매핑, task-18 clips-finalize, task-33 slot-assignment   |
| FR-7  | clip 업로드 + 실패 시 재시도                                   | 11, 18, 19         | task-11 signed upload URL, task-18 finalize, task-19 useUploadClip  |
| FR-8  | 슬롯 종료 시 empty/skipped_single/compiled/failed outcome 결정 | 5, 20              | task-5 VlogState/VlogEvent, task-20 hourly-tick 종료 로직           |
| FR-9  | 업로드 2건 이상일 때 자동 브이로그 합성                        | 20, 25, 26         | task-20 worker enqueue, task-25 Cloud Run compile, task-26 배포     |
| FR-10 | 업로드 1건이면 raw clip 만 노출 (brief 합성 없음)              | 5, 22, 29          | task-5 UserFacingSlotStatus=raw_only, task-22 slots API, task-29 UI |
| FR-11 | 3회 연속 missed slot → 당일 push 뮤트                          | 20, 24             | task-20 streak/mute 갱신, task-24 push 발송 (muted 제외)            |
| FR-12 | raw clip·중간 파일 업로드 다음날 01:00 local 자동 삭제         | 28                 | task-28 raw-delete cron                                             |
| FR-13 | 합성 실패 슬롯에 수동 retry 제공, raw 삭제 후 410 Gone 반환    | 5, 27              | task-5 DomainError (RAW_EXPIRED), task-27 vlogs-retry               |

## 2. 비기능 요구사항 (NFR)

| Req   | Summary                                                | Implementing Tasks | Verified By                                                               |
| ----- | ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------- |
| NFR-1 | 브이로그 합성 평균 90초 이내                           | 25, 39             | task-39 합성 latency 계측, task-25 FFmpeg 타임아웃 설정                   |
| NFR-2 | 업로드·합성 성공률 99%                                 | 40                 | task-40 success rate 계측                                                 |
| NFR-3 | 그룹 콘텐츠는 멤버만 접근, 저장 자산 encrypted at rest | 8, 10, 41          | task-8 RLS 정책, task-10 private Storage 버킷, task-41 보안 검증          |
| NFR-4 | Private group only / raw 짧은 retention / invite 감사  | 14, 28, 41         | task-14 rate-limit + invite_attempts, task-28 raw deletion, task-41 audit |
| NFR-5 | 영상 재생 local cache 우선                             | 30                 | task-30 CachedVideo LRU                                                   |
| NFR-6 | foreground 복귀 시 stale UI 제거                       | 31, 32             | task-31 useAppStateRefetch, task-32 Supabase Realtime 구독                |

## 3. 교차 참조 원칙

- FR/NFR 업데이트가 필요해진 경우, **PRD 를 먼저 수정**하고 본 문서를 뒤따라 갱신한다.
- 구현 task 가 병합·분할되면, 본 문서에 반영한다. `.sisyphus/plans/momentlog-mvp.md` 의 task 번호가 권위(source of truth)이다.
- 모든 FR-N / NFR-N 은 **최소 1개 task 에 매핑**되어야 한다. 플랜 변경 시 본 문서를 재검증한다.
