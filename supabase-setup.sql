create table if not exists public.studbud_user_data (
    user_id uuid primary key references auth.users (id) on delete cascade,
    data jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.studbud_user_data enable row level security;
revoke all on table public.studbud_user_data from anon, authenticated;
grant select, insert, update on table public.studbud_user_data to authenticated;

drop policy if exists "Users can read their own StudBud data" on public.studbud_user_data;
create policy "Users can read their own StudBud data"
    on public.studbud_user_data for select
    using (auth.uid() = user_id);

drop policy if exists "Users can insert their own StudBud data" on public.studbud_user_data;
create policy "Users can insert their own StudBud data"
    on public.studbud_user_data for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own StudBud data" on public.studbud_user_data;
create policy "Users can update their own StudBud data"
    on public.studbud_user_data for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create table if not exists public.studbud_community_decks (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users (id) on delete cascade,
    source_deck_id text not null,
    title text not null check (char_length(title) between 1 and 100),
    description text not null default '' check (char_length(description) <= 300),
    cards jsonb not null check (
        jsonb_typeof(cards) = 'array'
        and jsonb_array_length(cards) >= 2
    ),
    card_count integer generated always as (jsonb_array_length(cards)) stored,
    study_count integer not null default 0 check (study_count >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, source_deck_id)
);
alter table public.studbud_community_decks drop constraint if exists studbud_community_decks_cards_check;
alter table public.studbud_community_decks
    add constraint studbud_community_decks_cards_check
    check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) >= 2);
-- The class a shared set is for (e.g. "AP Biology"). Personal quiz/test links stay private.
alter table public.studbud_community_decks add column if not exists course text not null default '';
alter table public.studbud_community_decks drop constraint if exists studbud_community_decks_course_check;
alter table public.studbud_community_decks
    add constraint studbud_community_decks_course_check check (char_length(course) <= 100);

alter table public.studbud_community_decks enable row level security;
revoke all on table public.studbud_community_decks from anon, authenticated;
grant select, insert, update, delete on table public.studbud_community_decks to authenticated;

drop policy if exists "Signed-in users can discover shared decks" on public.studbud_community_decks;
create policy "Signed-in users can discover shared decks"
    on public.studbud_community_decks for select
    to authenticated using (true);

drop policy if exists "Deck owners can publish community decks" on public.studbud_community_decks;
create policy "Deck owners can publish community decks"
    on public.studbud_community_decks for insert
    to authenticated with check (auth.uid() = owner_id);

drop policy if exists "Deck owners can update community decks" on public.studbud_community_decks;
create policy "Deck owners can update community decks"
    on public.studbud_community_decks for update
    to authenticated using (auth.uid() = owner_id)
    with check (auth.uid() = owner_id);

drop policy if exists "Deck owners can remove community decks" on public.studbud_community_decks;
create policy "Deck owners can remove community decks"
    on public.studbud_community_decks for delete
    to authenticated using (auth.uid() = owner_id);

create table if not exists public.studbud_community_deck_studies (
    deck_id uuid not null references public.studbud_community_decks (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    studied_at timestamptz not null default now(),
    primary key (deck_id, user_id)
);

alter table public.studbud_community_deck_studies enable row level security;
revoke all on table public.studbud_community_deck_studies from anon, authenticated;

create table if not exists public.studbud_study_time_entries (
    user_id uuid not null references auth.users (id) on delete cascade,
    entry_id text not null check (char_length(entry_id) between 1 and 140),
    study_date date not null default (timezone('utc', now())::date),
    seconds integer not null check (seconds between 1 and 21600),
    created_at timestamptz not null default now(),
    primary key (user_id, entry_id)
);

create index if not exists studbud_study_time_entries_date_idx
    on public.studbud_study_time_entries (study_date, user_id);
alter table public.studbud_study_time_entries enable row level security;
revoke all on table public.studbud_study_time_entries from public, anon, authenticated;

-- Anonymous guest sessions (Continue as guest / join with a code) can play but not use account-only features.
create or replace function public.studbud_is_guest()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
    select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

drop function if exists public.studbud_record_study_time(text, integer);
create or replace function public.studbud_record_study_time(
    p_entry_id text,
    p_seconds integer,
    p_study_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_inserted integer;
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_user_id is null then raise exception 'Sign in to record study time.'; end if;
    if p_entry_id is null or char_length(btrim(p_entry_id)) not between 1 and 140 then
        raise exception 'That study session could not be recorded.';
    end if;
    if p_seconds is null or p_seconds not between 1 and 21600 then
        raise exception 'Study time must be between 1 second and 6 hours.';
    end if;
    if p_study_date is null or p_study_date > timezone('utc', now())::date then
        raise exception 'Study dates cannot be in the future.';
    end if;
    -- Beta-test study time was reset on 2026-10-15; older sessions still queued on devices are ignored.
    if p_study_date < date '2026-10-15' then
        return jsonb_build_object('recorded', false);
    end if;

    insert into public.studbud_study_time_entries (user_id, entry_id, study_date, seconds)
    values (v_user_id, btrim(p_entry_id), p_study_date, p_seconds)
    on conflict (user_id, entry_id) do nothing;
    get diagnostics v_inserted = row_count;
    return jsonb_build_object('recorded', v_inserted > 0);
end;
$$;

-- True when the account is banned or still has to pick a new username; such accounts never appear on leaderboards or in friend lists.
create or replace function public.studbud_is_hidden_user(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    return exists (select 1 from public.studbud_banned_users b where b.user_id = p_user_id)
        or exists (select 1 from public.studbud_username_state s where s.user_id = p_user_id and s.force_change)
        or exists (select 1 from auth.users a where a.id = p_user_id and a.banned_until is not null and a.banned_until > now());
end;
$$;

-- Current streak for any user: consecutive UTC days with at least 5 minutes, ending today or yesterday.
create or replace function public.studbud_current_streak(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(max(runs.len) filter (where runs.last_day >= timezone('utc', now())::date - 1), 0)::integer
    from (
        select count(*)::integer as len, max(days.study_date) as last_day
        from (
            select study_date, study_date - (row_number() over (order by study_date))::integer as grp
            from public.studbud_study_time_entries
            where user_id = p_user_id
            group by study_date
            having sum(seconds) >= 300
        ) days
        group by days.grp
    ) runs;
$$;
revoke all on function public.studbud_current_streak(uuid) from public, anon, authenticated;

drop function if exists public.studbud_get_study_leaderboard(text);
create or replace function public.studbud_get_study_leaderboard(p_period text default 'daily', p_scope text default 'global')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_today date := timezone('utc', now())::date;
    v_start date;
    v_today_seconds integer;
    v_streak integer := 0;
    v_best integer := 0;
    v_active_days integer := 0;
    v_total_seconds integer := 0;
    v_week jsonb;
    v_board jsonb;
    v_me jsonb;
    v_participants integer := 0;
begin
    if v_user_id is null then raise exception 'Sign in to open study leaderboards.'; end if;
    if p_period is null or p_period not in ('daily', 'weekly', 'monthly', 'alltime') then
        raise exception 'Choose a daily, weekly, monthly or all-time leaderboard.';
    end if;
    if p_scope is null or p_scope not in ('global', 'friends') then raise exception 'Choose the global or buds leaderboard.'; end if;
    v_start := case p_period
        when 'weekly' then date_trunc('week', v_today::timestamp)::date
        when 'monthly' then date_trunc('month', v_today::timestamp)::date
        when 'alltime' then date '2000-01-01'
        else v_today
    end;

    select coalesce(sum(seconds), 0)::integer into v_today_seconds
    from public.studbud_study_time_entries
    where user_id = v_user_id and study_date = v_today;

    select coalesce(sum(seconds), 0)::integer into v_total_seconds
    from public.studbud_study_time_entries
    where user_id = v_user_id;

    select coalesce(max(runs.len), 0)::integer,
        coalesce(max(runs.len) filter (where runs.last_day >= v_today - 1), 0)::integer,
        coalesce(sum(runs.len), 0)::integer
    into v_best, v_streak, v_active_days
    from (
        select count(*)::integer as len, max(days.study_date) as last_day
        from (
            select study_date, study_date - (row_number() over (order by study_date))::integer as grp
            from public.studbud_study_time_entries
            where user_id = v_user_id
            group by study_date
            having sum(seconds) >= 300
        ) days
        group by days.grp
    ) runs;

    select jsonb_agg(jsonb_build_object(
        'date', day.d::date,
        'seconds', coalesce((
            select sum(e.seconds) from public.studbud_study_time_entries e
            where e.user_id = v_user_id and e.study_date = day.d::date
        ), 0)::integer
    ) order by day.d)
    into v_week
    from generate_series((v_today - 6)::timestamp, v_today::timestamp, interval '1 day') as day(d);

    with pool as (
        select v_user_id as user_id
        union
        select case when f.requester_id = v_user_id then f.addressee_id else f.requester_id end
        from public.studbud_friendships f
        where f.status = 'accepted' and v_user_id in (f.requester_id, f.addressee_id)
    ), totals as (
        select entry.user_id, sum(entry.seconds)::integer as seconds
        from public.studbud_study_time_entries entry
        where entry.study_date between v_start and v_today
          and (p_scope = 'global' or entry.user_id in (select pool.user_id from pool))
        group by entry.user_id
    ), visible as (
        select totals.user_id, totals.seconds,
            coalesce(nullif(account.raw_user_meta_data ->> 'username', ''), 'Student') as username
        from totals
        join auth.users account on account.id = totals.user_id
        where not public.studbud_is_hidden_user(totals.user_id)
    ), ranked as (
        select row_number() over (order by visible.seconds desc, visible.username)::integer as rank,
            visible.user_id, visible.seconds, visible.username
        from visible
    )
    select coalesce(jsonb_agg(jsonb_build_object(
            'rank', ranked.rank,
            'user_id', ranked.user_id,
            'username', ranked.username,
            'seconds', ranked.seconds,
            'minutes', floor(ranked.seconds / 60.0)::integer,
            'streak_days', public.studbud_current_streak(ranked.user_id),
            'skin', coalesce(cosmetics.equipped_skin, ''),
            'hat', coalesce(cosmetics.equipped_hat, ''),
            'accessory', coalesce(cosmetics.equipped_accessory, ''),
            'effect', coalesce(cosmetics.equipped_effect, ''),
            'tags', to_jsonb(public.studbud_user_tags_for(ranked.user_id)),
            'is_me', ranked.user_id = v_user_id
        ) order by ranked.rank) filter (where ranked.rank <= 50), '[]'::jsonb),
        (jsonb_agg(jsonb_build_object('rank', ranked.rank, 'seconds', ranked.seconds)) filter (where ranked.user_id = v_user_id)) -> 0,
        count(*)::integer
    into v_board, v_me, v_participants
    from ranked
    left join public.studbud_multiplayer_profiles cosmetics on cosmetics.user_id = ranked.user_id;

    return jsonb_build_object(
        'period', p_period,
        'scope', p_scope,
        'starts_on', v_start,
        'ends_on', v_today,
        'today_seconds', v_today_seconds,
        'today_minutes', floor(v_today_seconds / 60.0)::integer,
        'daily_goal_seconds', 300,
        'streak_days', v_streak,
        'best_streak', greatest(v_best, v_streak),
        'active_days', v_active_days,
        'total_seconds', v_total_seconds,
        'week', coalesce(v_week, '[]'::jsonb),
        'me', v_me,
        'participants', v_participants,
        'leaderboard', v_board
    );
end;
$$;

create or replace function public.studbud_protect_community_deck_study_count()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    if current_user = 'authenticated' and (
        (tg_op = 'INSERT' and new.study_count <> 0)
        or (tg_op = 'UPDATE' and new.study_count is distinct from old.study_count)
    ) then
        raise exception 'Community study counts can only be changed by the study-tracking function.';
    end if;
    return new;
end;
$$;

drop trigger if exists studbud_protect_community_deck_study_count on public.studbud_community_decks;
create trigger studbud_protect_community_deck_study_count
    before insert or update on public.studbud_community_decks
    for each row execute function public.studbud_protect_community_deck_study_count();

create or replace function public.studbud_record_community_deck_study(p_deck_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_inserted integer;
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_user_id is null then
        raise exception 'Sign in to record a community deck study.';
    end if;

    insert into public.studbud_community_deck_studies (deck_id, user_id)
    select d.id, v_user_id
    from public.studbud_community_decks d
    where d.id = p_deck_id and d.owner_id <> v_user_id
    on conflict do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 0 and not exists (
        select 1 from public.studbud_community_decks d
        where d.id = p_deck_id and d.owner_id <> v_user_id
    ) then
        raise exception 'This community deck is unavailable.';
    end if;

    if v_inserted > 0 then
        update public.studbud_community_decks
        set study_count = study_count + 1
        where id = p_deck_id;
    end if;
end;
$$;

create table if not exists public.studbud_game_rooms (
    id uuid primary key default gen_random_uuid(),
    room_code text not null unique check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
    host_id uuid not null references auth.users (id) on delete cascade,
    deck_title text not null check (char_length(deck_title) between 1 and 100),
    cards jsonb not null check (
        jsonb_typeof(cards) = 'array'
        and jsonb_array_length(cards) >= 1
    ),
    mode text not null check (mode in ('classic', 'rush', 'survival', 'skyline', 'river', 'market', 'miner', 'duel', 'crypto', 'shooter', 'sports', 'fishing', 'hack', 'chess', 'defense')),
    status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
    state jsonb not null default '{"players":[],"question_index":-1,"question":null}'::jsonb,
    goal_type text not null default 'points',
    point_limit integer not null default 1000,
    time_limit_seconds integer not null default 300,
    started_at timestamptz,
    rewards_paid boolean not null default false,
    expires_at timestamptz not null default (now() + interval '2 hours'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.studbud_game_rooms
    add column if not exists goal_type text not null default 'points',
    add column if not exists point_limit integer not null default 1000,
    add column if not exists time_limit_seconds integer not null default 300,
    add column if not exists started_at timestamptz,
    add column if not exists rewards_paid boolean not null default false;
alter table public.studbud_game_rooms drop constraint if exists studbud_game_rooms_cards_check;
alter table public.studbud_game_rooms
    add constraint studbud_game_rooms_cards_check
    check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) >= 1);
alter table public.studbud_game_rooms drop constraint if exists studbud_game_rooms_mode_check;
alter table public.studbud_game_rooms
    add constraint studbud_game_rooms_mode_check
    check (mode in ('classic', 'rush', 'survival', 'skyline', 'river', 'market', 'miner', 'duel', 'crypto', 'shooter', 'sports', 'fishing', 'hack', 'chess', 'defense'));
alter table public.studbud_game_rooms drop constraint if exists studbud_game_rooms_goal_type_check;
alter table public.studbud_game_rooms
    add constraint studbud_game_rooms_goal_type_check check (goal_type in ('points', 'time'));
alter table public.studbud_game_rooms drop constraint if exists studbud_game_rooms_point_limit_check;
alter table public.studbud_game_rooms
    add constraint studbud_game_rooms_point_limit_check check (point_limit > 0);
alter table public.studbud_game_rooms drop constraint if exists studbud_game_rooms_time_limit_seconds_check;
alter table public.studbud_game_rooms
    add constraint studbud_game_rooms_time_limit_seconds_check check (time_limit_seconds between 60 and 3600 or (mode in ('chess', 'defense') and time_limit_seconds = 0));

alter table public.studbud_game_rooms enable row level security;
revoke all on table public.studbud_game_rooms from anon, authenticated;

create table if not exists public.studbud_multiplayer_profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    coins integer not null default 100 check (coins >= 0),
    wins integer not null default 0 check (wins >= 0),
    owned_items text[] not null default array['avatar_default', 'palette_default'],
    equipped_avatar text not null default 'avatar_default',
    equipped_palette text not null default 'palette_default',
    equipped_skin text not null default '',
    equipped_hat text not null default '',
    equipped_accessory text not null default '',
    equipped_effect text not null default '',
    best_wait_score integer not null default 0 check (best_wait_score >= 0),
    updated_at timestamptz not null default now()
);

alter table public.studbud_multiplayer_profiles
    add column if not exists equipped_skin text not null default '',
    add column if not exists equipped_hat text not null default '',
    add column if not exists equipped_accessory text not null default '',
    add column if not exists equipped_effect text not null default '',
    add column if not exists best_wait_score integer not null default 0;

-- Legacy 'accessory_default' placeholder from older versions means "nothing equipped".
update public.studbud_multiplayer_profiles set equipped_accessory = '' where equipped_accessory = 'accessory_default';

-- Move previously equipped auras out of the wearable slot without clearing them.
update public.studbud_multiplayer_profiles
set equipped_effect = equipped_accessory, equipped_accessory = ''
where equipped_effect = ''
  and (equipped_accessory like 'acc\_%\_effect'
       or equipped_accessory in ('acc_aura', 'acc_sparkles', 'acc_flame', 'acc_lightning',
                                 'acc_hearts', 'acc_stars', 'acc_snow'));

alter table public.studbud_multiplayer_profiles
    add column if not exists equipped_pet text not null default '',
    add column if not exists last_daily_claim date,
    add column if not exists daily_streak integer not null default 0,
    add column if not exists solo_coins_day date,
    add column if not exists solo_coins_today integer not null default 0;

-- Limited monthly sets. They only drop from that month's seasonal box (month is UTC).
-- Crossing counts rows, unlike the older warm-up score. Keep the legacy record separately.
alter table public.studbud_multiplayer_profiles
    add column if not exists best_crossing_rows integer not null default 0 check (best_crossing_rows between 0 and 100000);

create or replace function public.studbud_seasonal_items()
returns table (id text, month integer, rarity text)
language sql
immutable
as $$
    select * from (values
        ('palette_seasonal_newyear', 1, 'uncommon'), ('hat_seasonal_newyear', 1, 'rare'), ('skin_seasonal_newyear', 1, 'epic'), ('acc_seasonal_newyear_effect', 1, 'legendary'),
        ('palette_seasonal_valentine', 2, 'uncommon'), ('hat_seasonal_valentine', 2, 'rare'), ('skin_seasonal_valentine', 2, 'epic'), ('acc_seasonal_valentine_effect', 2, 'legendary'),
        ('palette_seasonal_clover', 3, 'uncommon'), ('hat_seasonal_clover', 3, 'rare'), ('skin_seasonal_clover', 3, 'epic'), ('acc_seasonal_clover_effect', 3, 'legendary'),
        ('palette_seasonal_spring', 4, 'uncommon'), ('hat_seasonal_spring', 4, 'rare'), ('skin_seasonal_spring', 4, 'epic'), ('acc_seasonal_spring_effect', 4, 'legendary'),
        ('palette_seasonal_grad', 5, 'uncommon'), ('hat_seasonal_grad', 5, 'rare'), ('skin_seasonal_grad', 5, 'epic'), ('acc_seasonal_grad_effect', 5, 'legendary'),
        ('palette_seasonal_summer', 6, 'uncommon'), ('hat_seasonal_summer', 6, 'rare'), ('skin_seasonal_summer', 6, 'epic'), ('acc_seasonal_summer_effect', 6, 'legendary'),
        ('palette_seasonal_fireworks', 7, 'uncommon'), ('hat_seasonal_fireworks', 7, 'rare'), ('skin_seasonal_fireworks', 7, 'epic'), ('acc_seasonal_fireworks_effect', 7, 'legendary'),
        ('palette_seasonal_school', 8, 'uncommon'), ('hat_seasonal_school', 8, 'rare'), ('skin_seasonal_school', 8, 'epic'), ('acc_seasonal_school_effect', 8, 'legendary'),
        ('palette_seasonal_autumn', 9, 'uncommon'), ('hat_seasonal_autumn', 9, 'rare'), ('skin_seasonal_autumn', 9, 'epic'), ('acc_seasonal_autumn_effect', 9, 'legendary'),
        ('palette_seasonal_halloween', 10, 'uncommon'), ('hat_seasonal_halloween', 10, 'rare'), ('skin_seasonal_halloween', 10, 'epic'), ('acc_seasonal_halloween_effect', 10, 'legendary'),
        ('palette_seasonal_harvest', 11, 'uncommon'), ('hat_seasonal_harvest', 11, 'rare'), ('skin_seasonal_harvest', 11, 'epic'), ('acc_seasonal_harvest_effect', 11, 'legendary'),
        ('palette_seasonal_holiday', 12, 'uncommon'), ('hat_seasonal_holiday', 12, 'rare'), ('skin_seasonal_holiday', 12, 'epic'), ('acc_seasonal_holiday_effect', 12, 'legendary')
    ) as seasonal(id, month, rarity)
    union all
    select extra.prefix || seasons.key || extra.suffix, seasons.month, extra.rarity
    from (values ('newyear', 1), ('valentine', 2), ('clover', 3), ('spring', 4), ('grad', 5), ('summer', 6),
        ('fireworks', 7), ('school', 8), ('autumn', 9), ('halloween', 10), ('harvest', 11), ('holiday', 12)) as seasons(key, month)
    cross join (values ('hat_seasonal_', '_alt', 'rare'), ('skin_seasonal_', '_alt', 'epic'),
        ('acc_seasonal_', '_alt_effect', 'legendary')) as extra(prefix, suffix, rarity);
$$;

-- Single source of truth for priced items and rarity (pets are box-only, so price is null).
create or replace function public.studbud_shop_items()
returns table (id text, price integer, rarity text)
language sql
immutable
as $$
    with priced(id, price) as (values
        ('palette_ocean', 120), ('palette_sunset', 120), ('palette_violet', 120),
        ('palette_aurora', 160), ('palette_coral', 160), ('palette_midnight', 180),
        ('skin_robot', 150), ('skin_ninja', 180), ('skin_alien', 180), ('skin_ghost', 220), ('skin_lava', 300), ('skin_gold', 400),
        ('skin_bubble', 130), ('skin_snow', 140), ('skin_zombie', 160), ('skin_pumpkin', 170), ('skin_cyber', 260),
        ('skin_shadow', 280), ('skin_crystal', 320), ('skin_galaxy', 450), ('skin_dragon', 500),
        ('hat_cap', 60), ('hat_party', 70), ('hat_beanie', 70), ('hat_flower', 90), ('hat_chef', 100), ('hat_cowboy', 110),
        ('hat_headphones', 120), ('hat_santa', 120), ('hat_tophat', 130), ('hat_bunny', 140), ('hat_cat', 140),
        ('hat_fedora', 110),
        ('hat_fedora_black', 110),
        ('hat_wizard', 160), ('hat_pirate', 170), ('hat_viking', 190), ('hat_horns', 200), ('hat_halo', 250), ('hat_crown', 400),
        ('acc_bowtie', 70), ('acc_shades', 80), ('acc_eyepatch', 90), ('acc_scarf', 90), ('acc_backpack', 100),
        ('acc_monocle', 140), ('acc_cape', 180), ('acc_sparkles', 220), ('acc_wings', 350),
        ('accessory_cap', 75), ('accessory_halo', 125), ('accessory_headphones', 150),
        ('skin_candy', 140), ('skin_pixel', 190), ('skin_mummy', 170), ('skin_vampire', 270), ('skin_samurai', 290),
        ('skin_steampunk', 310), ('skin_neon', 330), ('skin_rainbow', 480),
        ('hat_straw', 80), ('hat_grad', 100), ('hat_propeller', 130), ('hat_helmet', 150),
        ('palette_rose', 110), ('palette_lime', 110), ('palette_mint', 120), ('palette_mocha', 120), ('palette_teal', 130),
        ('palette_peach', 130), ('palette_lavender', 140), ('palette_gold', 150), ('palette_slate', 150), ('palette_jungle', 160),
        ('palette_crimson', 170), ('palette_glacier', 180), ('palette_sakura', 190), ('palette_ember', 210), ('palette_cyber', 240),
        ('palette_galaxy', 280), ('palette_prism', 420),
        ('acc_glasses', 70), ('acc_headband', 70), ('acc_bandana', 80), ('acc_mask', 90), ('acc_tie', 90), ('acc_mustache', 100),
        ('acc_goggles', 120), ('acc_chain', 130), ('acc_beard', 130), ('acc_medal', 150), ('acc_tail', 170), ('acc_sword', 190),
        ('acc_hearts', 200), ('acc_snow', 210), ('acc_jetpack', 240), ('acc_fairy', 260), ('acc_stars', 280), ('acc_flame', 300),
        ('acc_phoenix', 420),
        ('skin_bee', 150), ('skin_ocean', 200), ('skin_forest', 210), ('skin_ice', 350), ('skin_chrome', 380), ('skin_cosmic', 520),
        ('hat_beret', 90), ('hat_sombrero', 140), ('hat_frog', 150), ('hat_mushroom', 160), ('hat_unicorn', 230), ('hat_tiara', 300),
        ('acc_lei', 90), ('acc_guitar', 210), ('acc_lightning', 320),
        ('palette_sunrise', 150), ('palette_arctic', 170), ('palette_toxic', 200), ('palette_royal', 320),
        ('palette_sand', 70), ('palette_sky', 75), ('palette_moss', 80), ('palette_plum', 85), ('palette_steel', 90),
        ('palette_eclipse', 700), ('palette_opal', 740),
        ('skin_sprout', 70), ('skin_sunny', 75), ('skin_berry', 80), ('skin_storm', 85), ('skin_minty', 90),
        ('skin_celestial', 750), ('skin_inferno', 800),
        ('skin_bookworm', 140), ('skin_astronaut', 230), ('skin_axolotl', 380),
        ('hat_aviator', 220), ('hat_prism', 430), ('hat_satellite', 740),
        ('acc_planet_effect', 440), ('acc_music_effect', 180),
        ('hat_visor', 65), ('hat_bucket', 75), ('hat_astronaut', 210), ('hat_cosmic', 720),
        ('acc_aura', 760),
        ('acc_prism_effect', 680), ('acc_frost_effect', 420), ('acc_ember_effect', 500), ('acc_heart_effect', 320),
        ('acc_dew_effect', 75), ('acc_leaf_effect', 130), ('acc_snowflake_effect', 210),
        ('acc_electric_effect', 340), ('acc_solar_effect', 520), ('acc_vortex_effect', 760),
        ('acc_cloud_effect', 85), ('acc_confetti_effect', 145), ('acc_sakura_effect', 230),
        ('acc_pixel_effect', 360), ('acc_meteor_effect', 560), ('acc_aurora_effect', 780),
        ('acc_rune_effect', 390), ('acc_lunar_effect', 640),
        ('acc_storm_effect', 900), ('acc_blackhole_effect', 880),
        ('acc_firefly_effect', 150), ('acc_jellyfish_effect', 600),
        ('acc_blossom_effect', 190), ('acc_bubble_effect', 160), ('acc_comet_effect', 300),
        ('acc_spiral_effect', 360), ('acc_spark_effect', 110)
    ), pets(id, rarity) as (values
        ('pet_puppy', 'common'), ('pet_kitten', 'common'), ('pet_hamster', 'common'), ('pet_bunny', 'common'),
        ('pet_chick', 'common'), ('pet_frog', 'common'), ('pet_turtle', 'common'), ('pet_goldfish', 'common'),
        ('pet_fox', 'uncommon'), ('pet_panda', 'uncommon'), ('pet_koala', 'uncommon'), ('pet_penguin', 'uncommon'),
        ('pet_duck', 'uncommon'), ('pet_octopus', 'uncommon'), ('pet_owl', 'uncommon'), ('pet_bee', 'uncommon'),
        ('pet_unicorn', 'rare'), ('pet_tiger', 'rare'), ('pet_shark', 'rare'), ('pet_butterfly', 'rare'),
        ('pet_wolf', 'rare'), ('pet_dino', 'rare'), ('pet_robot', 'rare'), ('pet_ghosty', 'rare'),
        ('pet_dragon', 'epic'), ('pet_eagle', 'epic'), ('pet_alien', 'epic'), ('pet_squid', 'epic'),
        ('pet_genie', 'epic'), ('pet_gem', 'epic'), ('pet_comet', 'epic'), ('pet_phoenix', 'epic'),
        ('pet_star', 'legendary'), ('pet_planet', 'legendary'), ('pet_rainbow', 'legendary'),
        ('pet_elder', 'legendary'), ('pet_brain', 'legendary'), ('pet_trophy', 'legendary')
    )
    select priced.id, (round(priced.price * 2.5 / 5) * 5)::integer,
        case when priced.price < 100 then 'common' when priced.price < 200 then 'uncommon'
             when priced.price < 350 then 'rare' when priced.price < 550 then 'epic'
             when priced.price < 800 then 'legendary' else 'mythic' end
    from priced
    union all
    select pets.id, null::integer, pets.rarity from pets
    union all
    select seasonal.id, null::integer, seasonal.rarity from public.studbud_seasonal_items() seasonal;
$$;

-- Retired trails are removed from inventories and the shared accessory slot.
with retired(ids) as (values (array[
    'acc_leaves', 'acc_notes', 'acc_bubbles', 'acc_comet',
    'acc_rainbow_trail', 'acc_firefly_trail', 'acc_stardust_trail', 'acc_leaf_trail',
    'acc_dust_trail', 'acc_confetti_trail', 'acc_sakura_trail', 'acc_pixel_trail',
    'acc_meteor_trail', 'acc_aurora_trail'
]::text[]))
update public.studbud_multiplayer_profiles p
set owned_items = array(
        select item from unnest(p.owned_items) with ordinality as owned(item, position)
        where not (item = any(r.ids))
        order by position
    ),
    equipped_accessory = case when p.equipped_accessory = any(r.ids)
        then '' else p.equipped_accessory end,
    updated_at = now()
from retired r
where p.owned_items && r.ids or p.equipped_accessory = any(r.ids);

create or replace function public.studbud_shop_price(p_item_id text)
returns integer
language sql
immutable
as $$
    select price from public.studbud_shop_items() where id = p_item_id;
$$;

revoke all on table public.studbud_multiplayer_profiles from anon, authenticated;

create or replace function public.studbud_get_multiplayer_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_profile public.studbud_multiplayer_profiles%rowtype;
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null then raise exception 'Sign in to open the multiplayer profile.'; end if;
    insert into public.studbud_multiplayer_profiles (user_id)
    values (v_user_id) on conflict (user_id) do nothing;
    select * into v_profile from public.studbud_multiplayer_profiles where user_id = v_user_id;
    return jsonb_build_object(
        'user_id', v_profile.user_id,
        'coins', v_profile.coins,
        'wins', v_profile.wins,
        'owned_items', to_jsonb(v_profile.owned_items),
        'equipped_avatar', v_profile.equipped_avatar,
        'equipped_palette', v_profile.equipped_palette,
        'equipped_skin', v_profile.equipped_skin,
        'equipped_hat', v_profile.equipped_hat,
        'equipped_accessory', v_profile.equipped_accessory,
        'equipped_effect', v_profile.equipped_effect,
        'equipped_pet', v_profile.equipped_pet,
        'best_wait_score', v_profile.best_wait_score,
        'best_crossing_rows', v_profile.best_crossing_rows,
        'daily_claimed', v_profile.last_daily_claim = current_date,
        'daily_streak', v_profile.daily_streak,
        'solo_coins_today', case when v_profile.solo_coins_day = current_date then v_profile.solo_coins_today else 0 end
    );
end;
$$;

create or replace function public.studbud_claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_profile public.studbud_multiplayer_profiles%rowtype;
    v_streak integer;
    v_reward integer;
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_user_id is null then raise exception 'Sign in to claim your daily reward.'; end if;
    perform public.studbud_get_multiplayer_profile();
    select * into v_profile from public.studbud_multiplayer_profiles where user_id = v_user_id for update;
    if v_profile.last_daily_claim = current_date then raise exception 'You already claimed today''s reward. Come back tomorrow!'; end if;
    v_streak := case when v_profile.last_daily_claim = current_date - 1 then least(v_profile.daily_streak + 1, 7) else 1 end;
    v_reward := 25 + (v_streak - 1) * 10;
    update public.studbud_multiplayer_profiles
        set coins = coins + v_reward, last_daily_claim = current_date, daily_streak = v_streak, updated_at = now()
        where user_id = v_user_id;
    return public.studbud_get_multiplayer_profile() || jsonb_build_object('daily_reward', v_reward);
end;
$$;

create or replace function public.studbud_award_solo_coins(p_correct integer, p_total integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_profile public.studbud_multiplayer_profiles%rowtype;
    v_used integer;
    v_award integer;
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_user_id is null then raise exception 'Sign in to earn coins.'; end if;
    if p_correct is null or p_total is null or p_correct < 0 or p_total < 1 or p_correct > p_total or p_total > 100 then
        raise exception 'That game result is invalid.';
    end if;
    perform public.studbud_get_multiplayer_profile();
    select * into v_profile from public.studbud_multiplayer_profiles where user_id = v_user_id for update;
    v_used := case when v_profile.solo_coins_day = current_date then v_profile.solo_coins_today else 0 end;
    v_award := greatest(0, least(least(p_correct * 2, 30), 150 - v_used));
    update public.studbud_multiplayer_profiles
        set coins = coins + v_award, solo_coins_day = current_date, solo_coins_today = v_used + v_award, updated_at = now()
        where user_id = v_user_id;
    return public.studbud_get_multiplayer_profile() || jsonb_build_object('coins_awarded', v_award);
end;
$$;

drop function if exists public.studbud_buy_mystery_item();

create or replace function public.studbud_buy_mystery_item(p_box text default 'basic')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_profile public.studbud_multiplayer_profiles%rowtype;
    v_item_id text;
    v_cost integer;
    v_roll numeric := random();
    v_rarity text;
    v_refund integer := 0;
    v_duplicate boolean := false;
    v_prefix text := '%';
    v_chances jsonb;
    v_total numeric;
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_user_id is null then raise exception 'Sign in to open a mystery box.'; end if;
    if p_box = 'basic' then
        v_cost := 80;
    elsif p_box = 'rare' then
        v_cost := 200;
    elsif p_box = 'legendary' then
        v_cost := 500;
    elsif p_box = 'hat' then
        v_cost := 130; v_prefix := 'hat\_%';
    elsif p_box = 'accessory' then
        v_cost := 140; v_prefix := 'acc\_%';
    elsif p_box = 'effect' then
        v_cost := 200; v_prefix := 'acc\_%';
    elsif p_box = 'palette' then
        v_cost := 160; v_prefix := 'palette\_%';
    elsif p_box = 'skin' then
        v_cost := 260; v_prefix := 'skin\_%';
    elsif p_box = 'mythic' then
        v_cost := 1000;
    elsif p_box = 'season' then
        v_cost := 350;
    else
        raise exception 'Unknown mystery box.';
    end if;
    insert into public.studbud_multiplayer_profiles (user_id)
    values (v_user_id) on conflict (user_id) do nothing;
    select * into v_profile from public.studbud_multiplayer_profiles where user_id = v_user_id for update;
    v_chances := case p_box
        when 'basic' then '{"common":70,"uncommon":22,"rare":7,"epic":1}'::jsonb
        when 'rare' then '{"common":20,"uncommon":40,"rare":28,"epic":10,"legendary":2}'::jsonb
        when 'legendary' then '{"uncommon":20,"rare":40,"epic":28,"legendary":10,"mythic":2}'::jsonb
        when 'hat' then '{"common":40,"uncommon":32,"rare":20,"epic":7,"legendary":1}'::jsonb
        when 'accessory' then '{"common":40,"uncommon":32,"rare":20,"epic":7,"legendary":1}'::jsonb
        when 'effect' then '{"common":25,"uncommon":35,"rare":25,"epic":12,"legendary":2,"mythic":1}'::jsonb
        when 'palette' then '{"uncommon":50,"rare":35,"epic":13,"legendary":2}'::jsonb
        when 'skin' then '{"uncommon":40,"rare":35,"epic":20,"legendary":5}'::jsonb
        when 'mythic' then '{"epic":40,"legendary":45,"mythic":15}'::jsonb
        when 'season' then '{"uncommon":35,"rare":30,"epic":27,"legendary":8}'::jsonb
    end;
    -- Remove exhausted tiers, then reweight only the tiers allowed by this box.
    select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb), sum(r.value::numeric)
    into v_chances, v_total
    from jsonb_each_text(v_chances) r
    where exists (
        select 1 from public.studbud_shop_items() s
        where s.rarity = r.key and s.id like v_prefix
          and s.id not like 'accessory\_%' and s.id not like 'pet\_%'
          and (case when p_box = 'season'
                then s.id in (select z.id from public.studbud_seasonal_items() z where z.month = extract(month from now() at time zone 'utc')::integer)
                else s.id not like '%\_seasonal\_%' end)
          and (p_box <> 'effect' or s.id like 'acc\_%\_effect'
              or s.id in ('acc_lightning', 'acc_flame', 'acc_sparkles', 'acc_aura',
                          'acc_hearts', 'acc_stars', 'acc_snow'))
          and not (s.id = any(v_profile.owned_items))
    );
    if v_total is null then
        return public.studbud_get_multiplayer_profile()
            || jsonb_build_object('collection_complete', true, 'completed_box', p_box);
    end if;
    if v_profile.coins < v_cost then raise exception 'You need % multiplayer coins to open that box.', v_cost; end if;
    select key into v_rarity
    from (
        select key, sum(value::numeric) over (order by key) as cumulative
        from jsonb_each_text(v_chances)
    ) tiers
    where cumulative > v_roll * v_total
    order by cumulative limit 1;
    select s.id into v_item_id
    from public.studbud_shop_items() s
    where s.id not like 'accessory\_%' and s.id not like 'pet\_%' and s.id like v_prefix
      and (case when p_box = 'season'
            then s.id in (select z.id from public.studbud_seasonal_items() z where z.month = extract(month from now() at time zone 'utc')::integer)
            else s.id not like '%\_seasonal\_%' end)
      and (p_box <> 'effect' or s.id like 'acc\_%\_effect'
            or s.id in ('acc_lightning', 'acc_flame', 'acc_sparkles', 'acc_aura',
                        'acc_hearts', 'acc_stars', 'acc_snow'))
      and not (s.id = any(v_profile.owned_items))
      and s.rarity = v_rarity
    order by random()
    limit 1;
    if v_item_id is null then raise exception 'The box reward could not be selected. Please try again.'; end if;
    select s.rarity into v_rarity from public.studbud_shop_items() s where s.id = v_item_id;

    update public.studbud_multiplayer_profiles
    set coins = coins - v_cost,
        owned_items = array_append(owned_items, v_item_id),
        updated_at = now()
    where user_id = v_user_id;
    return public.studbud_get_multiplayer_profile()
        || jsonb_build_object('unlocked_item', v_item_id, 'duplicate', v_duplicate, 'refund', v_refund, 'rarity', v_rarity);
end;
$$;

create or replace function public.studbud_record_waiting_game_best(p_score integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_user_id is null then raise exception 'Sign in to save your personal best.'; end if;
    if p_score is null or p_score < 0 or p_score > 100000 then raise exception 'That warm-up score is invalid.'; end if;
    insert into public.studbud_multiplayer_profiles (user_id, best_wait_score)
    values (v_user_id, p_score)
    on conflict (user_id) do update
        set best_wait_score = greatest(studbud_multiplayer_profiles.best_wait_score, excluded.best_wait_score),
            updated_at = now();
    return public.studbud_get_multiplayer_profile();
end;
$$;

create or replace function public.studbud_record_crossing_best(p_score integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or public.studbud_is_guest() then raise exception 'Sign in to save your Crossing record.'; end if;
    if p_score is null or p_score not between 0 and 100000 then raise exception 'That Crossing row count is invalid.'; end if;
    insert into public.studbud_multiplayer_profiles (user_id, best_crossing_rows)
    values (auth.uid(), p_score)
    on conflict (user_id) do update
        set best_crossing_rows = greatest(studbud_multiplayer_profiles.best_crossing_rows, excluded.best_crossing_rows),
            updated_at = now();
    return public.studbud_get_multiplayer_profile();
end;
$$;
revoke all on function public.studbud_record_crossing_best(integer) from public, anon;
grant execute on function public.studbud_record_crossing_best(integer) to authenticated;

create or replace function public.studbud_buy_multiplayer_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_cost integer;
    v_profile public.studbud_multiplayer_profiles%rowtype;
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_user_id is null then raise exception 'Sign in to shop.'; end if;
    if p_item_id like 'pet\_%' then raise exception 'Pets can only be found in mystery boxes.'; end if;
    v_cost := public.studbud_shop_price(p_item_id);
    if v_cost is null then raise exception 'That shop item is not available.'; end if;
    insert into public.studbud_multiplayer_profiles (user_id)
    values (v_user_id) on conflict (user_id) do nothing;
    select * into v_profile from public.studbud_multiplayer_profiles where user_id = v_user_id for update;
    if p_item_id = any(v_profile.owned_items) then raise exception 'You already own that item.'; end if;
    if v_profile.coins < v_cost then raise exception 'You do not have enough multiplayer coins.'; end if;
    update public.studbud_multiplayer_profiles
    set coins = coins - v_cost, owned_items = array_append(owned_items, p_item_id), updated_at = now()
    where user_id = v_user_id;
    return public.studbud_get_multiplayer_profile();
end;
$$;

create or replace function public.studbud_equip_multiplayer_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_profile public.studbud_multiplayer_profiles%rowtype;
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_user_id is null then raise exception 'Sign in to customize your multiplayer profile.'; end if;
    if p_item_id like 'acc\_%\_trail' or p_item_id in ('acc_leaves', 'acc_notes', 'acc_bubbles', 'acc_comet') then
        raise exception 'Trails have been retired. Choose an aura or accessory instead.';
    end if;
    select * into v_profile from public.studbud_multiplayer_profiles where user_id = v_user_id for update;
    if not found or not p_item_id = any(v_profile.owned_items) then raise exception 'You do not own that item.'; end if;
    if p_item_id like 'avatar_%' then
        update public.studbud_multiplayer_profiles set equipped_avatar = p_item_id, updated_at = now() where user_id = v_user_id;
    elsif p_item_id like 'palette_%' then
        update public.studbud_multiplayer_profiles set equipped_palette = p_item_id, updated_at = now() where user_id = v_user_id;
    elsif p_item_id like 'skin_%' then
        update public.studbud_multiplayer_profiles set equipped_skin = p_item_id, updated_at = now() where user_id = v_user_id;
    elsif p_item_id like 'hat_%' or p_item_id like 'accessory_%' then
        update public.studbud_multiplayer_profiles set equipped_hat = p_item_id, updated_at = now() where user_id = v_user_id;
    elsif p_item_id like 'acc\_%\_effect'
       or p_item_id in ('acc_aura', 'acc_sparkles', 'acc_flame', 'acc_lightning',
                        'acc_hearts', 'acc_stars', 'acc_snow') then
        update public.studbud_multiplayer_profiles set equipped_effect = p_item_id, updated_at = now() where user_id = v_user_id;
    elsif p_item_id like 'acc\_%' then
        update public.studbud_multiplayer_profiles set equipped_accessory = p_item_id, updated_at = now() where user_id = v_user_id;
    elsif p_item_id like 'pet\_%' then
        update public.studbud_multiplayer_profiles set equipped_pet = p_item_id, updated_at = now() where user_id = v_user_id;
    else
        raise exception 'That item cannot be equipped.';
    end if;
    return public.studbud_get_multiplayer_profile();
end;
$$;

create or replace function public.studbud_unequip_multiplayer_slot(p_slot text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_user_id is null then raise exception 'Sign in to customize your multiplayer profile.'; end if;
    insert into public.studbud_multiplayer_profiles (user_id) values (v_user_id) on conflict (user_id) do nothing;
    if p_slot = 'skin' then update public.studbud_multiplayer_profiles set equipped_skin = '', updated_at = now() where user_id = v_user_id;
    elsif p_slot = 'hat' then update public.studbud_multiplayer_profiles set equipped_hat = '', updated_at = now() where user_id = v_user_id;
    elsif p_slot = 'accessory' then update public.studbud_multiplayer_profiles set equipped_accessory = '', updated_at = now() where user_id = v_user_id;
    elsif p_slot = 'effect' then update public.studbud_multiplayer_profiles set equipped_effect = '', updated_at = now() where user_id = v_user_id;
    elsif p_slot = 'palette' then update public.studbud_multiplayer_profiles set equipped_palette = 'palette_default', updated_at = now() where user_id = v_user_id;
    elsif p_slot = 'pet' then update public.studbud_multiplayer_profiles set equipped_pet = '', updated_at = now() where user_id = v_user_id;
    else raise exception 'Unknown slot.'; end if;
    return public.studbud_get_multiplayer_profile();
end;
$$;

create table if not exists public.studbud_user_tags (
    user_id uuid not null references auth.users (id) on delete cascade,
    tag text not null check (tag in ('teacher', 'tester', 'moderator')),
    granted_by uuid references auth.users (id) on delete set null,
    granted_at timestamptz not null default now(),
    primary key (user_id, tag)
);
alter table public.studbud_user_tags enable row level security;
revoke all on table public.studbud_user_tags from anon, authenticated;

create or replace function public.studbud_user_tags_for(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(array_agg(tag order by case tag when 'teacher' then 1 when 'tester' then 2 else 3 end), array[]::text[])
    from public.studbud_user_tags where user_id = p_user_id;
$$;
revoke all on function public.studbud_user_tags_for(uuid) from public, anon;

create or replace function public.studbud_player_cosmetics(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select jsonb_build_object(
        'avatar', coalesce(profile.equipped_avatar, 'avatar_default'),
        'palette', coalesce(profile.equipped_palette, 'palette_default'),
        'skin', coalesce(profile.equipped_skin, ''),
        'hat', coalesce(profile.equipped_hat, ''),
        'accessory', coalesce(profile.equipped_accessory, ''),
        'effect', coalesce(profile.equipped_effect, ''),
        'tags', to_jsonb(public.studbud_user_tags_for(p_user_id)),
        'pet', coalesce(profile.equipped_pet, '')
    )
    from (select p_user_id as user_id) user_ref
    left join public.studbud_multiplayer_profiles profile on profile.user_id = user_ref.user_id;
$$;

create or replace function public.studbud_pay_game_rewards(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
    v_player jsonb;
    v_high_score integer;
    v_rewards jsonb := '{}'::jsonb;
    v_reward integer;
    v_chess_winner text;
    v_is_winner boolean;
begin
    select * into v_room from public.studbud_game_rooms where id = p_room_id for update;
    if not found or v_room.status <> 'finished' or v_room.rewards_paid then return; end if;
    select coalesce(max((player ->> 'score')::integer), 0)
    into v_high_score
    from jsonb_array_elements(v_room.state -> 'players') as item(player);
    if v_room.mode = 'chess' and v_room.state -> 'chess' ->> 'winner' in ('0', '1') then
        v_chess_winner := (v_room.state -> 'players' -> ((v_room.state -> 'chess' ->> 'winner')::integer)) ->> 'id';
    end if;

    for v_player in
        select player from jsonb_array_elements(v_room.state -> 'players') as item(player)
        where coalesce((player ->> 'correct_count')::integer, 0) > 0 or coalesce((player ->> 'score')::integer, 0) > 0
    loop
        if exists (select 1 from auth.users where id = (v_player ->> 'id')::uuid and is_anonymous) then
            v_rewards := jsonb_set(v_rewards, array[v_player ->> 'id'], '0'::jsonb, true);
            continue;
        end if;
        v_is_winner := case when v_room.mode = 'defense' then coalesce(
                v_room.state -> 'defense' -> 'teams' ->> (v_player ->> 'id') = v_room.state -> 'defense' ->> 'winner', false)
            when v_room.mode = 'chess' then coalesce(v_player ->> 'id' = v_chess_winner, false)
            else (v_player ->> 'score')::integer = v_high_score and v_high_score > 0 end;
        v_reward := least(250, coalesce((v_player ->> 'correct_count')::integer, 0) * 6)
            + case when v_is_winner then 25 else 0 end;
        insert into public.studbud_multiplayer_profiles (user_id)
        values ((v_player ->> 'id')::uuid) on conflict (user_id) do nothing;
        update public.studbud_multiplayer_profiles
        set coins = coins + v_reward,
            wins = wins + case when v_is_winner then 1 else 0 end,
            updated_at = now()
        where user_id = (v_player ->> 'id')::uuid;
        v_rewards := jsonb_set(v_rewards, array[v_player ->> 'id'], to_jsonb(v_reward), true);
    end loop;

    update public.studbud_game_rooms
    set rewards_paid = true,
        state = jsonb_set(state, '{coin_rewards}', v_rewards, true),
        updated_at = now()
    where id = p_room_id;
end;
$$;

create or replace function public.studbud_game_make_question(p_cards jsonb, p_index integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
    v_card jsonb;
    v_options jsonb;
begin
    v_card := p_cards -> (p_index % jsonb_array_length(p_cards));

    -- Prefer the author's own wrong options, then other answers that look alike (similar length and both numeric or both text).
    with custom as (
        -- Usually keep the author's options, but sometimes swap one out so the choice set changes between rounds.
        select btrim(value) as answer, case when random() < 0.7 then 0 else 2 end as tier, random() as score
        from jsonb_array_elements_text(case when jsonb_typeof(v_card -> 'distractors') = 'array' then v_card -> 'distractors' else '[]'::jsonb end) as option(value)
        where btrim(value) <> '' and lower(btrim(value)) <> lower(btrim(v_card ->> 'back'))
    ), pool as (
        select btrim(card ->> 'back') as answer, 1 as tier,
            abs(char_length(btrim(card ->> 'back')) - char_length(btrim(v_card ->> 'back')))::numeric
                / greatest(char_length(btrim(v_card ->> 'back')), 1)
            + case when (card ->> 'back' ~ '^\s*[-+]?[0-9]') = (v_card ->> 'back' ~ '^\s*[-+]?[0-9]') then 0 else 1 end
            + random() * 1.6 as score
        from jsonb_array_elements(p_cards) as item(card)
        where btrim(coalesce(card ->> 'back', '')) <> ''
            and lower(btrim(card ->> 'back')) <> lower(btrim(v_card ->> 'back'))
    ), picked as (
        select answer from (select * from custom union all select * from pool) as candidates
        group by answer
        order by min(tier), min(score)
        limit 3
    )
    select jsonb_agg(to_jsonb(answer) order by random())
    into v_options
    from (select answer from picked union all select v_card ->> 'back') as choices;

    if not coalesce(v_options @> jsonb_build_array(v_card ->> 'back'), false) then
        v_options := coalesce(v_options, '[]'::jsonb) || jsonb_build_array(v_card ->> 'back');
    end if;

    return jsonb_build_object(
        'number', p_index,
        'front', v_card ->> 'front',
        'options', v_options,
        'started_at', clock_timestamp(),
        'correct_answer', v_card ->> 'back'
    );
end;
$$;

create or replace function public.studbud_game_room_view(p_room public.studbud_game_rooms)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_state jsonb := p_room.state;
begin
    v_state := jsonb_set(v_state, '{players}', coalesce((
        select jsonb_agg(
            player || jsonb_build_object(
                'username', coalesce(account.raw_user_meta_data ->> 'username', ''),
                'skin', coalesce(profile.equipped_skin, player ->> 'skin', ''),
                'hat', coalesce(profile.equipped_hat, player ->> 'hat', ''),
                'accessory', coalesce(profile.equipped_accessory, player ->> 'accessory', ''),
                'effect', coalesce(profile.equipped_effect, player ->> 'effect', ''),
                'tags', to_jsonb(public.studbud_user_tags_for(profile.user_id))
            ) order by position
        )
        from jsonb_array_elements(coalesce(v_state -> 'players', '[]'::jsonb))
            with ordinality as members(player, position)
        left join public.studbud_multiplayer_profiles profile
            on profile.user_id::text = player ->> 'id'
        left join auth.users account on account.id::text = player ->> 'id'
    ), '[]'::jsonb), true);

    if auth.uid() is distinct from p_room.host_id
        and jsonb_typeof(v_state -> 'question') = 'object' then
        v_state := jsonb_set(
            v_state,
            '{question}',
            coalesce(v_state -> 'question', 'null'::jsonb) - 'correct_answer',
            true
        );
    end if;

    return (to_jsonb(p_room) - 'cards')
        || jsonb_build_object('state', v_state, 'card_count', jsonb_array_length(p_room.cards));
end;
$$;

create or replace function public.studbud_create_game_room(
    p_code text,
    p_nickname text,
    p_deck_title text,
    p_cards jsonb,
    p_mode text,
    p_options jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_room public.studbud_game_rooms%rowtype;
    v_nickname text := btrim(p_nickname);
    v_cards jsonb := p_cards;
    v_goal_type text := 'time';
    v_point_limit integer := 1000;
    v_time_limit integer := coalesce((p_options ->> 'time_limit_seconds')::integer, 300);
    v_reward integer := coalesce((p_options ->> 'question_reward')::integer, 20);
    v_cosmetics jsonb;
begin
    if v_user_id is null then raise exception 'Sign in to host a game.'; end if;
    if public.studbud_is_guest() and (select count(*) from public.studbud_game_rooms where host_id = v_user_id and expires_at > now() and status <> 'finished') >= 3 then
        raise exception 'Guests can host up to 3 open games at once. Finish one first.';
    end if;
    if p_code !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'The room code is invalid.'; end if;
    if char_length(v_nickname) not between 2 and 20 or v_nickname !~ '^[A-Za-z0-9 _-]+$' then
        raise exception 'Nickname must be 2–20 letters, numbers, spaces, underscores, or hyphens.';
    end if;
    if coalesce(p_mode, '') not in ('classic', 'rush', 'survival', 'skyline', 'river', 'market', 'miner', 'duel', 'crypto', 'shooter', 'sports', 'fishing', 'hack', 'chess', 'defense') then raise exception 'Choose a valid game mode.'; end if;
    if v_goal_type not in ('points', 'time') then raise exception 'Choose a valid match goal.'; end if;
    if p_mode = 'chess' then v_goal_type := 'points'; v_time_limit := 0; v_reward := 1; end if;
    if p_mode = 'defense' then v_goal_type := 'points'; v_time_limit := 0; end if;
    if p_mode not in ('chess', 'defense') and v_time_limit not between 60 and 3600 then
        raise exception 'Choose a time limit between 1 minute and 1 hour.';
    end if;
    if p_mode <> 'chess' and (v_reward not between 5 and 100 or v_reward % 5 <> 0) then raise exception 'Choose resources per answer from 5 to 100 in increments of 5.'; end if;
    if jsonb_typeof(v_cards) is distinct from 'array' then raise exception 'The selected deck is invalid.'; end if;
    if jsonb_array_length(v_cards) < 1 then raise exception 'A hosted game needs at least one card.'; end if;
    if exists (
        select 1 from jsonb_array_elements(v_cards) as item(card)
        where jsonb_typeof(card) <> 'object'
            or char_length(btrim(coalesce(card ->> 'front', ''))) not between 1 and 1000
            or char_length(btrim(coalesce(card ->> 'back', ''))) not between 1 and 1000
    ) then raise exception 'Every game card needs a term and definition under 1000 characters.'; end if;
    delete from public.studbud_game_rooms where expires_at <= now();

    insert into public.studbud_multiplayer_profiles (user_id)
    values (v_user_id) on conflict (user_id) do nothing;
    v_cosmetics := public.studbud_player_cosmetics(v_user_id);

    insert into public.studbud_game_rooms (
        room_code, host_id, deck_title, cards, mode, state, goal_type, point_limit, time_limit_seconds
    )
    values (
        p_code,
        v_user_id,
        left(btrim(p_deck_title), 100),
        v_cards,
        p_mode,
        jsonb_build_object(
            'public_deck_id', (select d.id from public.studbud_community_decks d where d.id::text = p_options ->> 'public_deck_id'),
            'source_deck_id', left(p_options ->> 'source_deck_id', 100),
            'players', jsonb_build_array(jsonb_build_object(
                'id', v_user_id::text, 'nickname', v_nickname, 'score', 0,
                'streak', 0, 'lives', 3, 'answered', false, 'answered_count', 0, 'eliminated', false,
                'distance', 0, 'loot', 0, 'deliveries', 0, 'depth', 0, 'yards', 0,
                'touchdowns', 0, 'targets', 0, 'wave', 1, 'last_event', '', 'last_action', '',
                'avatar', v_cosmetics ->> 'avatar', 'palette', v_cosmetics ->> 'palette',
                'skin', v_cosmetics ->> 'skin', 'hat', v_cosmetics ->> 'hat',
                'accessory', v_cosmetics ->> 'accessory', 'effect', v_cosmetics ->> 'effect',
                'tags', v_cosmetics -> 'tags', 'pet', v_cosmetics ->> 'pet'
            )),
            'question_index', -1,
            'question', null,
            'question_reward', v_reward
        ),
        v_goal_type,
        v_point_limit,
        v_time_limit
    )
    returning * into v_room;

    return public.studbud_game_room_view(v_room);
end;
$$;

create or replace function public.studbud_create_game_room(
    p_code text,
    p_nickname text,
    p_deck_title text,
    p_cards jsonb,
    p_mode text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
    select public.studbud_create_game_room(
        p_code, p_nickname, p_deck_title, p_cards, p_mode,
        '{"goal_type":"points","point_limit":1000,"time_limit_seconds":300}'::jsonb
    );
$$;

create or replace function public.studbud_join_game_room(p_code text, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_nickname text := btrim(p_nickname);
    v_room public.studbud_game_rooms%rowtype;
    v_players jsonb;
    v_cosmetics jsonb;
begin
    if v_user_id is null then raise exception 'Sign in to join a game.'; end if;
    if char_length(v_nickname) not between 2 and 20 or v_nickname !~ '^[A-Za-z0-9 _-]+$' then
        raise exception 'Nickname must be 2–20 letters, numbers, spaces, underscores, or hyphens.';
    end if;

    select * into v_room
    from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now()
    for update;
    if not found then raise exception 'Room not found or expired. Check the code and try again.'; end if;
    if v_room.status <> 'waiting' then raise exception 'This game has already started.'; end if;

    v_players := v_room.state -> 'players';
    if exists (
        select 1 from jsonb_array_elements(v_players) as item(player)
        where player ->> 'id' = v_user_id::text
    ) then return public.studbud_game_room_view(v_room); end if;
    if v_room.mode = 'duel' and jsonb_array_length(v_players) >= 8 then
        raise exception 'This 1v1 room already has both players.';
    end if;
    if v_room.mode = 'chess' and jsonb_array_length(v_players) >= 2 then
        raise exception 'This chess room already has both players.';
    end if;
    if jsonb_array_length(v_players) >= 16 then raise exception 'This room is full (16 players maximum).'; end if;
    insert into public.studbud_multiplayer_profiles (user_id)
    values (v_user_id) on conflict (user_id) do nothing;
    v_cosmetics := public.studbud_player_cosmetics(v_user_id);

    v_players := v_players || jsonb_build_array(jsonb_build_object(
        'id', v_user_id::text, 'nickname', v_nickname, 'score', 0,
        'streak', 0, 'lives', 3, 'answered', false, 'answered_count', 0, 'eliminated', false,
        'distance', 0, 'loot', 0, 'deliveries', 0, 'depth', 0, 'yards', 0,
        'touchdowns', 0, 'targets', 0, 'wave', 1, 'last_event', '', 'last_action', '',
        'avatar', v_cosmetics ->> 'avatar', 'palette', v_cosmetics ->> 'palette',
        'skin', v_cosmetics ->> 'skin', 'hat', v_cosmetics ->> 'hat',
        'accessory', v_cosmetics ->> 'accessory', 'effect', v_cosmetics ->> 'effect',
        'tags', v_cosmetics -> 'tags', 'pet', v_cosmetics ->> 'pet'
    ));
    update public.studbud_game_rooms
    set state = jsonb_set(state, '{players}', v_players),
        updated_at = now()
    where id = v_room.id
    returning * into v_room;

    return public.studbud_game_room_view(v_room);
end;
$$;

-- Guests have no cosmetics, so they can pick one of a few free starter colors for their character.
create or replace function public.studbud_set_guest_color(p_code text, p_color text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
begin
    if auth.uid() is null or not public.studbud_is_guest() then return; end if;
    if lower(coalesce(p_color, '')) not in ('#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf', '#fb923c') then
        raise exception 'Choose one of the starter colors.';
    end if;
    select * into v_room from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now() for update;
    if not found then return; end if;
    update public.studbud_game_rooms
    set state = jsonb_set(state, '{players}', (
            select jsonb_agg(case when player ->> 'id' = auth.uid()::text
                then player || jsonb_build_object('color', lower(p_color)) else player end order by position)
            from jsonb_array_elements(state -> 'players') with ordinality as members(player, position)
        )),
        updated_at = now()
    where id = v_room.id and jsonb_array_length(state -> 'players') > 0;
end;
$$;
revoke all on function public.studbud_set_guest_color(text, text) from public, anon;
grant execute on function public.studbud_set_guest_color(text, text) to authenticated;

create or replace function public.studbud_get_game_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
begin
    if auth.uid() is null then raise exception 'Sign in to view a game.'; end if;
    select * into v_room
    from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now();
    if v_room.id is null then raise exception 'You are not in this game, or the room has expired.'; end if;
    if v_room.status = 'playing' and v_room.goal_type = 'time'
        and now() >= v_room.started_at + make_interval(secs => v_room.time_limit_seconds) then
        update public.studbud_game_rooms set status = 'finished', updated_at = now()
        where id = v_room.id returning * into v_room;
        perform public.studbud_pay_game_rewards(v_room.id);
        select * into v_room from public.studbud_game_rooms where id = v_room.id;
    end if;
    if not exists (
        select 1 from jsonb_array_elements(v_room.state -> 'players') as item(player)
        where player ->> 'id' = auth.uid()::text
    ) then raise exception 'You are not in this game, or the room has expired.'; end if;
    return public.studbud_game_room_view(v_room);
end;
$$;

create or replace function public.studbud_start_game_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
    v_players jsonb;
begin
    select * into v_room
    from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now()
    for update;
    if not found or v_room.host_id is distinct from auth.uid() then raise exception 'Only the host can start this game.'; end if;
    if v_room.status <> 'waiting' then raise exception 'This game has already started.'; end if;
    v_players := v_room.state -> 'players';
    if jsonb_array_length(v_players) < 2 then raise exception 'At least two players are needed to start.'; end if;
    if v_room.mode = 'chess' and jsonb_array_length(v_players) <> 2 then raise exception 'Chess requires exactly two players.'; end if;

    update public.studbud_game_rooms
    set status = 'playing',
        started_at = now(),
        state = jsonb_build_object(
            'players', v_players,
            'public_deck_id', v_room.state -> 'public_deck_id',
            'source_deck_id', v_room.state -> 'source_deck_id',
            'question_index', 0,
            'question_reward', coalesce((v_room.state ->> 'question_reward')::integer, 20),
            'question', public.studbud_game_make_question(cards, 0)
        ),
        updated_at = now()
    where id = v_room.id
    returning * into v_room;
    if v_room.mode in ('chess', 'defense') then
        update public.studbud_game_rooms set expires_at = 'infinity'::timestamptz where id = v_room.id returning * into v_room;
    end if;
    if v_room.mode = 'defense' then
        update public.studbud_game_rooms
        set state = jsonb_set(state, '{defense_teams}', (
            select jsonb_object_agg(player ->> 'id', (n - 1) % 2)
            from jsonb_array_elements(v_players) with ordinality c(player, n)
        )) where id = v_room.id returning * into v_room;
    end if;
    return public.studbud_game_room_view(v_room);
end;
$$;

drop function if exists public.studbud_submit_game_answer(text, integer, integer);
create or replace function public.studbud_submit_game_answer(
    p_code text,
    p_question_number integer,
    p_choice_index integer,
    p_action text default 'steady'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
    v_player jsonb;
    v_players jsonb := '[]'::jsonb;
    v_correct boolean;
    v_points integer;
    v_streak integer;
    v_lives integer;
    v_action text;
    v_roll integer;
    v_progress integer;
    v_yards integer;
    v_touchdowns integer;
    v_targets integer;
    v_event text;
begin
    if p_choice_index is null or p_choice_index < 0 then raise exception 'Choose an answer.'; end if;
    select * into v_room
    from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now()
    for update;
    if not found or v_room.status <> 'playing' then raise exception 'This game is not accepting answers.'; end if;
    if v_room.goal_type = 'time'
        and now() >= v_room.started_at + make_interval(secs => v_room.time_limit_seconds) then
        update public.studbud_game_rooms set status = 'finished', updated_at = now()
        where id = v_room.id returning * into v_room;
        perform public.studbud_pay_game_rewards(v_room.id);
        select * into v_room from public.studbud_game_rooms where id = v_room.id;
        return public.studbud_game_room_view(v_room);
    end if;
    if p_question_number is null or (v_room.state ->> 'question_index')::integer <> p_question_number then
        raise exception 'That question has expired.';
    end if;
    if p_choice_index >= jsonb_array_length(v_room.state #> '{question,options}') then raise exception 'Choose one of the displayed answers.'; end if;

    v_correct := (v_room.state #> '{question,options}') ->> p_choice_index
        = v_room.state #>> '{question,correct_answer}';
    if coalesce(p_action, '') !~ '^[a-z_]{1,24}$' then raise exception 'Choose a valid game action.'; end if;
    for v_player in select value from jsonb_array_elements(v_room.state -> 'players') loop
        if v_player ->> 'id' = auth.uid()::text then
            if coalesce((v_player ->> 'eliminated')::boolean, false) then raise exception 'You are out of this Survival round.'; end if;
            if coalesce((v_player ->> 'answered')::boolean, false) then raise exception 'You already answered this question.'; end if;
            v_streak := case when v_correct then coalesce((v_player ->> 'streak')::integer, 0) + 1 else 0 end;
            v_lives := coalesce((v_player ->> 'lives')::integer, 3);
            v_action := coalesce(p_action, 'steady');
            if (v_room.mode = 'skyline' and v_action not in ('sprint', 'vault'))
                or (v_room.mode = 'river' and v_action not in ('shore_cast', 'deep_cast'))
                or (v_room.mode = 'market' and v_action not in ('deliver', 'bargain'))
                or (v_room.mode = 'miner' and v_action not in ('drill', 'blast'))
                or (v_room.mode = 'duel' and v_action not in ('swing', 'guard'))
                or (v_room.mode = 'crypto' and v_action not in ('buy', 'short'))
                or (v_room.mode = 'shooter' and v_action not in ('precision', 'scatter'))
                or (v_room.mode = 'sports' and v_action not in ('run', 'pass')) then
                raise exception 'That action is not available in this game.';
            end if;
            v_roll := floor(random() * 100)::integer;
            v_event := case when v_correct then 'Nice answer!' else 'Missed answer' end;
            v_progress := 0;
            v_yards := coalesce((v_player ->> 'yards')::integer, 0);
            v_touchdowns := coalesce((v_player ->> 'touchdowns')::integer, 0);
            v_targets := coalesce((v_player ->> 'targets')::integer, 0);
            if v_room.mode = 'survival' and not v_correct then v_lives := v_lives - 1; end if;
            if v_correct and v_room.mode = 'sports' then
                v_progress := case when v_action = 'run' then 7 + (v_roll % 10)
                    when v_roll < 68 then 16 + (v_roll % 36) else 0 end;
                v_event := case when v_action = 'pass' and v_progress = 0 then 'Pass intercepted — no gain'
                    else format('%s play · %s yards', initcap(v_action), v_progress) end;
                v_touchdowns := v_touchdowns + greatest(0, floor((v_yards + v_progress)::numeric / 100)::integer - floor(v_yards::numeric / 100)::integer);
                v_yards := (v_yards + v_progress) % 100;
            elsif v_correct and v_room.mode = 'shooter' then
                v_targets := v_targets + case when v_action = 'scatter' then 2 else 1 end;
                v_event := case when v_action = 'scatter' then 'Scatter burst cleared multiple drones!'
                    else 'Precision hit! Target down.' end;
            elsif v_correct and v_room.mode = 'skyline' then
                v_progress := case when v_action = 'vault' then 2 else 1 end;
                v_event := case when v_action = 'vault' then 'Vaulted the hazard · shortcut!' else 'Checkpoint reached!' end;
            elsif v_correct and v_room.mode = 'river' then
                v_event := case when v_action = 'shore_cast' then 'Safe cast · steady catch!'
                    when v_roll < 58 then 'Lucky deep cast · rare catch!'
                    when v_roll < 88 then 'Deep cast · solid catch.'
                    else 'The big one got away!' end;
            elsif v_correct and v_room.mode = 'crypto' then
                v_event := case when v_action = 'buy' and v_roll < 62 then 'Market uptick · token gained value!'
                    when v_action = 'buy' then 'Market dipped · small loss.'
                    when v_roll < 24 then 'Short squeeze! Position liquidated.'
                    when v_roll < 76 then 'Nice short · profit secured.'
                    else 'Big crash · jackpot short!' end;
            elsif v_correct and v_room.mode = 'market' then
                v_event := case when v_action = 'deliver' then 'Order delivered · tip earned!'
                    when v_roll < 25 then 'Bargain backfired · empty stall.'
                    when v_roll < 82 then 'Trade made · extra coins!'
                    else 'Market jackpot · rare goods!' end;
            elsif v_correct and v_room.mode = 'miner' then
                v_event := case when v_action = 'drill' then 'Vein mined · steady crystals.'
                    when v_roll < 30 then 'Blast missed the seam.'
                    when v_roll < 82 then 'Blast uncovered a crystal pocket!'
                    else 'Rich strike · cave jackpot!' end;
            elsif v_correct and v_room.mode = 'duel' then
                v_progress := case when v_action = 'swing' then 2 else 1 end;
                v_event := case when v_action = 'swing' then 'Hammer strike · rival staggered!'
                    else 'Guard held · counter-step gained.' end;
            end if;
            v_points := case
                when not v_correct and v_room.mode = 'crypto' and v_action = 'short' then -75
                when not v_correct then 0
                when v_room.mode = 'rush' then 100
                    + least(200, greatest(0, 200 - floor(extract(epoch from now() - (v_room.state #>> '{question,started_at}')::timestamptz) * 10)::integer))
                    + least(100, (v_streak - 1) * 20)
                when v_room.mode = 'skyline' then 75 + v_progress * 45 + least(100, (v_streak - 1) * 15)
                when v_room.mode = 'river' and v_action = 'shore_cast' then 100 + least(100, (v_streak - 1) * 15)
                when v_room.mode = 'river' and v_roll < 58 then 260 + least(100, (v_streak - 1) * 20)
                when v_room.mode = 'river' and v_roll < 88 then 150 + least(80, (v_streak - 1) * 15)
                when v_room.mode = 'river' then 30
                when v_room.mode = 'market' and v_action = 'deliver' then 110 + least(180, (v_streak - 1) * 25)
                when v_room.mode = 'market' and v_roll < 25 then 0
                when v_room.mode = 'market' and v_roll < 82 then 220
                when v_room.mode = 'market' then 430
                when v_room.mode = 'miner' and v_action = 'drill' then 105 + least(180, (v_streak - 1) * 25)
                when v_room.mode = 'miner' and v_roll < 30 then 0
                when v_room.mode = 'miner' and v_roll < 82 then 240
                when v_room.mode = 'miner' then 480
                when v_room.mode = 'duel' and v_action = 'swing' then 180
                when v_room.mode = 'duel' then 130
                when v_room.mode = 'crypto' and v_action = 'buy' and v_roll < 62 then 160
                when v_room.mode = 'crypto' and v_action = 'buy' then -40
                when v_room.mode = 'crypto' and v_roll < 24 then -120
                when v_room.mode = 'crypto' and v_roll < 76 then 220
                when v_room.mode = 'crypto' then 520
                when v_room.mode = 'shooter' and v_action = 'scatter' then 230
                when v_room.mode = 'sports' then v_progress * 6 + case when v_progress > 0 then 35 else 0 end
                else 100
            end;
            v_player := jsonb_set(v_player, '{score}', to_jsonb(greatest(0, coalesce((v_player ->> 'score')::integer, 0) + v_points)));
            v_player := jsonb_set(v_player, '{streak}', to_jsonb(v_streak));
            v_player := jsonb_set(v_player, '{lives}', to_jsonb(v_lives));
            v_player := jsonb_set(v_player, '{answered}', 'true'::jsonb);
            v_player := jsonb_set(v_player, '{answered_count}', to_jsonb(coalesce((v_player ->> 'answered_count')::integer, 0) + 1));
            v_player := jsonb_set(v_player, '{last_correct}', to_jsonb(v_correct));
            v_player := jsonb_set(v_player, '{eliminated}', to_jsonb(v_room.mode = 'survival' and v_lives <= 0));
            v_player := jsonb_set(v_player, '{last_action}', to_jsonb(v_action));
            v_player := jsonb_set(v_player, '{last_event}', to_jsonb(v_event));
            v_player := jsonb_set(v_player, '{distance}', to_jsonb(coalesce((v_player ->> 'distance')::integer, 0) + v_progress));
            v_player := jsonb_set(v_player, '{checkpoint}', to_jsonb(floor((coalesce((v_player ->> 'distance')::integer, 0) + v_progress)::numeric / 5)::integer));
            v_player := jsonb_set(v_player, '{yards}', to_jsonb(v_yards));
            v_player := jsonb_set(v_player, '{touchdowns}', to_jsonb(v_touchdowns));
            v_player := jsonb_set(v_player, '{targets}', to_jsonb(v_targets));
            v_player := jsonb_set(v_player, '{wave}', to_jsonb(greatest(1, floor(v_targets::numeric / 5)::integer + 1)));
            v_player := jsonb_set(v_player, '{loot}', to_jsonb(coalesce((v_player ->> 'loot')::integer, 0) + greatest(0, v_points)));
            v_player := jsonb_set(v_player, '{deliveries}', to_jsonb(coalesce((v_player ->> 'deliveries')::integer, 0) + case when v_correct and v_room.mode = 'market' then 1 else 0 end));
            v_player := jsonb_set(v_player, '{depth}', to_jsonb(coalesce((v_player ->> 'depth')::integer, 0) + case when v_correct and v_room.mode = 'miner' then greatest(1, v_points / 100) else 0 end));
        end if;
        v_players := v_players || jsonb_build_array(v_player);
    end loop;

    if not exists (
        select 1 from jsonb_array_elements(v_room.state -> 'players') as item(player)
        where player ->> 'id' = auth.uid()::text
    ) then raise exception 'Join the game before answering.'; end if;

    update public.studbud_game_rooms
    set state = jsonb_set(state, '{players}', v_players),
        status = case
            when goal_type = 'points' and (
                (mode = 'sports' and exists (
                    select 1 from jsonb_array_elements(v_players) as item(player)
                    where (player ->> 'touchdowns')::integer >= point_limit
                ))
                or (mode = 'shooter' and exists (
                    select 1 from jsonb_array_elements(v_players) as item(player)
                    where (player ->> 'targets')::integer >= point_limit
                ))
                or (mode = 'skyline' and exists (
                    select 1 from jsonb_array_elements(v_players) as item(player)
                    where (player ->> 'distance')::integer >= 36
                ))
                or (mode not in ('sports', 'shooter', 'skyline') and exists (
                select 1 from jsonb_array_elements(v_players) as item(player)
                where (player ->> 'score')::integer >= point_limit
                ))
            ) then 'finished'
            else status
        end,
        updated_at = now()
    where id = v_room.id
    returning * into v_room;
    if v_room.status = 'finished' then perform public.studbud_pay_game_rewards(v_room.id); end if;
    select * into v_room from public.studbud_game_rooms where id = v_room.id;
    return public.studbud_game_room_view(v_room);
end;
$$;

create or replace function public.studbud_advance_game_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
    v_index integer;
    v_players jsonb;
begin
    select * into v_room
    from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now()
    for update;
    if not found or v_room.host_id is distinct from auth.uid() then raise exception 'Only the host can advance this game.'; end if;
    if v_room.status <> 'playing' then raise exception 'This game is not in progress.'; end if;

    if v_room.goal_type = 'time'
        and now() >= v_room.started_at + make_interval(secs => v_room.time_limit_seconds) then
        update public.studbud_game_rooms set status = 'finished', updated_at = now()
        where id = v_room.id returning * into v_room;
        perform public.studbud_pay_game_rewards(v_room.id);
        select * into v_room from public.studbud_game_rooms where id = v_room.id;
        return public.studbud_game_room_view(v_room);
    end if;
    if exists (
        select 1 from jsonb_array_elements(v_room.state -> 'players') as item(player)
        where not coalesce((player ->> 'eliminated')::boolean, false)
            and not coalesce((player ->> 'answered')::boolean, false)
    ) then raise exception 'Wait for every active player to answer before moving on.'; end if;

    v_index := (v_room.state ->> 'question_index')::integer + 1;
    if (v_room.goal_type = 'points' and exists (
        select 1 from jsonb_array_elements(v_room.state -> 'players') as item(player)
        where (player ->> 'score')::integer >= v_room.point_limit
    )) or not exists (
        select 1 from jsonb_array_elements(v_room.state -> 'players') as item(player)
        where not coalesce((player ->> 'eliminated')::boolean, false)
    ) then
        update public.studbud_game_rooms set status = 'finished', updated_at = now()
        where id = v_room.id returning * into v_room;
        perform public.studbud_pay_game_rewards(v_room.id);
        select * into v_room from public.studbud_game_rooms where id = v_room.id;
    else
        select jsonb_agg(
            jsonb_set(player, '{answered}', 'false'::jsonb)
            order by ordinality
        ) into v_players
        from jsonb_array_elements(v_room.state -> 'players') with ordinality as item(player, ordinality)
        where not coalesce((player ->> 'eliminated')::boolean, false);
        select coalesce(v_players, '[]'::jsonb) || coalesce((
            select jsonb_agg(player order by ordinality)
            from jsonb_array_elements(v_room.state -> 'players') with ordinality as item(player, ordinality)
            where coalesce((player ->> 'eliminated')::boolean, false)
        ), '[]'::jsonb) into v_players;

        update public.studbud_game_rooms
        set state = jsonb_build_object(
                'players', v_players,
                'question_index', v_index,
                'question', public.studbud_game_make_question(cards, v_index)
            ),
            updated_at = now()
        where id = v_room.id
        returning * into v_room;
    end if;
    return public.studbud_game_room_view(v_room);
end;
$$;

create or replace function public.studbud_finish_game_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
begin
    update public.studbud_game_rooms
    set status = 'finished', updated_at = now(),
        expires_at = case when mode = 'chess' then now() + interval '2 hours' else expires_at end
    where room_code = upper(btrim(p_code))
        and host_id = auth.uid()
        and status <> 'finished'
        and expires_at > now()
    returning * into v_room;
    if not found then raise exception 'Only the host can end this active game.'; end if;
    perform public.studbud_pay_game_rewards(v_room.id);
    select * into v_room from public.studbud_game_rooms where id = v_room.id;
    return public.studbud_game_room_view(v_room);
end;
$$;

create or replace function public.studbud_kick_game_player(p_code text, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
    v_players jsonb;
begin
    select * into v_room
    from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now()
    for update;
    if not found or v_room.host_id is distinct from auth.uid() then raise exception 'Only the host can manage this room.'; end if;
    if p_player_id is null or p_player_id = v_room.host_id then raise exception 'The host cannot be removed.'; end if;
    select coalesce(jsonb_agg(player order by ordinality), '[]'::jsonb)
    into v_players
    from jsonb_array_elements(v_room.state -> 'players') with ordinality as item(player, ordinality)
    where player ->> 'id' <> p_player_id::text;
    if jsonb_array_length(v_players) = jsonb_array_length(v_room.state -> 'players') then
        raise exception 'That player is not in this room.';
    end if;
    update public.studbud_game_rooms
    set state = jsonb_set(state, '{players}', v_players), updated_at = now()
    where id = v_room.id returning * into v_room;
    return public.studbud_game_room_view(v_room);
end;
$$;

create or replace function public.studbud_leave_game_room(p_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
    v_players jsonb;
begin
    if auth.uid() is null then raise exception 'Sign in to leave a game.'; end if;
    select * into v_room
    from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now()
    for update;
    if not found then return; end if;
    if v_room.host_id = auth.uid() then
        update public.studbud_game_rooms
        set status = 'finished', updated_at = now(),
            expires_at = case when mode = 'chess' then now() + interval '2 hours' else expires_at end
        where id = v_room.id returning * into v_room;
        perform public.studbud_pay_game_rewards(v_room.id);
    else
        select coalesce(jsonb_agg(player order by ordinality), '[]'::jsonb)
        into v_players
        from jsonb_array_elements(v_room.state -> 'players') with ordinality as item(player, ordinality)
        where player ->> 'id' <> auth.uid()::text;
        update public.studbud_game_rooms
        set state = jsonb_set(state, '{players}', v_players),
            status = case when mode = 'chess' and status = 'playing' and jsonb_array_length(v_players) < jsonb_array_length(v_room.state -> 'players') then 'finished' else status end,
            expires_at = case when mode = 'chess' and jsonb_array_length(v_players) < jsonb_array_length(v_room.state -> 'players') then now() + interval '2 hours' else expires_at end,
            updated_at = now()
        where id = v_room.id returning * into v_room;
        if v_room.mode = 'chess' and v_room.status = 'finished' then perform public.studbud_pay_game_rewards(v_room.id); end if;
    end if;
end;
$$;

drop function if exists public.studbud_report_game_score(text, integer, integer);
create or replace function public.studbud_report_game_score(p_code text, p_score integer, p_answered integer, p_correct integer default 0)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
    v_players jsonb;
begin
    select * into v_room
    from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now()
    for update;
    if not found or v_room.status <> 'playing' then return; end if;
    select coalesce(jsonb_agg(
        case when player ->> 'id' = auth.uid()::text
            then player || jsonb_build_object(
                'score', greatest(0, least(coalesce(p_score, 0), 100000)),
                'answered_count', greatest(0, least(coalesce(p_answered, 0), 1000)),
                'correct_count', greatest(0, least(coalesce(p_correct, 0), coalesce(p_answered, 0), 1000)))
            else player end
        order by ordinality), '[]'::jsonb)
    into v_players
    from jsonb_array_elements(v_room.state -> 'players') with ordinality as item(player, ordinality);
    update public.studbud_game_rooms
    set state = jsonb_set(state, '{players}', v_players), updated_at = now()
    where id = v_room.id;
end;
$$;

create or replace function public.studbud_get_game_cards(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
begin
    select * into v_room
    from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now();
    if not found or not exists (
        select 1 from jsonb_array_elements(v_room.state -> 'players') as item(player)
        where player ->> 'id' = auth.uid()::text
    ) then raise exception 'You are not in this game, or the room has expired.'; end if;
    return v_room.cards;
end;
$$;

revoke all on function public.studbud_get_game_cards(text) from public, anon;
grant execute on function public.studbud_get_game_cards(text) to authenticated;

create or replace function public.studbud_save_chess_state(p_code text, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
    v_board text := p_state ->> 'board';
    v_serial integer;
    v_players jsonb;
    v_white integer := 0;
    v_black integer := 0;
begin
    select * into v_room from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now() for update;
    if not found or v_room.host_id is distinct from auth.uid() or v_room.mode <> 'chess' then
        raise exception 'Only the chess host can save this board.';
    end if;
    if v_room.status <> 'playing' then raise exception 'This chess match is not playing.'; end if;
    if v_board is null or v_board !~ '^[prnbqkPRNBQK.]{64}$' or length(p_state::text) > 4000
        or length(v_board) - length(replace(v_board, 'K', '')) <> 1
        or length(v_board) - length(replace(v_board, 'k', '')) <> 1
        or coalesce(p_state ->> 'serial', '') !~ '^[0-9]{1,9}$'
        or coalesce(p_state ->> 'revision', '') !~ '^[0-9]{1,9}$'
        or coalesce(p_state ->> 'winner', '') not in ('-2', '-1', '0', '1')
        or jsonb_typeof(p_state -> 'credits') is distinct from 'array'
        or jsonb_typeof(p_state -> 'ack') is distinct from 'array' then
        raise exception 'Invalid chess board state.';
    end if;
    if jsonb_typeof(p_state -> 'capturePoints') is distinct from 'array' then raise exception 'Invalid captured material scores.'; end if;
    if jsonb_typeof(p_state -> 'castling') is distinct from 'array' then raise exception 'Invalid castling rights.'; end if;
    if jsonb_array_length(p_state -> 'castling') <> 4
        or exists (select 1 from jsonb_array_elements(p_state -> 'castling') c(value) where jsonb_typeof(value) <> 'boolean')
        or coalesce(p_state ->> 'enPassant', '') !~ '^(-1|[0-9]{1,2})$'
        or (p_state ->> 'enPassant')::integer > 63 then
        raise exception 'Invalid special move state.';
    end if;
    if jsonb_array_length(p_state -> 'capturePoints') <> 2
        or exists (select 1 from jsonb_array_elements_text(p_state -> 'capturePoints') as c(value) where value is null or value !~ '^[0-9]{1,3}$') then
        raise exception 'Invalid captured material scores.';
    end if;
    if jsonb_array_length(p_state -> 'credits') <> 2 or jsonb_array_length(p_state -> 'ack') <> 2
        or exists (select 1 from jsonb_array_elements_text(p_state -> 'credits') as c(value) where value is null or value not in ('0', '1'))
        or exists (select 1 from jsonb_array_elements_text(p_state -> 'ack') as a(value) where value is null or value !~ '^[0-9]{1,9}$') then
        raise exception 'Invalid chess move credits.';
    end if;
    v_serial := (p_state ->> 'serial')::integer;
    if v_serial <= coalesce((v_room.state -> 'chess' ->> 'serial')::integer, -1) then return; end if;
    v_white := (p_state -> 'capturePoints' ->> 0)::integer;
    v_black := (p_state -> 'capturePoints' ->> 1)::integer;
    select jsonb_agg(player || jsonb_build_object('score', case when ordinality = 1 then v_white else v_black end) order by ordinality)
    into v_players from jsonb_array_elements(v_room.state -> 'players') with ordinality as players(player, ordinality);
    update public.studbud_game_rooms
    set state = jsonb_set(jsonb_set(state, '{chess}', p_state), '{players}', v_players), updated_at = now()
    where id = v_room.id;
end;
$$;
revoke all on function public.studbud_save_chess_state(text, jsonb) from public, anon;
grant execute on function public.studbud_save_chess_state(text, jsonb) to authenticated;

create or replace function public.studbud_save_defense_state(p_code text, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_room public.studbud_game_rooms%rowtype;
    v_players jsonb;
    v_serial integer;
    v_winner text := p_state ->> 'winner';
begin
    select * into v_room from public.studbud_game_rooms
    where room_code = upper(btrim(p_code)) and expires_at > now() for update;
    if not found or v_room.host_id is distinct from auth.uid() or v_room.mode <> 'defense' then
        raise exception 'Only the Tower Defense host can save this battle.';
    end if;
    if v_room.status <> 'playing' then raise exception 'This battle is not playing.'; end if;
    if p_state is null or length(p_state::text) > 100000
        or coalesce(p_state ->> 'serial', '') !~ '^[0-9]{1,9}$'
        or coalesce(p_state ->> 'nextId', '') !~ '^[0-9]{1,9}$'
        or jsonb_typeof(p_state -> 'teams') is distinct from 'object'
        or jsonb_typeof(p_state -> 'answers') is distinct from 'object'
        or jsonb_typeof(p_state -> 'lastSeq') is distinct from 'object'
        or jsonb_typeof(p_state -> 'health') is distinct from 'array'
        or jsonb_typeof(p_state -> 'wallets') is distinct from 'array'
        or jsonb_typeof(p_state -> 'damage') is distinct from 'array'
        or jsonb_typeof(p_state -> 'troops') is distinct from 'array'
        or jsonb_typeof(p_state -> 'enemies') is distinct from 'array'
        or (v_winner is not null and v_winner not in ('0', '1')) then
        raise exception 'Invalid Tower Defense battle state.';
    end if;
    if jsonb_array_length(p_state -> 'health') <> 2
        or jsonb_array_length(p_state -> 'wallets') <> 2
        or jsonb_array_length(p_state -> 'damage') <> 2
        or jsonb_array_length(p_state -> 'troops') > 12 * (select count(*) from jsonb_object_keys(p_state -> 'teams'))
        or jsonb_array_length(p_state -> 'enemies') > 120
        or exists (select 1 from jsonb_array_elements_text((p_state -> 'health') || (p_state -> 'wallets') || (p_state -> 'damage')) c(value)
            where value is null or value !~ '^[0-9]{1,9}$')
        or exists (select 1 from jsonb_each_text((p_state -> 'answers') || (p_state -> 'lastSeq')) c(key, value)
            where value is null or value !~ '^[0-9]{1,9}$')
        or p_state -> 'teams' is distinct from v_room.state -> 'defense_teams' then
        raise exception 'Invalid team economy or roster.';
    end if;
    if (p_state -> 'health' ->> 0)::integer > 100 or (p_state -> 'health' ->> 1)::integer > 100
        or (v_winner = '0' and (p_state -> 'health' ->> 1)::integer <> 0)
        or (v_winner = '1' and (p_state -> 'health' ->> 0)::integer <> 0) then
        raise exception 'Invalid base health or winner.';
    end if;
    if exists (select 1 from jsonb_array_elements((p_state -> 'troops') || (p_state -> 'enemies')) c(unit)
        where coalesce(unit ->> 'team', '') not in ('0', '1')
            or coalesce(unit ->> 'type', '') not in ('0', '1', '2', '3', '4', '5')
            or coalesce(unit ->> 'id', '') !~ '^[0-9]{1,9}$')
        or exists (select 1 from jsonb_array_elements(p_state -> 'troops') c(unit)
            where coalesce(unit ->> 'level', '') not in ('1', '2', '3')
                or jsonb_typeof(unit -> 'owner') is distinct from 'string'
                or not ((p_state -> 'teams') ? (unit ->> 'owner'))
                or (p_state -> 'teams' ->> (unit ->> 'owner')) is distinct from (unit ->> 'team')
                or coalesce(unit ->> 'x', '') !~ '^[0-9]{1,4}$'
                or coalesce(unit ->> 'y', '') !~ '^[0-9]{1,4}$'
                or jsonb_typeof(unit -> 'cd') is distinct from 'number')
        or exists (select 1 from jsonb_array_elements(p_state -> 'enemies') c(unit)
            where coalesce(unit ->> 'segment', '') not in ('0', '1', '2', '3', '4', '5', '6')
                or jsonb_typeof(unit -> 'hp') is distinct from 'number'
                or jsonb_typeof(unit -> 'progress') is distinct from 'number'
                or jsonb_typeof(unit -> 'slow') is distinct from 'number'
                or (unit ? 'poisonT' and jsonb_typeof(unit -> 'poisonT') is distinct from 'number')
                or (unit ? 'poisonD' and jsonb_typeof(unit -> 'poisonD') is distinct from 'number')) then
        raise exception 'Invalid troops or enemies.';
    end if;
    if exists (select 1 from jsonb_array_elements(p_state -> 'troops') c(unit)
        group by unit ->> 'owner' having count(*) > 12)
        or exists (select 1 from jsonb_array_elements(p_state -> 'troops') c(unit)
            group by unit ->> 'x', unit ->> 'y' having count(*) > 1) then
        raise exception 'Invalid per-player tower limits or occupied grid cells.';
    end if;
    if exists (select 1 from jsonb_array_elements(p_state -> 'troops') c(unit)
        where (unit ->> 'x')::numeric < 0 or (unit ->> 'x')::numeric > 2200
            or (unit ->> 'y')::numeric < 0 or (unit ->> 'y')::numeric > 1500
            or mod((unit ->> 'x')::numeric - (unit ->> 'team')::integer * 1100 - 95, 70) <> 0
            or mod((unit ->> 'y')::numeric - 85, 70) <> 0
            or (unit ->> 'x')::numeric < (unit ->> 'team')::integer * 1100 + 95
            or (unit ->> 'x')::numeric > (unit ->> 'team')::integer * 1100 + 1005
            or (unit ->> 'y')::numeric < 85 or (unit ->> 'y')::numeric > 1415
            or (unit ->> 'cd')::numeric < 0 or (unit ->> 'cd')::numeric > 2.2)
        or exists (select 1 from jsonb_array_elements(p_state -> 'enemies') c(unit)
            where (unit ->> 'hp')::numeric <= 0
                or (unit ->> 'hp')::numeric > (array[65, 90, 330, 32, 550, 135])[(unit ->> 'type')::integer + 1]
                or (unit ->> 'progress')::numeric < 0 or (unit ->> 'progress')::numeric > 740
                or (unit ->> 'slow')::numeric < 0 or (unit ->> 'slow')::numeric > 1.5
                or (unit ->> 'poisonT')::numeric < 0 or (unit ->> 'poisonT')::numeric > 3
                or (unit ->> 'poisonD')::numeric < 0 or (unit ->> 'poisonD')::numeric > 21) then
        raise exception 'Invalid unit positions, health or cooldowns.';
    end if;
    v_serial := (p_state ->> 'serial')::integer;
    if v_serial <= coalesce((v_room.state -> 'defense' ->> 'serial')::integer, -1) then return; end if;
    select jsonb_agg(player || jsonb_build_object('score',
        (p_state -> 'damage' ->> (p_state -> 'teams' ->> (player ->> 'id'))::integer)::integer
        + case when v_winner = p_state -> 'teams' ->> (player ->> 'id') then 10000 else 0 end) order by n)
    into v_players from jsonb_array_elements(v_room.state -> 'players') with ordinality c(player, n);
    update public.studbud_game_rooms
    set state = jsonb_set(jsonb_set(state, '{defense}', p_state), '{players}', v_players), updated_at = now()
    where id = v_room.id;
end;
$$;
revoke all on function public.studbud_save_defense_state(text, jsonb) from public, anon;
grant execute on function public.studbud_save_defense_state(text, jsonb) to authenticated;

revoke all on function public.studbud_report_game_score(text, integer, integer, integer) from public, anon;
grant execute on function public.studbud_report_game_score(text, integer, integer, integer) to authenticated;
revoke all on function public.studbud_unequip_multiplayer_slot(text) from public, anon;
grant execute on function public.studbud_unequip_multiplayer_slot(text) to authenticated;

revoke all on function public.studbud_record_community_deck_study(uuid) from public, anon;
grant execute on function public.studbud_record_community_deck_study(uuid) to authenticated;
revoke all on function public.studbud_record_study_time(text, integer, date) from public, anon;
grant execute on function public.studbud_record_study_time(text, integer, date) to authenticated;
revoke all on function public.studbud_get_study_leaderboard(text, text) from public, anon;
grant execute on function public.studbud_get_study_leaderboard(text, text) to authenticated;
revoke all on function public.studbud_protect_community_deck_study_count() from public, anon, authenticated;
revoke all on function public.studbud_game_make_question(jsonb, integer) from public, anon, authenticated;
revoke all on function public.studbud_game_room_view(public.studbud_game_rooms) from public, anon, authenticated;
revoke all on function public.studbud_player_cosmetics(uuid) from public, anon, authenticated;
revoke all on function public.studbud_pay_game_rewards(uuid) from public, anon, authenticated;
revoke all on function public.studbud_create_game_room(text, text, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.studbud_create_game_room(text, text, text, jsonb, text, jsonb) to authenticated;
revoke all on function public.studbud_create_game_room(text, text, text, jsonb, text) from public, anon;
grant execute on function public.studbud_create_game_room(text, text, text, jsonb, text) to authenticated;
revoke all on function public.studbud_get_multiplayer_profile() from public, anon;
grant execute on function public.studbud_get_multiplayer_profile() to authenticated;
revoke all on function public.studbud_buy_mystery_item(text) from public, anon;
grant execute on function public.studbud_buy_mystery_item(text) to authenticated;
revoke all on function public.studbud_record_waiting_game_best(integer) from public, anon;
grant execute on function public.studbud_record_waiting_game_best(integer) to authenticated;
revoke all on function public.studbud_buy_multiplayer_item(text) from public, anon;
grant execute on function public.studbud_buy_multiplayer_item(text) to authenticated;
revoke all on function public.studbud_equip_multiplayer_item(text) from public, anon;
grant execute on function public.studbud_equip_multiplayer_item(text) to authenticated;
revoke all on function public.studbud_join_game_room(text, text) from public, anon;
grant execute on function public.studbud_join_game_room(text, text) to authenticated;
revoke all on function public.studbud_get_game_room(text) from public, anon;
grant execute on function public.studbud_get_game_room(text) to authenticated;
revoke all on function public.studbud_start_game_room(text) from public, anon;
grant execute on function public.studbud_start_game_room(text) to authenticated;
revoke all on function public.studbud_submit_game_answer(text, integer, integer, text) from public, anon;
grant execute on function public.studbud_submit_game_answer(text, integer, integer, text) to authenticated;
revoke all on function public.studbud_advance_game_room(text) from public, anon;
grant execute on function public.studbud_advance_game_room(text) to authenticated;
revoke all on function public.studbud_finish_game_room(text) from public, anon;
grant execute on function public.studbud_finish_game_room(text) to authenticated;
revoke all on function public.studbud_kick_game_player(text, uuid) from public, anon;
grant execute on function public.studbud_kick_game_player(text, uuid) to authenticated;
revoke all on function public.studbud_leave_game_room(text) from public, anon;
grant execute on function public.studbud_leave_game_room(text) to authenticated;


-- ============================================================================
-- Admin tools: only the "overit" and "andy" accounts (emails overit@/andy@accounts.studbud.invalid)
-- Every function re-checks the caller on the server, so the client can't bypass it.
-- ============================================================================
create table if not exists public.studbud_banned_users (
    user_id uuid primary key references auth.users (id) on delete cascade,
    reason text not null default '',
    banned_at timestamptz not null default now()
);
alter table public.studbud_banned_users enable row level security;
revoke all on table public.studbud_banned_users from anon, authenticated;

create or replace function public.studbud_current_user_can_publish_community_decks()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select auth.uid() is not null
        and not exists (
            select 1 from public.studbud_banned_users b where b.user_id = auth.uid()
        );
$$;
revoke all on function public.studbud_current_user_can_publish_community_decks() from public, anon, authenticated;
grant execute on function public.studbud_current_user_can_publish_community_decks() to authenticated;

create or replace function public.studbud_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from auth.users
        where id = auth.uid() and         lower(email) in ('overit@accounts.studbud.invalid', 'andy@accounts.studbud.invalid')
    );
$$;

create table if not exists public.studbud_user_tags (
    user_id uuid not null references auth.users (id) on delete cascade,
    tag text not null check (tag in ('teacher', 'tester', 'moderator')),
    granted_by uuid references auth.users (id) on delete set null,
    granted_at timestamptz not null default now(),
    primary key (user_id, tag)
);
alter table public.studbud_user_tags enable row level security;
revoke all on table public.studbud_user_tags from anon, authenticated;

create or replace function public.studbud_has_user_tag(p_user_id uuid, p_tag text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select auth.uid() is not null
       and exists (select 1 from public.studbud_user_tags where user_id = p_user_id and tag = p_tag);
$$;
revoke all on function public.studbud_has_user_tag(uuid, text) from public, anon, authenticated;

create or replace function public.studbud_require_moderator()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.studbud_is_admin()
       and not public.studbud_has_user_tag(auth.uid(), 'moderator') then
        raise exception 'Flashcard moderation is available to moderators.';
    end if;
end;
$$;

create or replace function public.studbud_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.studbud_is_admin() then raise exception 'Only the admin can do this.'; end if;
end;
$$;

create or replace function public.studbud_admin_set_user_tags(p_user_id uuid, p_tags text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_admin();
    if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'Choose a valid account.';
    end if;
    if exists (select 1 from unnest(coalesce(p_tags, array[]::text[])) tag
               where tag is null or tag not in ('teacher', 'tester', 'moderator')) then
        raise exception 'Only teacher, tester, and moderator tags can be assigned.';
    end if;
    delete from public.studbud_user_tags where user_id = p_user_id;
    insert into public.studbud_user_tags (user_id, tag, granted_by)
    select p_user_id, distinct_tags.tag, auth.uid()
    from (select distinct unnest(coalesce(p_tags, array[]::text[])) as tag) distinct_tags;
end;
$$;

-- Banned users can't publish community decks.
drop policy if exists "Deck owners can publish community decks" on public.studbud_community_decks;
create policy "Deck owners can publish community decks"
    on public.studbud_community_decks for insert
    to authenticated with check (
        auth.uid() = owner_id
        and not public.studbud_is_guest()
        and public.studbud_current_user_can_publish_community_decks()
    );

-- Username changes: once every 7 days, or immediately when the admin forces a rename.
create table if not exists public.studbud_username_state (
    user_id uuid primary key references auth.users(id) on delete cascade,
    changed_at timestamptz,
    force_change boolean not null default false
);
alter table public.studbud_username_state enable row level security;
revoke all on public.studbud_username_state from anon, authenticated;

create or replace function public.studbud_require_account_moderation(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_moderator();
    if not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'Choose a valid account.';
    end if;
    if not public.studbud_is_admin() and (
        p_user_id = auth.uid()
        or public.studbud_has_user_tag(p_user_id, 'moderator')
        or exists (select 1 from auth.users where id = p_user_id
            and lower(raw_user_meta_data ->> 'username') in ('overit', 'andy'))
    ) then
        raise exception 'Only administrators can moderate staff accounts or your own account.';
    end if;
end;
$$;
revoke all on function public.studbud_require_account_moderation(uuid) from public, anon, authenticated;

create or replace function public.studbud_admin_list_users(p_query text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_moderator();
    return coalesce((
        select jsonb_agg(row_to_json(u)) from (
            select a.id,
                coalesce(nullif(a.raw_user_meta_data ->> 'username', ''), 'Student') as username,
                a.created_at,
                a.last_sign_in_at,
                coalesce(p.coins, 0) as coins,
                coalesce(p.wins, 0) as wins,
                (select count(*) from public.studbud_community_decks d where d.owner_id = a.id) as decks,
                exists (select 1 from public.studbud_banned_users b where b.user_id = a.id) as banned,
                (select b.reason from public.studbud_banned_users b where b.user_id = a.id) as ban_reason,
                coalesce((select s.force_change from public.studbud_username_state s where s.user_id = a.id), false) as force_change,
                coalesce((select array_agg(t.tag order by t.tag) from public.studbud_user_tags t where t.user_id = a.id), array[]::text[]) as tags,
                coalesce((select pp.school from public.studbud_public_profiles pp where pp.user_id = a.id), a.raw_user_meta_data ->> 'school', 'pchs') as school
            from auth.users a
            left join public.studbud_multiplayer_profiles p on p.user_id = a.id
            where coalesce(p_query, '') = ''
                or coalesce(a.raw_user_meta_data ->> 'username', '') ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%'
            order by a.created_at desc
            limit 100
        ) u
    ), '[]'::jsonb);
end;
$$;

create or replace function public.studbud_admin_list_decks(p_query text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_moderator();
    return coalesce((
        select jsonb_agg(row_to_json(d)) from (
            select c.id, c.title, c.description, c.card_count, c.study_count, c.updated_at, c.owner_id,
                coalesce(nullif(a.raw_user_meta_data ->> 'username', ''), 'Student') as owner,
                (select jsonb_agg(card) from (select jsonb_array_elements(c.cards) as card limit 5) preview) as preview
            from public.studbud_community_decks c
            left join auth.users a on a.id = c.owner_id
            where coalesce(p_query, '') = ''
                or c.title ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%'
                or coalesce(a.raw_user_meta_data ->> 'username', '') ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%'
            order by c.updated_at desc
            limit 100
        ) d
    ), '[]'::jsonb);
end;
$$;

create or replace function public.studbud_admin_delete_deck(p_deck_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_moderator();
    delete from public.studbud_community_decks where id = p_deck_id;
end;
$$;

create or replace function public.studbud_admin_set_ban(p_user_id uuid, p_banned boolean, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_account_moderation(p_user_id);
    if p_user_id = auth.uid() then raise exception 'You can''t ban your own account.'; end if;
    if p_banned then
        insert into public.studbud_banned_users (user_id, reason) values (p_user_id, left(coalesce(p_reason, ''), 200))
        on conflict (user_id) do update set reason = excluded.reason, banned_at = now();
        delete from public.studbud_community_decks where owner_id = p_user_id;
    else
        delete from public.studbud_banned_users where user_id = p_user_id;
    end if;
end;
$$;

create or replace function public.studbud_admin_adjust_coins(p_user_id uuid, p_delta integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_admin();
    update public.studbud_multiplayer_profiles
        set coins = greatest(0, coins + p_delta), updated_at = now()
        where user_id = p_user_id;
    if not found then raise exception 'That user has no game profile yet.'; end if;
end;
$$;

create or replace function public.studbud_admin_remove_user_decks(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_account_moderation(p_user_id);
    delete from public.studbud_community_decks where owner_id = p_user_id;
end;
$$;

revoke all on function public.studbud_is_admin() from public, anon;
grant execute on function public.studbud_is_admin() to authenticated;
revoke all on function public.studbud_require_admin() from public, anon, authenticated;
revoke all on function public.studbud_require_moderator() from public, anon, authenticated;
revoke all on function public.studbud_admin_list_users(text) from public, anon;
grant execute on function public.studbud_admin_list_users(text) to authenticated;
revoke all on function public.studbud_admin_set_user_tags(uuid, text[]) from public, anon;
grant execute on function public.studbud_admin_set_user_tags(uuid, text[]) to authenticated;
revoke all on function public.studbud_admin_list_decks(text) from public, anon;
grant execute on function public.studbud_admin_list_decks(text) to authenticated;
revoke all on function public.studbud_admin_delete_deck(uuid) from public, anon;
grant execute on function public.studbud_admin_delete_deck(uuid) to authenticated;
revoke all on function public.studbud_admin_set_ban(uuid, boolean, text) from public, anon;
grant execute on function public.studbud_admin_set_ban(uuid, boolean, text) to authenticated;
revoke all on function public.studbud_admin_adjust_coins(uuid, integer) from public, anon;
grant execute on function public.studbud_admin_adjust_coins(uuid, integer) to authenticated;
revoke all on function public.studbud_admin_remove_user_decks(uuid) from public, anon;
grant execute on function public.studbud_admin_remove_user_decks(uuid) to authenticated;

create or replace function public.studbud_username_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare st public.studbud_username_state;
begin
    if auth.uid() is null then raise exception 'Sign in first.'; end if;
    select * into st from public.studbud_username_state where user_id = auth.uid();
    return jsonb_build_object(
        'forced', coalesce(st.force_change, false),
        'next_change_at', case when st.changed_at is null then null else st.changed_at + interval '7 days' end,
        'can_change', public.studbud_is_admin() = false and (coalesce(st.force_change, false) or st.changed_at is null or st.changed_at <= now() - interval '7 days')
    );
end;
$$;

create or replace function public.studbud_change_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_name text := lower(trim(coalesce(p_username, '')));
    v_email text;
    st public.studbud_username_state;
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_uid is null then raise exception 'Sign in first.'; end if;
    if public.studbud_is_admin() then raise exception 'The admin account''s username can''t be changed.'; end if;
    if v_name !~ '^[a-z0-9_]{3,24}$' then raise exception 'Username must be 3-24 characters and contain only letters, numbers, or underscores.'; end if;
    select * into st from public.studbud_username_state where user_id = v_uid;
    if found and not st.force_change and st.changed_at is not null and st.changed_at > now() - interval '7 days' then
        raise exception 'You can change your username once a week. Try again after %.', to_char(st.changed_at + interval '7 days', 'Mon DD, HH24:MI "UTC"');
    end if;
    v_email := v_name || '@accounts.studbud.invalid';
    if exists (select 1 from auth.users where id = v_uid and lower(email) = v_email) then raise exception 'That is already your username.'; end if;
    if exists (select 1 from auth.users where id <> v_uid and lower(email) = v_email) then raise exception 'That username is already taken.'; end if;
    update auth.users
        set email = v_email,
            raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', v_name, 'email', v_email),
            updated_at = now()
        where id = v_uid;
    update auth.identities
        set identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email), updated_at = now()
        where user_id = v_uid and provider = 'email';
    insert into public.studbud_username_state (user_id, changed_at, force_change) values (v_uid, now(), false)
    on conflict (user_id) do update set changed_at = now(), force_change = false;
    return jsonb_build_object('username', v_name);
end;
$$;

create or replace function public.studbud_admin_force_username(p_user_id uuid, p_force boolean default true)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_account_moderation(p_user_id);
    if p_user_id = auth.uid() then raise exception 'You can''t force your own account.'; end if;
    insert into public.studbud_username_state (user_id, force_change) values (p_user_id, p_force)
    on conflict (user_id) do update set force_change = excluded.force_change;
end;
$$;

revoke all on function public.studbud_username_status() from public, anon;
grant execute on function public.studbud_username_status() to authenticated;
revoke all on function public.studbud_change_username(text) from public, anon;
grant execute on function public.studbud_change_username(text) to authenticated;
revoke all on function public.studbud_admin_force_username(uuid, boolean) from public, anon;
grant execute on function public.studbud_admin_force_username(uuid, boolean) to authenticated;

-- ============================================================================
-- Friends: requests, accepting, removing and viewing a friend's profile.
-- ============================================================================
create table if not exists public.studbud_friendships (
    id uuid primary key default gen_random_uuid(),
    requester_id uuid not null references auth.users (id) on delete cascade,
    addressee_id uuid not null references auth.users (id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'accepted')),
    created_at timestamptz not null default now(),
    check (requester_id <> addressee_id)
);
create unique index if not exists studbud_friendships_pair_idx
    on public.studbud_friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
alter table public.studbud_friendships enable row level security;
revoke all on table public.studbud_friendships from anon, authenticated;

create or replace function public.studbud_friend_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
    if v_uid is null then raise exception 'Sign in first.'; end if;
    return jsonb_build_object(
        'friends', coalesce((
            select jsonb_agg(jsonb_build_object(
                'friendship_id', f.id,
                'user_id', a.id,
                'username', coalesce(nullif(a.raw_user_meta_data ->> 'username', ''), 'Student'),
                'skin', coalesce(mp.equipped_skin, ''),
                'hat', coalesce(mp.equipped_hat, ''),
                'accessory', coalesce(mp.equipped_accessory, ''),
                'effect', coalesce(mp.equipped_effect, ''),
                'tags', to_jsonb(public.studbud_user_tags_for(a.id))
            ) order by coalesce(a.raw_user_meta_data ->> 'username', ''))
            from public.studbud_friendships f
            join auth.users a on a.id = case when f.requester_id = v_uid then f.addressee_id else f.requester_id end
            left join public.studbud_multiplayer_profiles mp on mp.user_id = a.id
            where f.status = 'accepted' and v_uid in (f.requester_id, f.addressee_id)
              and not public.studbud_is_hidden_user(a.id)
        ), '[]'::jsonb),
        'incoming', coalesce((
            select jsonb_agg(jsonb_build_object(
                'friendship_id', f.id,
                'user_id', a.id,
                'username', coalesce(nullif(a.raw_user_meta_data ->> 'username', ''), 'Student'),
                'skin', coalesce(mp.equipped_skin, ''),
                'hat', coalesce(mp.equipped_hat, ''),
                'accessory', coalesce(mp.equipped_accessory, ''),
                'effect', coalesce(mp.equipped_effect, ''),
                'tags', to_jsonb(public.studbud_user_tags_for(a.id))
            ) order by f.created_at)
            from public.studbud_friendships f
            join auth.users a on a.id = f.requester_id
            left join public.studbud_multiplayer_profiles mp on mp.user_id = a.id
            where f.status = 'pending' and f.addressee_id = v_uid
              and not public.studbud_is_hidden_user(a.id)
        ), '[]'::jsonb),
        'outgoing', coalesce((
            select jsonb_agg(jsonb_build_object(
                'friendship_id', f.id,
                'user_id', a.id,
                'username', coalesce(nullif(a.raw_user_meta_data ->> 'username', ''), 'Student'),
                'skin', coalesce(mp.equipped_skin, ''),
                'hat', coalesce(mp.equipped_hat, ''),
                'accessory', coalesce(mp.equipped_accessory, ''),
                'effect', coalesce(mp.equipped_effect, ''),
                'tags', to_jsonb(public.studbud_user_tags_for(a.id))
            ) order by f.created_at)
            from public.studbud_friendships f
            join auth.users a on a.id = f.addressee_id
            left join public.studbud_multiplayer_profiles mp on mp.user_id = a.id
            where f.status = 'pending' and f.requester_id = v_uid
        ), '[]'::jsonb)
    );
end;
$$;

create or replace function public.studbud_friend_request(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_name text := lower(trim(coalesce(p_username, '')));
    v_target uuid;
    v_existing public.studbud_friendships;
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if v_uid is null then raise exception 'Sign in first.'; end if;
    if v_name = '' then raise exception 'Enter a username.'; end if;
    select id into v_target from auth.users
        where lower(coalesce(raw_user_meta_data ->> 'username', '')) = v_name limit 1;
    if v_target is null or public.studbud_is_hidden_user(v_target) then raise exception 'No student with that username was found.'; end if;
    if v_target = v_uid then raise exception 'You can''t add yourself.'; end if;
    select * into v_existing from public.studbud_friendships
        where least(requester_id, addressee_id) = least(v_uid, v_target) and greatest(requester_id, addressee_id) = greatest(v_uid, v_target);
    if found then
        if v_existing.status = 'accepted' then raise exception 'You are already buds.'; end if;
        if v_existing.requester_id = v_uid then raise exception 'Bud request already sent.'; end if;
        update public.studbud_friendships set status = 'accepted' where id = v_existing.id;
        return jsonb_build_object('status', 'accepted');
    end if;
    insert into public.studbud_friendships (requester_id, addressee_id) values (v_uid, v_target);
    return jsonb_build_object('status', 'pending');
end;
$$;

create or replace function public.studbud_friend_respond(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Sign in first.'; end if;
    if p_accept then
        update public.studbud_friendships set status = 'accepted'
            where id = p_friendship_id and addressee_id = auth.uid() and status = 'pending';
    else
        delete from public.studbud_friendships
            where id = p_friendship_id and addressee_id = auth.uid() and status = 'pending';
    end if;
end;
$$;

-- Removes a friend, declines or cancels a request, whichever applies.
create or replace function public.studbud_friend_remove(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Sign in first.'; end if;
    delete from public.studbud_friendships
        where id = p_friendship_id and auth.uid() in (requester_id, addressee_id);
end;
$$;

-- What a student chooses to show their friends.
create table if not exists public.studbud_public_profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    bio text not null default '',
    favorite_subject text not null default '',
    grade_level text not null default '',
    study_goal text not null default '',
    first_name text not null default '',
    last_name text not null default '',
    show_real_name boolean not null default false,
    school text not null default 'pchs' check (school in ('pchs', 'pnhs', 'pshs', 'pwhs', 'other')),
    show_school boolean not null default false,
    show_stats boolean not null default true,
    updated_at timestamptz not null default now()
);
alter table public.studbud_public_profiles add column if not exists first_name text not null default '';
alter table public.studbud_public_profiles add column if not exists last_name text not null default '';
alter table public.studbud_public_profiles add column if not exists show_real_name boolean not null default false;
alter table public.studbud_public_profiles add column if not exists school text not null default 'pchs';
alter table public.studbud_public_profiles add column if not exists show_school boolean not null default false;
-- Parkway Central (pchs), North (pnhs), South (pshs) and West (pwhs) each have their own school tag.
alter table public.studbud_public_profiles drop constraint if exists studbud_public_profiles_school_check;
alter table public.studbud_public_profiles add constraint studbud_public_profiles_school_check check (school in ('pchs', 'pnhs', 'pshs', 'pwhs', 'other'));
alter table public.studbud_public_profiles enable row level security;
revoke all on table public.studbud_public_profiles from anon, authenticated;

create or replace function public.studbud_user_tags_for(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(array_agg(tags.tag order by tags.position), array[]::text[])
    from (
        select role.tag, case role.tag when 'teacher' then 1 when 'tester' then 2 else 3 end as position
        from public.studbud_user_tags role where role.user_id = p_user_id
        union all
        select profile.school, 4
        from public.studbud_public_profiles profile
        where profile.user_id = p_user_id and profile.school in ('pchs', 'pnhs', 'pshs', 'pwhs') and profile.show_school
    ) tags;
$$;

create or replace function public.studbud_friend_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_today date := timezone('utc', now())::date;
    v_week date := date_trunc('week', timezone('utc', now()))::date;
    v_streak integer := 0;
    v_day date;
    v_prof public.studbud_multiplayer_profiles;
    v_pub public.studbud_public_profiles;
    v_show boolean;
    v_name text;
begin
    if v_uid is null then raise exception 'Sign in first.'; end if;
    if not exists (
        select 1 from public.studbud_friendships f
        where f.status = 'accepted'
          and ((f.requester_id = v_uid and f.addressee_id = p_user_id) or (f.addressee_id = v_uid and f.requester_id = p_user_id))
    ) then raise exception 'You can only view the profiles of your buds.'; end if;
    if public.studbud_is_hidden_user(p_user_id) then raise exception 'This profile is unavailable.'; end if;
    select coalesce(nullif(raw_user_meta_data ->> 'username', ''), 'Student') into v_name from auth.users where id = p_user_id;
    select * into v_prof from public.studbud_multiplayer_profiles where user_id = p_user_id;
    select * into v_pub from public.studbud_public_profiles where user_id = p_user_id;
    v_show := coalesce(v_pub.show_stats, true);
    v_day := v_today;
    if coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id and study_date = v_day), 0) < 300 then v_day := v_day - 1; end if;
    loop
        exit when coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id and study_date = v_day), 0) < 300;
        v_streak := v_streak + 1;
        v_day := v_day - 1;
    end loop;
    return jsonb_build_object(
        'user_id', p_user_id,
        'username', v_name,
        'display_name', case when coalesce(v_pub.show_real_name, false)
            then nullif(trim(concat_ws(' ', nullif(v_pub.first_name, ''), nullif(v_pub.last_name, ''))), '') end,
        'bio', coalesce(v_pub.bio, ''),
        'favorite_subject', coalesce(v_pub.favorite_subject, ''),
        'grade_level', coalesce(v_pub.grade_level, ''),
        'study_goal', coalesce(v_pub.study_goal, ''),
        'show_stats', v_show,
        'tags', to_jsonb(public.studbud_user_tags_for(p_user_id)),
        'school', case when coalesce(v_pub.show_school, false) and v_pub.school in ('pchs', 'pnhs', 'pshs', 'pwhs') then v_pub.school end,
        'show_school', coalesce(v_pub.show_school, false) and coalesce(v_pub.school, 'other') in ('pchs', 'pnhs', 'pshs', 'pwhs'),
        'wins', coalesce(v_prof.wins, 0),
        'skin', coalesce(v_prof.equipped_skin, ''),
        'hat', coalesce(v_prof.equipped_hat, ''),
        'accessory', coalesce(v_prof.equipped_accessory, ''),
        'effect', coalesce(v_prof.equipped_effect, ''),
        'palette', coalesce(v_prof.equipped_palette, 'palette_default'),
        'today_seconds', case when v_show then coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id and study_date = v_today), 0) end,
        'week_seconds', case when v_show then coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id and study_date between v_week and v_today), 0) end,
        'total_seconds', case when v_show then coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id), 0) end,
        'streak_days', case when v_show then v_streak end
    );
end;
$$;

create or replace function public.studbud_get_public_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v public.studbud_public_profiles;
begin
    if auth.uid() is null then raise exception 'Sign in first.'; end if;
    select * into v from public.studbud_public_profiles where user_id = auth.uid();
    return jsonb_build_object('bio', coalesce(v.bio, ''), 'favorite_subject', coalesce(v.favorite_subject, ''),
        'grade_level', coalesce(v.grade_level, ''), 'study_goal', coalesce(v.study_goal, ''),
        'show_real_name', coalesce(v.show_real_name, false), 'show_stats', coalesce(v.show_stats, true),
        'school', coalesce(v.school, (select a.raw_user_meta_data ->> 'school' from auth.users a where a.id = auth.uid()), 'pchs'),
        'show_school', coalesce(v.show_school, false));
end;
$$;

drop function if exists public.studbud_set_public_profile(text, text, text, text, boolean);
drop function if exists public.studbud_set_public_profile(text, text, text, text, text, text, boolean, boolean);
create or replace function public.studbud_set_public_profile(
    p_bio text,
    p_favorite_subject text,
    p_grade_level text,
    p_study_goal text,
    p_first_name text,
    p_last_name text,
    p_show_real_name boolean,
    p_show_school boolean,
    p_show_stats boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if auth.uid() is null then raise exception 'Sign in first.'; end if;
    insert into public.studbud_public_profiles (
        user_id, bio, favorite_subject, grade_level, study_goal, first_name, last_name, show_real_name, show_school, show_stats, updated_at
    )
    values (auth.uid(), left(trim(coalesce(p_bio, '')), 160), left(trim(coalesce(p_favorite_subject, '')), 40),
        left(trim(coalesce(p_grade_level, '')), 20), left(trim(coalesce(p_study_goal, '')), 80),
        left(trim(coalesce(p_first_name, '')), 60), left(trim(coalesce(p_last_name, '')), 60),
        coalesce(p_show_real_name, false), coalesce(p_show_school, false), coalesce(p_show_stats, true), now())
    on conflict (user_id) do update set bio = excluded.bio, favorite_subject = excluded.favorite_subject,
        grade_level = excluded.grade_level, study_goal = excluded.study_goal, first_name = excluded.first_name,
        last_name = excluded.last_name, show_real_name = excluded.show_real_name,
        show_school = excluded.show_school, show_stats = excluded.show_stats, updated_at = now();
    return public.studbud_get_public_profile();
end;
$$;

create or replace function public.studbud_set_school(p_school text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if public.studbud_is_guest() then raise exception 'Create a free account to use this. Your guest data comes with you.'; end if;
    if auth.uid() is null then raise exception 'Sign in first.'; end if;
    if p_school is null or p_school not in ('pchs', 'pnhs', 'pshs', 'pwhs', 'other') then raise exception 'Choose your school from the list.'; end if;
    insert into public.studbud_public_profiles (user_id, school, updated_at)
    values (auth.uid(), p_school, now())
    on conflict (user_id) do update set school = excluded.school, updated_at = now();
    return public.studbud_get_public_profile();
end;
$$;

revoke all on function public.studbud_get_public_profile() from public, anon;
grant execute on function public.studbud_get_public_profile() to authenticated;
revoke all on function public.studbud_set_public_profile(text, text, text, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.studbud_set_public_profile(text, text, text, text, text, text, boolean, boolean, boolean) to authenticated;
revoke all on function public.studbud_set_school(text) from public, anon;
grant execute on function public.studbud_set_school(text) to authenticated;
revoke all on function public.studbud_has_user_tag(uuid, text) from public, anon, authenticated;
revoke all on function public.studbud_user_tags_for(uuid) from public, anon;
grant execute on function public.studbud_user_tags_for(uuid) to authenticated;

revoke all on function public.studbud_is_hidden_user(uuid) from public, anon, authenticated;
revoke all on function public.studbud_friend_overview() from public, anon;
grant execute on function public.studbud_friend_overview() to authenticated;
revoke all on function public.studbud_friend_request(text) from public, anon;
grant execute on function public.studbud_friend_request(text) to authenticated;
revoke all on function public.studbud_friend_respond(uuid, boolean) from public, anon;
grant execute on function public.studbud_friend_respond(uuid, boolean) to authenticated;
revoke all on function public.studbud_friend_remove(uuid) from public, anon;
grant execute on function public.studbud_friend_remove(uuid) to authenticated;
revoke all on function public.studbud_friend_profile(uuid) from public, anon;
grant execute on function public.studbud_friend_profile(uuid) to authenticated;

-- Shared-deck rules: no duplicate titles and no identical card sets.
alter table public.studbud_community_decks add column if not exists title_key text;
alter table public.studbud_community_decks add column if not exists content_hash text;

create or replace function public.studbud_card_key(p_card jsonb)
returns text
language sql
immutable
as $$
    select lower(regexp_replace(btrim(coalesce(p_card ->> 'front', '')), '\s+', ' ', 'g')) || E'\x1f' ||
           lower(regexp_replace(btrim(coalesce(p_card ->> 'back', '')), '\s+', ' ', 'g'));
$$;

create or replace function public.studbud_community_deck_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.title_key := lower(regexp_replace(btrim(new.title), '\s+', ' ', 'g'));
    select md5(coalesce(string_agg(pair, E'\x1e' order by pair), ''))
    into new.content_hash
    from (
        select lower(regexp_replace(btrim(c ->> 'front'), '\s+', ' ', 'g')) || E'\x1f' ||
               lower(regexp_replace(btrim(c ->> 'back'), '\s+', ' ', 'g')) as pair
        from jsonb_array_elements(new.cards) as c
    ) pairs;
    -- An upsert can have a fresh UUID before ON CONFLICT resolves the existing source deck.
    if exists (select 1 from public.studbud_community_decks d where d.id <> new.id
        and not (d.owner_id = new.owner_id and d.source_deck_id = new.source_deck_id)
        and d.title_key = new.title_key) then
        raise exception 'A shared set with that name already exists. Rename your deck to share it.';
    end if;
    if exists (select 1 from public.studbud_community_decks d where d.id <> new.id
        and not (d.owner_id = new.owner_id and d.source_deck_id = new.source_deck_id)
        and d.content_hash = new.content_hash) then
        raise exception 'A shared set with exactly these cards already exists.';
    end if;
    -- Reposting: most of these cards already live in someone else's shared set.
    if exists (
        select 1
        from public.studbud_community_decks d
        cross join lateral (
            select count(*) as hits
            from jsonb_array_elements(new.cards) nc
            where exists (
                select 1 from jsonb_array_elements(d.cards) dc
                where public.studbud_card_key(dc) = public.studbud_card_key(nc)
            )
        ) m
        where d.id <> new.id and d.owner_id <> new.owner_id
          and m.hits >= 2 and m.hits * 2 >= jsonb_array_length(new.cards)
    ) then
        raise exception 'Most of these cards are already in another student''s shared set. Study their set instead of reposting it.';
    end if;
    return new;
end;
$$;

drop trigger if exists studbud_community_deck_guard_trg on public.studbud_community_decks;
create trigger studbud_community_deck_guard_trg
    before insert or update of title, cards on public.studbud_community_decks
    for each row execute function public.studbud_community_deck_guard();

create or replace function public.studbud_community_authors(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce(jsonb_object_agg(a.id::text, coalesce(nullif(a.raw_user_meta_data ->> 'username', ''), 'Student')), '{}'::jsonb)
    from auth.users a
    where auth.uid() is not null and a.id = any(p_ids) and not public.studbud_is_hidden_user(a.id);
$$;
revoke all on function public.studbud_community_authors(uuid[]) from public, anon;
grant execute on function public.studbud_community_authors(uuid[]) to authenticated;

-- Any signed-in user can open another student's public profile.
create or replace function public.studbud_view_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_today date := timezone('utc', now())::date;
    v_week date := date_trunc('week', timezone('utc', now()))::date;
    v_streak integer := 0;
    v_day date;
    v_prof public.studbud_multiplayer_profiles;
    v_pub public.studbud_public_profiles;
    v_show boolean;
    v_name text;
    v_decks jsonb;
begin
    if v_uid is null then raise exception 'Sign in first.'; end if;
    if public.studbud_is_hidden_user(p_user_id) then raise exception 'This profile is unavailable.'; end if;
    select coalesce(nullif(raw_user_meta_data ->> 'username', ''), 'Student') into v_name from auth.users where id = p_user_id;
    if v_name is null then raise exception 'This profile is unavailable.'; end if;
    select * into v_prof from public.studbud_multiplayer_profiles where user_id = p_user_id;
    select * into v_pub from public.studbud_public_profiles where user_id = p_user_id;
    v_show := coalesce(v_pub.show_stats, true);
    v_day := v_today;
    if coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id and study_date = v_day), 0) < 300 then v_day := v_day - 1; end if;
    loop
        exit when coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id and study_date = v_day), 0) < 300;
        v_streak := v_streak + 1;
        v_day := v_day - 1;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'description', d.description, 'course', d.course,
        'card_count', d.card_count, 'study_count', d.study_count) order by d.study_count desc, d.updated_at desc), '[]'::jsonb)
    into v_decks
    from public.studbud_community_decks d where d.owner_id = p_user_id;
    return jsonb_build_object(
        'user_id', p_user_id,
        'username', v_name,
        'display_name', case when coalesce(v_pub.show_real_name, false)
            then nullif(trim(concat_ws(' ', nullif(v_pub.first_name, ''), nullif(v_pub.last_name, ''))), '') end,
        'is_me', p_user_id = v_uid,
        'bio', coalesce(v_pub.bio, ''),
        'favorite_subject', coalesce(v_pub.favorite_subject, ''),
        'grade_level', coalesce(v_pub.grade_level, ''),
        'study_goal', coalesce(v_pub.study_goal, ''),
        'show_stats', v_show,
        'tags', to_jsonb(public.studbud_user_tags_for(p_user_id)),
        'school', case when coalesce(v_pub.show_school, false) and v_pub.school in ('pchs', 'pnhs', 'pshs', 'pwhs') then v_pub.school end,
        'show_school', coalesce(v_pub.show_school, false) and coalesce(v_pub.school, 'other') in ('pchs', 'pnhs', 'pshs', 'pwhs'),
        'wins', coalesce(v_prof.wins, 0),
        'skin', coalesce(v_prof.equipped_skin, ''),
        'hat', coalesce(v_prof.equipped_hat, ''),
        'accessory', coalesce(v_prof.equipped_accessory, ''),
        'effect', coalesce(v_prof.equipped_effect, ''),
        'palette', coalesce(v_prof.equipped_palette, 'palette_default'),
        'decks', v_decks,
        'today_seconds', case when v_show then coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id and study_date = v_today), 0) end,
        'week_seconds', case when v_show then coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id and study_date between v_week and v_today), 0) end,
        'total_seconds', case when v_show then coalesce((select sum(seconds) from public.studbud_study_time_entries where user_id = p_user_id), 0) end,
        'streak_days', case when v_show then v_streak end
    );
end;
$$;
revoke all on function public.studbud_view_profile(uuid) from public, anon;
grant execute on function public.studbud_view_profile(uuid) to authenticated;

-- Admin-only full-card review; public discovery still uses its existing preview.
create or replace function public.studbud_admin_get_deck(p_deck_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_deck jsonb;
begin
    perform public.studbud_require_moderator();
    select jsonb_build_object('id', d.id, 'title', d.title, 'card_count', d.card_count, 'cards', d.cards)
        into v_deck from public.studbud_community_decks d where d.id = p_deck_id;
    if v_deck is null then raise exception 'That shared set no longer exists.'; end if;
    return v_deck;
end;
$$;
revoke all on function public.studbud_admin_get_deck(uuid) from public, anon;
grant execute on function public.studbud_admin_get_deck(uuid) to authenticated;

create table if not exists public.studbud_site_notice (
    id integer primary key check (id = 1),
    message text not null check (char_length(message) <= 1000),
    active boolean not null default false,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null,
    constraint studbud_site_notice_active_message_check check (not active or char_length(btrim(message)) > 0)
);
alter table public.studbud_site_notice enable row level security;
revoke all on public.studbud_site_notice from public, anon, authenticated;

create table if not exists public.studbud_site_notice_history (
    id bigint generated always as identity primary key,
    message text not null check (char_length(btrim(message)) between 1 and 1000),
    published_at timestamptz not null default now(),
    published_by uuid references auth.users(id) on delete set null
);
alter table public.studbud_site_notice_history enable row level security;
revoke all on public.studbud_site_notice_history from public, anon, authenticated;

alter table public.studbud_site_notice_history add column if not exists published_username text;
update public.studbud_site_notice_history h
set published_username = nullif(account.raw_user_meta_data ->> 'username', '')
from auth.users account
where h.published_username is null and account.id = h.published_by;

alter table public.studbud_site_notice add column if not exists publication_id bigint
    references public.studbud_site_notice_history(id);

-- Preserve the existing announcement once when upgrading from the single-notice schema.
with archived as (
    insert into public.studbud_site_notice_history(message, published_at, published_by, published_username)
    select n.message, n.updated_at, n.updated_by, nullif(account.raw_user_meta_data ->> 'username', '')
    from public.studbud_site_notice n
    left join auth.users account on account.id = n.updated_by
    where publication_id is null and char_length(btrim(message)) > 0
    returning id
)
update public.studbud_site_notice set publication_id = archived.id from archived
where publication_id is null;

create table if not exists public.studbud_site_notice_dismissals (
    user_id uuid not null references auth.users(id) on delete cascade,
    publication_id bigint not null references public.studbud_site_notice_history(id) on delete cascade,
    dismissed_at timestamptz not null default now(),
    primary key (user_id, publication_id)
);
alter table public.studbud_site_notice_dismissals enable row level security;
revoke all on public.studbud_site_notice_dismissals from public, anon, authenticated;

create or replace function public.studbud_get_site_notice()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Sign in to see announcements.'; end if;
    return (
        select jsonb_build_object('message', n.message, 'active', n.active, 'updated_at', n.updated_at,
            'published_at', h.published_at, 'author_name', coalesce(h.published_username, 'Site administrator'),
            'publication_id', n.publication_id::text, 'dismissed', exists (
                select 1 from public.studbud_site_notice_dismissals d
                where d.user_id = auth.uid() and d.publication_id = n.publication_id
            ))
        from public.studbud_site_notice n
        left join public.studbud_site_notice_history h on h.id = n.publication_id
        where n.active or public.studbud_is_admin()
    );
end;
$$;
revoke all on function public.studbud_get_site_notice() from public, anon;
grant execute on function public.studbud_get_site_notice() to authenticated;

create or replace function public.studbud_get_site_notice_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Sign in to see announcements.'; end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object('publication_id', h.id::text,
            'message', h.message, 'published_at', h.published_at,
            'author_name', coalesce(h.published_username, 'Site administrator')) order by h.published_at desc, h.id desc)
        from public.studbud_site_notice_history h
    ), '[]'::jsonb);
end;
$$;
revoke all on function public.studbud_get_site_notice_history() from public, anon;
grant execute on function public.studbud_get_site_notice_history() to authenticated;

create or replace function public.studbud_dismiss_site_notice(p_publication_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Sign in to dismiss announcements.'; end if;
    if not exists (select 1 from public.studbud_site_notice_history where id = p_publication_id) then
        raise exception 'That announcement no longer exists.';
    end if;
    insert into public.studbud_site_notice_dismissals(user_id, publication_id)
    values (auth.uid(), p_publication_id) on conflict do nothing;
end;
$$;
revoke all on function public.studbud_dismiss_site_notice(bigint) from public, anon;
grant execute on function public.studbud_dismiss_site_notice(bigint) to authenticated;

create or replace function public.studbud_admin_set_site_notice(p_message text, p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_publication_id bigint;
    v_author_username text;
begin
    perform public.studbud_require_admin();
    if p_message is null or char_length(p_message) > 1000 or p_active is null
        or (p_active and char_length(btrim(p_message)) = 0) then
        raise exception 'Enter an announcement of 1-1000 characters before publishing.';
    end if;
    if p_active then
        select nullif(raw_user_meta_data ->> 'username', '') into v_author_username
        from auth.users where id = auth.uid();
        if v_author_username is null then raise exception 'The announcement author must have a username.'; end if;
        insert into public.studbud_site_notice_history(message, published_by, published_username)
        values (btrim(p_message), auth.uid(), v_author_username) returning id into v_publication_id;
    end if;
    insert into public.studbud_site_notice(id, message, active, updated_at, updated_by, publication_id)
        values (1, btrim(p_message), p_active, now(), auth.uid(), v_publication_id)
    on conflict(id) do update
        set message = excluded.message, active = excluded.active,
            updated_at = excluded.updated_at, updated_by = excluded.updated_by,
            publication_id = case when p_active then excluded.publication_id
                else studbud_site_notice.publication_id end;
end;
$$;
revoke all on function public.studbud_admin_set_site_notice(text, boolean) from public, anon;
grant execute on function public.studbud_admin_set_site_notice(text, boolean) to authenticated;

create or replace function public.studbud_admin_delete_site_notice(p_publication_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_admin();
    if p_publication_id is null then raise exception 'Choose an announcement to delete.'; end if;
    perform 1 from public.studbud_site_notice_history where id = p_publication_id for update;
    if not found then raise exception 'That announcement no longer exists.'; end if;
    update public.studbud_site_notice
    set active = false, message = '', publication_id = null, updated_at = now(), updated_by = auth.uid()
    where publication_id = p_publication_id;
    delete from public.studbud_site_notice_history where id = p_publication_id;
end;
$$;
revoke all on function public.studbud_admin_delete_site_notice(bigint) from public, anon;
grant execute on function public.studbud_admin_delete_site_notice(bigint) to authenticated;

-- Content reports: students flag public flashcard sets or profiles for moderator review.
create table if not exists public.studbud_content_reports (
    id bigint generated always as identity primary key,
    reporter_id uuid not null references auth.users (id) on delete cascade,
    target_type text not null check (target_type in ('deck', 'profile')),
    target_id uuid not null,
    reason text not null check (reason in ('inappropriate', 'wrong', 'spam', 'copyright', 'harassment', 'other')),
    details text not null default '' check (char_length(details) <= 500),
    status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
    created_at timestamptz not null default now(),
    resolved_by uuid references auth.users (id) on delete set null,
    resolved_at timestamptz,
    unique (reporter_id, target_type, target_id)
);
create index if not exists studbud_content_reports_status_idx on public.studbud_content_reports (status, created_at desc);
alter table public.studbud_content_reports enable row level security;
revoke all on table public.studbud_content_reports from anon, authenticated;

create or replace function public.studbud_report_content(p_target_type text, p_target_id uuid, p_reason text, p_details text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Sign in or join as a guest to report content.'; end if;
    if p_target_type not in ('deck', 'profile') then raise exception 'That content cannot be reported.'; end if;
    if p_reason not in ('inappropriate', 'wrong', 'spam', 'copyright', 'harassment', 'other') then raise exception 'Choose a report reason.'; end if;
    if p_target_type = 'deck' and not exists (select 1 from public.studbud_community_decks where id = p_target_id) then
        raise exception 'That flashcard set is no longer shared.';
    end if;
    if p_target_type = 'profile' and not exists (select 1 from auth.users where id = p_target_id) then
        raise exception 'That profile no longer exists.';
    end if;
    if p_target_type = 'profile' and p_target_id = auth.uid() then raise exception 'You cannot report your own profile.'; end if;
    if (select count(*) from public.studbud_content_reports
        where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
        raise exception 'You have sent a lot of reports today. Please try again tomorrow.';
    end if;
    insert into public.studbud_content_reports (reporter_id, target_type, target_id, reason, details)
    values (auth.uid(), p_target_type, p_target_id, p_reason, left(coalesce(btrim(p_details), ''), 500))
    on conflict (reporter_id, target_type, target_id) do update
        set reason = excluded.reason, details = excluded.details, status = 'open',
            created_at = now(), resolved_by = null, resolved_at = null;
end;
$$;
revoke all on function public.studbud_report_content(text, uuid, text, text) from public, anon;
grant execute on function public.studbud_report_content(text, uuid, text, text) to authenticated;

create or replace function public.studbud_admin_list_reports(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_moderator();
    return coalesce((
        select jsonb_agg(row_to_json(r) order by r.report_count desc, r.latest desc) from (
            select cr.target_type, cr.target_id,
                count(*)::int as report_count,
                max(cr.created_at) as latest,
                array_agg(distinct cr.reason) as reasons,
                (select jsonb_agg(jsonb_build_object('id', x.id, 'reason', x.reason, 'details', x.details, 'created_at', x.created_at,
                        'reporter', coalesce(nullif(ru.raw_user_meta_data ->> 'username', ''), 'Student')) order by x.created_at desc)
                    from public.studbud_content_reports x left join auth.users ru on ru.id = x.reporter_id
                    where x.target_type = cr.target_type and x.target_id = cr.target_id and x.status = coalesce(nullif(p_status, ''), 'open')) as reports,
                case when cr.target_type = 'deck' then (select d.title from public.studbud_community_decks d where d.id = cr.target_id)
                    else (select coalesce(nullif(u.raw_user_meta_data ->> 'username', ''), 'Student') from auth.users u where u.id = cr.target_id) end as target_name,
                case when cr.target_type = 'deck' then (select d.owner_id from public.studbud_community_decks d where d.id = cr.target_id)
                    else cr.target_id end as owner_id
            from public.studbud_content_reports cr
            where cr.status = coalesce(nullif(p_status, ''), 'open')
            group by cr.target_type, cr.target_id
            limit 100
        ) r
    ), '[]'::jsonb);
end;
$$;
revoke all on function public.studbud_admin_list_reports(text) from public, anon;
grant execute on function public.studbud_admin_list_reports(text) to authenticated;

create or replace function public.studbud_admin_resolve_reports(p_target_type text, p_target_id uuid, p_status text default 'resolved')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_moderator();
    if p_status not in ('resolved', 'dismissed') then raise exception 'Choose resolved or dismissed.'; end if;
    update public.studbud_content_reports
    set status = p_status, resolved_by = auth.uid(), resolved_at = now()
    where target_type = p_target_type and target_id = p_target_id and status = 'open';
end;
$$;
revoke all on function public.studbud_admin_resolve_reports(text, uuid, text) from public, anon;
grant execute on function public.studbud_admin_resolve_reports(text, uuid, text) to authenticated;

-- ==========================================================================
-- CLASSROOMS: teachers (accounts with the "teacher" tag at a Parkway school) pick the courses they teach
-- from their school's catalog. Students at the same school who have that course get access automatically
-- (no join codes), share a small progress snapshot with the teacher, and see the teacher's flashcard sets.
-- ==========================================================================
create table if not exists public.studbud_classes (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references auth.users (id) on delete cascade,
    school text not null check (school in ('pchs', 'pnhs', 'pshs', 'pwhs')),
    course_code text not null check (char_length(course_code) between 1 and 40),
    title text not null check (char_length(title) between 1 and 100),
    section text not null default '' check (char_length(section) <= 40),
    join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
    created_at timestamptz not null default now()
);
create index if not exists studbud_classes_teacher_idx on public.studbud_classes (teacher_id);
create index if not exists studbud_classes_course_idx on public.studbud_classes (school, course_code);
alter table public.studbud_classes enable row level security;
revoke all on table public.studbud_classes from public, anon, authenticated;

create table if not exists public.studbud_class_members (
    class_id uuid not null references public.studbud_classes (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    joined_at timestamptz not null default now(),
    snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 6000),
    snapshot_at timestamptz,
    primary key (class_id, user_id)
);
alter table public.studbud_class_members add column if not exists removed boolean not null default false;
create index if not exists studbud_class_members_user_idx on public.studbud_class_members (user_id);
alter table public.studbud_class_members enable row level security;
revoke all on table public.studbud_class_members from public, anon, authenticated;

create table if not exists public.studbud_class_decks (
    id uuid primary key default gen_random_uuid(),
    class_id uuid not null references public.studbud_classes (id) on delete cascade,
    title text not null check (char_length(title) between 1 and 100),
    description text not null default '' check (char_length(description) <= 300),
    cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) <= 500 and octet_length(cards::text) <= 250000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists studbud_class_decks_class_idx on public.studbud_class_decks (class_id);
alter table public.studbud_class_decks enable row level security;
revoke all on table public.studbud_class_decks from public, anon, authenticated;

create or replace function public.studbud_require_teacher()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    v_school text;
begin
    if public.studbud_is_guest() or auth.uid() is null then raise exception 'Sign in with a teacher account first.'; end if;
    if not exists (select 1 from public.studbud_user_tags where user_id = auth.uid() and tag = 'teacher') then
        raise exception 'Only teacher accounts can manage classes.';
    end if;
    select coalesce(pp.school, a.raw_user_meta_data ->> 'school', 'pchs') into v_school
    from auth.users a left join public.studbud_public_profiles pp on pp.user_id = a.id
    where a.id = auth.uid();
    if v_school not in ('pchs', 'pnhs', 'pshs', 'pwhs') then
        raise exception 'Classes are available for Parkway high schools. Pick your school in Settings first.';
    end if;
    return v_school;
end;
$$;
revoke all on function public.studbud_require_teacher() from public, anon, authenticated;

create or replace function public.studbud_class_person(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select jsonb_build_object(
        'user_id', a.id,
        'username', coalesce(nullif(a.raw_user_meta_data ->> 'username', ''), 'Student'),
        'first_name', coalesce(pp.first_name, ''),
        'last_name', coalesce(pp.last_name, '')
    )
    from auth.users a left join public.studbud_public_profiles pp on pp.user_id = a.id
    where a.id = p_user_id;
$$;
revoke all on function public.studbud_class_person(uuid) from public, anon, authenticated;

create or replace function public.studbud_class_summary(p_class public.studbud_classes)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select jsonb_build_object(
        'id', p_class.id, 'school', p_class.school, 'course_code', p_class.course_code,
        'title', p_class.title, 'section', p_class.section, 'created_at', p_class.created_at,
        'teacher', public.studbud_class_person(p_class.teacher_id),
        'student_count', (select count(*) from public.studbud_class_members m where m.class_id = p_class.id and not m.removed),
        'deck_count', (select count(*) from public.studbud_class_decks d where d.class_id = p_class.id)
    );
$$;
revoke all on function public.studbud_class_summary(public.studbud_classes) from public, anon, authenticated;

create or replace function public.studbud_course_matches(p_course jsonb, p_code text, p_title text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from unnest(array[p_course ->> 'catalogCode', p_course ->> 'code']) as c(code)
        where length(btrim(coalesce(c.code, ''))) > 0 and length(btrim(coalesce(p_code, ''))) > 0
          and regexp_split_to_array(upper(btrim(c.code)), '\s*/\s*')
            && regexp_split_to_array(upper(btrim(p_code)), '\s*/\s*')
    ) or (
        length(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]', '', 'g')) > 0
        and regexp_replace(lower(coalesce(p_course ->> 'title', '')), '[^a-z0-9]', '', 'g')
            = regexp_replace(lower(p_title), '[^a-z0-9]', '', 'g')
    );
$$;
revoke all on function public.studbud_course_matches(jsonb, text, text) from public, anon, authenticated;

-- Reconcile only this teacher's rosters. Never expose students' saved course lists to clients.
create or replace function public.studbud_refresh_teacher_roster()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_teacher();
    delete from public.studbud_class_members m using public.studbud_classes c
    where c.id = m.class_id and c.teacher_id = auth.uid() and not m.removed
      and not exists (
          select 1 from public.studbud_user_data d
          join auth.users a on a.id = d.user_id
          left join public.studbud_public_profiles pp on pp.user_id = d.user_id
          cross join lateral jsonb_array_elements(
              case when jsonb_typeof(d.data #> '{state,courses}') = 'array'
                  then d.data #> '{state,courses}' else '[]'::jsonb end) as course(value)
          where d.user_id = m.user_id
            and coalesce(nullif(d.data #>> '{state,profile,school}', ''), pp.school, a.raw_user_meta_data ->> 'school', 'pchs') = c.school
            and public.studbud_course_matches(course.value, c.course_code, c.title)
      );
    insert into public.studbud_class_members (class_id, user_id)
    select distinct c.id, d.user_id
    from public.studbud_classes c
    join public.studbud_user_data d on d.user_id <> c.teacher_id
    join auth.users a on a.id = d.user_id
    left join public.studbud_public_profiles pp on pp.user_id = d.user_id
    cross join lateral jsonb_array_elements(
        case when jsonb_typeof(d.data #> '{state,courses}') = 'array'
            then d.data #> '{state,courses}' else '[]'::jsonb end) as course(value)
    where c.teacher_id = auth.uid()
      and coalesce(nullif(d.data #>> '{state,profile,school}', ''), pp.school, a.raw_user_meta_data ->> 'school', 'pchs') = c.school
      and public.studbud_course_matches(course.value, c.course_code, c.title)
      and not exists (select 1 from public.studbud_user_tags t where t.user_id = d.user_id and t.tag = 'teacher')
      and not coalesce(a.is_anonymous, false)
    on conflict do nothing;
end;
$$;
revoke all on function public.studbud_refresh_teacher_roster() from public, anon, authenticated;

create or replace function public.studbud_teacher_create_class(p_course_code text, p_title text, p_section text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_school text := public.studbud_require_teacher();
    v_code text;
    v_class public.studbud_classes;
    v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
    if p_course_code is null or char_length(btrim(p_course_code)) not between 1 and 40 then raise exception 'Pick a course from your school catalog.'; end if;
    if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then raise exception 'Class names must be 1-100 characters.'; end if;
    if char_length(coalesce(p_section, '')) > 40 then raise exception 'Keep the period or section label under 40 characters.'; end if;
    if (select count(*) from public.studbud_classes where teacher_id = auth.uid()) >= 20 then raise exception 'You can have up to 20 classes.'; end if;
    if exists (select 1 from public.studbud_classes where teacher_id = auth.uid() and course_code = btrim(p_course_code)) then
        raise exception 'You already added this course.';
    end if;
    loop
        select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::integer, 1), '') into v_code from generate_series(1, 6);
        exit when not exists (select 1 from public.studbud_classes where join_code = v_code);
    end loop;
    insert into public.studbud_classes (teacher_id, school, course_code, title, section, join_code)
    values (auth.uid(), v_school, btrim(p_course_code), btrim(p_title), btrim(coalesce(p_section, '')), v_code)
    returning * into v_class;
    perform public.studbud_refresh_teacher_roster();
    return public.studbud_class_summary(v_class) || jsonb_build_object('join_code', v_class.join_code);
end;
$$;

create or replace function public.studbud_teacher_update_class(p_class_id uuid, p_title text, p_section text, p_new_code boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_class public.studbud_classes;
    v_code text;
    v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
    perform public.studbud_require_teacher();
    if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then raise exception 'Class names must be 1-100 characters.'; end if;
    if char_length(coalesce(p_section, '')) > 40 then raise exception 'Keep the period or section label under 40 characters.'; end if;
    select * into v_class from public.studbud_classes where id = p_class_id and teacher_id = auth.uid();
    if v_class.id is null then raise exception 'Class not found.'; end if;
    v_code := v_class.join_code;
    if coalesce(p_new_code, false) then
        loop
            select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::integer, 1), '') into v_code from generate_series(1, 6);
            exit when not exists (select 1 from public.studbud_classes where join_code = v_code);
        end loop;
    end if;
    update public.studbud_classes set title = btrim(p_title), section = btrim(coalesce(p_section, '')), join_code = v_code
    where id = p_class_id returning * into v_class;
    return public.studbud_class_summary(v_class) || jsonb_build_object('join_code', v_class.join_code);
end;
$$;

create or replace function public.studbud_teacher_delete_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_teacher();
    delete from public.studbud_classes where id = p_class_id and teacher_id = auth.uid();
    if not found then raise exception 'Class not found.'; end if;
end;
$$;

create or replace function public.studbud_teacher_classes()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_school text := public.studbud_require_teacher();
begin
    perform public.studbud_refresh_teacher_roster();
    return jsonb_build_object('school', v_school, 'classes', coalesce((
        select jsonb_agg(public.studbud_class_summary(c) || jsonb_build_object(
            'join_code', c.join_code,
            'average_grade', (select round(avg((m.snapshot ->> 'grade_pct')::numeric), 1) from public.studbud_class_members m
                where m.class_id = c.id and not m.removed and m.snapshot ->> 'grade_pct' ~ '^-?[0-9]+(\.[0-9]+)?$'),
            'missing_total', (select coalesce(sum((m.snapshot ->> 'missing')::integer), 0) from public.studbud_class_members m
                where m.class_id = c.id and not m.removed and m.snapshot ->> 'missing' ~ '^[0-9]{1,4}$')
        ) order by c.section, c.title)
        from public.studbud_classes c where c.teacher_id = auth.uid()
    ), '[]'::jsonb));
end;
$$;

create or replace function public.studbud_teacher_class_detail(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_class public.studbud_classes;
    v_today date := timezone('utc', now())::date;
begin
    perform public.studbud_require_teacher();
    select * into v_class from public.studbud_classes where id = p_class_id and teacher_id = auth.uid();
    if v_class.id is null then raise exception 'Class not found.'; end if;
    perform public.studbud_refresh_teacher_roster();
    return public.studbud_class_summary(v_class) || jsonb_build_object(
        'join_code', v_class.join_code,
        'students', coalesce((
            select jsonb_agg(public.studbud_class_person(m.user_id) || jsonb_build_object(
                'joined_at', m.joined_at,
                'snapshot', m.snapshot,
                'snapshot_at', m.snapshot_at,
                'today_seconds', (select coalesce(sum(e.seconds), 0) from public.studbud_study_time_entries e where e.user_id = m.user_id and e.study_date = v_today),
                'week_seconds', (select coalesce(sum(e.seconds), 0) from public.studbud_study_time_entries e where e.user_id = m.user_id and e.study_date > v_today - 7),
                'streak', public.studbud_current_streak(m.user_id),
                'last_active', greatest(m.snapshot_at, (select max(e.created_at) from public.studbud_study_time_entries e where e.user_id = m.user_id))
            ) order by m.joined_at)
            from public.studbud_class_members m where m.class_id = v_class.id and not m.removed
        ), '[]'::jsonb),
        'removed', coalesce((
            select jsonb_agg(public.studbud_class_person(m.user_id) order by m.joined_at)
            from public.studbud_class_members m where m.class_id = v_class.id and m.removed
        ), '[]'::jsonb),
        'decks', coalesce((
            select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'description', d.description, 'cards', d.cards, 'updated_at', d.updated_at) order by d.updated_at desc)
            from public.studbud_class_decks d where d.class_id = v_class.id
        ), '[]'::jsonb)
    );
end;
$$;

create or replace function public.studbud_teacher_remove_student(p_class_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_teacher();
    if not exists (select 1 from public.studbud_classes where id = p_class_id and teacher_id = auth.uid()) then raise exception 'Class not found.'; end if;
    update public.studbud_class_members set removed = true, snapshot = '{}'::jsonb, snapshot_at = null
    where class_id = p_class_id and user_id = p_user_id;
end;
$$;

create or replace function public.studbud_teacher_restore_student(p_class_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_teacher();
    if not exists (select 1 from public.studbud_classes where id = p_class_id and teacher_id = auth.uid()) then raise exception 'Class not found.'; end if;
    update public.studbud_class_members set removed = false where class_id = p_class_id and user_id = p_user_id;
end;
$$;

create or replace function public.studbud_teacher_save_deck(p_class_id uuid, p_deck_id uuid, p_title text, p_description text, p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_cards jsonb;
    v_id uuid;
begin
    perform public.studbud_require_teacher();
    if not exists (select 1 from public.studbud_classes where id = p_class_id and teacher_id = auth.uid()) then raise exception 'Class not found.'; end if;
    if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then raise exception 'Set titles must be 1-100 characters.'; end if;
    if char_length(coalesce(p_description, '')) > 300 then raise exception 'Keep the description under 300 characters.'; end if;
    if p_cards is null or jsonb_typeof(p_cards) <> 'array' then raise exception 'Add at least one card.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('front', left(btrim(card ->> 'front'), 1000), 'back', left(btrim(card ->> 'back'), 1000))), '[]'::jsonb)
    into v_cards
    from jsonb_array_elements(p_cards) card
    where jsonb_typeof(card) = 'object' and char_length(btrim(coalesce(card ->> 'front', ''))) > 0 and char_length(btrim(coalesce(card ->> 'back', ''))) > 0;
    if jsonb_array_length(v_cards) = 0 then raise exception 'Add at least one card with a term and a definition.'; end if;
    if jsonb_array_length(v_cards) > 500 then raise exception 'Class sets can have up to 500 cards.'; end if;
    if p_deck_id is null then
        if (select count(*) from public.studbud_class_decks where class_id = p_class_id) >= 50 then raise exception 'A class can have up to 50 sets.'; end if;
        insert into public.studbud_class_decks (class_id, title, description, cards)
        values (p_class_id, btrim(p_title), btrim(coalesce(p_description, '')), v_cards) returning id into v_id;
    else
        update public.studbud_class_decks set title = btrim(p_title), description = btrim(coalesce(p_description, '')), cards = v_cards, updated_at = now()
        where id = p_deck_id and class_id = p_class_id returning id into v_id;
        if v_id is null then raise exception 'Set not found.'; end if;
    end if;
    return jsonb_build_object('id', v_id, 'card_count', jsonb_array_length(v_cards));
end;
$$;

create or replace function public.studbud_teacher_delete_deck(p_deck_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_teacher();
    delete from public.studbud_class_decks d using public.studbud_classes c
    where d.id = p_deck_id and c.id = d.class_id and c.teacher_id = auth.uid();
    if not found then raise exception 'Set not found.'; end if;
end;
$$;

-- Access is automatic: a student is in every class at their own school whose course is in their course list.
-- Classes for courses they no longer take (or at another school) are dropped; teacher removals stick.
drop function if exists public.studbud_join_class(text, uuid);
drop function if exists public.studbud_leave_class(uuid);
drop function if exists public.studbud_my_classes(text[]);

create or replace function public.studbud_my_classes(p_course_codes text[] default array[]::text[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_school text;
    v_codes text[];
begin
    if public.studbud_is_guest() or auth.uid() is null then return jsonb_build_object('classes', '[]'::jsonb); end if;
    select coalesce(nullif(d.data #>> '{state,profile,school}', ''), pp.school, a.raw_user_meta_data ->> 'school', 'pchs') into v_school
    from auth.users a
    left join public.studbud_public_profiles pp on pp.user_id = a.id
    left join public.studbud_user_data d on d.user_id = a.id
    where a.id = auth.uid();
    select coalesce(array_agg(distinct left(btrim(code), 40)), array[]::text[]) into v_codes
    from unnest(coalesce(p_course_codes, array[]::text[])) with ordinality as t(code, n)
    where n <= 40 and char_length(btrim(coalesce(code, ''))) > 0;

    delete from public.studbud_class_members m using public.studbud_classes c
    where m.class_id = c.id and m.user_id = auth.uid() and not m.removed
      and (c.school <> v_school or not exists (
          select 1 from unnest(v_codes) as code(value)
          where public.studbud_course_matches(jsonb_build_object('code', code.value), c.course_code, '')
      ));

    insert into public.studbud_class_members (class_id, user_id)
    select c.id, auth.uid() from public.studbud_classes c
    where c.school = v_school and c.teacher_id <> auth.uid()
      and exists (
          select 1 from unnest(v_codes) as code(value)
          where public.studbud_course_matches(jsonb_build_object('code', code.value), c.course_code, '')
      )
    on conflict do nothing;

    return jsonb_build_object(
        'school', v_school,
        'classes', coalesce((
            select jsonb_agg(public.studbud_class_summary(c) || jsonb_build_object(
                'decks', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'description', d.description, 'cards', d.cards, 'updated_at', d.updated_at) order by d.updated_at desc)
                    from public.studbud_class_decks d where d.class_id = c.id), '[]'::jsonb)
            ) order by c.title)
            from public.studbud_classes c join public.studbud_class_members m on m.class_id = c.id and m.user_id = auth.uid() and not m.removed
        ), '[]'::jsonb)
    );
end;
$$;

-- The student app pushes a small per-class snapshot (grade, missing and upcoming work) so the teacher roster stays current.
create or replace function public.studbud_sync_class_stats(p_snapshots jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_item jsonb;
    v_count integer := 0;
begin
    if public.studbud_is_guest() or auth.uid() is null then return 0; end if;
    if p_snapshots is null or jsonb_typeof(p_snapshots) <> 'array' or jsonb_array_length(p_snapshots) > 20 then raise exception 'Invalid class progress.'; end if;
    for v_item in select value from jsonb_array_elements(p_snapshots) loop
        continue when coalesce(jsonb_typeof(v_item -> 'snapshot'), '') <> 'object' or octet_length((v_item -> 'snapshot')::text) > 6000;
        continue when coalesce(v_item ->> 'class_id', '') !~ '^[0-9a-f-]{36}$';
        update public.studbud_class_members set snapshot = v_item -> 'snapshot', snapshot_at = now()
        where class_id = (v_item ->> 'class_id')::uuid and user_id = auth.uid() and not removed;
        if found then v_count := v_count + 1; end if;
    end loop;
    return v_count;
end;
$$;

revoke all on function public.studbud_teacher_create_class(text, text, text) from public, anon;
grant execute on function public.studbud_teacher_create_class(text, text, text) to authenticated;
revoke all on function public.studbud_teacher_update_class(uuid, text, text, boolean) from public, anon;
grant execute on function public.studbud_teacher_update_class(uuid, text, text, boolean) to authenticated;
revoke all on function public.studbud_teacher_delete_class(uuid) from public, anon;
grant execute on function public.studbud_teacher_delete_class(uuid) to authenticated;
revoke all on function public.studbud_teacher_classes() from public, anon;
grant execute on function public.studbud_teacher_classes() to authenticated;
revoke all on function public.studbud_teacher_class_detail(uuid) from public, anon;
grant execute on function public.studbud_teacher_class_detail(uuid) to authenticated;
revoke all on function public.studbud_teacher_remove_student(uuid, uuid) from public, anon;
grant execute on function public.studbud_teacher_remove_student(uuid, uuid) to authenticated;
revoke all on function public.studbud_teacher_save_deck(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.studbud_teacher_save_deck(uuid, uuid, text, text, jsonb) to authenticated;
revoke all on function public.studbud_teacher_delete_deck(uuid) from public, anon;
grant execute on function public.studbud_teacher_delete_deck(uuid) to authenticated;
revoke all on function public.studbud_teacher_restore_student(uuid, uuid) from public, anon;
grant execute on function public.studbud_teacher_restore_student(uuid, uuid) to authenticated;
revoke all on function public.studbud_my_classes(text[]) from public, anon;
grant execute on function public.studbud_my_classes(text[]) to authenticated;
revoke all on function public.studbud_sync_class_stats(jsonb) from public, anon;
grant execute on function public.studbud_sync_class_stats(jsonb) to authenticated;

notify pgrst, 'reload schema';