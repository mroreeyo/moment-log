export type { ClipStatus, Clip, StoragePath } from './types.ts';
export { buildRawStoragePath } from './types.ts';

export {
  MAX_CLIP_SIZE_BYTES,
  ALLOWED_CLIP_MIME_TYPES,
  validateUploadRequest,
} from './upload-validation.ts';
export type {
  AllowedClipMimeType,
  UploadRequestInput,
  UploadRequestValid,
  UploadRequestValidation,
} from './upload-validation.ts';

export { validateFinalizeBody, finalizeSlotDecision } from './finalize-validation.ts';
export type {
  FinalizeBodyInput,
  FinalizeBodyValidation,
  FinalizePromptSnapshot,
  FinalizeSlotDecisionInput,
  FinalizeSlotDecision,
} from './finalize-validation.ts';
