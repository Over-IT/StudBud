const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ActiveStudyTracker } = require('../studyTracker.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

async function timing() {
    let now = Date.parse('2026-10-20T12:00:00Z'), fail = false;
    const saved = new Map(), errors = [];
    const tracker = new ActiveStudyTracker({
        now: () => now,
        save: async record => {
            if (fail) throw new Error('Storage full');
            saved.set(record.id, record);
        },
        onError: error => errors.push(error)
    });
    const advance = seconds => {
        for (let i = 0; i < seconds; i++) { now += 1000; tracker.tick(); }
    };
    const context = { key: 'cards', session: { title: 'Biology', source: 'flashcards' } };
    tracker.setContext(context);
    advance(20);
    await tracker.checkpoint();
    assert.equal(saved.get('cards').durationSec, 20);
    assert.equal(saved.get('cards').autoTracked, true);
    assert.equal(saved.size, 1, 'checkpoints update one session, not a new session per tick');
    advance(100);
    assert.equal(tracker.seconds(), 60, 'inactivity stops exactly at sixty seconds');
    assert.equal(tracker.running, false);
    tracker.activity();
    advance(5);
    assert.equal(tracker.seconds(), 65, 'activity resumes without crediting the idle gap');
    tracker.setAvailable(false);
    advance(30);
    tracker.setAvailable(true);
    advance(5);
    assert.equal(tracker.seconds(), 70, 'hidden or unfocused time is excluded');
    now += 120000;
    tracker.tick();
    assert.equal(tracker.seconds(), 70, 'device sleep is never backfilled as active time');
    tracker.activity();
    advance(2);
    tracker.setContext(null);
    advance(25);
    assert.equal(tracker.seconds('cards'), 72, 'feedback and gameplay without a question do not count');
    tracker.setContext(context);
    tracker.activity();
    advance(5);
    await tracker.stop();
    assert.equal(saved.get('cards').durationSec, 77);
    assert.equal(saved.size, 1, 'question gaps can resume a single session');
    fail = true;
    tracker.setContext({ key: 'assignment', session: { assignmentId: 'essay' } });
    tracker.activity();
    advance(3);
    await tracker.stop();
    assert.equal(errors.length, 1, 'write failures are explicitly reported');
    fail = false;
    advance(1);
    await tracker.queue;
    assert.equal(saved.get('assignment').durationSec, 3, 'a failed final save retries even after leaving that context');
    assert.equal(saved.get('assignment').assignmentId, 'essay');
    assert.equal(saved.get('cards').durationSec, 77, 'different study contexts do not overlap');
    assert.equal(saved.get('cards').milliseconds, undefined, 'internal tracker fields are not stored');

    tracker.setContext({ key: 'limit', session: {} });
    for (let i = 0; i < 21601; i++) { tracker.activity(); advance(1); }
    await tracker.stop();
    assert.equal(saved.get('limit').durationSec, 21600, 'the existing server session limit is respected');
}

async function integration() {
    const stores = new Map(), storage = new Map(), nodes = new Map();
    let failStorage = false, modalOpen = false;
    const sandbox = {
        console, Date, Math, Map, Set, setTimeout, clearTimeout,
        window: { crypto: require('node:crypto').webcrypto, navigator: { onLine: true } },
        document: {
            addEventListener() {}, getElementById: id => nodes.get(id) || null,
            querySelector: () => modalOpen ? {} : null,
            querySelectorAll: () => []
        },
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        EventBus: { emit() {} },
        NexusDB: {
            async put(table, row) {
                if (failStorage) throw new Error('Storage full');
                if (!stores.has(table)) stores.set(table, new Map());
                stores.get(table).set(row.id, clone(row));
            }
        }
    };
    vm.createContext(sandbox);
    for (const file of ['parkwayData.js', 'gpaCalculator.js', 'flashcardEngine.js', 'cloudSync.js']) {
        vm.runInContext(read(file), sandbox, { filename: file });
    }
    const source = read('app.js');
    vm.runInContext(source.slice(source.indexOf('    const ACTIVITY_RESET_ID'), source.indexOf('    const AppState =')), sandbox);
    vm.runInContext('globalThis.AppState = new AppStateEngine();', sandbox);
    vm.runInContext(source.slice(source.indexOf('    function localDateKey'), source.indexOf('    window.NexusApp ='))
        + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
    const app = sandbox.app, state = sandbox.AppState;
    sandbox.window.NexusApp = app;
    app.renderUI = app.renderDashboard = app.renderAssignments = app.renderDecks = () => {};
    const study = { id: 'automatic', title: 'Biology', autoTracked: true, durationSec: 15 };
    await state.recordStudySession(study);
    const xp = state.state.gameMetrics.xp;
    await state.recordStudySession({ ...study, durationSec: 30 });
    await state.recordStudySession({ ...study, durationSec: 30 });
    assert.equal(state.state.gameMetrics.xp - xp, 3, 'only incremental active time earns XP');
    assert.equal(state.state.studyHistory.length, 1);
    assert.equal(stores.get('studyHistory').get('automatic').durationSec, 30);
    await state.recordStudySession({ ...study, durationSec: 15 });
    assert.equal(state.state.studyHistory[0].durationSec, 30, 'older checkpoints cannot reduce duration');
    const beforeZero = state.state.gameMetrics.xp;
    await state.recordStudySession({ id: 'no-questions', durationSec: 0, autoTracked: true, gameSummary: { answered: 0 } });
    assert.equal(state.state.gameMetrics.xp, beforeZero, 'gameplay with no questions earns no study XP');
    assert.equal(state.state.studyHistory[1].leaderboardSyncPending, false);

    state.state.assignments = [{ id: 'essay', title: 'Essay', status: 'pending', graded: false, estimatedMinutes: 120 }];
    state.state.studyHistory = [{ id: 'essay-session', assignmentId: 'essay', durationSec: 1800 }];
    const essay = state.state.assignments[0];
    assert.deepEqual(clone(app.assignmentTimeProgress(essay)), {
        totalMinutes: 120, studiedMinutes: 30, remainingMinutes: 90, pct: 25
    });
    essay.remainingEstimateMinutes = 30;
    essay.remainingEstimateStudiedSeconds = 1800;
    assert.equal(app.assignmentTimeProgress(essay).pct, 50, 'new remaining estimates adjust the total at the saved baseline');
    state.state.studyHistory[0].durationSec = 2700;
    assert.equal(app.assignmentTimeProgress(essay).remainingMinutes, 15);
    assert.equal(app.assignmentTimeProgress(essay).pct, 75);
    state.state.studyHistory[0].durationSec = 7200;
    assert.equal(app.assignmentTimeProgress(essay).remainingMinutes, 0);
    assert.equal(app.assignmentTimeProgress(essay).pct, 100);
    assert.equal(essay.status, 'pending', 'time completion never marks work done');
    essay.remainingEstimateMinutes = 0;
    essay.remainingEstimateStudiedSeconds = 0;
    assert.equal(app.assignmentTimeProgress(essay).pct, 100, 'zero remaining is a valid explicit estimate');
    const quiz = { id: 'quiz', title: 'Quiz', kind: 'quiz', status: 'pending', graded: false, estimatedMinutes: 30 };
    state.state.assignments.push(quiz);
    assert.equal(app.assignmentTimeProgress(quiz).totalMinutes, app.getStudyRecommendations()[0].totalStudyMinutes,
        'planner rows and study suggestions share one time estimate');
    const fields = {
        'assignment-id': 'essay', 'assignment-kind': 'assignment', 'assignment-max-points': '100',
        'assignment-name': 'Essay', 'assignment-course': '', 'assignment-due-date': '2026-11-01',
        'assignment-category': '', 'assignment-size': '120', 'assignment-importance': '3', 'assignment-remaining': '20'
    };
    for (const [id, value] of Object.entries(fields)) nodes.set(id, { value, dataset: { original: '' } });
    app.saveAssignment();
    let savedEssay = state.state.assignments.find(item => item.id === 'essay');
    assert.equal(savedEssay.remainingEstimateMinutes, 20);
    assert.equal(savedEssay.remainingEstimateStudiedSeconds, 7200);
    assert.equal(app.assignmentTimeProgress(savedEssay).remainingMinutes, 20);
    nodes.get('assignment-remaining').value = '-1';
    assert.throws(() => app.saveAssignment(), /Remaining time/);
    nodes.get('assignment-remaining').value = '1.5';
    assert.throws(() => app.saveAssignment(), /Remaining time/);
    nodes.get('assignment-remaining').value = '';
    nodes.get('assignment-remaining').dataset.original = '20';
    app.saveAssignment();
    savedEssay = state.state.assignments.find(item => item.id === 'essay');
    assert.equal(savedEssay.remainingEstimateMinutes, null, 'clearing the optional field restores the original total estimate');

    const a = { code: 'a', title: 'Regular', credits: 1, isWeighted: false, targetPct: 95 };
    const b = { code: 'b', title: 'Honors', credits: .5, isWeighted: true, targetPct: 85 };
    const c = { code: 'c', title: 'Current fallback', credits: 1, isWeighted: false, targetPct: null };
    state.state.courses = [a, b, c, { code: 'ungraded', credits: 10 }];
    state.state.assignments.push({ id: 'grade', courseCode: 'c', pointsEarned: 75, maxPoints: 100, graded: true });
    const calculator = sandbox.window.GPACalculator;
    const expected = calculator.calculateCurrentGPA([
        { ...a, targetGrade: app.gradeForPercentage(95, a) },
        { ...b, targetGrade: app.gradeForPercentage(85, b) },
        { ...c, targetGrade: app.gradeForPercentage(75, c) }
    ]);
    state.state.profile = { targetGpa: 1 };
    const goal = app.calculateTargetGPA();
    assert.equal(Number(goal.weighted), Number(expected.weighted));
    assert.equal(Number(goal.unweighted), Number(expected.unweighted));
    assert.equal(goal.totalCredits, 2.5, 'ungraded classes without targets are excluded');
    assert.equal(app.effectiveCourseTarget(c), Number.NaN, 'GPA no longer invents an implicit course target');
    state.state.profile = { targetGpa: 5, priorCredits: 2, priorWeightedGpa: 3, priorUnweightedGpa: 2.5 };
    const blended = app.calculateTargetGPA();
    assert.ok(Math.abs(Number(blended.weighted) - (Number(expected.weighted) * 2.5 + 6) / 4.5) < 1e-10);
    a.targetPct = 65;
    assert.ok(Number(app.calculateTargetGPA().weighted) < Number(blended.weighted), 'editing a class goal recalculates GPA immediately');

    state.state.currentView = 'flashcard';
    state.state.flashcards = [{ id: 'set', title: 'Biology', cards: [{ id: 'term', front: 'Term', back: 'Answer' }], assessmentId: 'quiz' }];
    app.activeDeckId = 'set';
    app.currentStudyCard = state.state.flashcards[0].cards[0];
    nodes.set('active-study-area', { classList: { contains: () => false } });
    assert.equal(app.automaticStudyContext().session.source, 'flashcards');
    assert.equal(app.automaticStudyContext().session.assignmentId, 'quiz');
    modalOpen = true;
    assert.equal(app.automaticStudyContext(), null, 'editing and dialogs pause study');
    modalOpen = false;
    const game = { game: { title: 'Game' }, practice: false, studySet: { deckId: 'set' } };
    app.arcadeSession = game;
    assert.equal(app.automaticStudyContext(), null, 'game movement does not count');
    game.question = { locked: false };
    assert.equal(app.automaticStudyContext().session.source, 'multiplayer');
    assert.equal(app.automaticStudyContext().session.assignmentId, 'quiz');
    game.question.locked = true;
    assert.equal(app.automaticStudyContext(), null, 'answer feedback does not count');
    game.question.locked = false;
    game.testing = true;
    assert.equal(app.automaticStudyContext(), null, 'staff game tests do not count');
    game.testing = false;
    game.over = true;
    assert.equal(app.automaticStudyContext(), null, 'game results do not count');
    app.arcadeSession = null;
    state.state.currentView = 'dashboard';
    app.dashboardSprintAssignmentId = 'essay';
    assert.equal(app.automaticStudyContext().session.assignmentId, 'essay');
    state.state.currentView = 'settings';
    assert.equal(app.automaticStudyContext(), null, 'browsing unrelated pages does not count selected-task time');
    state.state.currentView = 'exam-arcade';
    app.arcadeStudyStartedAt = Date.now();
    app.arcadeStudyRecorded = false;
    app.arcadeCards = [];
    let questionOpen = true;
    nodes.set('arcade-game-content', { querySelector: () => questionOpen ? {} : null });
    assert.equal(app.automaticStudyContext().session.source, 'arcade');
    questionOpen = false;
    assert.equal(app.automaticStudyContext(), null, 'solo feedback and test results do not count');

    let now = 0;
    app.studyTracker = new ActiveStudyTracker({
        now: () => now, save: record => state.recordStudySession(record), onError() {}
    });
    app.studyTracker.setContext({ key: 'retry', session: { source: 'flashcards' } });
    now = 1000;
    failStorage = true;
    await assert.rejects(app.flushAutomaticStudy(), /has not saved yet/);
    failStorage = false;
    await app.flushAutomaticStudy();
    assert.equal(stores.get('studyHistory').get('retry').durationSec, 1);
    await app.resetAutomaticStudy();
    assert.equal(app.studyTracker.sessions.size, 0, 'account cleanup clears tracking context and unsaved memory');
    assert.equal(app.dashboardSprintAssignmentId, '');

    const Cloud = sandbox.window.StudBudCloud.constructor;
    const local = [{ id: 'same', autoTracked: true, durationSec: 30, leaderboardSyncPending: true }];
    const remote = [{ id: 'same', autoTracked: true, durationSec: 15, leaderboardSyncedSeconds: 15, leaderboardSyncPending: false }];
    const merged = Cloud.mergeData([], local, remote, 'account.studyHistory')[0];
    assert.equal(merged.durationSec, 30);
    assert.equal(merged.leaderboardSyncPending, true, 'an old acknowledgement cannot discard newer unsynced time');
    assert.equal(merged.leaderboardSyncedSeconds, 15);

    let sent;
    sandbox.window.StudBudCloud.user = { id: 'owner' };
    sandbox.window.StudBudCommunityGames = { recordStudyTime: async (id, seconds) => { sent = { id, seconds }; return { seconds }; } };
    app.refreshStudyLeaderboard = async () => {};
    state.state.studyHistory = [{ id: 'sync', durationSec: 45, autoTracked: true, leaderboardSyncPending: true }];
    sandbox.window.StudBudCloud.accountReady = false;
    await app.syncStudyTimeEntry(state.state.studyHistory[0], false);
    assert.equal(sent, undefined, 'account initialization or an unresolved merge cannot upload study history');
    sandbox.window.StudBudCloud.accountReady = true;
    await app.syncStudyTimeEntry({ ...state.state.studyHistory[0], durationSec: 15 }, false);
    assert.deepEqual(sent, { id: 'sync', seconds: 15 });
    assert.equal(state.state.studyHistory[0].leaderboardSyncPending, true, 'late network acknowledgement retains pending newer time');
    await app.syncStudyTimeEntry(state.state.studyHistory[0], false);
    assert.deepEqual(sent, { id: 'sync', seconds: 45 });
    assert.equal(state.state.studyHistory[0].leaderboardSyncPending, false);

    const cleared = [];
    let reloaded = false, confirmed = false;
    sandbox.window.StudBudDialogs = { confirm: async () => confirmed };
    sandbox.window.location = { reload() { reloaded = true; } };
    sandbox.NexusDB.clear = async table => {
        assert.equal(app.studyTracker.sessions.size, 0, 'tracking must stop before local data is removed');
        cleared.push(table);
        stores.delete(table);
    };
    sandbox.localStorage.removeItem = key => {
        assert.equal(cleared.length, 3);
        storage.delete(key);
    };
    app.studyTracker.setContext({ key: 'clear-device', session: { source: 'flashcards' } });
    await app.factoryReset();
    assert.equal(cleared.length, 0, 'cancelling local removal keeps study data and tracking intact');
    assert.equal(app.studyTracker.sessions.size, 1);
    confirmed = true;
    now += 1000;
    await app.factoryReset();
    assert.deepEqual(cleared, ['flashcards', 'studyHistory', 'gameMetrics']);
    assert.equal(storage.has(state.STORAGE_KEY), false);
    assert.equal(reloaded, true);

    assert.match(read('supabase-setup.sql'), /on conflict \(user_id, entry_id\) do update\s+set seconds = greatest\(studbud_study_time_entries.seconds, excluded.seconds\)/);
    assert.match(read('service-worker.js'), /'\.\/studyTracker\.js'/);
    assert.match(read('index.html'), /id="settings-target-gpa" readonly/);
    assert.doesNotMatch(read('index.html'), /focus-play-btn|id="focus-duration"|id="focus-sprint-start-btn"/);
    console.log('Automatic study timing, AFK/resume, question gating, checkpoints/retries, incremental XP, assignment progress, derived GPA and sync checks passed.');
}

timing().then(integration).catch(error => { console.error(error); process.exitCode = 1; });
