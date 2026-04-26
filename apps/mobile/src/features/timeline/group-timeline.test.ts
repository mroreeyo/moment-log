import type { GetGroupSlotsResponse, SlotSummary } from '@momentlog/domain/api';
import { createSlotCardModel } from '../../../components/SlotCard';
import { createRecordingCTAModel, remainingMinutes } from '../../../components/RecordingCTA';
import { createGroupTimelineController } from '../../../app/(tabs)/groups/[id]';

const BASE_SLOT: SlotSummary = {
  promptId: 'prompt-1',
  slotStartsAt: '2026-04-27T01:00:00.000Z',
  slotEndsAt: '2026-04-27T02:00:00.000Z',
  graceEndsAt: '2026-04-27T02:15:00.000Z',
  status: 'closed',
  outcome: 'empty',
  userFacingStatus: 'empty',
  expired: false,
  clipCount: 0,
  expectedCount: 2,
  myClipExists: false,
  vlogUrl: null,
  clips: [],
};

describe('SlotCard task-23 status rendering', () => {
  it('renders six distinct status card models', () => {
    const statuses = ['empty', 'raw_only', 'processing', 'compiled', 'failed', 'expired'] as const;

    expect(
      statuses.map((status) =>
        createSlotCardModel({
          ...BASE_SLOT,
          promptId: `prompt-${status}`,
          userFacingStatus: status,
          outcome: status === 'compiled' ? 'compiled' : status === 'expired' ? 'expired' : 'empty',
          expired: status === 'expired',
          clipCount: status === 'empty' ? 0 : 1,
        }),
      ),
    ).toMatchSnapshot();
  });
});

describe('RecordingCTA task-23 behavior', () => {
  it('calculates active-slot remaining time label', () => {
    const now = new Date('2026-04-27T10:25:00.000Z');
    const activeSlot = {
      ...BASE_SLOT,
      promptId: 'prompt-active',
      slotStartsAt: '2026-04-27T10:00:00.000Z',
      slotEndsAt: '2026-04-27T11:00:00.000Z',
      graceEndsAt: '2026-04-27T11:15:00.000Z',
      status: 'open',
    } satisfies SlotSummary;

    expect(remainingMinutes(now, activeSlot.graceEndsAt)).toBe(50);
    expect(createRecordingCTAModel({ groupId: 'g1', activeSlot, now }).label).toBe(
      '지금 기록하기 (50분 남음)',
    );
  });

  it('shows muted banner while preserving record CTA', () => {
    const now = new Date('2026-04-27T10:25:00.000Z');
    const model = createRecordingCTAModel({
      groupId: 'g1',
      activeSlot: { ...BASE_SLOT, status: 'open' },
      now,
      mutedUntil: '2026-04-27T15:00:00.000Z',
    });

    expect(model.mutedBanner).toEqual({
      testID: 'banner-muted',
      visible: true,
      label: '오늘은 알림이 줄어듭니다',
    });
    expect(model.buttonTestID).toBe('btn-record-now');
  });
});

describe('GroupTimelineRoute task-23 refresh model', () => {
  it('reloads groups-slots data on pull-to-refresh', async () => {
    const calls: Array<{ groupId: string; date: string }> = [];
    const response = (clipCount: number): GetGroupSlotsResponse => ({
      groupId: 'g1',
      date: '2026-04-27',
      slots: [{ ...BASE_SLOT, clipCount }],
    });
    const responses = [response(0), response(1)];
    const controller = createGroupTimelineController({
      groupId: 'g1',
      date: '2026-04-27',
      now: () => new Date('2026-04-27T01:20:00.000Z'),
      client: {
        getGroupSlots: (input) => {
          calls.push(input);
          return Promise.resolve(responses.shift() ?? response(1));
        },
      },
    });

    const initial = await controller.load();
    const refreshed = await controller.refresh();

    expect(calls).toEqual([
      { groupId: 'g1', date: '2026-04-27' },
      { groupId: 'g1', date: '2026-04-27' },
    ]);
    expect(initial.cards[0]?.subtitle).toContain('0/2명 기록');
    expect(refreshed.cards[0]?.subtitle).toContain('1/2명 기록');
    expect(controller.snapshot().refreshing).toBe(false);
  });
});
