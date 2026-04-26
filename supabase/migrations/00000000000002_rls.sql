-- Task-8: RLS 정책 (PRD §20.2). 모든 7개 테이블에 RLS 활성화 + 최소 권한 정책.
-- service_role 키는 RLS 를 기본 bypass 하므로 별도 policy 불필요.

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table prompts enable row level security;
alter table clips enable row level security;
alter table vlogs enable row level security;
alter table push_tokens enable row level security;
alter table invite_attempts enable row level security;

-- profiles: 인증 유저는 모두 읽기, 본인만 update
drop policy if exists profiles_select_authenticated on profiles;
create policy profiles_select_authenticated on profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- groups: 자기가 속한 그룹만 읽기
drop policy if exists groups_select_member on groups;
create policy groups_select_member on groups
  for select to authenticated
  using (
    id in (
      select gm.group_id from group_members gm
      where gm.user_id = (select auth.uid())
    )
  );

-- group_members: 같은 그룹 구성원만 읽기. insert/update/delete 는 service_role.
drop policy if exists group_members_select_same_group on group_members;
create policy group_members_select_same_group on group_members
  for select to authenticated
  using (
    group_id in (
      select gm.group_id from group_members gm
      where gm.user_id = (select auth.uid())
    )
  );

-- prompts: 그룹 멤버만 읽기, insert/update 는 service_role
drop policy if exists prompts_select_member on prompts;
create policy prompts_select_member on prompts
  for select to authenticated
  using (
    group_id in (
      select gm.group_id from group_members gm
      where gm.user_id = (select auth.uid())
    )
  );

-- clips: 같은 그룹 멤버만 읽기, insert 는 본인 user_id 만
drop policy if exists clips_select_member on clips;
create policy clips_select_member on clips
  for select to authenticated
  using (
    group_id in (
      select gm.group_id from group_members gm
      where gm.user_id = (select auth.uid())
    )
  );

drop policy if exists clips_insert_self on clips;
create policy clips_insert_self on clips
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- vlogs: 그룹 멤버만 읽기, insert/update 는 service_role
drop policy if exists vlogs_select_member on vlogs;
create policy vlogs_select_member on vlogs
  for select to authenticated
  using (
    group_id in (
      select gm.group_id from group_members gm
      where gm.user_id = (select auth.uid())
    )
  );

-- push_tokens: 본인만 전체 CRUD
drop policy if exists push_tokens_all_self on push_tokens;
create policy push_tokens_all_self on push_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- invite_attempts: 앱(authenticated/anon) 접근 전면 차단. service_role 전용.
-- ENABLE ROW LEVEL SECURITY 만으로 policy 없으면 0 row 반환. 명시적 DENY 는 불필요.
