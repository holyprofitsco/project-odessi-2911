-- Photos and logos for clients and people, stored in a public "photos" bucket under the workspace's folder.
alter table public.clients add column photo_url text;
alter table public.people add column photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Members add photos to their workspace folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "Members change photos in their workspace folder" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "Members remove photos in their workspace folder" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));
