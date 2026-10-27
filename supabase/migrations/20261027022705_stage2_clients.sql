-- Stage 2: clients, people, notes, custom fields, connections, and links.
alter table public.workspaces add column warm_last_contact boolean not null default false;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null default 'person' check (kind in ('person', 'business')),
  name text not null default '',
  title text not null default '',
  stage_status_id uuid not null references public.statuses (id),
  client_since date,
  website text not null default '',
  phone text not null default '',
  email text not null default '',
  time_zone text,
  socials jsonb not null default '[]'::jsonb,
  order_in_stage double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_workspace_id_idx on public.clients (workspace_id);
create index clients_stage_status_id_idx on public.clients (stage_status_id);
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

create table public.people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null default '',
  role text not null default '',
  email text not null default '',
  phone text not null default '',
  socials jsonb not null default '[]'::jsonb,
  is_main_contact boolean not null default false,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);
create index people_workspace_id_idx on public.people (workspace_id);
create index people_client_id_idx on public.people (client_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  person_id uuid references public.people (id) on delete set null,
  -- stage = an automatic "Moved to Active" line. It never counts as contact.
  kind text not null default 'note' check (kind in ('note', 'call', 'email', 'session', 'became_active', 'stage')),
  body text not null default '',
  occurred_at date not null default current_date,
  created_at timestamptz not null default now()
);
create index notes_workspace_id_idx on public.notes (workspace_id);
create index notes_client_id_idx on public.notes (client_id);
create index notes_person_id_idx on public.notes (person_id);

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  area text not null default 'client' check (area in ('task', 'project', 'content', 'client')),
  name text not null,
  type text not null check (type in ('text', 'dropdown', 'labels', 'date', 'number', 'money', 'checkbox', 'link')),
  -- [{ id, name, bg, text }] for dropdowns and labels
  options jsonb not null default '[]'::jsonb,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);
create index fields_workspace_id_idx on public.fields (workspace_id);

create table public.field_values (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  item_type text not null,
  item_id uuid not null,
  value jsonb,
  unique (field_id, item_id)
);
create index field_values_workspace_id_idx on public.field_values (workspace_id);
create index field_values_item_id_idx on public.field_values (item_id);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  from_type text not null,
  from_id uuid not null,
  to_type text not null,
  to_id uuid not null,
  created_at timestamptz not null default now(),
  unique (from_id, to_id)
);
create index connections_workspace_id_idx on public.connections (workspace_id);
create index connections_to_id_idx on public.connections (to_id);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  item_type text not null,
  item_id uuid not null,
  name text not null default '',
  url text not null,
  kind text not null default 'link' check (kind in ('file', 'link')),
  created_at timestamptz not null default now()
);
create index files_workspace_id_idx on public.files (workspace_id);
create index files_item_id_idx on public.files (item_id);

-- Waiting on can point at a real client or a person inside one.
alter table public.tasks add column waiting_on_client_id uuid references public.clients (id) on delete set null;
alter table public.tasks add column waiting_on_person_id uuid references public.people (id) on delete set null;
create index tasks_waiting_on_client_id_idx on public.tasks (waiting_on_client_id);
create index tasks_waiting_on_person_id_idx on public.tasks (waiting_on_person_id);

alter table public.clients enable row level security;
alter table public.people enable row level security;
alter table public.notes enable row level security;
alter table public.fields enable row level security;
alter table public.field_values enable row level security;
alter table public.connections enable row level security;
alter table public.files enable row level security;

create policy "Members manage their clients" on public.clients for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their people" on public.people for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their notes" on public.notes for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their fields" on public.fields for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their field values" on public.field_values for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their connections" on public.connections for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their files" on public.files for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- Client stages and starter fields. Past and Didn't move forward are required (done / canceled).
create function private.seed_client_defaults(ws uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.statuses (workspace_id, area, name, color_bg, color_text, sort_order, behavior, built_in) values
    (ws, 'client', 'Lead', '#E6DEF2', '#4F3A78', 0, 'open', false),
    (ws, 'client', 'Active', '#FBEFC4', '#6B5310', 1, 'open', false),
    (ws, 'client', 'Past', '#F0F0EE', '#666666', 2, 'done', true),
    (ws, 'client', 'Didn''t move forward', '#F0F0EE', '#666666', 3, 'canceled', true);
  insert into public.fields (workspace_id, area, name, type, options, sort_order) values
    (ws, 'client', 'Offer', 'dropdown', '[]'::jsonb, 0),
    (ws, 'client', 'Source', 'dropdown', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'name', 'Instagram', 'bg', '#F3DDE6', 'text', '#7A3350'),
      jsonb_build_object('id', gen_random_uuid(), 'name', 'Referral', 'bg', '#DDEBDD', 'text', '#2F5B35'),
      jsonb_build_object('id', gen_random_uuid(), 'name', 'Workshop', 'bg', '#FBEFC4', 'text', '#6B5310'),
      jsonb_build_object('id', gen_random_uuid(), 'name', 'Podcast', 'bg', '#E6DEF2', 'text', '#4F3A78'),
      jsonb_build_object('id', gen_random_uuid(), 'name', 'Website', 'bg', '#E8EEF2', 'text', '#3F5463')
    ), 1);
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
  return new;
end;
$$;

select private.seed_client_defaults(w.id)
from public.workspaces w
where exists (select 1 from public.workspace_members m where m.workspace_id = w.id);
