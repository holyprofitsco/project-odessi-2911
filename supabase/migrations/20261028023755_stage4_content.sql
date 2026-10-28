-- Stage 4: content cards and ideas, platforms with a posting rhythm, pillars, campaigns, and content statuses.
create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default '',
  -- How a post looks on the board: wide (YouTube), square (Instagram), tall (reels, TikTok), text (LinkedIn, Substack)
  shape text not null default 'square' check (shape in ('wide', 'square', 'tall', 'text')),
  -- Posting rhythm: weekdays you aim to post (0 = Sunday) and the usual time
  days integer[] not null default '{}',
  usual_time time,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);
create index platforms_workspace_id_idx on public.platforms (workspace_id);

create table public.pillars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default '',
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);
create index pillars_workspace_id_idx on public.pillars (workspace_id);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default '',
  start_date date,
  end_date date,
  color_bg text not null default '#F3DDE6',
  color_text text not null default '#7A3350',
  created_at timestamptz not null default now()
);
create index campaigns_workspace_id_idx on public.campaigns (workspace_id);

create table public.content (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null default '',
  -- Ideas live in the Idea bank and have no status until you Start them.
  is_idea boolean not null default false,
  status_id uuid references public.statuses (id),
  publish_date date,
  publish_time time,
  platform_ids uuid[] not null default '{}',
  pillar_id uuid references public.pillars (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  caption text not null default '' check (char_length(caption) <= 5000),
  idea_note text not null default '',
  script_url text,
  cover_url text,
  -- [{ id, name, url, kind: 'image' | 'link' }]
  attachments jsonb not null default '[]'::jsonb,
  -- Repurposed pieces point at the original.
  parent_id uuid references public.content (id) on delete set null,
  sort_order double precision not null default 0,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_workspace_id_idx on public.content (workspace_id);
create index content_status_id_idx on public.content (status_id);
create index content_pillar_id_idx on public.content (pillar_id);
create index content_project_id_idx on public.content (project_id);
create index content_campaign_id_idx on public.content (campaign_id);
create index content_parent_id_idx on public.content (parent_id);
create trigger content_touch before update on public.content
  for each row execute function public.touch_updated_at();

-- Tasks can belong to a piece of content (Write script, Film video, Edit video).
alter table public.tasks add column content_id uuid references public.content (id) on delete set null;
create index tasks_content_id_idx on public.tasks (content_id);

alter table public.platforms enable row level security;
alter table public.pillars enable row level security;
alter table public.campaigns enable row level security;
alter table public.content enable row level security;

create policy "Members manage their platforms" on public.platforms for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their pillars" on public.pillars for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their campaigns" on public.campaigns for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy "Members manage their content" on public.content for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- Content statuses from the design system, plus a few common platforms with no rhythm set yet.
create function private.seed_content_defaults(ws uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.statuses (workspace_id, area, name, color_bg, color_text, sort_order, behavior, built_in) values
    (ws, 'content', 'Ready to script', '#FEF3D2', '#7A6418', 0, 'open', false),
    (ws, 'content', 'Ready to film', '#EDCFC0', '#8A4A33', 1, 'open', false),
    (ws, 'content', 'Ready to edit', '#C3D3D6', '#3E6468', 2, 'open', false),
    (ws, 'content', 'Ready to post', '#D5DBE4', '#435474', 3, 'open', false),
    (ws, 'content', 'Scheduled', '#E4D5E3', '#6E4A72', 4, 'open', false),
    (ws, 'content', 'Posted', '#F0F0EE', '#666666', 5, 'done', true);
  insert into public.platforms (workspace_id, name, shape, sort_order) values
    (ws, 'YouTube', 'wide', 0),
    (ws, 'Instagram', 'square', 1),
    (ws, 'LinkedIn', 'text', 2),
    (ws, 'Substack', 'text', 3);
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
  perform private.seed_content_defaults(new.id);
  return new;
end;
$$;

select private.seed_content_defaults(w.id)
from public.workspaces w
where exists (select 1 from public.workspace_members m where m.workspace_id = w.id);
