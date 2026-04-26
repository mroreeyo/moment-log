import { assertEquals } from '@std/assert';
import {
  listGroupSlots,
  type GroupSlotsClip,
  type GroupSlotsGroup,
  type GroupSlotsPrompt,
  type GroupSlotsRepository,
  type GroupSlotsVlog,
} from './group-slots.ts';

Deno.test('listGroupSlots: lists local-date slots without signed URLs', async () => {
  const repo = new FakeRepo({
    prompts: [
      prompt({ id: 'p-prev', slotStartsAt: '2026-04-26T14:00:00.000Z' }),
      prompt({ id: 'p-local', slotStartsAt: '2026-04-26T15:00:00.000Z' }),
    ],
    clips: [
      clip({ promptId: 'p-local', userId: 'u1' }),
      clip({ promptId: 'p-local', userId: 'u2' }),
    ],
    vlogs: [{ promptId: 'p-local', status: 'done', outcome: 'compiled' }],
  });

  const result = await listGroupSlots(deps(repo), {
    userId: 'u1',
    query: { groupId: 'g1', date: '2026-04-27' },
  });

  if (!result.ok) throw new Error('expected ok');
  assertEquals(result.slots.length, 1);
  assertEquals(result.slots[0], {
    promptId: 'p-local',
    slotStartsAt: '2026-04-26T15:00:00.000Z',
    status: 'closed',
    outcome: 'compiled',
    userFacingStatus: 'compiled',
    expired: false,
    clipCount: 2,
    myClipExists: true,
    vlogUrl: null,
    clips: [],
  });
});

Deno.test('listGroupSlots: failed vlog is expired only after raw delete time passes', async () => {
  const repo = new FakeRepo({
    prompts: [prompt({ id: 'p1' })],
    clips: [clip({ promptId: 'p1', rawDeleteAt: '2026-04-27T00:00:00.000Z' })],
    vlogs: [{ promptId: 'p1', status: 'failed', outcome: 'failed' }],
  });

  const result = await listGroupSlots(deps(repo), {
    userId: 'u1',
    query: { groupId: 'g1', date: '2026-04-27' },
  });

  if (!result.ok) throw new Error('expected ok');
  assertEquals(result.slots[0]?.expired, true);
  assertEquals(result.slots[0]?.userFacingStatus, 'expired');
  assertEquals(result.slots[0]?.outcome, 'expired');
});

Deno.test('listGroupSlots: non-member gets FORBIDDEN', async () => {
  const repo = new FakeRepo({ member: false });
  const result = await listGroupSlots(deps(repo), {
    userId: 'outside',
    query: { groupId: 'g1', date: '2026-04-27' },
  });

  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'FORBIDDEN');
});

class FakeRepo implements GroupSlotsRepository {
  private readonly groupValue: GroupSlotsGroup | null;
  private readonly member: boolean;
  private readonly prompts: readonly GroupSlotsPrompt[];
  private readonly vlogs: readonly GroupSlotsVlog[];
  private readonly clips: readonly GroupSlotsClip[];

  constructor(input: {
    readonly group?: GroupSlotsGroup | null;
    readonly member?: boolean;
    readonly prompts?: readonly GroupSlotsPrompt[];
    readonly vlogs?: readonly GroupSlotsVlog[];
    readonly clips?: readonly GroupSlotsClip[];
  }) {
    this.groupValue =
      input.group === undefined ? { id: 'g1', timezone: 'Asia/Seoul' } : input.group;
    this.member = input.member ?? true;
    this.prompts = input.prompts ?? [];
    this.vlogs = input.vlogs ?? [];
    this.clips = input.clips ?? [];
  }

  findGroup(): Promise<GroupSlotsGroup | null> {
    return Promise.resolve(this.groupValue);
  }

  isMember(): Promise<boolean> {
    return Promise.resolve(this.member);
  }

  listPromptsInWindow(): Promise<readonly GroupSlotsPrompt[]> {
    return Promise.resolve(this.prompts);
  }

  listVlogs(): Promise<readonly GroupSlotsVlog[]> {
    return Promise.resolve(this.vlogs);
  }

  listClips(): Promise<readonly GroupSlotsClip[]> {
    return Promise.resolve(this.clips);
  }
}

const deps = (repo: GroupSlotsRepository) => ({
  repo,
  clock: { now: () => new Date('2026-04-27T12:00:00.000Z') },
});

const prompt = (overrides: Partial<GroupSlotsPrompt> = {}): GroupSlotsPrompt => ({
  id: 'p1',
  slotStartsAt: '2026-04-26T15:00:00.000Z',
  status: 'closed',
  ...overrides,
});

const clip = (overrides: Partial<GroupSlotsClip> = {}): GroupSlotsClip => ({
  promptId: 'p1',
  userId: 'u1',
  rawDeleteAt: '2026-04-28T00:00:00.000Z',
  ...overrides,
});
