import { assertEquals } from 'jsr:@std/assert@1';
import { signClipUpload } from './sign-clip-upload.ts';
import type { MembershipReader, PromptLookupResult } from '../ports/driven/membership-reader.ts';
import type { SignedUploadUrl, StorageSigner } from '../ports/driven/storage-signer.ts';
import type { Clock } from '../ports/driven/clock.ts';

class FakeMembershipReader implements MembershipReader {
  constructor(
    private readonly prompt: PromptLookupResult,
    private readonly membership = true,
  ) {}
  lookupPrompt(): Promise<PromptLookupResult> {
    return Promise.resolve(this.prompt);
  }
  isMember(): Promise<boolean> {
    return Promise.resolve(this.membership);
  }
}

class FakeSigner implements StorageSigner {
  createSignedUploadUrl(): Promise<SignedUploadUrl> {
    return Promise.resolve({
      uploadUrl: 'https://signed.example.com/put',
      expiresAt: '2026-04-24T12:30:00.000Z',
    });
  }
}

class FakeClock implements Clock {
  now(): Date {
    return new Date('2026-04-24T12:00:00.000Z');
  }
}

const VALID_BODY = {
  promptId: '00000000-0000-0000-0000-000000000001',
  mimeType: 'video/mp4',
  fileSizeBytes: 2_000_000,
} as const;

Deno.test('signClipUpload: happy path returns signed URL and canonical storagePath', async () => {
  const deps = {
    membership: new FakeMembershipReader({ found: true, groupId: 'g1', status: 'open' }),
    signer: new FakeSigner(),
    clock: new FakeClock(),
  };
  const result = await signClipUpload(deps, { userId: 'u1', body: VALID_BODY });
  if (!result.ok) throw new Error('expected ok');
  assertEquals(result.uploadUrl, 'https://signed.example.com/put');
  assertEquals(result.storagePath, `raw/g1/${VALID_BODY.promptId}/u1.mp4`);
});

Deno.test('signClipUpload: rejects invalid body with VALIDATION_FAILED', async () => {
  const deps = {
    membership: new FakeMembershipReader({ found: true, groupId: 'g1', status: 'open' }),
    signer: new FakeSigner(),
    clock: new FakeClock(),
  };
  const result = await signClipUpload(deps, {
    userId: 'u1',
    body: { ...VALID_BODY, fileSizeBytes: 99_999_999 },
  });
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'VALIDATION_FAILED');
});

Deno.test('signClipUpload: NOT_FOUND when prompt missing', async () => {
  const deps = {
    membership: new FakeMembershipReader({ found: false }),
    signer: new FakeSigner(),
    clock: new FakeClock(),
  };
  const result = await signClipUpload(deps, { userId: 'u1', body: VALID_BODY });
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'NOT_FOUND');
});

Deno.test('signClipUpload: SLOT_CLOSED for closed prompt', async () => {
  const deps = {
    membership: new FakeMembershipReader({ found: true, groupId: 'g1', status: 'closed' }),
    signer: new FakeSigner(),
    clock: new FakeClock(),
  };
  const result = await signClipUpload(deps, { userId: 'u1', body: VALID_BODY });
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'SLOT_CLOSED');
});

Deno.test('signClipUpload: FORBIDDEN when user not a member', async () => {
  const deps = {
    membership: new FakeMembershipReader({ found: true, groupId: 'g1', status: 'open' }, false),
    signer: new FakeSigner(),
    clock: new FakeClock(),
  };
  const result = await signClipUpload(deps, { userId: 'u-outside', body: VALID_BODY });
  if (result.ok) throw new Error('expected error');
  assertEquals(result.error.code, 'FORBIDDEN');
});
