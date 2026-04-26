import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Storage } from '../../ports/driven/index.js';
import type {
  ClipForCompile,
  CompileVlogInput,
  VlogCompileRepository,
} from '../../use-cases/compile-vlog.js';

export interface SupabaseAdapterOptions {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
}

interface RestRow {
  readonly [key: string]: unknown;
}

export class SupabaseWorkerRepository implements VlogCompileRepository {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: SupabaseAdapterOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async claimPendingVlog(input: CompileVlogInput & { readonly now: string }): Promise<boolean> {
    const rows = await this.request<readonly RestRow[]>(
      `/rest/v1/vlogs?prompt_id=eq.${input.promptId}&group_id=eq.${input.groupId}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'processing',
          processing_started_at: input.now,
          trigger_type: input.triggerType,
        }),
      },
    );
    return rows.length > 0;
  }

  async listClips(promptId: string): Promise<readonly ClipForCompile[]> {
    const rows = await this.request<readonly RestRow[]>(
      `/rest/v1/clips?prompt_id=eq.${promptId}&order=recording_started_at.asc`,
    );
    return rows.map((row) => ({
      id: requireString(row, 'id'),
      storagePath: requireString(row, 'storage_path'),
      fileSizeBytes: requireNumber(row, 'file_size_bytes'),
    }));
  }

  async markDone(input: {
    readonly promptId: string;
    readonly groupId: string;
    readonly storagePath: string;
    readonly clipCount: number;
    readonly durationSec: number;
    readonly completedAt: string;
  }): Promise<void> {
    await this.request(
      `/rest/v1/vlogs?prompt_id=eq.${input.promptId}&group_id=eq.${input.groupId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'done',
          outcome: 'compiled',
          storage_path: input.storagePath,
          clip_count: input.clipCount,
          duration_sec: Math.round(input.durationSec),
          completed_at: input.completedAt,
        }),
      },
    );
  }

  async markFailed(input: {
    readonly promptId: string;
    readonly groupId: string;
    readonly stage: string;
    readonly message: string;
  }): Promise<void> {
    await this.request(
      `/rest/v1/vlogs?prompt_id=eq.${input.promptId}&group_id=eq.${input.groupId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'failed',
          outcome: 'failed',
          error_stage: input.stage,
          error_message: input.message,
        }),
      },
    );
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.options.supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: this.options.serviceRoleKey,
        Authorization: `Bearer ${this.options.serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Supabase request failed ${response.status}: ${await response.text()}`);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    return (text.length === 0 ? undefined : JSON.parse(text)) as T;
  }
}

export class SupabaseStorageAdapter implements Storage {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: SupabaseAdapterOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async download(path: string, localDest: string): Promise<void> {
    const { bucket, objectKey } = splitStoragePath(path);
    const response = await this.fetcher(
      `${this.options.supabaseUrl}/storage/v1/object/${bucket}/${encodeObjectKey(objectKey)}`,
      { headers: this.authHeaders() },
    );
    if (!response.ok) {
      throw new Error(`download failed ${response.status}: ${await response.text()}`);
    }
    await mkdir(dirname(localDest), { recursive: true });
    await writeFile(localDest, new Uint8Array(await response.arrayBuffer()));
  }

  async upload(localSource: string, path: string): Promise<void> {
    const { bucket, objectKey } = splitStoragePath(path);
    const response = await this.fetcher(
      `${this.options.supabaseUrl}/storage/v1/object/${bucket}/${encodeObjectKey(objectKey)}`,
      {
        method: 'POST',
        headers: { ...this.authHeaders(), 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
        body: await readFile(localSource),
      },
    );
    if (!response.ok) {
      throw new Error(`upload failed ${response.status}: ${await response.text()}`);
    }
  }

  async delete(path: string): Promise<void> {
    const { bucket, objectKey } = splitStoragePath(path);
    const response = await this.fetcher(
      `${this.options.supabaseUrl}/storage/v1/object/${bucket}/${encodeObjectKey(objectKey)}`,
      { method: 'DELETE', headers: this.authHeaders() },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`delete failed ${response.status}: ${await response.text()}`);
    }
  }

  private authHeaders(): Readonly<Record<string, string>> {
    return {
      apikey: this.options.serviceRoleKey,
      Authorization: `Bearer ${this.options.serviceRoleKey}`,
    };
  }
}

export const splitStoragePath = (
  path: string,
): { readonly bucket: string; readonly objectKey: string } => {
  const [bucket, ...keyParts] = path.split('/');
  const objectKey = keyParts.join('/');
  if (!bucket || !objectKey) {
    throw new Error(`invalid storage path: ${path}`);
  }
  return { bucket, objectKey };
};

const encodeObjectKey = (key: string): string => key.split('/').map(encodeURIComponent).join('/');

const requireString = (row: RestRow, key: string): string => {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`invalid ${key}`);
  }
  return value;
};

const requireNumber = (row: RestRow, key: string): number => {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`invalid ${key}`);
  }
  return value;
};
