import { Clip, Api } from '@momentlog/domain/index.ts';
import type { Clock } from '../ports/driven/clock.ts';
import type { MembershipReader } from '../ports/driven/membership-reader.ts';
import type { StorageSigner } from '../ports/driven/storage-signer.ts';

const RAW_BUCKET = 'raw';
const UPLOAD_URL_TTL_SEC = 30 * 60;

export interface SignClipUploadInput {
  readonly userId: string;
  readonly body: Clip.UploadRequestInput;
}

export interface SignClipUploadOkOutput {
  readonly ok: true;
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly storagePath: string;
}

export type SignClipUploadOutput =
  | SignClipUploadOkOutput
  | { readonly ok: false; readonly error: Api.DomainError };

export interface SignClipUploadDeps {
  readonly membership: MembershipReader;
  readonly signer: StorageSigner;
  readonly clock: Clock;
}

export const signClipUpload = async (
  deps: SignClipUploadDeps,
  input: SignClipUploadInput,
): Promise<SignClipUploadOutput> => {
  const validation = Clip.validateUploadRequest(input.body);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const { promptId, fileSizeBytes } = validation.value;

  const prompt = await deps.membership.lookupPrompt(promptId);
  if (!prompt.found) {
    return { ok: false, error: { code: 'NOT_FOUND', resource: 'prompt' } };
  }
  if (prompt.status !== 'open') {
    return { ok: false, error: { code: 'SLOT_CLOSED', promptId } };
  }

  const isMember = await deps.membership.isMember(input.userId, prompt.groupId);
  if (!isMember) {
    return { ok: false, error: { code: 'FORBIDDEN' } };
  }

  const objectKey = `${prompt.groupId}/${promptId}/${input.userId}.mp4`;
  const storagePath = Clip.buildRawStoragePath(prompt.groupId, promptId, input.userId);

  const signed = await deps.signer.createSignedUploadUrl(RAW_BUCKET, objectKey, {
    expiresInSec: UPLOAD_URL_TTL_SEC,
    upsert: true,
  });

  deps.clock.now();
  void fileSizeBytes;

  return {
    ok: true,
    uploadUrl: signed.uploadUrl,
    expiresAt: signed.expiresAt,
    storagePath,
  };
};
