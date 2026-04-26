export interface SignedUploadUrl {
  readonly uploadUrl: string;
  readonly expiresAt: string;
}

export interface StorageSigner {
  createSignedUploadUrl(
    bucket: string,
    objectKey: string,
    options: { readonly expiresInSec: number; readonly upsert: boolean },
  ): Promise<SignedUploadUrl>;
}
