import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompileVlogInput } from '../use-cases/compile-vlog.js';
import { compileVlog } from '../use-cases/compile-vlog.js';
import { SystemClock } from '../adapters/clock/system-clock.js';
import { FfmpegVideoProcessor } from '../adapters/ffmpeg/ffmpeg-video-processor.js';
import {
  SupabaseStorageAdapter,
  SupabaseWorkerRepository,
} from '../adapters/supabase/supabase-worker-adapter.js';

export const startServer = (port: number): void => {
  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  server.listen(port, () => console.warn(`momentlog-worker listening on ${port}`));
};

const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  if (req.method === 'GET' && req.url === '/healthz') {
    send(res, 200, { ok: true });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/compile') {
    send(res, 404, { error: 'NOT_FOUND' });
    return;
  }
  const requestId = req.headers['x-request-id']?.toString() ?? randomUUID();
  try {
    const input = await readCompileInput(req);
    const supabase = supabaseEnv();
    const workDir = await mkdtemp(join(tmpdir(), `momentlog-${input.promptId}-`));
    const result = await compileVlog(
      {
        repo: new SupabaseWorkerRepository(supabase),
        storage: new SupabaseStorageAdapter(supabase),
        processor: new FfmpegVideoProcessor({ workDir }),
        clock: new SystemClock(),
        workDir,
        logger: (message, context) =>
          console.warn(JSON.stringify({ requestId, message, ...context })),
      },
      input,
    );
    send(
      res,
      result.status === 'already_processing' ? 202 : result.status === 'done' ? 200 : 500,
      result,
    );
  } catch (error) {
    send(res, 400, {
      error: 'BAD_REQUEST',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

const readCompileInput = async (req: IncomingMessage): Promise<CompileVlogInput> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : new Uint8Array(chunk));
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<CompileVlogInput>;
  if (!body.promptId || !body.groupId) {
    throw new Error('promptId and groupId are required');
  }
  return {
    promptId: body.promptId,
    groupId: body.groupId,
    triggerType: body.triggerType === 'retry' ? 'retry' : 'hourly-tick',
  };
};

const send = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const supabaseEnv = (): { readonly supabaseUrl: string; readonly serviceRoleKey: string } => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return { supabaseUrl, serviceRoleKey };
};
