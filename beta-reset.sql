-- StudBud end-of-beta reset (run once in the Supabase SQL editor, after supabase-setup.sql).
-- Resets study activity, coins and cosmetics for every account. Keeps accounts, usernames, tags,
-- courses, grades, assignments, flashcard decks, friends, classes and game wins.
-- Safe to rerun: the reset only happens the first time (tracked in studbud_data_resets).

create table if not exists public.studbud_data_resets (
    id text primary key,
    ran_at timestamptz not null default now()
);
alter table public.studbud_data_resets enable row level security;
revoke all on table public.studbud_data_resets from public, anon, authenticated;

do $$
declare
    v_ran integer;
begin
    insert into public.studbud_data_resets (id) values ('beta-end-2026-10-15') on conflict do nothing;
    get diagnostics v_ran = row_count;
    if v_ran = 0 then
        raise notice 'The end-of-beta reset already ran. Nothing changed.';
        return;
    end if;

    -- Study activity: leaderboard time, daily goals and streaks all come from these entries.
    delete from public.studbud_study_time_entries;

    -- Coins and cosmetics back to a new account's starting point.
    update public.studbud_multiplayer_profiles set
        coins = 100,
        owned_items = array['avatar_default', 'palette_default'],
        equipped_avatar = 'avatar_default',
        equipped_palette = 'palette_default',
        equipped_skin = '',
        equipped_hat = '',
        equipped_accessory = '',
        equipped_effect = '',
        equipped_pet = '',
        last_daily_claim = null,
        daily_streak = 0,
        solo_coins_day = null,
        solo_coins_today = 0,
        updated_at = now();

    -- Study history, XP and level stored in each account's cloud backup.
    update public.studbud_user_data set
        data = jsonb_set(
            jsonb_set(data, '{studyHistory}', '[]'::jsonb, true),
            '{state,gameMetrics}',
            '{"level": 1, "xp": 0, "streakDays": 0, "lastStudyDate": null, "resetId": "beta-end-2026-10-15"}'::jsonb,
            true),
        updated_at = now()
    where jsonb_typeof(data) = 'object' and jsonb_typeof(data -> 'state') = 'object';

    raise notice 'End-of-beta reset complete.';
end;
$$;
