-- Task-10: Storage 버킷 3종 (PRD §20.1). 모두 private + size/MIME 제한.
-- Canonical paths: raw/{group_id}/{prompt_id}/{user_id}.mp4, vlogs/{group_id}/{prompt_id}/output.mp4, tmp/{group_id}/{prompt_id}/*

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('raw',   'raw',   false, 10485760,  array['video/mp4', 'video/quicktime']),
  ('vlogs', 'vlogs', false, 52428800,  array['video/mp4']),
  ('tmp',   'tmp',   false, 52428800,  array['video/mp4', 'application/octet-stream'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects 는 service_role 전용으로 둔다. 일반 앱은 Edge Function 이 발급한 signed URL 로만 접근한다 (PRD §20.1).
-- Public 이나 policy 를 열지 않는 것이 의도된 설계.
