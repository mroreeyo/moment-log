import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Api } from '@momentlog/domain/index.ts';
import { ConsoleLogger } from '../_shared/adapters/logger/console-logger.ts';
import {
  getSlotUrls,
  type SlotUrlsClip,
  type SlotUrlsProfile,
  type SlotUrlsPrompt,
  type SlotUrlsRepository,
  type SlotUrlsVlog,
  type StorageSignedUrlReader,
} from '../_shared/use-cases/slot-urls.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const logger = new ConsoleLogger();

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
  const result = await getSlotUrls(
    {
      repo: new SupabaseSlotUrlsRepository(adminClient),
      signer: new SupabaseStorageSignedUrlReader(adminClient),
    },
    { userId: user.id, promptId: parsePromptId(url) },
  );

  if (!result.ok) {
    logger.info('slots-urls rejected', { code: result.error.code });
    return errorResponse(result.error);
  }

  logger.info('slots-urls ok', { userId: user.id, promptId: result.promptId });
  return json({ promptId: result.promptId, vlogUrl: result.vlogUrl, clips: result.clips }, 200);
});

class SupabaseSlotUrlsRepository implements SlotUrlsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findPrompt(promptId: string): Promise<SlotUrlsPrompt | null> {
    const { data, error } = await this.client
      .from('prompts')
      .select('id, group_id')
      .eq('id', promptId)
      .maybeSingle();
    if (error) throw new Error(`findPrompt failed: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return { id: requireString(row, 'id'), groupId: requireString(row, 'group_id') };
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

  async findVlog(promptId: string): Promise<SlotUrlsVlog | null> {
    const { data, error } = await this.client
      .from('vlogs')
      .select('storage_path')
      .eq('prompt_id', promptId)
      .maybeSingle();
    if (error) throw new Error(`findVlog failed: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return { storagePath: optionalString(row, 'storage_path') };
  }

  async listClips(promptId: string): Promise<readonly SlotUrlsClip[]> {
    const { data, error } = await this.client
      .from('clips')
      .select('user_id, storage_path')
      .eq('prompt_id', promptId)
      .order('upload_completed_at', { ascending: true });
    if (error) throw new Error(`listClips failed: ${error.message}`);
    return (data ?? []).map((value: unknown): SlotUrlsClip => {
      const row = value as Record<string, unknown>;
      return {
        userId: requireString(row, 'user_id'),
        storagePath: requireString(row, 'storage_path'),
      };
    });
  }

  async listProfiles(userIds: readonly string[]): Promise<readonly SlotUrlsProfile[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await this.client
      .from('profiles')
      .select('id, display_name')
      .in('id', [...userIds]);
    if (error) throw new Error(`listProfiles failed: ${error.message}`);
    return (data ?? []).map((value: unknown): SlotUrlsProfile => {
      const row = value as Record<string, unknown>;
      return { userId: requireString(row, 'id'), displayName: optionalString(row, 'display_name') };
    });
  }
}

class SupabaseStorageSignedUrlReader implements StorageSignedUrlReader {
  constructor(private readonly client: SupabaseClient) {}

  async createSignedUrl(bucket: string, objectKey: string, expiresInSec: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(objectKey, expiresInSec);
    if (error || !data) throw new Error(`createSignedUrl failed: ${error?.message ?? 'unknown'}`);
    return data.signedUrl;
  }
}

const parsePromptId = (url: URL): string => {
  const fromQuery = url.searchParams.get('promptId');
  if (fromQuery) return fromQuery;
  const parts = url.pathname.split('/').filter(Boolean);
  const functionIndex = parts.lastIndexOf('slots-urls');
  if (functionIndex >= 0 && parts[functionIndex + 1]) return parts[functionIndex + 1]!;
  const slotsIndex = parts.lastIndexOf('slots');
  if (slotsIndex >= 0 && parts[slotsIndex + 2] === 'urls') return parts[slotsIndex + 1] ?? '';
  return '';
};

const requireString = (row: Readonly<Record<string, unknown>>, key: string): string => {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`invalid ${key}`);
  return value;
};

const optionalString = (row: Readonly<Record<string, unknown>>, key: string): string | null => {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
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
