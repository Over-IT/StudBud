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

    insert into public.studbud_study_time_entries (user_id, entry_id, study_date, seconds)
    values (v_user_id, btrim(p_entry_id), p_study_date, p_seconds)
    on conflict (user_id, entry_id) do nothing;
    get diagnostics v_inserted = row_count;
    return jsonb_build_object('recorded', v_inserted > 0);
end;
$$;

create or replace function public.studbud_get_study_leaderboard(p_period text default 'daily')
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
    v_streak_day date;
    v_day_seconds integer;
    v_today_seconds integer;
    v_streak integer := 0;
    v_board jsonb;
begin
    if v_user_id is null then raise exception 'Sign in to open study leaderboards.'; end if;
    if p_period is null or p_period not in ('daily', 'weekly') then raise exception 'Choose a daily or weekly leaderboard.'; end if;
    v_start := case when p_period = 'weekly'
        then date_trunc('week', v_today::timestamp)::date
        else v_today
    end;

    select coalesce(sum(seconds), 0)::integer into v_today_seconds
    from public.studbud_study_time_entries
    where user_id = v_user_id and study_date = v_today;

    v_streak_day := v_today;
    if v_today_seconds < 900 then v_streak_day := v_today - 1; end if;
    loop
        select coalesce(sum(seconds), 0)::integer into v_day_seconds
        from public.studbud_study_time_entries
        where user_id = v_user_id and study_date = v_streak_day;
        exit when v_day_seconds < 900;
        v_streak := v_streak + 1;
        v_streak_day := v_streak_day - 1;
    end loop;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'rank', ranked.rank,
            'username', ranked.username,
            'seconds', ranked.seconds,
            'minutes', floor(ranked.seconds / 60.0)::integer,
            'is_me', ranked.user_id = v_user_id
        ) order by ranked.seconds desc, ranked.username
    ), '[]'::jsonb)
    into v_board
    from (
        select row_number() over (order by sum(entry.seconds) desc, coalesce(nullif(account.raw_user_meta_data ->> 'username', ''), 'Student'))::integer as rank,
            entry.user_id,
            coalesce(nullif(account.raw_user_meta_data ->> 'username', ''), 'Student') as username,
            sum(entry.seconds)::integer as seconds
        from public.studbud_study_time_entries entry
        join auth.users account on account.id = entry.user_id
        where entry.study_date between v_start and v_today
          and not exists (select 1 from public.studbud_banned_users banned where banned.user_id = entry.user_id)
        group by entry.user_id, account.raw_user_meta_data
        order by sum(entry.seconds) desc, username
        limit 50
    ) ranked;

    return jsonb_build_object(
        'period', p_period,
        'starts_on', v_start,
        'ends_on', v_today,
        'today_seconds', v_today_seconds,
        'today_minutes', floor(v_today_seconds / 60.0)::integer,
        'daily_goal_seconds', 900,
        'streak_days', v_streak,
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
    mode text not null check (mode in ('classic', 'rush', 'survival', 'skyline', 'river', 'market', 'miner', 'duel', 'crypto', 'shooter', 'sports', 'fishing', 'hack')),
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
    check (mode in ('classic', 'rush', 'survival', 'skyline', 'river', 'market', 'miner', 'duel', 'crypto', 'shooter', 'sports', 'fishing', 'hack'));
alter table public.studbud_game_rooms drop constraint if exists studbud_game_rooms_goal_type_check;
alter table public.studbud_game_rooms
    add constraint studbud_game_rooms_goal_type_check check (goal_type in ('points', 'time'));
alter table public.studbud_game_rooms drop constraint if exists studbud_game_rooms_point_limit_check;
alter table public.studbud_game_rooms
    add constraint studbud_game_rooms_point_limit_check check (point_limit > 0);
alter table public.studbud_game_rooms drop constraint if exists studbud_game_rooms_time_limit_seconds_check;
alter table public.studbud_game_rooms
    add constraint studbud_game_rooms_time_limit_seconds_check check (time_limit_seconds between 60 and 3600);

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
    best_wait_score integer not null default 0 check (best_wait_score >= 0),
    updated_at timestamptz not null default now()
);

alter table public.studbud_multiplayer_profiles
    add column if not exists equipped_skin text not null default '',
    add column if not exists equipped_hat text not null default '',
    add column if not exists equipped_accessory text not null default '',
    add column if not exists best_wait_score integer not null default 0;

-- Legacy 'accessory_default' placeholder from older versions means "nothing equipped".
update public.studbud_multiplayer_profiles set equipped_accessory = '' where equipped_accessory = 'accessory_default';

alter table public.studbud_multiplayer_profiles
    add column if not exists equipped_pet text not null default '',
    add column if not exists last_daily_claim date,
    add column if not exists daily_streak integer not null default 0,
    add column if not exists solo_coins_day date,
    add column if not exists solo_coins_today integer not null default 0;

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
        ('hat_wizard', 160), ('hat_pirate', 170), ('hat_viking', 190), ('hat_horns', 200), ('hat_halo', 250), ('hat_crown', 400),
        ('acc_bowtie', 70), ('acc_shades', 80), ('acc_eyepatch', 90), ('acc_scarf', 90), ('acc_backpack', 100),
        ('acc_monocle', 140), ('acc_cape', 180), ('acc_sparkles', 220), ('acc_wings', 350),
        ('accessory_cap', 75), ('accessory_halo', 125), ('accessory_headphones', 150)
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
    select priced.id, priced.price,
        case when priced.price < 100 then 'common' when priced.price < 160 then 'uncommon'
             when priced.price < 260 then 'rare' when priced.price < 400 then 'epic' else 'legendary' end
    from priced
    union all
    select pets.id, null::integer, pets.rarity from pets;
$$;

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
        'equipped_pet', v_profile.equipped_pet,
        'best_wait_score', v_profile.best_wait_score,
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
begin
    if v_user_id is null then raise exception 'Sign in to open a mystery box.'; end if;
    if p_box = 'basic' then
        v_cost := 80;
        v_rarity := case when v_roll < 0.70 then 'common' when v_roll < 0.92 then 'uncommon' when v_roll < 0.99 then 'rare' else 'epic' end;
    elsif p_box = 'rare' then
        v_cost := 200;
        v_rarity := case when v_roll < 0.20 then 'common' when v_roll < 0.60 then 'uncommon' when v_roll < 0.88 then 'rare' when v_roll < 0.98 then 'epic' else 'legendary' end;
    elsif p_box = 'legendary' then
        v_cost := 500;
        v_rarity := case when v_roll < 0.20 then 'uncommon' when v_roll < 0.60 then 'rare' when v_roll < 0.90 then 'epic' else 'legendary' end;
    else
        raise exception 'Unknown mystery box.';
    end if;
    insert into public.studbud_multiplayer_profiles (user_id)
    values (v_user_id) on conflict (user_id) do nothing;
    select * into v_profile from public.studbud_multiplayer_profiles where user_id = v_user_id for update;
    if v_profile.coins < v_cost then raise exception 'You need % multiplayer coins to open that box.', v_cost; end if;

    select id into v_item_id
    from public.studbud_shop_items()
    where rarity = v_rarity and id not like 'accessory\_%'
    order by random()
    limit 1;
    if v_item_id is null then raise exception 'That box is empty right now.'; end if;

    if v_item_id = any(v_profile.owned_items) then
        v_duplicate := true;
        v_refund := case v_rarity when 'common' then 15 when 'uncommon' then 30 when 'rare' then 60 when 'epic' then 120 else 250 end;
    end if;

    update public.studbud_multiplayer_profiles
    set coins = coins - v_cost + v_refund,
        owned_items = case when v_duplicate then owned_items else array_append(owned_items, v_item_id) end,
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
    if v_user_id is null then raise exception 'Sign in to customize your multiplayer profile.'; end if;
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
    if v_user_id is null then raise exception 'Sign in to customize your multiplayer profile.'; end if;
    insert into public.studbud_multiplayer_profiles (user_id) values (v_user_id) on conflict (user_id) do nothing;
    if p_slot = 'skin' then update public.studbud_multiplayer_profiles set equipped_skin = '', updated_at = now() where user_id = v_user_id;
    elsif p_slot = 'hat' then update public.studbud_multiplayer_profiles set equipped_hat = '', updated_at = now() where user_id = v_user_id;
    elsif p_slot = 'accessory' then update public.studbud_multiplayer_profiles set equipped_accessory = '', updated_at = now() where user_id = v_user_id;
    elsif p_slot = 'pet' then update public.studbud_multiplayer_profiles set equipped_pet = '', updated_at = now() where user_id = v_user_id;
    else raise exception 'Unknown slot.'; end if;
    return public.studbud_get_multiplayer_profile();
end;
$$;

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
begin
    select * into v_room from public.studbud_game_rooms where id = p_room_id for update;
    if not found or v_room.status <> 'finished' or v_room.rewards_paid then return; end if;
    select coalesce(max((player ->> 'score')::integer), 0)
    into v_high_score
    from jsonb_array_elements(v_room.state -> 'players') as item(player);

    for v_player in
        select player from jsonb_array_elements(v_room.state -> 'players') as item(player)
        where coalesce((player ->> 'correct_count')::integer, 0) > 0 or coalesce((player ->> 'score')::integer, 0) > 0
    loop
        v_reward := least(250, coalesce((v_player ->> 'correct_count')::integer, 0) * 6)
            + case when (v_player ->> 'score')::integer = v_high_score and v_high_score > 0 then 25 else 0 end;
        insert into public.studbud_multiplayer_profiles (user_id)
        values ((v_player ->> 'id')::uuid) on conflict (user_id) do nothing;
        update public.studbud_multiplayer_profiles
        set coins = coins + v_reward,
            wins = wins + case when (v_player ->> 'score')::integer = v_high_score and v_high_score > 0 then 1 else 0 end,
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

    select jsonb_agg(to_jsonb(answer) order by shuffle_key)
    into v_options
    from (
        select answer, min(shuffle_key) as shuffle_key
        from (
            select card ->> 'back' as answer, random() as shuffle_key
            from jsonb_array_elements(p_cards) as item(card)
            where card ->> 'back' is not null
                and (card ->> 'back') <> (v_card ->> 'back')
        ) as definitions
        group by answer
        order by min(shuffle_key)
        limit 3
    ) as choices;

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
    if p_code !~ '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'The room code is invalid.'; end if;
    if char_length(v_nickname) not between 2 and 20 or v_nickname !~ '^[A-Za-z0-9 _-]+$' then
        raise exception 'Nickname must be 2–20 letters, numbers, spaces, underscores, or hyphens.';
    end if;
    if coalesce(p_mode, '') not in ('classic', 'rush', 'survival', 'skyline', 'river', 'market', 'miner', 'duel', 'crypto', 'shooter', 'sports', 'fishing', 'hack') then raise exception 'Choose a valid game mode.'; end if;
    if v_goal_type not in ('points', 'time') then raise exception 'Choose a valid match goal.'; end if;
    if v_time_limit not between 60 and 3600 then
        raise exception 'Choose a time limit between 1 minute and 1 hour.';
    end if;
    if v_reward not in (10, 20, 30, 50) then raise exception 'Choose a supported question reward.'; end if;
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
            'players', jsonb_build_array(jsonb_build_object(
                'id', v_user_id::text, 'nickname', v_nickname, 'score', 0,
                'streak', 0, 'lives', 3, 'answered', false, 'answered_count', 0, 'eliminated', false,
                'distance', 0, 'loot', 0, 'deliveries', 0, 'depth', 0, 'yards', 0,
                'touchdowns', 0, 'targets', 0, 'wave', 1, 'last_event', '', 'last_action', '',
                'avatar', v_cosmetics ->> 'avatar', 'palette', v_cosmetics ->> 'palette',
                'skin', v_cosmetics ->> 'skin', 'hat', v_cosmetics ->> 'hat', 'accessory', v_cosmetics ->> 'accessory', 'pet', v_cosmetics ->> 'pet'
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
        'skin', v_cosmetics ->> 'skin', 'hat', v_cosmetics ->> 'hat', 'accessory', v_cosmetics ->> 'accessory', 'pet', v_cosmetics ->> 'pet'
    ));
    update public.studbud_game_rooms
    set state = jsonb_set(state, '{players}', v_players),
        updated_at = now()
    where id = v_room.id
    returning * into v_room;

    return public.studbud_game_room_view(v_room);
end;
$$;

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

    update public.studbud_game_rooms
    set status = 'playing',
        started_at = now(),
        state = jsonb_build_object(
            'players', v_players,
            'question_index', 0,
            'question_reward', coalesce((v_room.state ->> 'question_reward')::integer, 20),
            'question', public.studbud_game_make_question(cards, 0)
        ),
        updated_at = now()
    where id = v_room.id
    returning * into v_room;
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
    set status = 'finished', updated_at = now()
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
        set status = 'finished', updated_at = now()
        where id = v_room.id returning * into v_room;
        perform public.studbud_pay_game_rewards(v_room.id);
    else
        select coalesce(jsonb_agg(player order by ordinality), '[]'::jsonb)
        into v_players
        from jsonb_array_elements(v_room.state -> 'players') with ordinality as item(player, ordinality)
        where player ->> 'id' <> auth.uid()::text;
        update public.studbud_game_rooms
        set state = jsonb_set(state, '{players}', v_players),
            updated_at = now()
        where id = v_room.id;
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

revoke all on function public.studbud_report_game_score(text, integer, integer, integer) from public, anon;
grant execute on function public.studbud_report_game_score(text, integer, integer, integer) to authenticated;
revoke all on function public.studbud_unequip_multiplayer_slot(text) from public, anon;
grant execute on function public.studbud_unequip_multiplayer_slot(text) to authenticated;

revoke all on function public.studbud_record_community_deck_study(uuid) from public, anon;
grant execute on function public.studbud_record_community_deck_study(uuid) to authenticated;
revoke all on function public.studbud_record_study_time(text, integer, date) from public, anon;
grant execute on function public.studbud_record_study_time(text, integer, date) to authenticated;
revoke all on function public.studbud_get_study_leaderboard(text) from public, anon;
grant execute on function public.studbud_get_study_leaderboard(text) to authenticated;
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
-- Admin tools: only the "overit" account (email overit@accounts.studbud.invalid)
-- Every function re-checks the caller on the server, so the client can't bypass it.
-- ============================================================================
create table if not exists public.studbud_banned_users (
    user_id uuid primary key references auth.users (id) on delete cascade,
    reason text not null default '',
    banned_at timestamptz not null default now()
);
alter table public.studbud_banned_users enable row level security;
revoke all on table public.studbud_banned_users from anon, authenticated;

create or replace function public.studbud_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from auth.users
        where id = auth.uid() and lower(email) = 'overit@accounts.studbud.invalid'
    );
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

-- Banned users can't publish community decks.
drop policy if exists "Deck owners can publish community decks" on public.studbud_community_decks;
create policy "Deck owners can publish community decks"
    on public.studbud_community_decks for insert
    to authenticated with check (
        auth.uid() = owner_id
        and not exists (select 1 from public.studbud_banned_users b where b.user_id = auth.uid())
    );

-- Username changes: once every 7 days, or immediately when the admin forces a rename.
create table if not exists public.studbud_username_state (
    user_id uuid primary key references auth.users(id) on delete cascade,
    changed_at timestamptz,
    force_change boolean not null default false
);
alter table public.studbud_username_state enable row level security;
revoke all on public.studbud_username_state from anon, authenticated;

create or replace function public.studbud_admin_list_users(p_query text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
    perform public.studbud_require_admin();
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
                coalesce((select s.force_change from public.studbud_username_state s where s.user_id = a.id), false) as force_change
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
    perform public.studbud_require_admin();
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
    perform public.studbud_require_admin();
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
    perform public.studbud_require_admin();
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
    perform public.studbud_require_admin();
    delete from public.studbud_community_decks where owner_id = p_user_id;
end;
$$;

revoke all on function public.studbud_is_admin() from public, anon;
grant execute on function public.studbud_is_admin() to authenticated;
revoke all on function public.studbud_require_admin() from public, anon, authenticated;
revoke all on function public.studbud_admin_list_users(text) from public, anon;
grant execute on function public.studbud_admin_list_users(text) to authenticated;
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
    perform public.studbud_require_admin();
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