import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Api } from '@momentlog/domain/index.ts';
import { SystemClock } from '../_shared/adapters/clock/system-clock.ts';
import { ConsoleLogger } from '../_shared/adapters/logger/console-logger.ts';
import {
  runHourlyTick,
  type CronRunCounters,
  type HourlyTickRepository,
  type SchedulerGroup,
  type SchedulerMember,
  type SchedulerPrompt,
  type WorkerDispatchInput,
  type WorkerDispatcher,
} from '../_shared/use-cases/hourly-tick.ts';

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

  const auth = await verifyCronAuthorization(req);
  if (!auth.ok) {
    logger.warn('cron-hourly-tick auth failed', { reason: auth.reason });
    return errorResponse({ code: 'UNAUTHORIZED' });
  }

  const serviceKey = must('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = must('SUPABASE_URL');
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await runHourlyTick({
      repo: new SupabaseHourlyTickRepository(client),
      worker: new HttpWorkerDispatcher(),
      clock,
    });
    logger.info('cron-hourly-tick ok', { ...result });
    return json(result, 200);
  } catch (error) {
    logger.error('cron-hourly-tick failed', {
      error: error instanceof Error ? error.message : error,
    });
    return json({ error: 'INTERNAL_ERROR', message: 'hourly tick failed', details: {} }, 500);
  }
});

class SupabaseHourlyTickRepository implements HourlyTickRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createCronRun(jobName: 'hourly-tick'): Promise<string> {
    const { data, error } = await this.client
      .from('cron_runs')
      .insert({ job_name: jobName, status: 'running' })
      .select('id')
      .single();
    if (error || !data) throw new Error(`createCronRun failed: ${error?.message ?? 'unknown'}`);
    return String(data.id);
  }

  async completeCronRun(cronRunId: string, counters: CronRunCounters): Promise<void> {
    const { error } = await this.client
      .from('cron_runs')
      .update({
        completed_at: new Date().toISOString(),
        status: 'success',
        prompts_created: counters.promptsCreated,
        prompts_closed: counters.promptsClosed,
        pushes_attempted: counters.pushesAttempted,
        pushes_succeeded: counters.pushesSucceeded,
        workers_enqueued: counters.workersEnqueued,
      })
      .eq('id', cronRunId);
    if (error) throw new Error(`completeCronRun failed: ${error.message}`);
  }

  async failCronRun(
    cronRunId: string,
    errorMessage: string,
    counters: CronRunCounters,
  ): Promise<void> {
    const { error } = await this.client
      .from('cron_runs')
      .update({
        completed_at: new Date().toISOString(),
        status: 'failed',
        error_message: errorMessage,
        prompts_created: counters.promptsCreated,
        prompts_closed: counters.promptsClosed,
        pushes_attempted: counters.pushesAttempted,
        pushes_succeeded: counters.pushesSucceeded,
        workers_enqueued: counters.workersEnqueued,
      })
      .eq('id', cronRunId);
    if (error) throw new Error(`failCronRun failed: ${error.message}`);
  }

  async listGroups(): Promise<readonly SchedulerGroup[]> {
    const { data, error } = await this.client
      .from('groups')
      .select('id, timezone, active_hour_start, active_hour_end');
    if (error) throw new Error(`listGroups failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      timezone: String(row.timezone),
      activeHourStart: Number(row.active_hour_start),
      activeHourEnd: Number(row.active_hour_end),
    }));
  }

  async countMembers(groupId: string): Promise<number> {
    const { count, error } = await this.client
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId);
    if (error) throw new Error(`countMembers failed: ${error.message}`);
    return count ?? 0;
  }

  async createPromptIfMissing(input: {
    readonly groupId: string;
    readonly slotStartsAt: string;
    readonly slotEndsAt: string;
    readonly graceEndsAt: string;
    readonly expectedCount: number;
  }): Promise<boolean> {
    const { data, error } = await this.client
      .from('prompts')
      .upsert(
        {
          group_id: input.groupId,
          slot_starts_at: input.slotStartsAt,
          slot_ends_at: input.slotEndsAt,
          grace_ends_at: input.graceEndsAt,
          expected_count: input.expectedCount,
        },
        { onConflict: 'group_id,slot_starts_at', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw new Error(`createPromptIfMissing failed: ${error.message}`);
    return (data ?? []).length > 0;
  }

  async listClosablePrompts(now: string): Promise<readonly SchedulerPrompt[]> {
    const { data, error } = await this.client
      .from('prompts')
      .select('id, group_id, slot_starts_at, uploaded_count, expected_count')
      .eq('status', 'open')
      .lt('grace_ends_at', now);
    if (error) throw new Error(`listClosablePrompts failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      groupId: String(row.group_id),
      slotStartsAt: String(row.slot_starts_at),
      uploadedCount: Number(row.uploaded_count),
      expectedCount: Number(row.expected_count),
    }));
  }

  async closePrompt(promptId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('prompts')
      .update({ status: 'closed' })
      .eq('id', promptId)
      .eq('status', 'open')
      .select('id');
    if (error) throw new Error(`closePrompt failed: ${error.message}`);
    return (data ?? []).length > 0;
  }

  async createVlogForClosedPrompt(input: {
    readonly promptId: string;
    readonly groupId: string;
    readonly clipCount: number;
    readonly status: 'pending' | 'skipped';
    readonly outcome: 'empty' | 'skipped_single';
    readonly triggerType: 'hourly-tick' | null;
    readonly processingStartedAt: string | null;
  }): Promise<boolean> {
    const { data, error } = await this.client
      .from('vlogs')
      .upsert(
        {
          prompt_id: input.promptId,
          group_id: input.groupId,
          clip_count: input.clipCount,
          status: input.status,
          outcome: input.outcome,
          trigger_type: input.triggerType,
          processing_started_at: input.processingStartedAt,
        },
        { onConflict: 'prompt_id', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw new Error(`createVlogForClosedPrompt failed: ${error.message}`);
    return (data ?? []).length > 0;
  }

  async listMembers(groupId: string): Promise<readonly SchedulerMember[]> {
    const { data, error } = await this.client
      .from('group_members')
      .select('user_id, consecutive_missed_count')
      .eq('group_id', groupId);
    if (error) throw new Error(`listMembers failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      userId: String(row.user_id),
      consecutiveMissedCount: Number(row.consecutive_missed_count),
    }));
  }

  async hasClip(promptId: string, userId: string): Promise<boolean> {
    const { count, error } = await this.client
      .from('clips')
      .select('*', { count: 'exact', head: true })
      .eq('prompt_id', promptId)
      .eq('user_id', userId);
    if (error) throw new Error(`hasClip failed: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async updateMemberMissState(input: {
    readonly groupId: string;
    readonly userId: string;
    readonly consecutiveMissedCount: number;
    readonly mutedUntil: string | null;
  }): Promise<void> {
    const { error } = await this.client
      .from('group_members')
      .update({
        consecutive_missed_count: input.consecutiveMissedCount,
        muted_until: input.mutedUntil,
      })
      .eq('group_id', input.groupId)
      .eq('user_id', input.userId);
    if (error) throw new Error(`updateMemberMissState failed: ${error.message}`);
  }

  async resetExpiredMutes(now: string): Promise<void> {
    const { error } = await this.client
      .from('group_members')
      .update({ muted_until: null, consecutive_missed_count: 0 })
      .lt('muted_until', now);
    if (error) throw new Error(`resetExpiredMutes failed: ${error.message}`);
  }

  async reapTimedOutProcessingVlogs(threshold: string): Promise<number> {
    const { data, error } = await this.client
      .from('vlogs')
      .update({ status: 'failed', outcome: 'failed', error_message: 'processing_timeout' })
      .eq('status', 'processing')
      .lt('processing_started_at', threshold)
      .select('id');
    if (error) throw new Error(`reapTimedOutProcessingVlogs failed: ${error.message}`);
    return (data ?? []).length;
  }
}

class HttpWorkerDispatcher implements WorkerDispatcher {
  async dispatchCompile(input: WorkerDispatchInput): Promise<boolean> {
    const url = Deno.env.get('CLOUD_RUN_COMPILE_URL');
    if (!url) return false;
    const token = Deno.env.get('CLOUD_RUN_ID_TOKEN');
    if (!token) throw new Error('Missing CLOUD_RUN_ID_TOKEN for compile dispatch');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`compile dispatch failed: ${response.status}`);
    return true;
  }
}

interface AuthOk {
  readonly ok: true;
}

interface AuthFail {
  readonly ok: false;
  readonly reason: string;
}

async function verifyCronAuthorization(req: Request): Promise<AuthOk | AuthFail> {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return { ok: false, reason: 'missing bearer' };
  const token = header.slice('bearer '.length).trim();
  if (Deno.env.get('CRON_ALLOW_LOCAL_BEARER') === token && token.length > 0) return { ok: true };
  return await verifyGoogleOidc(token, {
    audience: Deno.env.get('CRON_OIDC_AUDIENCE') ?? new URL(req.url).toString(),
    email: must('CRON_INVOKER_EMAIL'),
  });
}

async function verifyGoogleOidc(
  token: string,
  expected: { readonly audience: string; readonly email: string },
): Promise<AuthOk | AuthFail> {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { ok: false, reason: 'malformed jwt' };
  }
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];
  const header = parseJwtJson(rawHeader) as { readonly kid?: unknown; readonly alg?: unknown };
  const payload = parseJwtJson(rawPayload) as {
    readonly iss?: unknown;
    readonly aud?: unknown;
    readonly email?: unknown;
    readonly exp?: unknown;
    readonly iat?: unknown;
  };
  if (header.alg !== 'RS256') return { ok: false, reason: 'unsupported alg' };
  if (typeof header.kid !== 'string') return { ok: false, reason: 'missing kid' };
  if (payload.iss !== 'https://accounts.google.com') return { ok: false, reason: 'bad issuer' };
  if (payload.aud !== expected.audience) return { ok: false, reason: 'bad audience' };
  if (payload.email !== expected.email) return { ok: false, reason: 'bad email' };
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec)
    return { ok: false, reason: 'expired' };
  if (typeof payload.iat === 'number' && payload.iat > nowSec + 60) {
    return { ok: false, reason: 'issued in future' };
  }
  const jwks = await fetchGoogleJwks();
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'unknown kid' };
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecode(rawSignature),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  return valid ? { ok: true } : { ok: false, reason: 'bad signature' };
}

interface GoogleJwks {
  readonly keys: Array<JsonWebKey & { readonly kid?: string }>;
}

async function fetchGoogleJwks(): Promise<GoogleJwks> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!response.ok) throw new Error(`Google JWKS fetch failed: ${response.status}`);
  return (await response.json()) as GoogleJwks;
}

function parseJwtJson(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as unknown;
}

function base64UrlDecode(value: string): ArrayBuffer {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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
  const value = Deno.env.get(key);
  if (!value || value.trim() === '') throw new Error(`Missing required env var: ${key}`);
  return value;
}
