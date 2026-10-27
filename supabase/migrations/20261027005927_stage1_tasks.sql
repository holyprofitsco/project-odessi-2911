-- Stage 1: statuses and tasks.
alter table public.workspaces add column priorities_on boolean not null default true;

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  area text not null default 'task' check (area in ('task', 'project', 'content', 'client')),
  name text not null,
  color_bg text not null default '#E8EEF2',
  color_text text not null default '#3F5463',
  sort_order integer not null default 0,
  -- open = a normal step, waiting = shows the Waiting on box, done / canceled = finished
  behavior text not null default 'open' check (behavior in ('open', 'waiting', 'done', 'canceled')),
  built_in boolean not null default false,
  created_at timestamptz not null default now()
);
create index statuses_workspace_id_idx on public.statuses (workspace_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null default '',
  status_id uuid not null references public.statuses (id),
  priority text not null default 'none' check (priority in ('high', 'medium', 'low', 'none')),
  due_date date,
  due_time time,
  notes text not null default '',
  parent_task_id uuid references public.tasks (id) on delete cascade,
  repeat_rule jsonb,
  repeat_from text check (repeat_from in ('due', 'done')),
  waiting_on_text text not null default '',
  waiting_since date,
  waiting_check_in date,
  order_in_group double precision not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_workspace_id_idx on public.tasks (workspace_id);
create index tasks_status_id_idx on public.tasks (status_id);
create index tasks_parent_task_id_idx on public.tasks (parent_task_id);

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Subtasks go one level deep only.
create function public.check_subtask_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_task_id is not null and exists (
    select 1 from public.tasks p where p.id = new.parent_task_id and p.parent_task_id is not null
  ) then
    raise exception 'Subtasks can only go one level deep';
  end if;
  return new;
end;
$$;
create trigger tasks_subtask_depth before insert or update of parent_task_id on public.tasks
  for each row execute function public.check_subtask_depth();

alter table public.statuses enable row level security;
alter table public.tasks enable row level security;

create policy "Members manage their statuses" on public.statuses
  for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their tasks" on public.tasks
  for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- Every workspace starts with the task statuses from the design system.
create function private.seed_task_statuses(ws uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.statuses (workspace_id, area, name, color_bg, color_text, sort_order, behavior, built_in) values
    (ws, 'task', 'To do', '#E8EEF2', '#3F5463', 0, 'open', false),
    (ws, 'task', 'In progress', '#FBEFC4', '#6B5310', 1, 'open', false),
    (ws, 'task', 'Waiting', '#F9DEC6', '#8A4A1F', 2, 'waiting', true),
    (ws, 'task', 'Done', '#F0F0EE', '#666666', 3, 'done', true),
    (ws, 'task', 'Canceled', '#F0F0EE', '#666666', 4, 'canceled', true);
$$;

create function private.seed_statuses_on_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_task_statuses(new.id);
  return new;
end;
$$;
create trigger workspaces_seed_statuses after insert on public.workspaces
  for each row execute function private.seed_statuses_on_new_workspace();

-- Existing workspaces that have at least one member.
select private.seed_task_statuses(w.id)
from public.workspaces w
where exists (select 1 from public.workspace_members m where m.workspace_id = w.id);
