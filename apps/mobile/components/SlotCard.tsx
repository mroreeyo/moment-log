import type { SlotSummary } from '@momentlog/domain/api';

export type SlotCardTone = 'neutral' | 'info' | 'success' | 'danger' | 'muted';
export type SlotCardAction = 'none' | 'play-raw' | 'open-vlog' | 'retry';

export interface SlotCardModel {
  readonly testID: string;
  readonly promptId: string;
  readonly tone: SlotCardTone;
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly action: SlotCardAction;
  readonly actionLabel: string | null;
  readonly route: string | null;
  readonly accessibilityLabel: string;
}

const STATUS_COPY: Readonly<
  Record<
    SlotSummary['userFacingStatus'],
    {
      readonly tone: SlotCardTone;
      readonly title: string;
      readonly badge: string;
      readonly action: SlotCardAction;
      readonly actionLabel: string | null;
      readonly routeKind: 'slot' | 'vlog' | null;
    }
  >
> = {
  empty: {
    tone: 'neutral',
    title: '아직 아무도 기록하지 않았어요',
    badge: '비어 있음',
    action: 'none',
    actionLabel: null,
    routeKind: null,
  },
  raw_only: {
    tone: 'info',
    title: '원본 클립이 있어요',
    badge: '원본만 있음',
    action: 'play-raw',
    actionLabel: '원본 보기',
    routeKind: 'slot',
  },
  processing: {
    tone: 'info',
    title: '브이로그 만드는 중',
    badge: '처리 중',
    action: 'none',
    actionLabel: null,
    routeKind: null,
  },
  compiled: {
    tone: 'success',
    title: '브이로그가 준비됐어요',
    badge: '완성',
    action: 'open-vlog',
    actionLabel: '브이로그 보기',
    routeKind: 'vlog',
  },
  failed: {
    tone: 'danger',
    title: '브이로그 만들기에 실패했어요',
    badge: '실패',
    action: 'retry',
    actionLabel: '다시 시도하기',
    routeKind: 'slot',
  },
  expired: {
    tone: 'muted',
    title: '원본이 만료됐어요',
    badge: '원본 만료',
    action: 'none',
    actionLabel: null,
    routeKind: null,
  },
};

export const createSlotCardModel = (slot: SlotSummary): SlotCardModel => {
  const copy = STATUS_COPY[slot.userFacingStatus];
  return {
    testID: `slot-card-${slot.userFacingStatus}`,
    promptId: slot.promptId,
    tone: copy.tone,
    title: copy.title,
    subtitle: `${formatSlotTime(slot.slotStartsAt)} · ${slot.clipCount}/${slot.expectedCount}명 기록`,
    badge: copy.badge,
    action: copy.action,
    actionLabel: copy.actionLabel,
    route: routeFor(copy.routeKind, slot.promptId),
    accessibilityLabel: `${copy.badge}, ${copy.title}`,
  };
};

export const createSlotCardModels = (slots: readonly SlotSummary[]): readonly SlotCardModel[] =>
  slots.map(createSlotCardModel);

const routeFor = (kind: 'slot' | 'vlog' | null, promptId: string): string | null => {
  switch (kind) {
    case 'slot':
      return `/slot/${promptId}`;
    case 'vlog':
      return `/vlog/${promptId}`;
    case null:
      return null;
  }
};

const formatSlotTime = (iso: string): string => {
  const date = new Date(iso);
  const hours = `${date.getUTCHours()}`.padStart(2, '0');
  const minutes = `${date.getUTCMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
};
