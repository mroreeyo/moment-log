import type { Vlog } from '@momentlog/domain/vlog/index.ts';

export interface VlogRepository {
  findByPromptId(promptId: string): Promise<VlogRecord | null>;
  save(vlog: VlogRecord): Promise<void>;
}

export interface VlogRecord {
  readonly id: string;
  readonly promptId: string;
  readonly groupId: string;
  readonly state: Vlog.VlogState;
  readonly retryCount: number;
  readonly updatedAt: string;
}
