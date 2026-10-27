-- Move the membership check out of the API-exposed public schema so it can't be called directly.
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_workspace_member(uuid) set schema private;
