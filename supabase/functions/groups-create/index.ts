import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { Api } from '@momentlog/domain/index.ts';
import { SystemClock } from '../_shared/adapters/clock/system-clock.ts';
import { ConsoleLogger } from '../_shared/adapters/logger/console-logger.ts';
import type {
  GroupCreateResult,
  GroupRepository,
  GroupRepositoryCreateInput,
  InviteCodeResolution,
} from '../_shared/ports/driven/group.repository.ts';
import type { RandomBytesPort } from '../_shared/ports/driven/random-bytes.ts';
import { createGroup } from '../_shared/use-cases/create-group.ts';

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
  if (typeof body !== 'object' || body === null) {
    return errorResponse({ code: 'VALIDATION_FAILED', details: { fields: ['body'] } });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await createGroup(
    {
      repo: new SupabaseGroupRepository(adminClient),
      random: new WebCryptoRandomBytes(),
      clock,
    },
    { userId: user.id, body: body as Parameters<typeof createGroup>[1]['body'] },
  );

  if (!result.ok) {
    logger.info('groups-create rejected', { userId: user.id, code: result.error.code });
    return errorResponse(result.error);
  }

  logger.info('groups-create ok', { userId: user.id, groupId: result.groupId });
  return json(
    {
      groupId: result.groupId,
      inviteCode: result.inviteCode,
      inviteExpiresAt: result.inviteExpiresAt,
    },
    201,
  );
});

class WebCryptoRandomBytes implements RandomBytesPort {
  bytes(length: number): Uint8Array {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    return buf;
  }
}

class SupabaseGroupRepository implements GroupRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createGroupWithOwner(input: GroupRepositoryCreateInput): Promise<GroupCreateResult> {
    const { data: groupRow, error: groupErr } = await this.client
      .from('groups')
      .insert({
        name: input.name,
        owner_id: input.ownerId,
        timezone: input.timezone,
        active_hour_start: input.activeHourStart,
        active_hour_end: input.activeHourEnd,
        invite_code: input.inviteCode,
        invite_expires_at: input.inviteExpiresAt,
      })
      .select('id, invite_code, invite_expires_at')
      .single();

    if (groupErr) {
      if (groupErr.code === '23505') {
        return { ok: false, reason: 'INVITE_CODE_CONFLICT' };
      }
      throw new Error(`createGroup failed: ${groupErr.message}`);
    }
    if (!groupRow) {
      throw new Error('createGroup returned no row');
    }

    const { error: memberErr } = await this.client.from('group_members').insert({
      group_id: groupRow.id,
      user_id: input.ownerId,
      role: 'owner',
    });
    if (memberErr) {
      throw new Error(`addOwnerMember failed: ${memberErr.message}`);
    }

    return {
      ok: true,
      value: {
        groupId: String(groupRow.id),
        inviteCode: String(groupRow.invite_code),
        inviteExpiresAt: String(groupRow.invite_expires_at),
      },
    };
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
    if (error) {
      throw new Error(`addMember failed: ${error.message}`);
    }
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
