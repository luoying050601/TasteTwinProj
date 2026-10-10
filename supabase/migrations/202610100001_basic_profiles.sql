begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nickname text check (nickname is null or (nickname = btrim(nickname) and char_length(nickname) between 1 and 40)),
  gender text check (gender in ('male', 'female', 'other', 'undisclosed')),
  birth_year integer check (birth_year between 1 and 9999),
  birth_month integer check (birth_month between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((birth_year is null) = (birth_month is null))
);

create unique index profiles_email_unique on public.profiles (lower(email));

create function public.validate_profile_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.birth_year is not null and
     (new.birth_year, new.birth_month) >
     (extract(year from timezone('UTC', now()))::integer,
      extract(month from timezone('UTC', now()))::integer) then
    raise exception 'Birth month cannot be in the future';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger validate_profile_write before insert or update on public.profiles
for each row execute function public.validate_profile_write();

create function public.sync_auth_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null then
    insert into public.profiles (id, email) values (new.id, lower(new.email))
    on conflict (id) do update set email = excluded.email;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_auth_profile() from public, anon, authenticated;
revoke all on function public.validate_profile_write() from public, anon, authenticated;

create trigger sync_auth_profile after insert or update of email on auth.users
for each row execute function public.sync_auth_profile();

insert into public.profiles (id, email)
select id, lower(email) from auth.users where email is not null;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nickname, gender, birth_year, birth_month) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

commit;