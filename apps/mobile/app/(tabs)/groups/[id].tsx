import type { GetGroupSlotsResponse } from '@momentlog/domain/api';
import { createRecordingCTAModel, activeSlotForNow } from '../../../components/RecordingCTA';
import { createSlotCardModels } from '../../../components/SlotCard';
import type { RecordingCTAModel } from '../../../components/RecordingCTA';
import type { SlotCardModel } from '../../../components/SlotCard';

export interface GroupSlotsQueryClient {
  readonly getGroupSlots: (input: {
    readonly groupId: string;
    readonly date: string;
  }) => Promise<GetGroupSlotsResponse>;
}

export interface GroupTimelineScreenState {
  readonly groupId: string;
  readonly date: string;
  readonly queryKey: readonly ['groups-slots', string, string];
  readonly cards: readonly SlotCardModel[];
  readonly cta: RecordingCTAModel;
  readonly refreshing: boolean;
}

export interface GroupTimelineController {
  readonly load: () => Promise<GroupTimelineScreenState>;
  readonly refresh: () => Promise<GroupTimelineScreenState>;
  readonly snapshot: () => GroupTimelineScreenState;
}

export interface GroupTimelineControllerOptions {
  readonly groupId: string;
  readonly date: string;
  readonly client: GroupSlotsQueryClient;
  readonly now: () => Date;
  readonly mutedUntil?: string | null;
}

export const createGroupTimelineController = (
  options: GroupTimelineControllerOptions,
): GroupTimelineController => {
  let latest: GetGroupSlotsResponse = { groupId: options.groupId, date: options.date, slots: [] };
  let refreshing = false;

  const toState = (): GroupTimelineScreenState => {
    const now = options.now();
    return {
      groupId: latest.groupId,
      date: latest.date,
      queryKey: groupSlotsQueryKey(options.groupId, options.date),
      cards: createSlotCardModels(latest.slots),
      cta: createRecordingCTAModel({
        groupId: options.groupId,
        activeSlot: activeSlotForNow(latest.slots, now),
        now,
        mutedUntil: options.mutedUntil ?? null,
      }),
      refreshing,
    };
  };

  const fetch = async (): Promise<GroupTimelineScreenState> => {
    latest = await options.client.getGroupSlots({ groupId: options.groupId, date: options.date });
    return toState();
  };

  return {
    load: fetch,
    refresh: async () => {
      refreshing = true;
      try {
        return await fetch();
      } finally {
        refreshing = false;
      }
    },
    snapshot: toState,
  };
};

export const groupSlotsQueryKey = (
  groupId: string,
  date: string,
): readonly ['groups-slots', string, string] => ['groups-slots', groupId, date];

export default function GroupTimelineRoute(): null {
  return null;
}
