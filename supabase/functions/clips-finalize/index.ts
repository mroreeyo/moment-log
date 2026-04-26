import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Api, Clip } from '@momentlog/domain/index.ts';
import { SystemClock } from '../_shared/adapters/clock/system-clock.ts';
import { ConsoleLogger } from '../_shared/adapters/logger/console-logger.ts';
import type {
  ClipRepository,
  PromptFinalizeSnapshot,
  UpsertClipInput,
  UpsertClipResult,
} from '../_shared/ports/driven/clip.repository.ts';
import { finalizeClip } from '../_shared/use-cases/finalize-clip.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const logger = new ConsoleLogger();
const clock = new SystemClock();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return json({ error: 'METHOD_NOT_ALLOWED', message: 'POST only', details: {} }, 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return errorResponse({ code: 'UNAUTHORIZED' });
  }

  const supabaseUrl = must('SUPABASE_URL');
  const anonKey = must('SUPABASE_ANON_KEY');
  const serviceKey = must('SUPABASE_SERVICE_ROLE_KEY');

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) {
    logger.warn('auth failed', { error: authError?.message });
    return errorResponse({ code: 'UNAUTHORIZED' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: 'VALIDATION_FAILED', details: { fields: ['body'] } });
  }
  if (typeof body !== 'object' || body === null) {
    return errorResponse({ code: 'VALIDATION_FAILED', details: { fields: ['body'] } });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await finalizeClip(
    { repo: new SupabaseClipRepository(adminClient), clock },
    { userId: user.id, body: body as Clip.FinalizeBodyInput },
  );
  if (!result.ok) {
    logger.info('clips-finalize rejected', { code: result.error.code });
    return errorResponse(result.error);
  }

  logger.info('clips-finalize ok', {
    promptId: result.promptId,
    replaced: result.replaced,
  });
  return json(
    {
      clipId: result.clipId,
      promptId: result.promptId,
      storagePath: result.storagePath,
      replaced: result.replaced,
    },
    result.replaced ? 200 : 201,
  );
});

class SupabaseClipRepository implements ClipRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findPromptForFinalize(promptId: string): Promise<PromptFinalizeSnapshot | null> {
    const { data, error } = await this.client
      .from('prompts')
      .select('id, group_id, slot_starts_at, slot_ends_at, grace_ends_at, status')
      .eq('id', promptId)
      .maybeSingle();
    if (error) throw new Error(`findPromptForFinalize failed: ${error.message}`);
    if (!data) return null;
    return this.toPromptSnapshot(data);
  }

  async findPromptForRecording(
    groupId: string,
    recordingStartedAt: string,
  ): Promise<PromptFinalizeSnapshot | null> {
    const { data, error } = await this.client
      .from('prompts')
      .select('id, group_id, slot_starts_at, slot_ends_at, grace_ends_at, status')
      .eq('group_id', groupId)
      .lte('slot_starts_at', recordingStartedAt)
      .gte('grace_ends_at', recordingStartedAt)
      .order('slot_starts_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`findPromptForRecording failed: ${error.message}`);
    if (!data) return null;
    return this.toPromptSnapshot(data);
  }

  async isMember(userId: string, groupId: string): Promise<boolean> {
    const { count, error } = await this.client
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('group_id', groupId);
    if (error) throw new Error(`isMember failed: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async upsertClip(input: UpsertClipInput): Promise<UpsertClipResult> {
    const { count: existingCount, error: existingError } = await this.client
      .from('clips')
      .select('*', { count: 'exact', head: true })
      .eq('prompt_id', input.promptId)
      .eq('user_id', input.userId);
    if (existingError) throw new Error(`check existing clip failed: ${existingError.message}`);

    const rawDeleteAt = await this.computeRawDeleteAt(input.groupId);
    const { data, error } = await this.client
      .from('clips')
      .upsert(
        {
          prompt_id: input.promptId,
          group_id: input.groupId,
          user_id: input.userId,
          storage_path: input.storagePath,
          recording_started_at: input.recordingStartedAt,
          upload_completed_at: new Date().toISOString(),
          raw_delete_at: rawDeleteAt,
          file_size_bytes: input.fileSizeBytes,
          is_late: input.isLate,
        },
        { onConflict: 'prompt_id,user_id' },
      )
      .select('id')
      .single();
    if (error || !data) throw new Error(`upsertClip failed: ${error?.message ?? 'unknown'}`);
    return { clipId: String(data.id), replaced: (existingCount ?? 0) > 0 };
  }

  private async toPromptSnapshot(row: unknown): Promise<PromptFinalizeSnapshot> {
    const prompt = asPromptRow(row);
    return {
      promptId: prompt.id,
      groupId: prompt.group_id,
      slotStartsAt: prompt.slot_starts_at,
      slotEndsAt: prompt.slot_ends_at,
      graceEndsAt: prompt.grace_ends_at,
      status: prompt.status === 'closed' ? 'closed' : 'open',
      groupTimezone: await this.findGroupTimezone(prompt.group_id),
    };
  }

  private async findGroupTimezone(groupId: string): Promise<string> {
    const { data, error } = await this.client
      .from('groups')
      .select('timezone')
      .eq('id', groupId)
      .single();
    if (error || !data) throw new Error(`findGroupTimezone failed: ${error?.message ?? 'unknown'}`);
    return asTimezoneRow(data).timezone;
  }

  private async computeRawDeleteAt(groupId: string): Promise<string> {
    const { data, error } = await this.client.rpc('compute_raw_delete_at', {
      group_id_arg: groupId,
    });
    if (error || typeof data !== 'string') {
      throw new Error(`computeRawDeleteAt failed: ${error?.message ?? 'missing timestamp'}`);
    }
    return data;
  }
}

interface PromptRow {
  readonly id: string;
  readonly group_id: string;
  readonly slot_starts_at: string;
  readonly slot_ends_at: string;
  readonly grace_ends_at: string;
  readonly status: string;
}

interface TimezoneRow {
  readonly timezone: string;
}

const asPromptRow = (value: unknown): PromptRow => {
  if (typeof value !== 'object' || value === null) throw new Error('invalid prompt row');
  const row = value as Record<string, unknown>;
  const id = requireString(row, 'id');
  const groupId = requireString(row, 'group_id');
  return {
    id,
    group_id: groupId,
    slot_starts_at: requireString(row, 'slot_starts_at'),
    slot_ends_at: requireString(row, 'slot_ends_at'),
    grace_ends_at: requireString(row, 'grace_ends_at'),
    status: requireString(row, 'status'),
  };
};

const asTimezoneRow = (value: unknown): TimezoneRow => {
  if (typeof value !== 'object' || value === null) throw new Error('invalid timezone row');
  return { timezone: requireString(value as Record<string, unknown>, 'timezone') };
};

const requireString = (row: Readonly<Record<string, unknown>>, key: string): string => {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`invalid ${key}`);
  }
  return value;
};

function errorResponse(e: Api.DomainError): Response {
  const { status, body } = Api.toErrorResponse(e);
  return json(body, status);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function must(key: string): string {
  const v = Deno.env.get(key);
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}
