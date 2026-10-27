-- The order areas show in the sidebar and Settings. Empty means the default order.
alter table public.workspaces add column areas_order text[] not null default '{}';
