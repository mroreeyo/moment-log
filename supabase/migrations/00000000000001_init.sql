-- Task-7: 초기 스키마 (PRD v1.1-final 부록 A)
-- 8개 테이블 + 9개 인덱스 + 3개 CHECK 제약. 플랜 GR-10: 부록 A 외 컬럼 추가 금지.

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users,
  timezone text not null default 'Asia/Seoul',
  active_hour_start smallint not null default 9,
  active_hour_end smallint not null default 22,
  invite_code text unique not null,
  invite_expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table if not exists group_members (
  group_id uuid not null references groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member',
  consecutive_missed_count int not null default 0,
  muted_until timestamptz,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  slot_starts_at timestamptz not null,
  slot_ends_at timestamptz not null,
  grace_ends_at timestamptz not null,
  expected_count int not null,
  uploaded_count int not null default 0,
  status text not null default 'open',
  created_at timestamptz default now(),
  unique (group_id, slot_starts_at)
);

create table if not exists clips (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts on delete cascade,
  group_id uuid not null references groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  storage_path text not null,
  recording_started_at timestamptz not null,
  upload_completed_at timestamptz not null default now(),
  raw_delete_at timestamptz not null,
  duration_sec int not null default 3,
  file_size_bytes bigint not null,
  status text not null default 'uploaded',
  is_late boolean not null default false,
  created_at timestamptz default now(),
  unique (prompt_id, user_id)
);
create index if not exists clips_raw_delete_at_idx on clips (raw_delete_at);

create table if not exists vlogs (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null unique references prompts on delete cascade,
  group_id uuid not null references groups on delete cascade,
  storage_path text,
  status text not null default 'pending',
  outcome text not null default 'empty',
  trigger_type text,
  clip_count int not null default 0,
  duration_sec int,
  error_message text,
  error_stage text,
  retry_count int not null default 0,
  last_retry_at timestamptz,
  processing_started_at timestamptz,
  created_at timestamptz default now(),
  completed_at timestamptz
);
create index if not exists vlogs_status_processing_idx
  on vlogs (processing_started_at) where status = 'processing';

create table if not exists invite_attempts (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null,
  ip_address text not null,
  success boolean not null default false,
  attempted_at timestamptz default now()
);
create index if not exists invite_attempts_ip_idx
  on invite_attempts (ip_address, attempted_at);

create table if not exists push_tokens (
  user_id uuid not null references auth.users on delete cascade,
  expo_push_token text not null,
  platform text not null,
  last_seen_at timestamptz not null default now(),
  invalidated_at timestamptz,
  updated_at timestamptz default now(),
  primary key (user_id, expo_push_token)
);

create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  prompts_created int not null default 0,
  prompts_closed int not null default 0,
  pushes_attempted int not null default 0,
  pushes_succeeded int not null default 0,
  workers_enqueued int not null default 0,
  clips_deleted int not null default 0,
  error_message text
);
create index if not exists cron_runs_job_started_idx on cron_runs (job_name, started_at desc);

-- CHECK 제약 (플랜 task-7 에서 명시적으로 요구된 3개)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vlogs_status_check') then
    alter table vlogs add constraint vlogs_status_check
      check (status in ('pending','processing','done','failed','skipped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vlogs_outcome_check') then
    alter table vlogs add constraint vlogs_outcome_check
      check (outcome in ('empty','skipped_single','compiled','failed','expired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prompts_status_check') then
    alter table prompts add constraint prompts_status_check
      check (status in ('open','closed'));
  end if;
end $$;
