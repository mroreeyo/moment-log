-- Task-9: uploaded_count 자동 증분 트리거 (PRD §14.1).
-- clips INSERT 시 prompts.uploaded_count += 1. status='open' 인 prompt 에만 반영.
-- upsert (ON CONFLICT DO ... UPDATE) 는 INSERT 트리거가 fire 하지 않으므로 중복 증분 자동 방지.

create or replace function increment_uploaded_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update prompts
    set uploaded_count = uploaded_count + 1
    where id = new.prompt_id and status = 'open';
  return new;
end;
$$;

drop trigger if exists clips_after_insert on clips;
create trigger clips_after_insert
  after insert on clips
  for each row execute function increment_uploaded_count();
