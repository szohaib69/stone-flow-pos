
create or replace function private.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select _user_id is not null and _user_id = auth.uid() and exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = _user_id and r.role = _role and p.status = 'approved'::public.account_status
  )
$$;

create or replace function private.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select _user_id is not null and _user_id = auth.uid() and exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = _user_id
      and r.role in ('admin'::public.app_role, 'cashier'::public.app_role)
      and p.status = 'approved'::public.account_status
  )
$$;

revoke all on function private.has_role(uuid, app_role) from public, anon, authenticated;
revoke all on function private.is_staff(uuid) from public, anon, authenticated;

create policy "admin update inquiries" on public.inquiries
  for update to authenticated
  using (private.has_role(auth.uid(), 'admin'::public.app_role))
  with check (private.has_role(auth.uid(), 'admin'::public.app_role));

create policy "admin delete inquiries" on public.inquiries
  for delete to authenticated
  using (private.has_role(auth.uid(), 'admin'::public.app_role));
