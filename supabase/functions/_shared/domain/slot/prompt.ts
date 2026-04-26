export type PromptStatus = 'open' | 'closed';

export interface Prompt {
  readonly id: string;
  readonly groupId: string;
  readonly slotStartsAt: string;
  readonly slotEndsAt: string;
  readonly graceEndsAt: string;
  readonly expectedCount: number;
  readonly uploadedCount: number;
  readonly status: PromptStatus;
  readonly createdAt: string;
}
