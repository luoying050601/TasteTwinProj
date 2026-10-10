begin;

create function public.notebook_choices_valid(state text, choices text[], detail text)
returns boolean language sql immutable set search_path = '' as $$
  select state in ('unknown', 'none', 'selected')
    and ((state = 'selected') = (cardinality(choices) > 0))
    and cardinality(choices) = (select count(distinct value) from unnest(choices) as value)
    and (('other' = any(choices)) = (length(btrim(detail)) > 0));
$$;

create table public.user_dietary_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allergy_status text not null default 'unknown',
  allergens text[] not null default '{}',
  allergy_other text not null default '' check (char_length(allergy_other) <= 200),
  avoidance_status text not null default 'unknown',
  avoided_foods text[] not null default '{}',
  avoidance_other text not null default '' check (char_length(avoidance_other) <= 200),
  updated_at timestamptz not null default now(),
  check (allergens <@ array['milk','egg','peanut','tree_nut','fish','crustacean','sesame','wheat','soy','mango','other']::text[]),
  check (avoided_foods <@ array['cilantro','scallion','ginger','garlic','pork','beef','lamb','offal_blood','fish_seafood','alcohol','other']::text[]),
  check (public.notebook_choices_valid(allergy_status, allergens, allergy_other)),
  check (public.notebook_choices_valid(avoidance_status, avoided_foods, avoidance_other))
);

create function public.notebook_preference_timestamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notebook_preference_timestamp before update on public.user_dietary_preferences
for each row execute function public.notebook_preference_timestamp();

create table public.user_health_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric(5,2) not null check (weight_kg > 0 and weight_kg <= 500),
  height_cm numeric(5,2) not null check (height_cm between 30 and 300),
  body_fat_status text not null check (body_fat_status in ('unknown','measured')),
  body_fat_pct numeric(5,2) check (body_fat_pct > 0 and body_fat_pct < 100),
  goal text not null check (goal in ('build_muscle','lose_fat','wellness','no_specific_goal')),
  chronotype text not null check (chronotype in ('morning','evening','intermediate')),
  breakfast_habit text not null check (breakfast_habit in ('often','sometimes','never')),
  lunch_habit text not null check (lunch_habit in ('often','sometimes','never')),
  dinner_habit text not null check (dinner_habit in ('often','sometimes','never')),
  recorded_at timestamptz not null default clock_timestamp(),
  check ((body_fat_status = 'measured') = (body_fat_pct is not null))
);

create index user_health_records_history on public.user_health_records (user_id, recorded_at desc, id desc);

alter table public.user_dietary_preferences enable row level security;
alter table public.user_health_records enable row level security;
revoke all on public.user_dietary_preferences, public.user_health_records from anon, authenticated;
grant select on public.user_dietary_preferences, public.user_health_records to authenticated;
grant insert (user_id, allergy_status, allergens, allergy_other, avoidance_status, avoided_foods, avoidance_other)
on public.user_dietary_preferences to authenticated;
grant update (allergy_status, allergens, allergy_other, avoidance_status, avoided_foods, avoidance_other)
on public.user_dietary_preferences to authenticated;
grant insert (id, user_id, weight_kg, height_cm, body_fat_status, body_fat_pct, goal, chronotype,
              breakfast_habit, lunch_habit, dinner_habit)
on public.user_health_records to authenticated;

create policy notebook_dietary_read on public.user_dietary_preferences for select to authenticated
using ((select auth.uid()) = user_id);
create policy notebook_dietary_insert on public.user_dietary_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy notebook_dietary_update on public.user_dietary_preferences for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notebook_health_read on public.user_health_records for select to authenticated
using ((select auth.uid()) = user_id);
create policy notebook_health_insert on public.user_health_records for insert to authenticated
with check ((select auth.uid()) = user_id);

revoke all on function public.notebook_choices_valid(text, text[], text) from public, anon;
grant execute on function public.notebook_choices_valid(text, text[], text) to authenticated;
revoke all on function public.notebook_preference_timestamp() from public, anon, authenticated;

commit;