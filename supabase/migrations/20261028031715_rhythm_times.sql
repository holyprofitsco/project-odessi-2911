-- A platform can have more than one posting time a day. Each time is one post you aim for.
-- usual_time is kept for older rows but no longer used.
alter table public.platforms add column times time[] not null default '{}';
update public.platforms set times = array[usual_time] where usual_time is not null;
