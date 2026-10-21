const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase-setup.sql'), 'utf8');
function functionSql(name) {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    assert.notEqual(start, -1, `${name} is defined`);
    const end = sql.indexOf('\n$$;', start);
    assert.notEqual(end, -1, `${name} has a complete SQL body`);
    return sql.slice(start, end + 4);
}
function rpc(name, signature) {
    const source = functionSql(name);
    assert.match(source, /security definer/);
    assert.match(source, /set search_path = public, pg_temp/);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(${signature}\\) from public, anon`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(${signature}\\) to authenticated`));
    return source;
}

const schemaStart = sql.indexOf('-- School community privacy is separate');
assert.notEqual(schemaStart, -1);
const featureSql = sql.slice(schemaStart);
assert.match(featureSql, /show_school_discovery boolean not null default false/);
assert.match(featureSql, /add column if not exists show_school_discovery/);
assert.match(sql, /show_classmates boolean not null default false/);
assert.match(featureSql, /studbud_class_community_posts/);
assert.match(featureSql, /check \(char_length\(body\) between 1 and 2000 or \(deleted and body = ''\)\)/);
assert.match(featureSql, /on public\.studbud_class_community_posts \(class_id, created_at desc, id desc\)/);
assert.match(featureSql, /on public\.studbud_class_community_posts \(parent_id, created_at desc, id desc\)/);
assert.match(featureSql, /alter table public\.studbud_class_community_posts enable row level security/);
assert.match(featureSql, /revoke all on table public\.studbud_class_community_posts from public, anon, authenticated/);
assert.match(featureSql, /create table if not exists public\.studbud_class_live_rooms/);
assert.match(featureSql, /room_id uuid not null unique references public\.studbud_game_rooms \(id\) on delete cascade/);

const preference = rpc('studbud_set_school_discovery', 'boolean');
assert.match(preference, /public\.studbud_is_guest\(\)/);
assert.match(preference, /public\.studbud_is_hidden_user\(auth\.uid\(\)\)/);
assert.match(preference, /show_school_discovery/);
assert.doesNotMatch(preference, /show_classmates\s*=/, 'school discovery cannot alter classmate consent');

const hub = rpc('studbud_school_community', 'uuid, uuid');
for (const key of ['school', 'class_id', 'can_announce', 'school_discovery', 'class_discovery',
    'people', 'decks', 'posts', 'live', 'next_before']) {
    assert.match(hub, new RegExp(`'${key}'`), `hub response includes ${key}`);
}
for (const field of ['user_id', 'username', 'card_count', 'course_title',
    'room_code', 'deck_title', 'teacher_username', 'joinable']) {
    assert.match(hub, new RegExp(`'${field}'`), `hub response includes ${field}`);
}
assert.match(hub, /author_id/);
assert.match(hub, /reply_count/);
assert.match(hub, /public\.studbud_community_require_class\(p_class_id\)/);
assert.match(hub, /not public\.studbud_is_hidden_user\(a\.id\)/);
assert.match(hub, /pp\.show_school_discovery/);
assert.match(hub, /pp\.show_classmates/);
assert.match(hub, /not m\.removed/);
assert.match(hub, /public\.studbud_course_matches/);
const deckScopes = hub.match(/from public\.studbud_community_decks d[\s\S]*?limit 20/g) || [];
assert.equal(deckScopes.length, 2, 'school and class public-set listings are both checked');
for (const scoped of deckScopes) {
    assert.match(scoped, /join public\.studbud_public_profiles author_profile on author_profile\.user_id = d\.owner_id\s+and \(author_profile\.show_school or \(v_school_discovery and author_profile\.show_school_discovery\)\)/,
        'publishing alone never discloses a hidden school affiliation');
    assert.doesNotMatch(scoped, /author_profile\.show_school or author_profile\.show_school_discovery/,
        'discovery-only consent is mutual, not public');
    assert.match(scoped, /public\.studbud_community_school\(d\.owner_id\) = (?:v_school|v_class\.school)/);
    assert.match(scoped, /not public\.studbud_is_hidden_user\(d\.owner_id\)/);
}
assert.doesNotMatch(hub, /studbud_class_decks/, 'teacher class decks remain in the existing class RPC');
assert.match(hub, /limit 20/);
assert.match(hub, /limit 21/);
assert.match(hub, /order by p\.created_at desc, p\.id desc/);
assert.match(hub, /room\.status in \('waiting', 'playing'\)/);
assert.match(hub, /room\.expires_at > now\(\)/);
assert.match(hub, /room\.host_last_seen_at > now\(\) - interval '30 seconds'/);
assert.doesNotMatch(hub, /snapshot|grade_pct|missing_total|email/i, 'peer discovery returns no private classroom progress');

const scope = functionSql('studbud_community_require_class');
assert.match(scope, /v_class\.school <> v_school/);
assert.match(scope, /m\.user_id = auth\.uid\(\) and not m\.removed/);
assert.match(scope, /public\.studbud_is_hidden_user\(auth\.uid\(\)\)/);

const post = rpc('studbud_community_post', 'uuid, text, text, uuid');
assert.match(post, /v_body text := btrim\(coalesce\(p_body, ''\)\)/);
assert.match(post, /char_length\(v_body\) not between 1 and 2000/);
assert.match(post, /octet_length\(v_body\) > 8000/);
assert.match(post, /v_kind = 'announcement'/);
assert.match(post, /v_class\.teacher_id <> v_uid/);
assert.match(post, /p\.parent_id is null and not p\.deleted/, 'replies are one level below any visible root');
assert.doesNotMatch(post, /p\.kind = 'discussion'/, 'announcements can receive discussion replies');
assert.match(post, /if v_kind <> 'discussion' then raise exception 'Replies must be discussion posts\.'/);
assert.match(post, /v_class\.teacher_id <> v_uid or not public\.studbud_has_user_tag\(v_uid, 'teacher'\)/);
assert.match(post, /p\.created_at > now\(\) - interval '10 minutes'/);
assert.match(post, /p\.created_at > now\(\) - interval '1 day'/);
assert.match(post, /pg_advisory_xact_lock/);

const replies = rpc('studbud_community_replies', 'uuid, uuid');
assert.match(replies, /perform public\.studbud_community_require_class\(v_root\.class_id\)/);
assert.match(replies, /limit 21/);
assert.match(replies, /limit 20/);
assert.match(replies, /'posts', v_posts, 'next_before', v_next_before/);
assert.match(replies, /not p\.deleted/);
assert.match(replies, /not public\.studbud_is_hidden_user\(p\.author_id\)/);
assert.match(replies, /p\.id = p_post_id and p\.parent_id is null and not p\.deleted/);
assert.doesNotMatch(replies, /p\.kind = 'discussion'/, 'announcement threads are readable');

const remove = rpc('studbud_community_delete_post', 'uuid');
assert.match(remove, /v_post\.author_id <> auth\.uid\(\)/);
assert.match(remove, /v_class\.teacher_id = auth\.uid\(\)/);
assert.match(featureSql, /add column if not exists deleted_body text/);
assert.match(featureSql, /add column if not exists deleted_at timestamptz/);
assert.match(featureSql, /add column if not exists deleted_by uuid/);
assert.equal((remove.match(/set deleted = true, deleted_body = body, body = '', deleted_at = now\(\), deleted_by = auth\.uid\(\)/g) || []).length, 2,
    'root, cascaded replies and single replies retain private evidence');
assert.match(remove, /\(id = v_post\.id or parent_id = v_post\.id\) and not deleted/,
    'cascades do not overwrite evidence from replies deleted earlier');
for (const source of [hub, replies]) {
    assert.doesNotMatch(source, /deleted_body|deleted_by|deleted_at/, 'community reads never expose private deletion evidence');
}
assert.doesNotMatch(remove, /delete from public\.studbud_class_community_posts/i,
    'deletion preserves post IDs referenced by reports');

const live = rpc('studbud_class_live_game', 'uuid, text');
assert.match(live, /v_class\.teacher_id <> auth\.uid\(\)/);
assert.match(live, /v_room\.host_id <> auth\.uid\(\)/);
assert.match(live, /v_room\.status not in \('waiting', 'playing'\)/);
assert.match(live, /v_room\.expires_at <= now\(\)/);
assert.match(live, /delete from public\.studbud_class_live_rooms where class_id = v_class\.id/);
assert.doesNotMatch(live, /delete from public\.studbud_game_rooms/i, 'clearing a listing never deletes its game room');
const joinable = functionSql('studbud_community_room_joinable');
assert.match(joinable, /select coalesce\(\(/, 'joinability is always a boolean');
assert.match(joinable, /p_room\.status = 'waiting'/);
assert.match(joinable, /p_room\.status = 'playing'/);
assert.match(joinable, /p_room\.mode <> 'chess'/);
assert.match(joinable, /allow_late_join/);
assert.match(joinable, /expires_at > now\(\)/);
assert.match(joinable, /p_room\.mode = 'duel' then 8/);
assert.match(joinable, /p_room\.mode = 'chess' then 2/);

console.log('School/class discovery, consent separation, bounded community posts, soft deletion, and live-game SQL contracts passed.');
