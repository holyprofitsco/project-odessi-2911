-- Stage 0: workspaces, members, and profiles.
-- Every row in Odessi belongs to a workspace. A person can see a row only if they are a member of its workspace.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My workspace',
  solo_mode boolean not null default true,
  areas_on jsonb not null default '{"content": true, "projects": true, "clients": true, "docs": true}',
  time_zone text not null default 'UTC',
  week_start text not null default 'monday' check (week_start in ('sunday', 'monday')),
  weekend_rule text not null default 'ask' check (weekend_rule in ('ask', 'friday', 'monday')),
  accent_color text not null default '#8C6A80',
  morning_ends time not null default '12:00',
  afternoon_ends time not null default '17:00',
  default_due text not null default 'none' check (default_due in ('none', 'today')),
  repeat_from text not null default 'due' check (repeat_from in ('due', 'done')),
  comments_on boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members (user_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  business_name text not null default '',
  title text not null default '',
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_workspace_id_idx on public.profiles (workspace_id);

-- Membership check used by every policy. Lives in a private schema so it is not callable through the API.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;
revoke execute on function private.is_workspace_member(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles enable row level security;

create policy "Members can see their workspace" on public.workspaces
  for select to authenticated using (private.is_workspace_member(id));
create policy "Members can update their workspace" on public.workspaces
  for update to authenticated using (private.is_workspace_member(id)) with check (private.is_workspace_member(id));

create policy "Members can see who is in their workspace" on public.workspace_members
  for select to authenticated using (private.is_workspace_member(workspace_id));

create policy "Members can see profiles in their workspace" on public.profiles
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy "People can update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Keep updated_at fresh.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A new sign-up gets their own workspace and profile.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.workspaces (time_zone)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'time_zone', ''), 'UTC'))
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  insert into public.profiles (id, workspace_id, email, first_name)
  values (new.id, new_workspace_id, new.email, coalesce(new.raw_user_meta_data ->> 'first_name', ''));

  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
