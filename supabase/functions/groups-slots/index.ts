import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Api } from '@momentlog/domain/index.ts';
import { SystemClock } from '../_shared/adapters/clock/system-clock.ts';
import { ConsoleLogger } from '../_shared/adapters/logger/console-logger.ts';
import {
  listGroupSlots,
  type GroupSlotsClip,
  type GroupSlotsGroup,
  type GroupSlotsPrompt,
  type GroupSlotsRepository,
  type GroupSlotsVlog,
} from '../_shared/use-cases/group-slots.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const logger = new ConsoleLogger();
const clock = new SystemClock();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'GET') {
    return json({ error: 'METHOD_NOT_ALLOWED', message: 'GET only', details: {} }, 405);
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

  const url = new URL(req.url);
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await listGroupSlots(
    { repo: new SupabaseGroupSlotsRepository(adminClient), clock },
    {
      userId: user.id,
      query: {
        groupId: parseGroupId(url),
        date: url.searchParams.get('date') ?? '',
      },
    },
  );

  if (!result.ok) {
    logger.info('groups-slots rejected', { code: result.error.code });
    return errorResponse(result.error);
  }

  logger.info('groups-slots ok', { userId: user.id, groupId: result.groupId, date: result.date });
  return json({ groupId: result.groupId, date: result.date, slots: result.slots }, 200);
});

class SupabaseGroupSlotsRepository implements GroupSlotsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findGroup(groupId: string): Promise<GroupSlotsGroup | null> {
    const { data, error } = await this.client
      .from('groups')
      .select('id, timezone')
      .eq('id', groupId)
      .maybeSingle();
    if (error) throw new Error(`findGroup failed: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return { id: requireString(row, 'id'), timezone: requireString(row, 'timezone') };
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

  async listPromptsInWindow(input: {
    readonly groupId: string;
    readonly windowStart: string;
    readonly windowEnd: string;
  }): Promise<readonly GroupSlotsPrompt[]> {
    const { data, error } = await this.client
      .from('prompts')
      .select('id, slot_starts_at, status')
      .eq('group_id', input.groupId)
      .gte('slot_starts_at', input.windowStart)
      .lt('slot_starts_at', input.windowEnd)
      .order('slot_starts_at', { ascending: true });
    if (error) throw new Error(`listPromptsInWindow failed: ${error.message}`);
    return (data ?? []).map((value: unknown): GroupSlotsPrompt => {
      const row = value as Record<string, unknown>;
      const status = requireString(row, 'status');
      return {
        id: requireString(row, 'id'),
        slotStartsAt: requireString(row, 'slot_starts_at'),
        status: status === 'closed' ? 'closed' : 'open',
      };
    });
  }

  async listVlogs(promptIds: readonly string[]): Promise<readonly GroupSlotsVlog[]> {
    if (promptIds.length === 0) return [];
    const { data, error } = await this.client
      .from('vlogs')
      .select('prompt_id, status, outcome')
      .in('prompt_id', [...promptIds]);
    if (error) throw new Error(`listVlogs failed: ${error.message}`);
    return (data ?? []).map((value: unknown): GroupSlotsVlog => {
      const row = value as Record<string, unknown>;
      return {
        promptId: requireString(row, 'prompt_id'),
        status: toVlogStatus(requireString(row, 'status')),
        outcome: toVlogOutcome(requireString(row, 'outcome')),
      };
    });
  }

  async listClips(promptIds: readonly string[]): Promise<readonly GroupSlotsClip[]> {
    if (promptIds.length === 0) return [];
    const { data, error } = await this.client
      .from('clips')
      .select('prompt_id, user_id, raw_delete_at')
      .in('prompt_id', [...promptIds]);
    if (error) throw new Error(`listClips failed: ${error.message}`);
    return (data ?? []).map((value: unknown): GroupSlotsClip => {
      const row = value as Record<string, unknown>;
      return {
        promptId: requireString(row, 'prompt_id'),
        userId: requireString(row, 'user_id'),
        rawDeleteAt: requireString(row, 'raw_delete_at'),
      };
    });
  }
}

const parseGroupId = (url: URL): string => {
  const fromQuery = url.searchParams.get('groupId');
  if (fromQuery) return fromQuery;
  const parts = url.pathname.split('/').filter(Boolean);
  const functionIndex = parts.lastIndexOf('groups-slots');
  if (functionIndex >= 0 && parts[functionIndex + 1]) return parts[functionIndex + 1]!;
  const groupsIndex = parts.lastIndexOf('groups');
  if (groupsIndex >= 0 && parts[groupsIndex + 2] === 'slots') return parts[groupsIndex + 1] ?? '';
  return '';
};

const toVlogStatus = (value: string): GroupSlotsVlog['status'] => {
  switch (value) {
    case 'pending':
    case 'processing':
    case 'done':
    case 'failed':
    case 'skipped':
      return value;
    default:
      throw new Error(`invalid vlog status: ${value}`);
  }
};

const toVlogOutcome = (value: string): GroupSlotsVlog['outcome'] => {
  switch (value) {
    case 'empty':
    case 'skipped_single':
    case 'compiled':
    case 'failed':
    case 'expired':
      return value;
    default:
      throw new Error(`invalid vlog outcome: ${value}`);
  }
};

const requireString = (row: Readonly<Record<string, unknown>>, key: string): string => {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`invalid ${key}`);
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
  if (!v || v.trim() === '') throw new Error(`Missing required env var: ${key}`);
  return v;
}
