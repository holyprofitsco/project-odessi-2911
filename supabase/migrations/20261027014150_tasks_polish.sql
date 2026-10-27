-- Urgent priority, a weekend "keep" option, the nominal date of a repeating task, and auto-complete for parent tasks.
alter table public.tasks drop constraint tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('urgent', 'high', 'medium', 'low', 'none'));
alter table public.workspaces drop constraint workspaces_weekend_rule_check;
alter table public.workspaces add constraint workspaces_weekend_rule_check check (weekend_rule in ('ask', 'keep', 'friday', 'monday'));
alter table public.tasks add column repeat_anchor date;
alter table public.workspaces add column auto_complete_parent boolean not null default false;
