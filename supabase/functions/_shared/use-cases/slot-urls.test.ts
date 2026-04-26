import { assertEquals } from '@std/assert';
import {
  getSlotUrls,
  splitStoragePath,
  type SlotUrlsClip,
  type SlotUrlsProfile,
  type SlotUrlsPrompt,
  type SlotUrlsRepository,
  type SlotUrlsVlog,
  type StorageSignedUrlReader,
} from './slot-urls.ts';

Deno.test('splitStoragePath: splits bucket prefix from object key', () => {
  assertEquals(splitStoragePath('raw/g1/p1/u1.mp4'), { bucket: 'raw', objectKey: 'g1/p1/u1.mp4' });
  assertEquals(splitStoragePath('vlogs/g1/p1.mp4'), { bucket: 'vlogs', objectKey: 'g1/p1.mp4' });
  assertEquals(splitStoragePath('raw'), null);
});

Deno.test(
  'getSlotUrls: signs each object for one hour and keeps item null on signing failure',
  async () => {
    const signer = new FakeSigner({ failObjectKey: 'g1/p1/u2.mp4' });
    const result = await getSlotUrls(
      { repo: new FakeRepo(), signer },
      { userId: 'u1', promptId: 'p1' },
    );

    if (!result.ok) throw new Error('expected ok');
    assertEquals(result.vlogUrl, 'signed:vlogs:g1/p1.mp4:3600');
    assertEquals(result.clips, [
      { userId: 'u1', displayName: 'Geo', clipUrl: 'signed:raw:g1/p1/u1.mp4:3600' },
      { userId: 'u2', displayName: 'Unknown', clipUrl: null },
    ]);
    assertEquals(
      signer.calls.map((call) => call.expiresInSec),
      [3600, 3600, 3600],
    );
  },
);

Deno.test('getSlotUrls: non-member gets FORBIDDEN', async () => {
  const result = await getSlotUrls(
    { repo: new FakeRepo({ member: false }), signer: new FakeSigner() },
    { userId: 'outside', promptId: 'p1' },
  );

  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'FORBIDDEN');
});

class FakeRepo implements SlotUrlsRepository {
  private readonly promptValue: SlotUrlsPrompt | null;
  private readonly member: boolean;
  private readonly vlogValue: SlotUrlsVlog | null;
  private readonly clipsValue: readonly SlotUrlsClip[];
  private readonly profilesValue: readonly SlotUrlsProfile[];

  constructor(
    input: {
      readonly prompt?: SlotUrlsPrompt | null;
      readonly member?: boolean;
      readonly vlog?: SlotUrlsVlog | null;
      readonly clips?: readonly SlotUrlsClip[];
      readonly profiles?: readonly SlotUrlsProfile[];
    } = {},
  ) {
    this.promptValue = input.prompt === undefined ? { id: 'p1', groupId: 'g1' } : input.prompt;
    this.member = input.member ?? true;
    this.vlogValue = input.vlog === undefined ? { storagePath: 'vlogs/g1/p1.mp4' } : input.vlog;
    this.clipsValue = input.clips ?? [
      { userId: 'u1', storagePath: 'raw/g1/p1/u1.mp4' },
      { userId: 'u2', storagePath: 'raw/g1/p1/u2.mp4' },
    ];
    this.profilesValue = input.profiles ?? [{ userId: 'u1', displayName: 'Geo' }];
  }

  findPrompt(): Promise<SlotUrlsPrompt | null> {
    return Promise.resolve(this.promptValue);
  }

  isMember(): Promise<boolean> {
    return Promise.resolve(this.member);
  }

  findVlog(): Promise<SlotUrlsVlog | null> {
    return Promise.resolve(this.vlogValue);
  }

  listClips(): Promise<readonly SlotUrlsClip[]> {
    return Promise.resolve(this.clipsValue);
  }

  listProfiles(): Promise<readonly SlotUrlsProfile[]> {
    return Promise.resolve(this.profilesValue);
  }
}

class FakeSigner implements StorageSignedUrlReader {
  calls: Array<{ bucket: string; objectKey: string; expiresInSec: number }> = [];
  constructor(private readonly options: { readonly failObjectKey?: string } = {}) {}

  createSignedUrl(bucket: string, objectKey: string, expiresInSec: number): Promise<string> {
    this.calls.push({ bucket, objectKey, expiresInSec });
    if (objectKey === this.options.failObjectKey) {
      return Promise.reject(new Error('sign failed'));
    }
    return Promise.resolve(`signed:${bucket}:${objectKey}:${expiresInSec}`);
  }
}
