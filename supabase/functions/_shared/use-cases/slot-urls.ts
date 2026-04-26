import { Api } from '@momentlog/domain/index.ts';

export interface SlotUrlsPrompt {
  readonly id: string;
  readonly groupId: string;
}

export interface SlotUrlsVlog {
  readonly storagePath: string | null;
}

export interface SlotUrlsClip {
  readonly userId: string;
  readonly storagePath: string;
}

export interface SlotUrlsProfile {
  readonly userId: string;
  readonly displayName: string | null;
}

export interface StorageSignedUrlReader {
  readonly createSignedUrl: (
    bucket: string,
    objectKey: string,
    expiresInSec: number,
  ) => Promise<string>;
}

export interface SlotUrlsRepository {
  readonly findPrompt: (promptId: string) => Promise<SlotUrlsPrompt | null>;
  readonly isMember: (userId: string, groupId: string) => Promise<boolean>;
  readonly findVlog: (promptId: string) => Promise<SlotUrlsVlog | null>;
  readonly listClips: (promptId: string) => Promise<readonly SlotUrlsClip[]>;
  readonly listProfiles: (userIds: readonly string[]) => Promise<readonly SlotUrlsProfile[]>;
}

export interface SlotUrlsDeps {
  readonly repo: SlotUrlsRepository;
  readonly signer: StorageSignedUrlReader;
}

export type SlotUrlsResult =
  | ({ readonly ok: true } & Api.GetSlotUrlsResponse)
  | { readonly ok: false; readonly error: Api.DomainError };

const SIGNED_URL_TTL_SEC = 60 * 60;

export const getSlotUrls = async (
  deps: SlotUrlsDeps,
  input: { readonly userId: string; readonly promptId: string },
): Promise<SlotUrlsResult> => {
  const promptId = input.promptId.trim();
  if (!promptId) {
    return { ok: false, error: { code: 'VALIDATION_FAILED', details: { fields: ['promptId'] } } };
  }

  const prompt = await deps.repo.findPrompt(promptId);
  if (!prompt) return { ok: false, error: { code: 'NOT_FOUND', resource: 'prompt' } };

  const member = await deps.repo.isMember(input.userId, prompt.groupId);
  if (!member) return { ok: false, error: { code: 'FORBIDDEN' } };

  const [vlog, clips] = await Promise.all([
    deps.repo.findVlog(promptId),
    deps.repo.listClips(promptId),
  ]);
  const profiles = await deps.repo.listProfiles(unique(clips.map((clip) => clip.userId)));
  const displayNames = new Map(profiles.map((profile) => [profile.userId, profile.displayName]));

  return {
    ok: true,
    promptId,
    vlogUrl: await safeSign(deps.signer, vlog?.storagePath ?? null),
    clips: await Promise.all(
      clips.map(
        async (clip): Promise<Api.SlotUrlsClipEntry> => ({
          userId: clip.userId,
          displayName: displayNames.get(clip.userId) ?? 'Unknown',
          clipUrl: await safeSign(deps.signer, clip.storagePath),
        }),
      ),
    ),
  };
};

export const splitStoragePath = (
  storagePath: string,
): { readonly bucket: string; readonly objectKey: string } | null => {
  const [bucket, ...keyParts] = storagePath.split('/');
  const objectKey = keyParts.join('/');
  if (!bucket || !objectKey) return null;
  return { bucket, objectKey };
};

const safeSign = async (
  signer: StorageSignedUrlReader,
  storagePath: string | null,
): Promise<string | null> => {
  if (!storagePath) return null;
  const parsed = splitStoragePath(storagePath);
  if (!parsed) return null;
  try {
    return await signer.createSignedUrl(parsed.bucket, parsed.objectKey, SIGNED_URL_TTL_SEC);
  } catch {
    return null;
  }
};

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)];
