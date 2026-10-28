-- Each template (and the projects made from it) names its big day: Launch day, Event day, Go-live day, Deadline, or your own words.
alter table public.templates add column if not exists big_day text not null default 'Launch day';
alter table public.projects add column if not exists big_day text not null default 'Launch day';
update public.templates set big_day = 'Event day' where starter_key = 'retreat-event';
