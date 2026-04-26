import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { Api } from '@momentlog/domain/index.ts';
import type { InviteAttempt } from '@momentlog/domain/group/index.ts';
import { SystemClock } from '../_shared/adapters/clock/system-clock.ts';
import { ConsoleLogger } from '../_shared/adapters/logger/console-logger.ts';
import type {
  InviteAttemptRepository,
  RecordAttemptInput,
} from '../_shared/ports/driven/invite-attempt.repository.ts';
import type {
  GroupCreateResult,
  GroupRepository,
  GroupRepositoryCreateInput,
  InviteCodeResolution,
} from '../_shared/ports/driven/group.repository.ts';
import { acceptInvite } from '../_shared/use-cases/accept-invite.ts';

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
    return errorResponse({ code: 'UNAUTHORIZED' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: 'VALIDATION_FAILED', details: { fields: ['body'] } });
  }
  const code =
    typeof body === 'object' && body !== null ? ((body as { code?: unknown }).code ?? '') : '';

  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await acceptInvite(
    {
      groupRepo: new SupabaseGroupRepository(adminClient),
      attempts: new SupabaseInviteAttempts(adminClient),
      clock,
    },
    {
      userId: user.id,
      ipAddress,
      code: String(code),
    },
  );

  if (!result.ok) {
    logger.info('invites-accept rejected', { userId: user.id, code: result.error.code });
    return errorResponse(result.error);
  }

  logger.info('invites-accept ok', { userId: user.id, groupId: result.groupId });
  return json(
    {
      groupId: result.groupId,
      groupName: result.groupName,
      memberCount: result.memberCount,
    },
    200,
  );
});

class SupabaseInviteAttempts implements InviteAttemptRepository {
  constructor(private readonly client: SupabaseClient) {}

  async recentAttempts(ipAddress: string, sinceMs: number): Promise<readonly InviteAttempt[]> {
    const since = new Date(Date.now() - sinceMs).toISOString();
    const { data, error } = await this.client
      .from('invite_attempts')
      .select('attempted_at, success')
      .eq('ip_address', ipAddress)
      .gte('attempted_at', since);
    if (error) throw new Error(`recentAttempts failed: ${error.message}`);
    return (data ?? []).map((r: { attempted_at: string; success: boolean }) => ({
      attemptedAt: r.attempted_at,
      success: r.success,
    }));
  }

  async record(input: RecordAttemptInput): Promise<void> {
    const { error } = await this.client.from('invite_attempts').insert({
      invite_code: input.inviteCode,
      ip_address: input.ipAddress,
      success: input.success,
    });
    if (error) throw new Error(`record invite attempt failed: ${error.message}`);
  }
}

class SupabaseGroupRepository implements GroupRepository {
  constructor(private readonly client: SupabaseClient) {}

  createGroupWithOwner(_: GroupRepositoryCreateInput): Promise<GroupCreateResult> {
    return Promise.reject(new Error('not implemented in invites-accept scope'));
  }

  async resolveInviteCode(code: string): Promise<InviteCodeResolution | null> {
    const { data, error } = await this.client
      .from('groups')
      .select('id, invite_expires_at, group_members(count)')
      .eq('invite_code', code)
      .maybeSingle();
    if (error) throw new Error(`resolveInviteCode failed: ${error.message}`);
    if (!data) return null;
    const membersField = data.group_members as unknown as ReadonlyArray<{ count: number }> | null;
    const currentMemberCount = membersField?.[0]?.count ?? 0;
    return {
      groupId: String(data.id),
      inviteExpiresAt: String(data.invite_expires_at),
      currentMemberCount,
    };
  }

  async addMember(input: { groupId: string; userId: string }): Promise<void> {
    const { error } = await this.client.from('group_members').insert({
      group_id: input.groupId,
      user_id: input.userId,
      role: 'member',
    });
    if (error) throw new Error(`addMember failed: ${error.message}`);
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
  if (!v || v.trim() === '') throw new Error(`Missing required env var: ${key}`);
  return v;
}
