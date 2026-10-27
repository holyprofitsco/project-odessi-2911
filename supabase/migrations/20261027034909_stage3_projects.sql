-- Stage 3: projects, phases, milestones, dependencies, task sets, and project templates.
alter table public.workspaces add column project_layout text not null default 'phases' check (project_layout in ('phases', 'list', 'milestones'));
alter table public.workspaces add column phases_in_order boolean not null default false;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default '',
  kind text not null default 'mine' check (kind in ('client', 'mine')),
  client_id uuid references public.clients (id) on delete set null,
  status_id uuid not null references public.statuses (id),
  layout text not null default 'phases' check (layout in ('phases', 'list', 'milestones')),
  start_date date,
  due_date date,
  launch_date date,
  about text not null default '',
  -- "Do in order" for the Task list layout. Phases and milestones keep their own switch.
  list_in_order boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_workspace_id_idx on public.projects (workspace_id);
create index projects_client_id_idx on public.projects (client_id);
create index projects_status_id_idx on public.projects (status_id);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null default '',
  sort_order double precision not null default 0,
  start_date date,
  end_date date,
  in_order boolean not null default false,
  created_at timestamptz not null default now()
);
create index phases_workspace_id_idx on public.phases (workspace_id);
create index phases_project_id_idx on public.phases (project_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null default '',
  date date,
  sort_order double precision not null default 0,
  in_order boolean not null default false,
  created_at timestamptz not null default now()
);
create index milestones_workspace_id_idx on public.milestones (workspace_id);
create index milestones_project_id_idx on public.milestones (project_id);

-- A task keeps its phase and its milestone, so switching layouts never moves anything.
alter table public.tasks add column project_id uuid references public.projects (id) on delete cascade;
alter table public.tasks add column phase_id uuid references public.phases (id) on delete set null;
alter table public.tasks add column milestone_id uuid references public.milestones (id) on delete set null;
-- Waiting on can also point at another task (typed with @). A dependency row does the waiting.
alter table public.tasks add column waiting_on_task_id uuid references public.tasks (id) on delete set null;
create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_phase_id_idx on public.tasks (phase_id);
create index tasks_milestone_id_idx on public.tasks (milestone_id);
create index tasks_waiting_on_task_id_idx on public.tasks (waiting_on_task_id);

create table public.dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  waits_on_task_id uuid not null references public.tasks (id) on delete cascade,
  -- true when "Do in order" made it, so reordering can rebuild it
  auto boolean not null default false,
  created_at timestamptz not null default now(),
  unique (task_id, waits_on_task_id),
  check (task_id <> waits_on_task_id)
);
create index dependencies_workspace_id_idx on public.dependencies (workspace_id);
create index dependencies_task_id_idx on public.dependencies (task_id);
create index dependencies_waits_on_task_id_idx on public.dependencies (waits_on_task_id);

-- No loops: A can't wait on B if B already waits on A, however far back.
create function public.check_dependency_loop()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    with recursive chain(id) as (
      select d.waits_on_task_id from public.dependencies d where d.task_id = new.waits_on_task_id
      union
      select d.waits_on_task_id from public.dependencies d join chain c on d.task_id = c.id
    )
    select 1 from chain where id = new.task_id
  ) then
    raise exception 'That would make a loop';
  end if;
  return new;
end;
$$;
create trigger dependencies_no_loop before insert or update on public.dependencies
  for each row execute function public.check_dependency_loop();

-- Task sets and project templates keep their rows as a small JSON list, with dates written as day offsets.
create table public.task_sets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default '',
  description text not null default '',
  in_order boolean not null default false,
  -- [{ id, title, offset, priority }]
  items jsonb not null default '[]'::jsonb,
  used_count integer not null default 0,
  last_used date,
  created_at timestamptz not null default now()
);
create index task_sets_workspace_id_idx on public.task_sets (workspace_id);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default '',
  description text not null default '',
  layout text not null default 'phases' check (layout in ('phases', 'list', 'milestones')),
  count_from text not null default 'start' check (count_from in ('start', 'launch')),
  -- [{ id, name, offset, in_order, items: [{ id, title, offset, priority }] }]
  groups jsonb not null default '[]'::jsonb,
  -- the starter it was customized from, if any
  starter_key text,
  used_count integer not null default 0,
  last_used date,
  created_at timestamptz not null default now()
);
create index templates_workspace_id_idx on public.templates (workspace_id);

alter table public.projects enable row level security;
alter table public.phases enable row level security;
alter table public.milestones enable row level security;
alter table public.dependencies enable row level security;
alter table public.task_sets enable row level security;
alter table public.templates enable row level security;

create policy "Members manage their projects" on public.projects for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their phases" on public.phases for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their milestones" on public.milestones for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their dependencies" on public.dependencies for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their task sets" on public.task_sets for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their templates" on public.templates for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- Project statuses. Done and Canceled are required.
create function private.seed_project_statuses(ws uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.statuses (workspace_id, area, name, color_bg, color_text, sort_order, behavior, built_in) values
    (ws, 'project', 'Planning', '#E6DEF2', '#4F3A78', 0, 'open', false),
    (ws, 'project', 'In progress', '#FBEFC4', '#6B5310', 1, 'open', false),
    (ws, 'project', 'On hold', '#F9DEC6', '#8A4A1F', 2, 'open', false),
    (ws, 'project', 'Done', '#DDEBDD', '#2F5B35', 3, 'done', true),
    (ws, 'project', 'Canceled', '#F0F0EE', '#666666', 4, 'canceled', true);
$$;

create or replace function private.seed_statuses_on_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_task_statuses(new.id);
  perform private.seed_client_defaults(new.id);
  perform private.seed_project_statuses(new.id);
  return new;
end;
$$;

select private.seed_project_statuses(w.id)
from public.workspaces w
where exists (select 1 from public.workspace_members m where m.workspace_id = w.id);
