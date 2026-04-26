import type { SlotSummary } from '@momentlog/domain/api';

export interface RecordingCTAModel {
  readonly testID: 'recording-cta';
  readonly visible: boolean;
  readonly buttonTestID: 'btn-record-now' | 'btn-slot-complete' | null;
  readonly label: string | null;
  readonly route: string | null;
  readonly disabled: boolean;
  readonly mutedBanner: MutedBannerModel | null;
}

export interface MutedBannerModel {
  readonly testID: 'banner-muted';
  readonly visible: true;
  readonly label: '오늘은 알림이 줄어듭니다';
}

export interface RecordingCTAInput {
  readonly groupId: string;
  readonly activeSlot: SlotSummary | null;
  readonly now: Date;
  readonly mutedUntil?: string | null;
}

export const createRecordingCTAModel = (input: RecordingCTAInput): RecordingCTAModel => {
  const mutedBanner: MutedBannerModel | null = isMuted(input.mutedUntil, input.now)
    ? { testID: 'banner-muted', visible: true, label: '오늘은 알림이 줄어듭니다' }
    : null;

  if (!input.activeSlot) {
    return {
      testID: 'recording-cta',
      visible: mutedBanner !== null,
      buttonTestID: null,
      label: null,
      route: null,
      disabled: true,
      mutedBanner,
    };
  }

  if (input.activeSlot.myClipExists) {
    return {
      testID: 'recording-cta',
      visible: true,
      buttonTestID: 'btn-slot-complete',
      label: `이번 슬롯 완료 ${input.activeSlot.clipCount}/${input.activeSlot.expectedCount}`,
      route: null,
      disabled: true,
      mutedBanner,
    };
  }

  return {
    testID: 'recording-cta',
    visible: true,
    buttonTestID: 'btn-record-now',
    label: `지금 기록하기 (${remainingMinutes(input.now, input.activeSlot.graceEndsAt)}분 남음)`,
    route: `/camera?groupId=${input.groupId}&promptId=${input.activeSlot.promptId}`,
    disabled: false,
    mutedBanner,
  };
};

export const activeSlotForNow = (slots: readonly SlotSummary[], now: Date): SlotSummary | null =>
  slots.find((slot) => inGraceWindow(slot, now)) ?? null;

export const inGraceWindow = (slot: SlotSummary, now: Date): boolean => {
  const time = now.getTime();
  return Date.parse(slot.slotStartsAt) <= time && time <= Date.parse(slot.graceEndsAt);
};

export const remainingMinutes = (now: Date, graceEndsAt: string): number =>
  Math.max(0, Math.ceil((Date.parse(graceEndsAt) - now.getTime()) / 60_000));

const isMuted = (mutedUntil: string | null | undefined, now: Date): boolean =>
  mutedUntil !== null && mutedUntil !== undefined && Date.parse(mutedUntil) > now.getTime();
