-- Run after supabase-setup.sql in the Supabase SQL editor.
-- Repairs this confirmed historical moderation deletion by public identity, not title.
begin;

alter table public.studbud_removed_decks alter column source_deck_id drop not null;

insert into public.studbud_removed_decks (id, owner_id, source_deck_id)
select 'e905f9a1-1f2a-411f-90b8-e7cce02b0c3c'::uuid,
    'f5e37575-f728-449b-a401-094dda45f786'::uuid,
    (
        select deck ->> 'id'
        from public.studbud_user_data d,
            jsonb_array_elements(case when jsonb_typeof(d.data -> 'flashcards') = 'array'
                then d.data -> 'flashcards' else '[]'::jsonb end) deck
        where d.user_id = 'f5e37575-f728-449b-a401-094dda45f786'::uuid
            and deck ->> 'communityDeckId' = 'e905f9a1-1f2a-411f-90b8-e7cce02b0c3c'
        order by deck ->> 'id'
        limit 1
    )
on conflict (id) do update
set source_deck_id = coalesce(public.studbud_removed_decks.source_deck_id, excluded.source_deck_id);

update public.studbud_user_data d
set data = public.studbud_prune_removed_decks(d.data, d.user_id),
    updated_at = greatest(clock_timestamp(), d.updated_at + interval '1 microsecond')
where d.data is distinct from public.studbud_prune_removed_decks(d.data, d.user_id);

delete from public.studbud_community_decks
where id = 'e905f9a1-1f2a-411f-90b8-e7cce02b0c3c'::uuid;

commit;

select id, owner_id, source_deck_id, removed_at
from public.studbud_removed_decks
where id = 'e905f9a1-1f2a-411f-90b8-e7cce02b0c3c'::uuid;
