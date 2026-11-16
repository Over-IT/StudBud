const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../communityGames.js'), 'utf8');
const calls = [];
let failure = null, response = 'share-id';
const sandbox = { console, Date, Math, Map, Set, window: { navigator: { onLine: true },
    StudBudCloud: { user: { id: 'sender' }, isGuest: () => false,
        client: { rpc: async (name, args) => { calls.push({ name, args }); return { data: response, error: failure }; } } } } };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const api = sandbox.window.StudBudCommunityGames;
const own = {
    id: 'mine', title: 'Biology', courseTitle: 'Private class', assessmentId: 'private-test',
    assignments: [{ grade: 90 }], studyHistory: ['private'],
    cards: [{ front: 'A', back: 'B', notes: 'private', attachments: ['private'], lastReviewed: 1 },
        { front: 'C', back: 'D', distractors: ['wrong'], answerImage: 'private' }]
};
(async () => {
    assert.equal(await api.shareDeckWithBud(own, 'recipient'), 'share-id');
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
        name: 'studbud_send_bud_set', args: { p_recipient_id: 'recipient', p_source_deck_id: 'mine',
            p_title: 'Biology', p_cards: [{ front: 'A', back: 'B' }, { front: 'C', back: 'D' }] }
    }, 'only the title, card terms and definitions cross the Bud sharing boundary');
    await assert.rejects(api.shareDeckWithBud({ ...own, budShareId: 'received' }, 'recipient'), /cannot be reposted/);
    await assert.rejects(api.shareDeckWithBud({ ...own, communitySourceId: 'public', communitySourceOwnerId: 'other' }, 'recipient'), /reposted/);
    await assert.rejects(api.shareDeckWithBud({ ...own, classShareSourceOwnerId: 'teacher' }, 'recipient'), /someone else/);
    await assert.rejects(api.shareDeckWithBud({ ...own, cards: Array.from({ length: 201 }, () => own.cards[0]) }, 'recipient'), /up to 200/);
    failure = { code: 'PGRST202', message: 'not found' };
    await assert.rejects(api.listBudSets(), /server update.*supabase-setup\.sql/);
    await assert.rejects(api.shareDeckWithBud(own, 'recipient'), /server update/);
    failure = null; response = null;
    await assert.rejects(api.shareDeckWithBud(own, 'recipient'), /invalid receipt/);
    await assert.rejects(api.listBudSets(), /invalid list/);
    response = [{ id: 'share-id' }];
    assert.equal((await api.listBudSets())[0].id, 'share-id');
    await api.removeBudSet('share-id');
    assert.equal(calls.at(-1).name, 'studbud_remove_bud_set');
    sandbox.window.StudBudCloud.isGuest = () => true;
    await assert.rejects(api.listBudSets(), /Create a free account/);
    const sql = fs.readFileSync(require('node:path').join(__dirname, '../supabase-setup.sql'), 'utf8')
        .split('-- Bud set sharing (additive migration).')[1];
    assert.ok(sql, 'the scoped SQL migration is present');
    assert.match(sql, /enable row level security/);
    assert.match(sql, /revoke all on public\.studbud_bud_sets from anon, authenticated/);
    assert.match(sql, /v_uid in \(s\.sender_id, s\.recipient_id\)/);
    assert.match(sql, /f\.status = 'accepted'/);
    assert.match(sql, /not public\.studbud_is_hidden_user\(s\.sender_id\)/);
    assert.match(sql, /jsonb_build_object\('front', btrim\(c->>'front'\), 'back', btrim\(c->>'back'\)\)/);
    assert.doesNotMatch(sql, /insert into public\.studbud_community_decks/);
    assert.match(sql, /auth\.uid\(\) in \(sender_id, recipient_id\)/);
    assert.match(sql, /friendship_id uuid not null references public\.studbud_friendships\(id\) on delete cascade/);
    console.log('Recipient-scoped Bud sharing payloads, source ownership, guests, missing migration and SQL access boundaries passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
