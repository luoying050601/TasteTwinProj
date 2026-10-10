begin;

alter table public.user_dietary_preferences
add column city text not null default '' check (char_length(city) <= 80 and city = btrim(city));

grant insert (city), update (city) on public.user_dietary_preferences to authenticated;

notify pgrst, 'reload schema';
commit;