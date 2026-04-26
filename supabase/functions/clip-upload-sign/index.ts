import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Api } from '@momentlog/domain/index.ts';
import { SystemClock } from '../_shared/adapters/clock/system-clock.ts';
import { ConsoleLogger } from '../_shared/adapters/logger/console-logger.ts';
import type { StorageSigner, SignedUploadUrl } from '../_shared/ports/driven/storage-signer.ts';
import type {
  MembershipReader,
  PromptLookupResult,
} from '../_shared/ports/driven/membership-reader.ts';
import { signClipUpload } from '../_shared/use-cases/sign-clip-upload.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const logger = new ConsoleLogger();
const clock = new SystemClock();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
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
    return errorResponse({
      code: 'VALIDATION_FAILED',
      details: { fields: ['body'] },
    });
  }
  if (typeof body !== 'object' || body === null) {
    return errorResponse({ code: 'VALIDATION_FAILED', details: { fields: ['body'] } });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const deps = {
    membership: new SupabaseMembershipReader(adminClient),
    signer: new SupabaseStorageSigner(adminClient),
    clock,
  };

  const input = {
    userId: user.id,
    body: body as Parameters<typeof signClipUpload>[1]['body'],
  };

  const result = await signClipUpload(deps, input);
  if (!result.ok) {
    logger.info('sign-clip-upload rejected', {
      userId: user.id,
      code: result.error.code,
    });
    return errorResponse(result.error);
  }

  logger.info('sign-clip-upload ok', {
    userId: user.id,
    promptId: (input.body as { promptId?: string }).promptId,
  });
  return json(
    {
      uploadUrl: result.uploadUrl,
      expiresAt: result.expiresAt,
      storagePath: result.storagePath,
    },
    200,
  );
});

class SupabaseStorageSigner implements StorageSigner {
  constructor(private readonly client: SupabaseClient) {}

  async createSignedUploadUrl(
    bucket: string,
    objectKey: string,
    options: { readonly expiresInSec: number; readonly upsert: boolean },
  ): Promise<SignedUploadUrl> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUploadUrl(objectKey, { upsert: options.upsert });
    if (error || !data) {
      throw new Error(`createSignedUploadUrl failed: ${error?.message ?? 'unknown'}`);
    }
    const expiresAt = new Date(Date.now() + options.expiresInSec * 1000).toISOString();
    return { uploadUrl: data.signedUrl, expiresAt };
  }
}

class SupabaseMembershipReader implements MembershipReader {
  constructor(private readonly client: SupabaseClient) {}

  async lookupPrompt(promptId: string): Promise<PromptLookupResult> {
    const { data, error } = await this.client
      .from('prompts')
      .select('group_id, status')
      .eq('id', promptId)
      .maybeSingle();
    if (error) {
      throw new Error(`lookupPrompt failed: ${error.message}`);
    }
    if (!data) {
      return { found: false };
    }
    const status = data.status === 'closed' ? 'closed' : 'open';
    return { found: true, groupId: String(data.group_id), status };
  }

  async isMember(userId: string, groupId: string): Promise<boolean> {
    const { count, error } = await this.client
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('group_id', groupId);
    if (error) {
      throw new Error(`isMember failed: ${error.message}`);
    }
    return (count ?? 0) > 0;
  }
}

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
