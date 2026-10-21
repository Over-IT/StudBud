const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
let response = 42, failure, guestConnections = 0;
const calls = [];
const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: response, error: failure }; } };
const cloud = { isGuest: () => true, offlineMode: true,
    async prepareGuestSession() { guestConnections++; this.guestClient = client; } };
const sandbox = { window: { StudBudCloud: cloud, navigator: { onLine: true } }, console, Date, Math, Map, Set };
vm.createContext(sandbox);
vm.runInContext(read('communityGames.js'), sandbox);
const api = sandbox.window.StudBudCommunityGames;
(async () => {
    assert.equal(await api.reportProblem('bug', '  Card will not reveal  ', '  Clicking Reveal does not turn over the card.  '), 42);
    assert.equal(guestConnections, 1, 'guests can submit without creating a permanent account');
    assert.equal(calls[0].name, 'studbud_submit_report');
    assert.equal(calls[0].args.p_subject, 'Card will not reveal');
    assert.equal(calls[0].args.p_details, 'Clicking Reveal does not turn over the card.');
    assert.equal(calls[0].args.p_username, null);
    await api.reportProblem('player', 'Lobby harassment', 'This player repeatedly insulted others in the lobby.', ' @example ');
    assert.equal(calls[1].args.p_username, 'example');
    await api.reportContent('profile', 'test-id', 'harassment', 'They repeatedly sent harassing messages.');
    assert.equal(calls[2].name, 'studbud_report_content');
    const before = calls.length;
    for (const args of [
        ['unknown', 'A summary', 'Detailed explanation'],
        ['bug', ' ', 'Detailed explanation'],
        ['bug', 'A summary', 'short'],
        ['bug', 'A summary', 'x'.repeat(2001)],
        ['player', 'A summary', 'Detailed explanation', '']
    ]) await assert.rejects(api.reportProblem(...args));
    await assert.rejects(api.reportContent('profile', 'test-id', 'other', ''), /Explain what happened/);
    assert.equal(calls.length, before, 'invalid submissions never make a request');
    failure = { code: 'PGRST202', message: 'Missing function' };
    await assert.rejects(api.reportProblem('bug', 'Broken feature', 'Detailed explanation'), /not been sent.*Email support/);
    failure = { message: 'Too many reports' };
    await assert.rejects(api.reportProblem('other', 'A concern', 'Detailed explanation'), /Too many reports/);
    failure = null; response = null;
    await assert.rejects(api.reportProblem('other', 'A concern', 'Detailed explanation'), /did not confirm/);
    sandbox.window.navigator.onLine = false;
    await assert.rejects(api.reportProblem('bug', 'Broken feature', 'Detailed explanation'), /internet connection/);
    const sql = read('supabase-setup.sql');
    const rpc = sql.slice(sql.indexOf('create or replace function public.studbud_submit_report('),
        sql.indexOf('create or replace function public.studbud_admin_list_reports('));
    assert.match(rpc, /auth\.uid\(\) is null/);
    assert.match(rpc, /char_length\(v_details\) not between 10 and 2000/);
    assert.match(rpc, /v_target = auth\.uid\(\)/, 'self reports are rejected');
    assert.match(rpc, /pg_advisory_xact_lock/);
    assert.match(rpc, />= 20/);
    assert.match(rpc, /return v_id/);
    assert.match(rpc, /grant execute[^;]+to authenticated/);
    assert.doesNotMatch(rpc, /grant execute[^;]+to anon/);
    assert.match(sql, /revoke all on table public\.studbud_content_reports from anon, authenticated/);
    assert.match(sql, /'subject', x\.subject, 'details', x\.details/);
    const app = read('app.js'), html = read('index.html');
    assert.match(app, /createElement\('dialog'\)[\s\S]+overlay\.showModal\(\)/);
    assert.match(app, /name="details"[^>]+required minlength="10"/);
    assert.match(app, /button\.disabled = false/);
    assert.match(app, /encodeURIComponent\(body\)/);
    assert.match(html, /data-action="report-problem"/);
    console.log('Bug/player/other reports: guest and account API, explanations, validation, explicit failures, private staff review and SQL contracts passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
