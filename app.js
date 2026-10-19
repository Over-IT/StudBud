/**
 * NEXUS STUDENT HUB - PCHS EDITION
 * FILE: app.js
 * DESCRIPTION: Core application orchestrator, reactive state engine, dual-persistence 
 * storage manager (LocalStorage + IndexedDB), single-page router engine, and a 100% 
 * procedural Web Audio API soundscape synthesizer.
 */

(function (window) {
    'use strict';

    const PARKWAY_CAMPUS_URL = 'https://parkwaymo.infinitecampus.org/campus/nav-wrapper/student/portal/student/home?appName=parkway';

    // ============================================================================
    // 1. EVENT BUS ENGINE
    // ============================================================================
    class EventBusEngine {
        constructor() {
            this.listeners = new Map();
        }

        /**
         * Subscribe a callback to an event.
         * @param {string} event 
         * @param {Function} callback 
         */
        on(event, callback) {
            if (!this.listeners.has(event)) {
                this.listeners.set(event, new Set());
            }
            this.listeners.get(event).add(callback);
            return () => this.off(event, callback);
        }

        /**
         * Unsubscribe a callback from an event.
         * @param {string} event 
         * @param {Function} callback 
         */
        off(event, callback) {
            if (this.listeners.has(event)) {
                this.listeners.get(event).delete(callback);
            }
        }

        /**
         * Dispatch event with payload to all active subscribers.
         * @param {string} event 
         * @param {*} data 
         */
        emit(event, data) {
            if (this.listeners.has(event)) {
                this.listeners.get(event).forEach(callback => {
                    try {
                        callback(data);
                    } catch (err) {
                        console.error(`[EventBus] Error executing listener for event "${event}":`, err);
                    }
                });
            }
        }
    }

    const EventBus = new EventBusEngine();

    // ============================================================================
    // 2. PERSISTENCE LAYER (IndexedDB - NexusDB & LocalStorage)
    // ============================================================================
    class NexusDBManager {
        constructor() {
            this.dbName = 'NexusDB';
            this.version = 1;
            this.db = null;
        }

        /**
         * Open connection to IndexedDB and initialize object stores.
         */
        async open() {
            if (this.db) return this.db;

            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onupgradeneeded = (e) => {
                    const db = e.target.result;

                    // Store 1: Flashcard Decks & Cards
                    if (!db.objectStoreNames.contains('flashcards')) {
                        const store = db.createObjectStore('flashcards', { keyPath: 'id' });
                        store.createIndex('title', 'title', { unique: false });
                        store.createIndex('category', 'category', { unique: false });
                    }

                    // Store 2: Detailed Study Session Logs
                    if (!db.objectStoreNames.contains('studyHistory')) {
                        const store = db.createObjectStore('studyHistory', { keyPath: 'id' });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                        store.createIndex('courseCode', 'courseCode', { unique: false });
                    }

                    // Store 3: Gamification Metrics & Stats
                    if (!db.objectStoreNames.contains('gameMetrics')) {
                        db.createObjectStore('gameMetrics', { keyPath: 'id' });
                    }
                };

                request.onsuccess = (e) => {
                    this.db = e.target.result;
                    resolve(this.db);
                };

                request.onerror = (e) => {
                    console.error('[NexusDB] Database open error:', e.target.error);
                    reject(e.target.error);
                };
            });
        }

        async replaceStores(records) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(Object.keys(records), 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Restoring saved data was aborted.'));
                try {
                    for (const [name, rows] of Object.entries(records)) {
                        const store = tx.objectStore(name);
                        store.clear();
                        for (const row of rows) store.put(row);
                    }
                } catch (error) {
                    tx.abort();
                    reject(error);
                }
            });
        }

        async get(storeName, id) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.get(id);
                let result;
                req.onsuccess = () => { result = req.result || null; };
                tx.oncomplete = () => resolve(result);
                tx.onerror = () => reject(tx.error || req.error);
                tx.onabort = () => reject(tx.error || req.error || new Error(`Reading ${storeName} was aborted.`));
            });
        }

        async getAll(storeName) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.getAll();
                let result = [];
                req.onsuccess = () => { result = req.result || []; };
                tx.oncomplete = () => resolve(result);
                tx.onerror = () => reject(tx.error || req.error);
                tx.onabort = () => reject(tx.error || req.error || new Error(`Reading ${storeName} was aborted.`));
            });
        }

        async put(storeName, item) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.put(item);
                let key;
                req.onsuccess = () => { key = req.result; };
                tx.oncomplete = () => resolve(key);
                tx.onerror = () => reject(tx.error || req.error);
                tx.onabort = () => reject(tx.error || req.error || new Error(`Saving to ${storeName} was aborted.`));
            });
        }

        async delete(storeName, id) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || req.error);
                tx.onabort = () => reject(tx.error || req.error || new Error(`Deleting from ${storeName} was aborted.`));
            });
        }

        async clear(storeName) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || req.error);
                tx.onabort = () => reject(tx.error || req.error || new Error(`Clearing ${storeName} was aborted.`));
            });
        }
    }

    const NexusDB = new NexusDBManager();

    // Study activity from the beta test was reset. Sessions before this moment and older XP/levels are dropped
    // everywhere they can come from (this device, cloud backups, other devices that sync later).
    const ACTIVITY_RESET_ID = 'beta-end-2026-10-15';
    const ACTIVITY_RESET_AT = Date.parse('2026-10-15T05:00:00Z');
    const freshGameMetrics = () => ({ level: 1, xp: 0, streakDays: 0, lastStudyDate: null, resetId: ACTIVITY_RESET_ID });
    const isCurrentStudySession = session => {
        const time = Date.parse(session?.timestamp || '');
        return Number.isFinite(time) && time >= ACTIVITY_RESET_AT;
    };
    const currentGameMetrics = metrics => metrics && metrics.resetId === ACTIVITY_RESET_ID ? metrics : freshGameMetrics();

    // ============================================================================
    // 3. REACTIVE STATE ENGINE
    // ============================================================================
    class AppStateEngine {
        constructor() {
            this.STORAGE_KEY = 'PCHS_NEXUS_STATE_V1';

            this.state = {
                profile: {
                    graduationYear: 2026,
                    targetGpa: 3.8,
                    currentTerm: "auto",
                },
                courses: [],
                assignments: [],
                calendarEvents: [],
                gradeScenarios: [],
                selectedGradeScenarioId: null,
                flashcards: [],
                studyHistory: [],
                gameMetrics: freshGameMetrics(),
                settings: {
                    theme: "dark",
                    colorScheme: "studbud",
                    audioVolume: 0.70,
                    audioLevels: { lofi: 0.5, rain: 0.5, white: 0.3, binaural: 0.6 },
                    soundscapePreset: "off",
                    binauralPreset: "off"
                },
                schedule: { all: {}, odd: {}, even: {} },
                currentView: "dashboard"
            };
        }

        async init() {
            try {
                const storedJSON = localStorage.getItem(this.STORAGE_KEY);
                if (storedJSON) {
                    const parsed = JSON.parse(storedJSON);
                    this.state = {
                        ...this.state,
                        ...parsed,
                        profile: { ...this.state.profile, ...(parsed.profile || {}) },
                        settings: { ...this.state.settings, ...(parsed.settings || {}) },
                        courses: Array.isArray(parsed.courses) ? parsed.courses : this.state.courses,
                        assignments: Array.isArray(parsed.assignments) ? parsed.assignments : this.state.assignments,
                        calendarEvents: Array.isArray(parsed.calendarEvents) ? parsed.calendarEvents : this.state.calendarEvents,
                        gradeScenarios: Array.isArray(parsed.gradeScenarios) ? parsed.gradeScenarios : this.state.gradeScenarios,
                        selectedGradeScenarioId: parsed.selectedGradeScenarioId || this.state.selectedGradeScenarioId,
                        schedule: parsed.schedule && typeof parsed.schedule === 'object'
                            ? { all: {}, odd: {}, even: {}, ...parsed.schedule }
                            : this.state.schedule
                    };
                } else {
                    this.saveToLocalStorage();
                }
                const flashcards = await NexusDB.getAll('flashcards');
                const studyHistory = await NexusDB.getAll('studyHistory');
                const metrics = await NexusDB.get('gameMetrics', 'user_metrics');

                this.state.flashcards = flashcards;
                this.state.studyHistory = studyHistory.filter(isCurrentStudySession);
                const staleSessions = studyHistory.filter(session => !isCurrentStudySession(session));
                await Promise.all(staleSessions.map(session => NexusDB.delete('studyHistory', session.id)));
                const { id: _metricsId, ...storedMetrics } = metrics || {};
                this.state.gameMetrics = currentGameMetrics(metrics ? storedMetrics : null);
                if (!metrics || this.state.gameMetrics !== storedMetrics) await NexusDB.put('gameMetrics', { id: 'user_metrics', ...this.state.gameMetrics });
                this.saveToLocalStorage();

                EventBus.emit('state:initialized', this.state);
            } catch (err) {
                console.error('[AppState] Initialization error:', err);
                throw err;
            }
        }

        saveToLocalStorage() {
            const payload = {
                savedAt: new Date().toISOString(),
                profile: this.state.profile,
                courses: this.state.courses,
                assignments: this.state.assignments,
                calendarEvents: this.state.calendarEvents,
                gradeScenarios: this.state.gradeScenarios,
                selectedGradeScenarioId: this.state.selectedGradeScenarioId,
                settings: this.state.settings,
                schedule: this.state.schedule
            };
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
                this.setSaveStatus(`Saved on this device · ${new Date(payload.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
            } catch (error) {
                console.error('[AppState] Could not save local app data:', error);
                this.setSaveStatus('Could not save on this device. Keep this page open, free storage space and try saving again.', 'error');
                throw new Error(`Your changes could not be saved on this device: ${error.message}`);
            }
        }

        setSaveStatus(message, state = 'saved') {
            const saveStatus = document.getElementById('data-save-status');
            if (!saveStatus) return;
            saveStatus.textContent = message;
            saveStatus.dataset.state = state;
            if (state === 'error') { /* silent: errors are shown as text */ }
        }

        get(key) {
            return this.state[key];
        }

        set(key, value) {
            this.state[key] = value;
            this.saveToLocalStorage();
            EventBus.emit(`state:updated:${key}`, value);
            EventBus.emit('state:changed', { key, value });
        }

        addCourse(course) {
            this.state.courses.push(course);
            this.saveToLocalStorage();
            EventBus.emit('courses:updated', this.state.courses);
        }

        removeCourse(code) {
            this.state.courses = this.state.courses.filter(c => c.code !== code);
            this.state.assignments = this.state.assignments.filter(item => item.courseCode !== code);
            this.state.gradeScenarios = (this.state.gradeScenarios || []).map(scenario => ({
                ...scenario,
                items: (scenario.items || []).filter(item => item.courseCode !== code)
            }));
            Object.keys(this.state.schedule || {}).forEach(pattern => {
                Object.keys(this.state.schedule[pattern] || {}).forEach(period => {
                    if (this.state.schedule[pattern][period] === code) delete this.state.schedule[pattern][period];
                });
            });
            this.saveToLocalStorage();
            EventBus.emit('courses:updated', this.state.courses);
            EventBus.emit('assignments:updated', this.state.assignments);
        }

        updateCourse(code, updatedData) {
            const index = this.state.courses.findIndex(c => c.code === code);
            if (index !== -1) {
                this.state.courses[index] = { ...this.state.courses[index], ...updatedData };
                this.saveToLocalStorage();
                EventBus.emit('courses:updated', this.state.courses);
            }
        }

        addAssignment(assignment) {
            this.state.assignments.push(assignment);
            this.saveToLocalStorage();
            EventBus.emit('assignments:updated', this.state.assignments);
        }

        updateAssignment(id, updatedData) {
            const index = this.state.assignments.findIndex(a => a.id === id);
            if (index !== -1) {
                this.state.assignments[index] = { ...this.state.assignments[index], ...updatedData };
                this.saveToLocalStorage();
                EventBus.emit('assignments:updated', this.state.assignments);
            }
        }

        deleteAssignment(id) {
            this.state.assignments = this.state.assignments.filter(a => a.id !== id);
            this.saveToLocalStorage();
            EventBus.emit('assignments:updated', this.state.assignments);
        }

        async saveFlashcardDeck(deck) {
            if (!deck.id) deck.id = 'deck_' + Date.now();
            if (window.NexusApp?.isRemovedCommunityDeck?.(deck)) throw new Error('This flashcard set was removed by moderation.');
            await NexusDB.put('flashcards', deck);
            if (window.NexusApp?.isRemovedCommunityDeck?.(deck)) {
                await NexusDB.delete('flashcards', deck.id);
                throw new Error('This flashcard set was removed by moderation.');
            }
            this.setSaveStatus('Flashcard deck saved on this device.');
            
            const index = this.state.flashcards.findIndex(d => d.id === deck.id);
            if (index !== -1) this.state.flashcards[index] = deck;
            else this.state.flashcards.push(deck);

            EventBus.emit('flashcards:updated', this.state.flashcards);
        }

        /** Applies small field patches (pin/order) to several decks with one save notice and one re-render. */
        async patchFlashcardDecks(patches) {
            const changed = [];
            this.state.flashcards = this.state.flashcards.map(deck => {
                if (!patches.has(deck.id)) return deck;
                const next = { ...deck, ...patches.get(deck.id) };
                changed.push(next);
                return next;
            });
            if (!changed.length) return;
            await Promise.all(changed.map(deck => NexusDB.put('flashcards', deck)));
            this.setSaveStatus('Deck order saved on this device.');
            EventBus.emit('flashcards:updated', this.state.flashcards);
        }

        async deleteFlashcardDeck(id) {
            await NexusDB.delete('flashcards', id);
            this.setSaveStatus('Flashcard deck deleted from this device.');
            this.state.flashcards = this.state.flashcards.filter(d => d.id !== id);
            EventBus.emit('flashcards:updated', this.state.flashcards);
        }

        async recordStudySession(session) {
            if (!session.id) session.id = 'session_' + Date.now();
            session.timestamp = session.timestamp || new Date().toISOString();
            session.leaderboardSyncPending = true;

            await NexusDB.put('studyHistory', session);
            const sessionIndex = this.state.studyHistory.findIndex(item => item.id === session.id);
            if (sessionIndex >= 0) this.state.studyHistory[sessionIndex] = session;
            else this.state.studyHistory.push(session);

            const minutes = Math.max(1, Math.round((session.durationSec || 60) / 60));
            this.state.gameMetrics.xp += (minutes * 10);
            this.state.gameMetrics.level = Math.floor(this.state.gameMetrics.xp / 500) + 1;

            await NexusDB.put('gameMetrics', { id: 'user_metrics', ...this.state.gameMetrics });
            this.setSaveStatus('Study session and progress saved on this device.');

            if (session.assignmentId) {
                const updatedAssignment = this.state.assignments.find(item => item.id === session.assignmentId);
                if (updatedAssignment) this.updateAssignment(updatedAssignment.id, { lastStudiedAt: session.timestamp });
            }
            EventBus.emit('study:recorded', session);
            EventBus.emit('metrics:updated', this.state.gameMetrics);
            if (window.NexusApp?.syncStudyTimeEntry) await window.NexusApp.syncStudyTimeEntry(session);
        }

        emptyCloudSnapshot() {
            const { currentView, flashcards, studyHistory, ...state } = new AppStateEngine().state;
            return { version: "1.0.0", state, flashcards: [], studyHistory: [] };
        }

        async exportAppState() {
            const stateSnapshot = JSON.parse(JSON.stringify({
                profile: this.state.profile,
                courses: this.state.courses,
                assignments: this.state.assignments,
                calendarEvents: this.state.calendarEvents,
                gradeScenarios: this.state.gradeScenarios,
                selectedGradeScenarioId: this.state.selectedGradeScenarioId,
                gameMetrics: this.state.gameMetrics,
                settings: this.state.settings,
                schedule: this.state.schedule
            }));
            const allFlashcards = await NexusDB.getAll('flashcards');
            const allHistory = await NexusDB.getAll('studyHistory');

            const fullBackup = {
                version: "1.0.0",
                exportedAt: new Date().toISOString(),
                state: stateSnapshot,
                flashcards: allFlashcards,
                studyHistory: allHistory
            };

            return JSON.stringify(fullBackup, null, 2);
        }

        async importAppState(jsonData) {
            try {
                const parsed = JSON.parse(typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData));

                if (!parsed.state || !parsed.version) {
                    throw new Error("Invalid backup format.");
                }
                parsed.flashcards = (parsed.flashcards || []).filter(deck => !window.NexusApp?.isRemovedCommunityDeck?.(deck));

                const studyHistory = (parsed.studyHistory || []).filter(isCurrentStudySession);
                const gameMetrics = currentGameMetrics(parsed.state.gameMetrics);
                await NexusDB.replaceStores({
                    flashcards: parsed.flashcards || [], studyHistory,
                    gameMetrics: [{ id: 'user_metrics', ...gameMetrics }]
                });

                this.state.profile = parsed.state.profile || this.state.profile;
                this.state.courses = parsed.state.courses || [];
                this.state.assignments = parsed.state.assignments || [];
                this.state.calendarEvents = Array.isArray(parsed.state.calendarEvents) ? parsed.state.calendarEvents : [];
                this.state.gradeScenarios = Array.isArray(parsed.state.gradeScenarios) ? parsed.state.gradeScenarios : [];
                this.state.selectedGradeScenarioId = parsed.state.selectedGradeScenarioId || null;
                this.state.gameMetrics = gameMetrics;
                this.state.settings = parsed.state.settings || this.state.settings;
                this.state.schedule = parsed.state.schedule || { all: {}, odd: {}, even: {} };
                this.state.flashcards = parsed.flashcards || [];
                this.state.studyHistory = studyHistory;

                this.saveToLocalStorage();

                EventBus.emit('state:restored', this.state);
                return true;
            } catch (err) {
                console.error('[AppState] Import failed:', err);
                throw err;
            }
        }

        async resetForCloudAccount() {
            await Promise.all(['flashcards', 'studyHistory', 'gameMetrics'].map(store => NexusDB.clear(store)));
            localStorage.removeItem(this.STORAGE_KEY);
            this.state = new AppStateEngine().state;
            this.saveToLocalStorage();
            EventBus.emit('state:restored', this.state);
        }
    }

    const AppState = new AppStateEngine();

    // ============================================================================
    // 4. ROUTER ENGINE
    // ============================================================================
    const WORKSPACES = [
        { main: 'gpa', tabs: [['gpa', 'Grades & GPA'], ['grade-scenarios', 'What-if grades'], ['analytics', 'Analytics']] },
        { main: 'planner', tabs: [['planner', 'Tasks'], ['calendar', 'Calendar'], ['schedule', 'Class schedule']] },
        { main: 'flashcard', tabs: [['flashcard', 'My sets'], ['exam-arcade', 'Practice'], ['importer', 'Import cards']] },
        { main: 'multiplayer', tabs: [['multiplayer', 'Games'], ['friends', 'Buds'], ['leaderboard', 'Leaderboards']] },
        { main: 'profile', tabs: [['profile', 'Profile'], ['shop', 'Shop'], ['inventory', 'Locker']] },
        { main: 'settings', tabs: [['settings', 'Profile & data'], ['appearance', 'Appearance'], ['sound', 'Sound'], ['about', 'About']] }
    ];
    const PAGE_GUIDES = {
        dashboard: ['Home', 'What is due today and what to study next.'],
        gpa: ['Classes & grades', 'Import from Infinite Campus or add a class.'],
        'grade-scenarios': ['What-if grades', 'Try possible scores without changing your saved grades.'],
        analytics: ['Study insights', 'Grades, study time and progress.'],
        planner: ['Tasks & deadlines', 'Assignments, quizzes and tests.'],
        calendar: ['Calendar', 'Assignments, study deadlines and your own events.'],
        schedule: ['Class schedule', 'When your classes meet.'],
        flashcard: ['My study sets', 'Create sets and study whenever you want.'],
        'exam-arcade': ['Practice & tests', 'Tests, quizzes and solo games. Results stay private.'],
        importer: ['Import flashcards', 'Paste rows or build a set by hand.'],
        multiplayer: ['Multiplayer games', 'Pick a game and a set, then host or join.'],
        friends: ['Buds', 'Find classmates and manage requests.'],
        leaderboard: ['Leaderboards', 'Study time and progress. Grades stay private.'],
        profile: ['Your profile', 'Your character, rewards and public profile.'],
        shop: ['Shop', 'Open boxes and buy cosmetics.'],
        inventory: ['Locker', 'Everything you own. Equip it here.'],
        settings: ['Profile & data', 'Name, school, privacy and account settings.'],
        appearance: ['Appearance & performance', 'Colors, spacing and game detail.'],
        sound: ['Sound & music', 'Interface sounds, effects and music.'],
        about: ['Help & about', 'How StudBud works.'],
        admin: ['Staff tools', 'Tools for testers, moderators and admins.'],
        classes: ['Classes', 'Join your teachers’ classes and study their flashcard sets.']
    };

    class RouterEngine {
        constructor() {
            this.routes = [
                "dashboard", "gpa", "grade-scenarios", "planner", "calendar", "schedule", "flashcard",
                "analytics", "leaderboard", "exam-arcade", "multiplayer", "profile", "shop", "inventory", "importer", "settings", "appearance", "sound", "admin", "about", "friends", "classes"
            ];
            this.activeRoute = "dashboard";
        }

        init() {
            window.addEventListener('hashchange', () => this.handleHashChange());
            this.handleHashChange();
        }

        handleHashChange() {
            const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
            if (rawHash.toLowerCase().startsWith('class/')) {
                try {
                    const courseCode = decodeURIComponent(rawHash.slice('class/'.length));
                    if ((AppState.get('courses') || []).some(course => course.code === courseCode)) {
                        this.selectedClassCode = courseCode;
                        this.navigate('class', false);
                        return;
                    }
                } catch (error) {
                    console.error('[Router] Invalid class route:', error);
                }
            }
            const routeName = rawHash.toLowerCase();
            const targetRoute = this.routes.includes(routeName) ? routeName : "dashboard";
            this.navigate(targetRoute, false);
        }

        navigate(route, updateHash = true) {
            if (route !== 'class' && !this.routes.includes(route)) route = "dashboard";
            if (route === 'admin' && (!window.NexusApp?.canAccessStaff || window.StudBudCloud?.offlineMode)) route = "dashboard";
            if (route === 'classes' && window.NexusApp?.classrooms && !window.NexusApp.classrooms.available()) route = "dashboard";

            this.activeRoute = route;
            AppState.set('currentView', route);

            if (updateHash) {
                window.location.hash = route === 'class'
                    ? `/class/${encodeURIComponent(this.selectedClassCode || '')}`
                    : `/${route}`;
            }

            const viewId = route === 'class' ? 'class-detail-view' : `${route}-view`;
            const workspace = WORKSPACES.find(group => group.tabs.some(([tab]) => tab === route) || (route === 'class' && group.main === 'gpa'));
            const tabs = document.getElementById('workspace-tabs');
            if (tabs) {
                const restoreFocus = tabs.contains(document.activeElement);
                tabs.classList.toggle('hidden', !workspace);
                tabs.innerHTML = workspace ? workspace.tabs.map(([tab, label]) => `<button type="button" class="workspace-tab${tab === route ? ' selected' : ''}" data-target="${tab}-view"${tab === route ? ' aria-current="page"' : ''}>${label}</button>`).join('') : '';
                if (restoreFocus) tabs.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
            }
            document.querySelectorAll('.view').forEach(view => {
                const isActive = view.id === viewId;
                view.classList.toggle('active', isActive);
                view.classList.toggle('hidden', !isActive);
            });

            document.querySelectorAll('.nav-item[data-target]').forEach(item => {
                const group = `${item.dataset.target} ${item.dataset.also || ''}`.split(' ');
                const active = group.includes(viewId);
                item.classList.toggle('active', active);
                if (active) item.setAttribute('aria-current', 'page');
                else item.removeAttribute('aria-current');
            });

            const activeItem = Array.from(document.querySelectorAll('.nav-item[data-target]'))
                .find(item => `${item.dataset.target} ${item.dataset.also || ''}`.split(' ').includes(viewId));
            const nav = document.getElementById('main-nav');
            if (activeItem && nav && nav.scrollWidth > nav.clientWidth + 4 && !document.getElementById('tutorial-root')) {
                const navRect = nav.getBoundingClientRect();
                const itemRect = activeItem.getBoundingClientRect();
                nav.scrollTo({ left: nav.scrollLeft + itemRect.left - navRect.left - (navRect.width - itemRect.width) / 2, behavior: 'smooth' });
            }
            const title = activeItem && activeItem.querySelector('span');
            const titleElement = document.getElementById('active-view-title');
            if (route === 'class' && titleElement) {
                const course = (AppState.get('courses') || []).find(item => item.code === this.selectedClassCode);
                titleElement.textContent = course ? course.title : 'Class';
            } else if (titleElement) titleElement.textContent = PAGE_GUIDES[route]?.[0] || title?.textContent.trim() || 'StudBud';
            const guide = document.getElementById('page-guide');
            if (guide) guide.textContent = PAGE_GUIDES[route]?.[1] || 'Manage this class’s grades, assignments and study sets.';

            const studyRoute = viewId === 'flashcard-view' || viewId === 'exam-arcade-view';
            const ambience = document.getElementById('study-ambience');
            ambience?.classList.toggle('hidden', !studyRoute);
            document.getElementById('ambience-panel')?.classList.add('hidden');
            document.getElementById('ambience-toggle')?.setAttribute('aria-expanded', 'false');
            if (studyRoute && ambience) {
                const toolbar = document.querySelector(`#${viewId} > .view-header`);
                toolbar?.appendChild(ambience);
            }
            if (!studyRoute) {
                document.getElementById('ambience-panel')?.classList.add('hidden');
                Soundscape.stopAll();
                document.querySelectorAll('.audio-btn').forEach(item => item.classList.remove('active'));
            }

            EventBus.emit('router:navigated', route);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    const Router = new RouterEngine();

    // ============================================================================
    // 5. PROCEDURAL WEB AUDIO SOUNDSCAPE ENGINE
    // ============================================================================
    class SoundscapeEngine {
        constructor() {
            this.ctx = null;
            this.masterGain = null;
            this.channelGains = {};
            
            this.activeNodes = {
                lofi: null,
                rain: null,
                noise: null,
                binauralLeft: null,
                binauralRight: null
            };

            this.volume = 0.70;
            this.isMuted = false;
        }

        initAudioContext() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioCtx();

                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
                this.masterGain.connect(this.ctx.destination);
                Object.entries(AppState.get('settings')?.audioLevels || {}).forEach(([channel, level]) => {
                    this.setChannelVolume(channel, level);
                });
            }

            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        setVolume(vol) {
            this.volume = Math.max(0, Math.min(1, vol));
            if (this.masterGain && this.ctx) {
                this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
            }
        }

        setChannelVolume(channel, level) {
            const volume = Math.max(0, Math.min(1, Number(level) || 0));
            if (!this.ctx || !this.masterGain) return;
            let gain = this.channelGains[channel];
            if (!gain) {
                gain = this.ctx.createGain();
                gain.gain.value = volume;
                gain.connect(this.masterGain);
                this.channelGains[channel] = gain;
            } else {
                gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.03);
            }
            return gain;
        }

        toggleMute() {
            this.isMuted = !this.isMuted;
            this.setVolume(this.volume);
            return this.isMuted;
        }

        // --- PROCEDURAL NOISE BUFFERS ---
        createWhiteNoiseBuffer(durationSec = 5) {
            const bufferSize = this.ctx.sampleRate * durationSec;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
            return buffer;
        }

        createPinkNoiseBuffer(durationSec = 5) {
            const bufferSize = this.ctx.sampleRate * durationSec;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = buffer.getChannelData(0);
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                output[i] *= 0.11;
                b6 = white * 0.115926;
            }
            return buffer;
        }

        createBrownNoiseBuffer(durationSec = 5) {
            const bufferSize = this.ctx.sampleRate * durationSec;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = buffer.getChannelData(0);
            let lastOut = 0.0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                output[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = output[i];
                output[i] *= 3.5;
            }
            return buffer;
        }

        // --- 1. LO-FI SYNTH CHORDS SYNTHESIZER ---
        startLoFi() {
            this.initAudioContext();
            this.stopLoFi();

            const chords = [
                [261.63, 329.63, 392.00, 493.88], // Cmaj7
                [220.00, 261.63, 329.63, 392.00], // Am7
                [146.83, 174.61, 220.00, 261.63], // Dm7
                [196.00, 246.94, 293.66, 349.23]  // G7
            ];

            const synthGain = this.ctx.createGain();
            synthGain.gain.setValueAtTime(0.15, this.ctx.currentTime);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, this.ctx.currentTime);

            const lfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();
            lfo.frequency.setValueAtTime(0.2, this.ctx.currentTime);
            lfoGain.gain.setValueAtTime(250, this.ctx.currentTime);
            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);
            lfo.start();

            filter.connect(synthGain);
            synthGain.connect(this.setChannelVolume('lofi', AppState.get('settings')?.audioLevels?.lofi ?? 0.5));

            let currentChordIdx = 0;
            const playChord = () => {
                const now = this.ctx.currentTime;
                const freqs = chords[currentChordIdx];

                freqs.forEach(freq => {
                    const osc1 = this.ctx.createOscillator();
                    const osc2 = this.ctx.createOscillator();
                    const noteGain = this.ctx.createGain();

                    osc1.type = 'sine';
                    osc2.type = 'triangle';

                    osc1.frequency.setValueAtTime(freq, now);
                    osc2.frequency.setValueAtTime(freq * 1.002, now); // Detune

                    noteGain.gain.setValueAtTime(0, now);
                    noteGain.gain.linearRampToValueAtTime(0.08, now + 0.8);
                    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

                    osc1.connect(noteGain);
                    osc2.connect(noteGain);
                    noteGain.connect(filter);

                    osc1.start(now);
                    osc2.start(now);
                    osc1.stop(now + 4.0);
                    osc2.stop(now + 4.0);
                });

                currentChordIdx = (currentChordIdx + 1) % chords.length;
            };

            playChord();
            const timerId = setInterval(playChord, 4000);

            this.activeNodes.lofi = {
                stop: () => {
                    clearInterval(timerId);
                    lfo.stop();
                    synthGain.disconnect();
                }
            };
        }

        stopLoFi() {
            if (this.activeNodes.lofi) {
                this.activeNodes.lofi.stop();
                this.activeNodes.lofi = null;
            }
        }

        // --- 2. RAIN & STORM SYNTHESIZER ---
        startRain() {
            this.initAudioContext();
            this.stopRain();

            const noiseBuffer = this.createBrownNoiseBuffer(5);
            const source = this.ctx.createBufferSource();
            source.buffer = noiseBuffer;
            source.loop = true;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(800, this.ctx.currentTime);

            const rainGain = this.ctx.createGain();
            rainGain.gain.setValueAtTime(0.25, this.ctx.currentTime);

            source.connect(filter);
            filter.connect(rainGain);
            rainGain.connect(this.setChannelVolume('rain', AppState.get('settings')?.audioLevels?.rain ?? 0.5));

            source.start();

            const thunderTimer = setInterval(() => {
                if (Math.random() > 0.6) {
                    const now = this.ctx.currentTime;
                    filter.frequency.setValueAtTime(300, now);
                    filter.frequency.linearRampToValueAtTime(1200, now + 0.5);
                    filter.frequency.exponentialRampToValueAtTime(400, now + 2.5);

                    rainGain.gain.setValueAtTime(0.25, now);
                    rainGain.gain.linearRampToValueAtTime(0.55, now + 0.3);
                    rainGain.gain.exponentialRampToValueAtTime(0.25, now + 3.0);
                }
            }, 6000);

            this.activeNodes.rain = {
                stop: () => {
                    clearInterval(thunderTimer);
                    source.stop();
                    rainGain.disconnect();
                }
            };
        }

        stopRain() {
            if (this.activeNodes.rain) {
                this.activeNodes.rain.stop();
                this.activeNodes.rain = null;
            }
        }

        // --- 3. NOISE GENERATOR (WHITE, PINK, BROWN) ---
        startNoise(type = 'brown') {
            this.initAudioContext();
            this.stopNoise();

            let buffer;
            if (type === 'white') buffer = this.createWhiteNoiseBuffer(5);
            else if (type === 'pink') buffer = this.createPinkNoiseBuffer(5);
            else buffer = this.createBrownNoiseBuffer(5);

            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.20, this.ctx.currentTime);

            source.connect(noiseGain);
            noiseGain.connect(this.setChannelVolume('white', AppState.get('settings')?.audioLevels?.white ?? 0.3));
            source.start();

            this.activeNodes.noise = {
                stop: () => {
                    source.stop();
                    noiseGain.disconnect();
                }
            };
        }

        stopNoise() {
            if (this.activeNodes.noise) {
                this.activeNodes.noise.stop();
                this.activeNodes.noise = null;
            }
        }

        // --- 4. BINAURAL BEAT GENERATOR (ALPHA & BETA) ---
        startBinaural(type = 'alpha') {
            this.initAudioContext();
            this.stopBinaural();

            const baseFreq = 200; 
            const beatFreq = (type === 'beta') ? 20 : 10; 

            const leftOsc = this.ctx.createOscillator();
            const rightOsc = this.ctx.createOscillator();

            leftOsc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
            rightOsc.frequency.setValueAtTime(baseFreq + beatFreq, this.ctx.currentTime);

            const leftPanner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
            const rightPanner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

            const binauralGain = this.ctx.createGain();
            binauralGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

            if (leftPanner && rightPanner) {
                leftPanner.pan.setValueAtTime(-1.0, this.ctx.currentTime);
                rightPanner.pan.setValueAtTime(1.0, this.ctx.currentTime);

                leftOsc.connect(leftPanner);
                rightOsc.connect(rightPanner);

                leftPanner.connect(binauralGain);
                rightPanner.connect(binauralGain);
            } else {
                leftOsc.connect(binauralGain);
                rightOsc.connect(binauralGain);
            }

            binauralGain.connect(this.setChannelVolume('binaural', AppState.get('settings')?.audioLevels?.binaural ?? 0.6));

            leftOsc.start();
            rightOsc.start();

            this.activeNodes.binauralLeft = leftOsc;
            this.activeNodes.binauralRight = rightOsc;
        }

        stopBinaural() {
            if (this.activeNodes.binauralLeft) {
                this.activeNodes.binauralLeft.stop();
                this.activeNodes.binauralLeft = null;
            }
            if (this.activeNodes.binauralRight) {
                this.activeNodes.binauralRight.stop();
                this.activeNodes.binauralRight = null;
            }
        }

        stopAll() {
            this.stopLoFi();
            this.stopRain();
            this.stopNoise();
            this.stopBinaural();
        }
    }

    const Soundscape = new SoundscapeEngine();

    function localDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ============================================================================
    // 6. CORE APPLICATION INITIALIZATION & ORCHESTRATION
    // ============================================================================
    class AppOrchestrator {
        constructor() {
            this.EventBus = EventBus;
            this.NexusDB = NexusDB;
            this.AppState = AppState;
            this.Router = Router;
            this.Soundscape = Soundscape;
            this.timerInterval = null;
            this.timerSeconds = 25 * 60;
            this.dashboardSprintInterval = null;
            this.dashboardSprintSeconds = null;
            this.dashboardSprintAssignmentId = '';
            this.activeDeckId = null;
            this.activeStudyStartedAt = null;
            this.studyLeaderboardPeriod = 'daily';
            this.studyLeaderboardScope = 'global';
            this.studyLeaderboardSnapshot = null;
            this.studyLeaderboardError = '';
            this.activeCardIndex = 0;
            this.studyCards = [];
            this.arcadeCards = [];
            this.arcadeQuestionIndex = 0;
            this.arcadeScore = 0;
            this.arcadeOptions = [];
            this.arcadeMode = '';
            this.arcadeLives = 3;
            this.arcadeCurrentIsTrue = true;
            this.calendarDate = new Date();
            this.selectedCalendarDate = localDateKey(new Date());
            this.arcadeTimer = null;
            this.arcadeTimeLeft = 60;
            this.arcadeStreak = 0;
            this.arcadeStudyStartedAt = null;
            this.arcadeStudyRecorded = false;
            this.memoryCards = [];
            this.memoryRevealed = [];
            this.memoryMatched = new Set();
            this.memoryLock = false;
            this.memoryMismatchTimeout = null;
            this.selectedScenarioCourseCode = null;
            this.practiceTestCards = [];
            this.practiceTestAnswers = [];
            this.practiceTestQuestionTypes = [];
            this.creatingGradeScenario = false;
            this.gradeProgressChart = null;
            this.hostedGameInterval = null;
            this.hostedGameRoom = null;
            this.hostedGameBusy = false;
            this.hostedGamePollError = '';
            this.multiplayerProfile = null;
            this.multiplayerProfilePromise = null;
            this.userTags = [];
            this.canModerateFlashcards = false;
            this.canTestGames = false;
            this.canAccessStaff = false;
            this.waitingRunner = { running: false, started: false, x: 4, row: 0, cameraRow: 0, score: 0, best: 0, hop: null, lanes: new Map(), clock: 0, dead: false, saving: false };
            this.multiplayerFrame = null;
            this.multiplayerFrameTime = 0;
            this.multiplayerScreen = 'host';
            this.selectedMultiplayerMode = 'skyline';
            this.arcadeSession = null;
            this.practiceSession = null;
            this.arcadeLeft = false;
        }

        async init() {
            await AppState.init();
            if (window.StudBudCloud.initialSnapshot) {
                await AppState.importAppState(window.StudBudCloud.initialSnapshot);
            }
            if ((!window.StudBudCloud.offlineMode || window.StudBudCloud.isGuest?.()) && window.navigator?.onLine !== false) await this.reconcileRemovedDecks();
            this.bindUI();
            this.updateMultiplayerModeSetup(this.selectedMultiplayerMode);
            this.renderUI();
            Router.init();
            if (window.StudBudCloud.isGuest?.()) {
                this.refreshGuestFeatures();
            } else if (!window.StudBudCloud.offlineMode) {
                await this.renderMultiplayerProfile();
                this.syncPendingStudyTime().catch(error => {
                    console.error('[NexusApp] Pending study time could not be loaded:', error);
                    AppState.setSaveStatus(`Saved study time could not be synced. ${this.friendlyErrorMessage(error)}`, 'error');
                });
                this.refreshStudyLeaderboard('daily');
            }

            const unlockAudio = () => {
                Soundscape.initAudioContext();
                window.removeEventListener('click', unlockAudio);
                window.removeEventListener('keydown', unlockAudio);
            };
            window.addEventListener('click', unlockAudio);
            window.addEventListener('keydown', unlockAudio);

            EventBus.emit('app:ready', null);
        }

        refreshGuestFeatures() {
            if (!window.StudBudCloud?.isGuest?.()) return;
            this.multiplayerProfile = null;
            this.renderMultiplayerProfile(true).catch(() => {});
            if (window.navigator?.onLine !== false) this.refreshStudyLeaderboard(this.studyLeaderboardPeriod || 'daily');
        }

        async restoreCloudSnapshot(snapshot) {
            const container = document.getElementById('app-container');
            const wasInert = container?.inert;
            if (container) container.inert = true;
            try {
                const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
                const filtered = this.removedCommunityDecks ? { ...parsed, flashcards: (parsed.flashcards || []).filter(deck => !this.isRemovedCommunityDeck(deck)) } : parsed;
                if (!await AppState.importAppState(filtered)) throw new Error('Your cloud data could not be restored. Keep this page open and retry syncing.');
                this.renderUI();
                this.setCloudChartControls();
                this.renderGradeProgress();
            } finally {
                if (container) container.inert = wasInert;
            }
        }

        async recoverOwnedCommunityDecks() {
            const games = window.StudBudCommunityGames;
            const decks = await games.ownedDecks();
            for (const shared of decks) {
                if ((AppState.get('flashcards') || []).some(deck => deck.id === shared.source_deck_id || deck.communityDeckId === shared.id || deck.communitySourceId === shared.id)) continue;
                await AppState.saveFlashcardDeck({
                    id: shared.source_deck_id, title: shared.title, communityPublished: true, communityDeckId: shared.id,
                    courseTitle: shared.course || '', cards: shared.cards.map((card, index) => ({ ...card, id: `${shared.source_deck_id}_card_${index}` }))
                });
            }
            this.renderDecks();
        }

        isRemovedCommunityDeck(deck) {
            const userId = window.StudBudCloud?.user?.id;
            return (this.removedCommunityDecks || []).some(removed =>
                [deck.communitySourceId, deck.communityDeckId].includes(removed.id)
                || (removed.source_deck_id != null && removed.owner_id === userId && removed.source_deck_id === deck.id));
        }

        async reconcileRemovedDecks() {
            if (!(AppState.get('flashcards') || []).length) return;
            const accountId = window.StudBudCloud?.user?.id;
            let removed;
            try {
                removed = await window.StudBudCommunityGames.removedDecks();
            } catch (error) {
                if (!['PGRST202', '42883'].includes(error.code)) throw error;
                if (!this.removedDeckCheckUnavailable) console.error('[NexusApp] Set-removal checks need the updated server SQL:', error);
                this.removedDeckCheckUnavailable = true;
                AppState.setSaveStatus('Study saves still work, but automatic set removals need the latest supabase-setup.sql on the server.', 'error');
                return;
            }
            if (accountId !== window.StudBudCloud?.user?.id) return;
            this.removedDeckCheckUnavailable = false;
            this.removedCommunityDecks = removed;
            const decks = (AppState.get('flashcards') || []).filter(deck => this.isRemovedCommunityDeck(deck));
            for (const deck of decks) {
                if (this.activeDeckId === deck.id) this.closeStudy();
                await AppState.deleteFlashcardDeck(deck.id);
            }
            if (decks.length) AppState.setSaveStatus('Moderated flashcard sets were removed from this device.');
        }

        async clearLocalStore(storeName) {
            await NexusDB.clear(storeName);
        }

        async resetForCloudAccount() {
            await AppState.resetForCloudAccount();
            this.renderUI();
        }

        escapeHTML(value) {
            return String(value ?? '').replace(/[&<>"']/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]);
        }

        accountTagMarkup(username, tags = []) {
            return window.StudBudArcade.util.accountTagMarkup(username, tags);
        }

        formatNumber(value) {
            return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
        }

        friendlyErrorMessage(error, fallback = 'Something went wrong. Please try again in a moment.') {
            const message = String(error?.message || error || '').trim();
            if (error?.localChangesSaved) return message;
            const code = String(error?.code || '');
            if (/PGRST202|PGRST204|PGRST205|42883|42P01|schema cache|could not find the function|function .* does not exist|relation .* does not exist/i.test(`${code} ${message}`)) {
                return 'This feature is not enabled on the server yet. Ask the site administrator to run the latest supabase-setup.sql, then try again.';
            }
            if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
                return 'Could not reach the server. Check your internet connection and try again.';
            }
            if (/jwt expired|invalid jwt|not authenticated|auth session missing|not signed in|sign in/i.test(message)) {
                return 'Your sign-in has expired. Sign in again and retry.';
            }
            if (/row-level security|permission denied|not allowed|forbidden|42501|403/i.test(`${code} ${message}`)) {
                return 'You do not have permission to do that. If you think this is a mistake, sign out and back in.';
            }
            if (/timeout|timed out|aborted/i.test(message)) {
                return 'That took too long. Check your connection and try again.';
            }
            if (/quota|storage is full|QuotaExceeded/i.test(`${error?.name || ''} ${message}`)) {
                return 'Your device is out of storage space. Keep this page open, free some space and try saving again.';
            }
            if (/rate limit|too many requests|429/i.test(`${code} ${message}`)) {
                return 'You are going too fast. Wait a few seconds and try again.';
            }
            if (/room.*(not found|does not exist|closed|ended)|no (such )?room|invalid room/i.test(message)) {
                return 'That room was not found. Check the 6-character code, or ask the host if the game has ended.';
            }
            if (/room.*full|game.*full/i.test(message)) {
                return 'That room is full.';
            }
            if (/already (started|in progress)|game has started/i.test(message)) {
                return 'That game has already started, so new players cannot join.';
            }
            if (/not enough coins|insufficient/i.test(message)) {
                return 'You do not have enough coins for that yet. Play a game or claim your daily reward.';
            }

            const readableMessage = message
                .replace(/^Could not (?:create the game|join the game|refresh the game|start the game|submit your answer|move to the next question|end the game|remove player|leave the game|purchase item|equip item|open mystery capsule|load multiplayer profile):\s*/i, '')
                .replace(/^Error:\s*/i, '')
                .trim();
            if (/23505|duplicate key/i.test(`${code} ${readableMessage}`)) {
                return 'That room code is already in use. Please try creating the room again.';
            }
            if (!readableMessage || readableMessage.length > 220
                || /\b(?:PGRST\d{3}|SQLSTATE|PostgREST|PostgreSQL|schema|permission denied|violates .*constraint|stack trace|invalid input syntax|unexpected token|TypeError|ReferenceError|SyntaxError)\b/i.test(readableMessage)) {
                return fallback;
            }
            return readableMessage;
        }

        bindUI() {
            document.addEventListener('click', event => this.handleClick(event));
            document.addEventListener('keydown', event => this.handleKeydown(event));
            const typingSurface = target => (target?.nodeType === 1 ? target : target?.parentElement)?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), code, pre, .selectable');
            document.addEventListener('selectstart', event => { if (!typingSurface(event.target)) event.preventDefault(); });
            document.addEventListener('dragstart', event => {
                const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
                if (!element?.closest?.('[draggable="true"]') && !typingSurface(element)) event.preventDefault();
            });
            document.addEventListener('keyup', event => {
                if (event.key !== ' ' && event.code !== 'Space') return;
                const studyArea = document.getElementById('active-study-area');
                if (Router.activeRoute === 'flashcard' && studyArea && !studyArea.classList.contains('hidden')
                    && event.target.closest?.('#active-study-area button')) event.preventDefault();
            });
            document.addEventListener('submit', event => this.handleSubmit(event));
            document.addEventListener('change', event => this.handleChange(event));
            this.bindFlashcardInteraction();
            window.addEventListener('message', event => this.handleInfiniteCampusMessage(event));
            document.addEventListener('click', event => {
                // The bookmarklet only works from the bookmarks bar on the Campus page
                if (!event.target.closest('#ic-bookmarklet-link')) return;
                event.preventDefault();
                this.setInfiniteCampusStatus('On a computer, drag StudBud Import to your bookmarks bar. On a phone, use the phone/tablet instructions below. Run the saved bookmark on the signed-in Campus website, not here.', 'warn');
            });
            document.addEventListener('change', event => {
                if (event.target.id === 'ic-import-file' && event.target.files?.[0]) {
                    this.previewInfiniteCampusFromInput().catch(error => this.setInfiniteCampusStatus(this.friendlyErrorMessage(error), 'error'));
                }
                if (event.target.matches('select[data-ic-class]')) {
                    event.target.closest('.ic-class-row')?.classList.toggle('ic-skipped', event.target.value === 'skip');
                }
                if (event.target.id === 'study-direction') {
                    localStorage.setItem('studbud-study-direction', event.target.value);
                    // re-ask the current card from the chosen side if it has not been answered yet
                    if (this.currentStudyCard && document.getElementById('sm2-controls').classList.contains('hidden')) {
                        this.studyReversed = this.pickStudyReversed();
                        this.renderStudyFaces(this.currentStudyCard, false);
                    }
                    event.target.blur();
                }
                if (event.target.id === 'study-type-toggle') {
                    localStorage.setItem('studbud-type-answer', event.target.checked ? '1' : '0');
                    const revealed = !document.getElementById('sm2-controls').classList.contains('hidden');
                    document.getElementById('study-type-form').classList.toggle('hidden', !event.target.checked || revealed);
                    if (event.target.checked && !revealed) document.getElementById('study-type-input').focus({ preventScroll: true });
                }
            });
            this.startPresence();
            this.bindDeckMenus();
            this.bindDeckReorderDrag();
            window.addEventListener('online', () => {
                this.syncPendingStudyTime().catch(error => {
                    console.error('[NexusApp] Pending study time could not be synced:', error);
                    AppState.setSaveStatus(`Saved study time could not be synced. ${this.friendlyErrorMessage(error)}`, 'error');
                });
            });
            const waitingCanvas = document.getElementById('waiting-runner-canvas');
            waitingCanvas.addEventListener('pointerdown', event => this.beginWaitingHop(event));
            waitingCanvas.addEventListener('pointerup', event => this.finishWaitingHop(event));
            waitingCanvas.addEventListener('pointercancel', event => this.finishWaitingHop(event));
            waitingCanvas.addEventListener('contextmenu', event => event.preventDefault());
            document.addEventListener('input', event => {
                if (event.target.matches('[data-reward-slider]')) {
                    const linked = document.getElementById(event.target.dataset.rewardSlider);
                    linked.value = event.target.value;
                    linked.dataset.custom = '1';
                    this.updateQuestionRewardGuidance();
                }
                if (event.target.matches('#host-game-reward, #solo-game-reward')) {
                    if (event.target.validity.valid) document.querySelector(`[data-reward-slider="${event.target.id}"]`).value = event.target.value;
                    event.target.dataset.custom = '1';
                    this.updateQuestionRewardGuidance();
                }
                if (event.target.matches('#grade-scenario-assignment-form [name="pointsEarned"], #grade-scenario-assignment-form [name="maxPoints"]')) {
                    this.updateScenarioScorePreview();
                }
                if (event.target.matches('#assignment-search')) this.renderAssignments();
                if (event.target.matches('#my-deck-search')) this.renderDecks();
                if (event.target.matches('#my-deck-sort')) {
                    localStorage.setItem('studbud-deck-sort', event.target.value);
                    if (event.target.value !== 'custom') this.deckReorderMode = false;
                    this.renderDecks();
                }
                if (event.target.matches('#deck-editor-search')) this.renderDeckEditorCards();
                if (event.target.matches('#deck-editor-filter')) this.renderDeckEditorCards();
                if (event.target.matches('.shop-search-input')) {
                    const key = event.target.dataset.searchKey;
                    if (key === 'multiplayer-inventory-items') this.inventorySearch = event.target.value.trim();
                    else this.shopSearch = event.target.value.trim();
                    this.filterShopGrid(document.getElementById(key), event.target.value);
                }
                if (event.target.matches('#course-search')) {
                    document.getElementById('course-name').value = '';
                    document.getElementById('course-selection-hint').textContent = `Choose a ${this.schoolShortName()} course from the matches.`;
                    this.filterCourseCatalog(event.target.value);
                }
                if (event.target.matches('#join-game-code')) {
                    event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
                }
                if (['host-game-time', 'solo-game-time', 'solo-game-unlimited'].includes(event.target.id)) this.updateMultiplayerGoalInputs();
                if (event.target.matches('input[type="range"][id^="vol-"]')) this.setMixerLevel(event.target, false);
                if (event.target.id === 'sfx-volume') {
                    const volume = Number(event.target.value) / 100;
                    this.updateGameAudio({ volume });
                    document.getElementById('sfx-volume-value').value = `${event.target.value}%`;
                }
                if (event.target.id === 'music-volume') {
                    this.updateGameAudio({ musicVolume: Number(event.target.value) / 100 });
                    document.getElementById('music-volume-value').value = `${event.target.value}%`;
                }
            });
            window.addEventListener('resize', () => this.updateSidebarToggle());
            document.getElementById('modal-container').addEventListener('click', event => {
                if (event.target.id === 'modal-container' && !document.querySelector('#modal-container .modal-content:not(.hidden) form')) this.closeModal();
            });

            this.EventBus.on('courses:updated', () => this.renderUI());
            this.EventBus.on('assignments:updated', () => this.renderUI());
            this.EventBus.on('state:updated:courses', () => this.renderUI());
            this.EventBus.on('state:updated:assignments', () => this.renderUI());
            this.EventBus.on('state:updated:calendarEvents', () => this.renderCalendar());
            this.EventBus.on('flashcards:updated', () => {
                this.renderDecks();
                this.renderHostedGameDecks();
                this.renderDashboard();
                this.renderStudyRecommendations('planner-study-list');
            });
            this.EventBus.on('study:recorded', () => {
                this.renderDashboard();
                this.renderStudyRecommendations('planner-study-list');
                this.refreshStudyLeaderboard(this.studyLeaderboardPeriod || 'daily');
            });
            this.EventBus.on('state:restored', () => this.renderUI());
            this.EventBus.on('router:navigated', route => {
                if (route !== 'flashcard') this.cancelDeckDrag?.();
                if (route !== 'sound') this.stopSettingsAudioPreview();
                if (route === 'class') this.renderClassDetail();
                if (route === 'calendar') this.renderCalendar();
                if (route === 'schedule') this.renderSchedulePage();
                if (route === 'grade-scenarios') this.renderGradeScenarios();
                if (route === 'analytics') this.renderGradeProgress();
                if (route === 'leaderboard') this.refreshStudyLeaderboard(this.studyLeaderboardPeriod || 'daily');
                if (['shop', 'inventory', 'profile'].includes(route)) {
                    this.animateShopAuras();
                    this.renderMultiplayerProfile(true);
                }
                this.setFriendPolling(route === 'friends');
                if (route === 'friends') this.loadFriends();
                if (route === 'about') this.loadAnnouncementHistory();
                if (route === 'admin') this.loadAdminList();
                if (route === 'classes') this.classrooms?.render();
                if (route === 'multiplayer') {
                    this.renderHostedGameDecks();
                    this.renderMultiplayerProfile(true);
                    this.startMultiplayerAnimation();
                }
                if (route === 'flashcard') {
                    this.renderHostedGameDecks();
                    if (!document.getElementById('community-deck-results').dataset.loaded) this.searchCommunityDecks('');
                }
                if (!['class', 'flashcard'].includes(route)) this.stopFocusTimer();
                if (route !== 'flashcard' && this.activeDeckId) this.closeStudy();
                if (route !== 'exam-arcade' && this.arcadeStudyStartedAt) this.closeArcade();
                if (route !== 'multiplayer') {
                    this.stopWaitingRunner();
                    this.stopMultiplayerAnimation();
                }
            });
        }

        renderUI() {
            this.renderCourses();
            this.renderAssignments();
            this.renderDecks();
            this.renderHostedGameDecks();
            this.renderProfile();
            this.renderDashboard();
            this.renderGradeScenarios();
            this.setCloudChartControls();
            this.renderGradeProgress();
            if (Router.activeRoute === 'class') this.renderClassDetail();
            if (Router.activeRoute === 'calendar') this.renderCalendar();
            if (Router.activeRoute === 'schedule') this.renderSchedulePage();
        }

        openModal(modalId) {
            const overlay = document.getElementById('modal-container');
            const modal = document.getElementById(modalId);
            if (!overlay || !modal) throw new Error('The requested dialog could not be opened.');
            if (overlay.classList.contains('hidden')) {
                this.modalReturnFocus = document.activeElement;
                this.modalBackground = [...overlay.parentElement.children].filter(element => element !== overlay)
                    .map(element => ({ element, inert: element.inert }));
                this.modalBackground.forEach(({ element }) => { element.inert = true; });
            }
            document.querySelectorAll('#modal-container .modal-content').forEach(modal => {
                modal.classList.toggle('hidden', modal.id !== modalId);
            });
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            const heading = modal.querySelector('h2');
            if (heading) {
                heading.id ||= `${modalId}-title`;
                modal.setAttribute('aria-labelledby', heading.id);
            }
            overlay.classList.remove('hidden');
            const target = modal.querySelector('input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)')
                || modal.querySelector('button:not(:disabled)');
            target?.focus({ preventScroll: true });
        }

        closeModal() {
            if (this.cardEditorReturnToDeck) {
                this.cardEditorReturnToDeck = false;
                this.renderDeckEditorCards();
                this.openModal('deck-editor-modal');
                return;
            }
            this.deckEditorDraft = null;
            const overlay = document.getElementById('modal-container');
            if (overlay) overlay.classList.add('hidden');
            document.querySelectorAll('#modal-container .modal-content').forEach(modal => {
                modal.classList.add('hidden');
            });
            this.modalBackground?.forEach(({ element, inert }) => { element.inert = inert; });
            this.modalBackground = null;
            if (this.modalReturnFocus?.isConnected) this.modalReturnFocus.focus({ preventScroll: true });
            this.modalReturnFocus = null;
        }

        renderGradeScenarios() {
            const scenarioSelect = document.getElementById('grade-scenario-select');
            if (!scenarioSelect) return;
            const scenarios = AppState.get('gradeScenarios') || [];
            const storedSelectedId = AppState.get('selectedGradeScenarioId');
            const selectedScenario = scenarios.find(item => item.id === storedSelectedId) || scenarios[0] || null;
            const selectedId = selectedScenario ? selectedScenario.id : '';
            if (selectedId !== (storedSelectedId || '')) {
                AppState.set('selectedGradeScenarioId', selectedScenario ? selectedId : null);
            }
            scenarioSelect.innerHTML = scenarios.map(item =>
                `<option value="${this.escapeHTML(item.id)}">${this.escapeHTML(item.name)}</option>`
            ).join('');
            scenarioSelect.value = selectedId;
            this.updateScenarioScorePreview();
            const nameInput = document.getElementById('grade-scenario-name');
            if (nameInput) nameInput.value = selectedScenario ? selectedScenario.name : '';
            const emptyState = document.getElementById('grade-scenario-empty');
            const workspace = document.getElementById('grade-scenario-workspace');
            if (emptyState) emptyState.classList.toggle('hidden', Boolean(selectedScenario));
            if (workspace) workspace.classList.toggle('hidden', !selectedScenario);
            const deleteButton = document.getElementById('delete-grade-scenario-btn');
            if (deleteButton) deleteButton.disabled = !selectedScenario;

            const courseSelect = document.getElementById('grade-scenario-course');
            const previousCourse = this.selectedScenarioCourseCode || courseSelect.value;
            const courses = this.schoolSemesterCourses();
            courseSelect.innerHTML = courses.map(course =>
                `<option value="${this.escapeHTML(course.code)}">${this.escapeHTML(course.title)}</option>`
            ).join('');
            if (courses.some(course => course.code === previousCourse)) courseSelect.value = previousCourse;
            else if (courses.length) {
                courseSelect.value = courses[0].code;
                this.selectedScenarioCourseCode = courses[0].code;
            }
            this.updateGradeScenarioCategories();
            const form = document.getElementById('grade-scenario-assignment-form');
            if (form) form.querySelectorAll('input, select, button').forEach(control => {
                control.disabled = !selectedScenario || !courses.length;
            });

            const itemsContainer = document.getElementById('grade-scenario-items');
            const resultContainer = document.getElementById('grade-scenario-results');
            const summary = document.getElementById('grade-scenario-gpa-summary');
            if (!selectedScenario) {
                itemsContainer.innerHTML = '';
                resultContainer.innerHTML = '';
                summary.innerHTML = '';
                return;
            }

            const visibleCourseCodes = new Set(courses.map(course => course.code));
            const scenarioItems = Array.isArray(selectedScenario.items)
                ? selectedScenario.items.filter(item => visibleCourseCodes.has(item.courseCode))
                : [];
            const overrides = selectedScenario.overrides || {};
            const realAssignments = this.semesterAssignments(AppState.get('assignments') || [], courses);
            const assignments = realAssignments.map(item => Object.prototype.hasOwnProperty.call(overrides, item.id)
                ? { ...item, pointsEarned: Number(overrides[item.id]), graded: true, status: 'completed' }
                : item);
            this.renderScenarioExisting(courses, realAssignments, overrides);
            const hypotheticalAssignments = scenarioItems.map(item => ({
                id: item.id,
                courseCode: item.courseCode,
                categoryId: item.categoryId || null,
                title: item.title,
                pointsEarned: Number(item.pointsEarned),
                maxPoints: Number(item.maxPoints),
                status: 'completed'
            }));
            const currentGpa = this.calculateSemesterGPA(courses);
            const projectedCourses = courses.map(course => {
                const grade = this.calculateScenarioCourseGrade(course, assignments, hypotheticalAssignments);
                return Number.isFinite(grade) ? { ...course, targetGrade: this.gradeForPercentage(grade) } : null;
            }).filter(Boolean);
            const projectedGpa = window.GPACalculator
                ? window.GPACalculator.calculateCurrentGPA(projectedCourses)
                : currentGpa;
            summary.innerHTML = `
                <article class="glass-card"><span class="gpa-summary-label">Current ${this.termLabel(this.schoolSemester())} weighted GPA</span><strong>${Number(currentGpa.weighted).toFixed(2)}</strong><small>Before hypothetical grades</small></article>
                <article class="glass-card"><span class="gpa-summary-label">Projected ${this.termLabel(this.schoolSemester())} weighted GPA</span><strong>${Number(projectedGpa.weighted).toFixed(2)}</strong><small>${this.formatGpaChange(currentGpa.weighted, projectedGpa.weighted)}</small></article>
                <article class="glass-card"><span class="gpa-summary-label">Current ${this.termLabel(this.schoolSemester())} unweighted GPA</span><strong>${Number(currentGpa.unweighted).toFixed(2)}</strong><small>Before hypothetical grades</small></article>
                <article class="glass-card"><span class="gpa-summary-label">Projected ${this.termLabel(this.schoolSemester())} unweighted GPA</span><strong>${Number(projectedGpa.unweighted).toFixed(2)}</strong><small>${this.formatGpaChange(currentGpa.unweighted, projectedGpa.unweighted)}</small></article>
            `;

            itemsContainer.innerHTML = scenarioItems.length ? scenarioItems.map(item => {
                const course = courses.find(entry => entry.code === item.courseCode);
                const category = (course && course.categories || []).find(entry => entry.id === item.categoryId);
                return `<article class="scenario-item">
                    <div><strong>${this.escapeHTML(item.title)}</strong><span>${this.escapeHTML(course ? course.title : 'Class removed')} · ${this.escapeHTML(category ? category.name : 'Uncategorized')}</span></div>
                    <strong>${this.formatNumber(item.pointsEarned)} / ${this.formatNumber(item.maxPoints)} (${(Number(item.pointsEarned) / Number(item.maxPoints) * 100).toFixed(2)}%)</strong>
                    <button class="icon-btn scenario-remove-btn" data-action="remove-scenario-item" data-id="${this.escapeHTML(item.id)}" aria-label="Remove ${this.escapeHTML(item.title)} from scenario" title="Remove"><i class="fas fa-xmark"></i></button>
                </article>`;
            }).join('') : '<p class="empty-state">Add hypothetical assignment scores to see their effect.</p>';

            resultContainer.innerHTML = courses.length ? courses.map(course => {
                const currentGrade = this.calculateCourseGrade(course, realAssignments);
                const projectedGrade = this.calculateScenarioCourseGrade(course, assignments, hypotheticalAssignments);
                const change = Number.isFinite(projectedGrade) && Number.isFinite(currentGrade) ? projectedGrade - currentGrade : 0;
                return `<article class="scenario-grade-row">
                    <strong>${this.escapeHTML(course.title)}</strong>
                    <span>${Number.isFinite(currentGrade) ? `${currentGrade.toFixed(2)}%` : 'Not graded'} <i class="fas fa-arrow-right" aria-hidden="true"></i> <strong>${Number.isFinite(projectedGrade) ? `${projectedGrade.toFixed(2)}%` : 'Not graded'}</strong></span>
                    <small class="${change > 0.005 ? 'grade-change-positive' : change < -0.005 ? 'grade-change-negative' : ''}">${Number.isFinite(projectedGrade) && Number.isFinite(currentGrade) ? `${change > 0.005 ? '+' : ''}${change.toFixed(2)} percentage points` : 'Add hypothetical scores to project this class'}</small>
                </article>`;
            }).join('') : '<p class="empty-state">Add a class to compare projected grades.</p>';
        }

        formatGpaChange(current, projected) {
            const change = Number(projected) - Number(current);
            return `${change >= 0.005 ? '+' : ''}${Math.abs(change) < .005 ? '0.00' : change.toFixed(2)} GPA points`;
        }

        calculateScenarioCourseGrade(course, assignments, hypotheticalAssignments) {
            const courseHypotheticals = hypotheticalAssignments.filter(item => item.courseCode === course.code);
            if (!courseHypotheticals.length) return this.calculateCourseGrade(course, assignments);
            return this.calculateCourseGrade(course, assignments.concat(courseHypotheticals));
        }

        updateGradeScenarioCategories() {
            const categorySelect = document.getElementById('grade-scenario-category');
            const courseCode = document.getElementById('grade-scenario-course')?.value;
            if (!categorySelect) return;
            const course = (AppState.get('courses') || []).find(item => item.code === courseCode);
            const categories = course ? course.categories || [] : [];
            const previousCategory = categorySelect.value;
            categorySelect.innerHTML = '<option value="">Uncategorized</option>' + categories.map(category =>
                `<option value="${this.escapeHTML(category.id)}">${this.escapeHTML(category.name)} (${this.categoryWeightLabel(course, category)})</option>`
            ).join('');
            if (categories.some(category => category.id === previousCategory)) categorySelect.value = previousCategory;
        }

        renderScenarioExisting(courses, assignments, overrides) {
            const container = document.getElementById('grade-scenario-existing');
            if (!container) return;
            const groups = courses.map(course => {
                const items = assignments.filter(item => item.courseCode === course.code);
                if (!items.length) return '';
                const rows = items.map(item => {
                    const overridden = Object.prototype.hasOwnProperty.call(overrides, item.id);
                    const actual = this.isGradedItem(item) ? Number(item.pointsEarned || 0) : null;
                    const max = Number(item.maxPoints || 100);
                    return `<div class="scenario-existing-row${overridden ? ' is-changed' : ''}">
                        <div><strong>${this.escapeHTML(item.title)}</strong><small>${actual === null ? 'Not graded yet' : `Actual: ${this.formatNumber(actual)} / ${this.formatNumber(max)}`}</small></div>
                        <label class="scenario-existing-input"><span class="sr-only">Hypothetical score for ${this.escapeHTML(item.title)}</span>
                            <input type="number" min="0" max="${max}" step="0.01" data-scenario-override="${this.escapeHTML(item.id)}" value="${overridden ? Number(Number(overrides[item.id]).toFixed(2)) : ''}" placeholder="${actual === null ? 'Score' : this.formatNumber(actual)}"> / ${this.formatNumber(max)}</label>
                        <button class="secondary-btn" data-action="reset-scenario-override" data-id="${this.escapeHTML(item.id)}" ${overridden ? '' : 'disabled'}>Reset</button>
                    </div>`;
                }).join('');
                return `<div class="scenario-existing-group"><h4>${this.escapeHTML(course.title)}</h4>${rows}</div>`;
            }).join('');
            container.innerHTML = groups || '<p class="empty-state">Add assignments to a class to try changing their grades.</p>';
        }

        setScenarioOverride(assignmentId, rawValue) {
            const selectedId = AppState.get('selectedGradeScenarioId');
            const assignment = (AppState.get('assignments') || []).find(item => item.id === assignmentId);
            if (!selectedId || !assignment) return;
            const text = String(rawValue ?? '').trim();
            const value = Math.round(Number(text) * 100) / 100;
            const clear = text === '' || !Number.isFinite(value) || value < 0 || value > Number(assignment.maxPoints || 100);
            const scenarios = (AppState.get('gradeScenarios') || []).map(scenario => {
                if (scenario.id !== selectedId) return scenario;
                const overrides = { ...(scenario.overrides || {}) };
                if (clear) delete overrides[assignmentId];
                else overrides[assignmentId] = value;
                return { ...scenario, overrides };
            });
            this.saveGradeScenarioItems(scenarios);
        }

        updateScenarioScorePreview() {
            const form = document.getElementById('grade-scenario-assignment-form');
            const preview = document.getElementById('grade-scenario-score-preview');
            if (!form || !preview) return;
            const earned = Number(form.elements.pointsEarned.value);
            const possible = Number(form.elements.maxPoints.value);
            preview.textContent = Number.isFinite(earned) && Number.isFinite(possible) && possible > 0
                ? `${(earned / possible * 100).toFixed(1)}% score`
                : 'Enter valid points to preview the score';
        }

        saveGradeScenarioItems(scenarios) {
            AppState.set('gradeScenarios', scenarios);
            this.renderGradeScenarios();
        }

        renderCourses() {
            const allCourses = AppState.get('courses') || [];
            const courses = this.schoolSemesterCourses(allCourses);
            const semester = this.schoolSemester();
            const semesterSelect = document.getElementById('school-semester-select');
            if (semesterSelect) semesterSelect.value = semester;
            const catalog = window.STUDBUD_COURSE_CATALOG || window.PCHS_COURSE_CATALOG || [];
            const body = document.getElementById('transcript-body');
            const cards = document.getElementById('class-card-grid');
            const summary = document.getElementById('cumulative-gpa-summary');
            const currentGpa = this.calculateSemesterGPA(courses);
            if (summary) {
                const creditNote = `${this.formatNumber(currentGpa.totalCredits)} tracked credits in ${this.termLabel(semester)}`;
                summary.innerHTML = `
                    <article class="glass-card"><span class="gpa-summary-label">${this.termLabel(semester)} weighted GPA</span><strong>${Number(currentGpa.weighted).toFixed(2)}</strong><small>${creditNote}</small></article>
                    <article class="glass-card"><span class="gpa-summary-label">${this.termLabel(semester)} unweighted GPA</span><strong>${Number(currentGpa.unweighted).toFixed(2)}</strong><small>${creditNote}</small></article>
                `;
            }
            if (body) {
                const assignments = AppState.get('assignments') || [];
                body.innerHTML = courses.length ? courses.map(course => {
                    const classAssignments = this.semesterAssignments(assignments, [course]);
                    const categories = course.categories || [];
                    const currentGrade = this.calculateCourseGrade(course, classAssignments);
                    const gradeLetter = currentGrade === null ? '—' : this.gradeForPercentage(currentGrade);
                    const categoryGroups = categories.map(category => ({
                        id: category.id,
                        name: category.name,
                        weight: this.usesCategoryWeights(course) ? Number(category.weight) || 0 : null,
                        excluded: category.excluded,
                        assignments: classAssignments.filter(item => item.categoryId === category.id)
                    }));
                    const categorizedIds = new Set(categories.map(category => category.id));
                    const uncategorized = classAssignments.filter(item => !item.categoryId || !categorizedIds.has(item.categoryId));
                    if (!categories.length || uncategorized.length) {
                        categoryGroups.push({ id: 'uncategorized', name: 'Other assignments', weight: null, assignments: uncategorized });
                    }
                    const categoryMarkup = categoryGroups.map(group => {
                        const graded = group.assignments.filter(item => this.isGradedItem(item));
                        const pointsEarned = graded.reduce((sum, item) => sum + Number(item.pointsEarned || 0), 0);
                        const pointsPossible = graded.reduce((sum, item) => sum + Number(item.maxPoints || 0), 0);
                        const categoryGrade = pointsPossible > 0 ? `${(pointsEarned / pointsPossible * 100).toFixed(2)}%` : '—';
                        const assignmentMarkup = group.assignments.length ? group.assignments.map(item => {
                            const hasScore = this.isGradedItem(item);
                            return `<article class="transcript-assignment ${item.status === 'completed' ? 'is-complete' : ''} is-${this.assignmentState(item)}">
                                <span class="assignment-status-dot" aria-hidden="true"></span>
                                <div class="transcript-assignment-main">
                                    <strong>${this.escapeHTML(item.title)}</strong>
                                    <span>${this.escapeHTML(item.kind || 'Assignment')}${hasScore ? '' : ` · Due ${this.escapeHTML(item.dueDate || 'No due date')}`}</span>
                                </div>
                                <strong class="transcript-assignment-score">${hasScore ? `${this.formatNumber(item.pointsEarned || 0)} / ${this.formatNumber(item.maxPoints || 0)}` : 'Not graded'}</strong>
                                <div class="transcript-assignment-actions">
                                    ${hasScore ? '' : this.assignmentStatusControl(item)}
                                    ${this.assessmentStudyButton(item)}
                                    <button class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}" aria-label="Edit ${this.escapeHTML(item.title)}">Edit</button>
                                    <button class="danger-btn" data-action="delete-assignment" data-id="${this.escapeHTML(item.id)}" aria-label="Delete ${this.escapeHTML(item.title)}">Delete</button>
                                </div>
                            </article>`;
                        }).join('') : '<p class="transcript-empty">No assignments in this category yet.</p>';
                        return `<details class="transcript-category" data-transcript-category="${this.escapeHTML(group.id)}">
                            <summary>
                                <span class="transcript-chevron" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
                                <span class="transcript-category-name">${this.escapeHTML(group.name)}</span>
                                <span class="transcript-category-meta">${group.excluded ? 'Excluded' : group.weight === null ? 'Unweighted' : `${group.weight.toFixed(2)}% of grade`}</span>
                                <strong class="transcript-category-grade">${categoryGrade}</strong>
                                <span class="transcript-item-count">${group.assignments.length} item${group.assignments.length === 1 ? '' : 's'}</span>
                            </summary>
                            <div class="transcript-assignment-list">${assignmentMarkup}<button class="secondary-btn transcript-add-btn" data-action="add-assignment-to-category" data-course="${this.escapeHTML(course.code)}" data-category="${this.escapeHTML(group.id === 'uncategorized' ? '' : group.id)}"><i class="fas fa-plus"></i> Add assignment</button></div>
                        </details>`;
                    }).join('');
                    return `<article class="transcript-class">
                        <details class="transcript-class-details" data-transcript-class="${this.escapeHTML(course.code)}">
                            <summary class="transcript-class-summary">
                                <span class="transcript-chevron" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
                                <span class="transcript-class-name"><strong>${this.escapeHTML(course.title)}</strong><small>${this.escapeHTML(this.termLabel(course.term))} · ${course.isWeighted ? 'Weighted' : 'Regular'} · ${this.formatNumber(course.credits || 0)} credits</small></span>
                                <span class="transcript-grade"><strong>${this.escapeHTML(gradeLetter)}</strong><small>${currentGrade === null ? 'No graded work' : `${currentGrade.toFixed(2)}%`}</small></span>
                                <span class="transcript-class-target"><small>Target</small><strong>${course.targetPct !== null && course.targetPct !== undefined && Number.isFinite(Number(course.targetPct)) ? `${Number(course.targetPct).toFixed(2)}%` : '—'}</strong></span>
                                <span class="transcript-item-count">${classAssignments.length} item${classAssignments.length === 1 ? '' : 's'}</span>
                            </summary>
                            <div class="transcript-class-content">
                                <div class="transcript-category-heading"><strong>Grade categories & assignments</strong><button class="primary-btn" data-action="open-class" data-id="${this.escapeHTML(course.code)}">Open class</button></div>
                                ${categoryMarkup}
                            </div>
                        </details>
                        <div class="transcript-class-actions">
                            <button class="secondary-btn" data-action="edit-course" data-id="${this.escapeHTML(course.code)}">Edit class</button>
                            <button class="danger-btn" data-action="delete-course" data-id="${this.escapeHTML(course.code)}">Delete</button>
                        </div>
                    </article>`;
                }).join('') : `<p class="empty-state">No classes for ${this.escapeHTML(this.termLabel(semester))} yet. Switch semesters or add a class.</p>`;
            }
            if (cards) {
                cards.innerHTML = courses.length ? courses.map(course => {
                    const grade = this.calculateSemesterCourseGrade(course);
                    const target = course.targetPct === null || course.targetPct === undefined ? NaN : Number(course.targetPct);
                    return `<article class="glass-card class-card">
                        <div><h3>${this.escapeHTML(course.title)}</h3><span class="class-term">${this.escapeHTML(this.termLabel(course.term))}</span></div>
                        <p>Current grade <strong>${grade === null ? 'Not graded' : `${grade.toFixed(2)}%`}</strong> · Goal <strong>${Number.isFinite(target) ? `${target.toFixed(2)}%` : 'Not set'}</strong></p>
                        <div class="class-grade-track"><span style="width:${Math.max(0, Math.min(100, grade || 0))}%"></span></div>
                        <button class="primary-btn" data-action="open-class" data-id="${this.escapeHTML(course.code)}">Open class</button>
                    </article>`;
                }).join('') : `<p class="empty-state glass-card">No classes for ${this.escapeHTML(this.termLabel(semester))} yet. Switch semesters or add a class.</p>`;
            }

            const options = document.getElementById('assignment-course');
            if (options) {
                const selected = options.value;
                options.innerHTML = '<option value="">Select a Course...</option>' + allCourses.map(course =>
                    `<option value="${this.escapeHTML(course.code)}">${this.escapeHTML(course.title)}</option>`
                ).join('');
                if (allCourses.some(course => course.code === selected)) options.value = selected;
            }
            if (!catalog.length) console.error('[StudBud] Parkway course catalog did not load.');
        }

        termLabel(term) {
            return ({ S1: 'Semester 1', S2: 'Semester 2', FY: 'Full Year' })[term] || 'Full Year';
        }

        configuredSemester() {
            const term = (AppState.get('profile') || {}).currentTerm;
            return term === 'S1' || term === 'S2' ? term : (new Date().getMonth() >= 7 ? 'S1' : 'S2');
        }

        schoolSemester() {
            return this.semesterView === 'S1' || this.semesterView === 'S2'
                ? this.semesterView
                : this.configuredSemester();
        }

        schoolSemesterCourses(courses = AppState.get('courses') || []) {
            const semester = this.schoolSemester();
            return courses.filter(course => !['S1', 'S2'].includes(course.term) || course.term === semester);
        }

        semesterAssignments(assignments, courses) {
            const coursesByCode = new Map(courses.map(course => [course.code, course]));
            const semester = this.schoolSemester();
            return assignments.filter(item => {
                const course = coursesByCode.get(item.courseCode);
                if (!course) return false;
                if (course.term === 'S1' || course.term === 'S2') return course.term === semester;
                const rawDate = item.dueDate || item.gradedAt;
                if (!rawDate) return true;
                const date = String(rawDate);
                const month = /^\d{4}-\d{2}-\d{2}$/.test(date)
                    ? Number(date.slice(5, 7)) - 1
                    : new Date(date).getMonth();
                return !Number.isInteger(month) || month < 0 || month > 11
                    || (month >= 7 ? 'S1' : 'S2') === semester;
            });
        }

        calculateSemesterGPA(courses) {
            const calculator = window.GPACalculator;
            if (!calculator) return { weighted: '0.000', unweighted: '0.000', totalCredits: 0 };
            const assignments = this.semesterAssignments(AppState.get('assignments') || [], courses);
            const currentCourses = courses.map(course => {
                const courseAssignments = assignments.filter(item => item.courseCode === course.code);
                const grade = this.calculateCourseGrade(course, courseAssignments);
                return Number.isFinite(grade) ? { ...course, targetGrade: this.gradeForPercentage(grade) } : null;
            }).filter(Boolean);
            return calculator.calculateCurrentGPA(currentCourses);
        }

        calculateSemesterCourseGrade(course) {
            const assignments = this.semesterAssignments(AppState.get('assignments') || [], [course]);
            return this.calculateCourseGrade(course, assignments);
        }

        calculateTrackedGPA(courses = AppState.get('courses') || []) {
            const calculator = window.GPACalculator;
            if (!calculator) return { weighted: '0.000', unweighted: '0.000', totalCredits: 0 };
            const currentCourses = courses.map(course => {
                const grade = this.calculateCourseGrade(course);
                return Number.isFinite(grade) ? { ...course, targetGrade: this.gradeForPercentage(grade) } : null;
            }).filter(Boolean);
            return this.withPriorGPA(calculator.calculateCurrentGPA(currentCourses));
        }

        /** Credits and GPA earned before the classes tracked in StudBud (from Settings). */
        priorGPA(profile = AppState.get('profile') || {}) {
            const read = value => value === '' || value === null || value === undefined ? NaN : Number(value);
            const credits = read(profile.priorCredits);
            const weighted = read(profile.priorWeightedGpa);
            const unweighted = read(profile.priorUnweightedGpa);
            if (!(credits > 0) || !Number.isFinite(weighted) || !Number.isFinite(unweighted)) return null;
            return { credits, weighted, unweighted };
        }

        /** Blends past credits into a GPA result, weighting each side by its credits. */
        withPriorGPA(result) {
            const prior = this.priorGPA();
            const trackedCredits = Number(result?.totalCredits) || 0;
            if (!prior) return { ...result, trackedCredits, priorCredits: 0 };
            const totalCredits = trackedCredits + prior.credits;
            const blend = key => String(((Number(result?.[key]) || 0) * trackedCredits + prior[key] * prior.credits) / totalCredits);
            return { ...result, weighted: blend('weighted'), unweighted: blend('unweighted'), totalCredits, trackedCredits, priorCredits: prior.credits };
        }

        usesCategoryWeights(course) {
            return (course.categories || []).some(category => !category.excluded && Number(category.weight) > 0);
        }

        categoryWeightLabel(course, category) {
            return category.excluded ? 'Excluded' : this.usesCategoryWeights(course) ? `${Number(category.weight || 0).toFixed(2)}%` : 'Unweighted';
        }

        calculateCourseGrade(course, assignments = AppState.get('assignments') || []) {
            const courseAssignments = assignments.filter(item =>
                item.courseCode === course.code &&
                this.isGradedItem(item) &&
                !(course.categories || []).some(category => category.id === item.categoryId && category.excluded)
            );
            if (!courseAssignments.length) return null;

            const categories = course.categories || [];
            if (this.usesCategoryWeights(course)) {
                let weightedTotal = 0;
                let activeWeight = 0;
                const configuredWeight = categories.reduce((sum, category) => sum + (Number(category.weight) || 0), 0);
                categories.forEach(category => {
                    const matching = courseAssignments.filter(item => item.categoryId === category.id);
                    const weight = Number(category.weight) || 0;
                    if (!matching.length || weight <= 0) return;
                    const points = matching.reduce((sum, item) => sum + Number(item.pointsEarned || 0), 0);
                    const possible = matching.reduce((sum, item) => sum + Number(item.maxPoints || 0), 0);
                    if (possible <= 0) return;
                    weightedTotal += (points / possible) * weight;
                    activeWeight += weight;
                });
                const uncategorized = courseAssignments.filter(item => !item.categoryId || !categories.some(category => category.id === item.categoryId));
                if (uncategorized.length) {
                    const points = uncategorized.reduce((sum, item) => sum + Number(item.pointsEarned || 0), 0);
                    const possible = uncategorized.reduce((sum, item) => sum + Number(item.maxPoints || 0), 0);
                    const unassignedWeight = Math.max(0, 100 - configuredWeight);
                    if (possible > 0 && unassignedWeight > 0) {
                        weightedTotal += (points / possible) * unassignedWeight;
                        activeWeight += unassignedWeight;
                    }
                }
                if (activeWeight > 0) return weightedTotal / activeWeight * 100;
            }

            const earned = courseAssignments.reduce((sum, item) => sum + Number(item.pointsEarned || 0), 0);
            const possible = courseAssignments.reduce((sum, item) => sum + Number(item.maxPoints || 0), 0);
            return possible > 0 ? earned / possible * 100 : null;
        }

        renderClassDetail() {
            const container = document.getElementById('class-detail-content');
            if (!container) return;
            const allCourses = AppState.get('courses') || [];
            const course = this.schoolSemesterCourses(allCourses).find(item => item.code === Router.selectedClassCode);
            if (!course) {
                const otherSemesterCourse = allCourses.find(item => item.code === Router.selectedClassCode);
                const message = otherSemesterCourse
                    ? `That class belongs to ${this.termLabel(otherSemesterCourse.term)}. Change semesters from My Classes & Grades to view it.`
                    : 'That class could not be found.';
                container.innerHTML = `<div class="glass-card empty-state">${this.escapeHTML(message)}</div>`;
                return;
            }
            const categories = course.categories || [];
            const assignments = this.semesterAssignments(AppState.get('assignments') || [], [course]);
            const grade = this.calculateCourseGrade(course, assignments);
            const target = course.targetPct === null || course.targetPct === undefined ? NaN : Number(course.targetPct);
            const sumWeights = categories.reduce((sum, category) => sum + Number(category.weight || 0), 0);
            const categoryRows = categories.map(category => {
                const items = assignments.filter(item => item.categoryId === category.id);
                const gradedItems = items.filter(item => this.isGradedItem(item));
                const earned = gradedItems.reduce((sum, item) => sum + Number(item.pointsEarned || 0), 0);
                const possible = gradedItems.reduce((sum, item) => sum + Number(item.maxPoints || 0), 0);
                const categoryGrade = possible > 0 ? `${(earned / possible * 100).toFixed(2)}%` : 'No graded work';
                return `<div class="category-row">
                    <div><strong>${this.escapeHTML(category.name)}</strong><span>${categoryGrade} · ${items.length} items</span></div>
                    <strong>${this.categoryWeightLabel(course, category)}</strong>
                    <button class="secondary-btn" data-action="add-assignment-to-category" data-course="${this.escapeHTML(course.code)}" data-category="${this.escapeHTML(category.id)}" aria-label="Add assignment to ${this.escapeHTML(category.name)}"><i class="fas fa-plus"></i> Add</button>
                    <button class="danger-btn" data-action="remove-category" data-id="${this.escapeHTML(category.id)}" aria-label="Remove ${this.escapeHTML(category.name)}">Remove</button>
                </div>`;
            }).join('');
            const workRows = assignments.length ? assignments.map(item => `
                <tr>
                    <td>${this.assignmentStatusControl(item)}</td>
                    <td>${this.escapeHTML(item.title)}</td>
                    <td>${this.escapeHTML((categories.find(category => category.id === item.categoryId) || {}).name || 'Uncategorized')}</td>
                    <td>${this.escapeHTML(item.kind || 'assignment')}</td>
                    <td>${this.isGradedItem(item) ? '—' : this.escapeHTML(item.dueDate || 'No date')}</td>
                    <td>${this.isGradedItem(item) ? `${this.formatNumber(item.pointsEarned ?? 0)} / ${this.formatNumber(item.maxPoints ?? 100)}` : 'Not graded'}</td>
                    <td class="actions">
                        ${this.assessmentStudyButton(item)}
                        <button class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">Edit</button>
                        <button class="danger-btn" data-action="delete-assignment" data-id="${this.escapeHTML(item.id)}">Delete</button>
                    </td>
                </tr>`).join('') : '<tr><td colspan="7" class="empty-state">No assignments yet. Add homework, quizzes, or tests to track this class.</td></tr>';

            container.innerHTML = `
                <div class="class-detail-summary glass-card">
                    <div><span class="class-term">${this.escapeHTML(this.termLabel(course.term))}</span><h2>${this.escapeHTML(course.title)}</h2><p>Current grade uses scored work and your category weights.</p></div>
                    <div class="class-grade-metrics"><div><span>${grade === null ? '—' : `${grade.toFixed(2)}%`}</span><small>Current</small></div><div><span>${Number.isFinite(target) ? `${target.toFixed(2)}%` : '—'}</span><small>Optional target</small></div></div>
                </div>
                <div class="class-detail-grid">
                    <section class="glass-card">
                        <h3>Grade targets</h3>
                        <label for="class-target-percent">Target grade (%)</label>
                        <div class="inline-form"><input id="class-target-percent" type="number" min="0" max="100" step="0.01" value="${Number.isFinite(target) ? Number(target.toFixed(2)) : ''}" placeholder="${Number.isFinite(this.effectiveCourseTarget(course)) ? `${this.formatNumber(this.effectiveCourseTarget(course))} (from GPA goal)` : 'e.g. 90'}"><button class="primary-btn" data-action="save-class-target">Save target</button></div>
                        <p>${(() => {
                            const goal = this.effectiveCourseTarget(course);
                            if (!Number.isFinite(goal)) return 'Set a target here or a target GPA in your profile.';
                            const source = Number.isFinite(target) ? 'class target' : `${goal.toFixed(2)}% needed for your target GPA`;
                            if (grade === null) return `No graded work yet. Aim for at least ${goal.toFixed(2)}% (${source}).`;
                            return grade >= goal ? `You are currently meeting your ${source}.` : `You are ${(goal - grade).toFixed(2)} points below your ${source}.`;
                        })()}</p>
                    </section>
                    <section class="glass-card">
                        <h3>Optional grade categories</h3>
                        <p>Weights are percentages. Category averages use earned points / possible points; categories without scores are left out until work is graded. Uncategorized scores use any remaining weight. When categories total 100%, assign scored work to a category to include it in the weighted grade.</p>
                        <div class="category-list">${categoryRows || '<p class="empty-state">No categories. Your graded assignments will use a points-based average.</p>'}</div>
                        <p class="${this.usesCategoryWeights(course) && Math.abs(sumWeights - 100) >= 0.01 ? 'weight-note' : 'weight-valid'}">${this.usesCategoryWeights(course) ? `Category weights total ${sumWeights.toFixed(2)}%${Math.abs(sumWeights - 100) >= 0.01 ? ' (recommended total: 100%)' : ''}` : 'Unweighted: all scored work counts by points, regardless of category.'}</p>
                        <div class="category-add-form">
                            <input id="new-category-name" type="text" aria-label="Category name" placeholder="Category name (e.g. Tests)">
                            <input id="new-category-weight" type="number" aria-label="Category weight (%)" min="0" max="100" step="0.1" placeholder="Weight %">
                            <button class="secondary-btn" data-action="add-category">Add category</button>
                        </div>
                    </section>
                </div>
                <section class="glass-card full-width class-work-section">
                    <h3>Assignments, quizzes & tests</h3>
                    <div class="table-responsive" tabindex="0" role="region" aria-label="Class assignments table"><table><thead><tr><th>Status</th><th>Item</th><th>Category</th><th>Type</th><th>Due</th><th>Score</th><th>Actions</th></tr></thead><tbody>${workRows}</tbody></table></div>
                </section>
                <section class="glass-card class-focus-panel">
                    <div><h3>Study this class</h3><p>Start a 25-minute focus session for this class.</p></div>
                    <div class="focus-timer-control">
                        <i class="fas fa-stopwatch"></i>
                        <span class="focus-time-display">25:00</span>
                        <button class="focus-play-btn" aria-label="Start class focus timer"><i class="fas fa-play"></i></button>
                    </div>
                </section>
                <section class="glass-card"><h3>Study guidance</h3><div class="study-guidance-list">${this.getStudyRecommendations().filter(item => item.courseCode === course.code).slice(0, 4).map(item => `<p><strong>${this.escapeHTML(item.title)}</strong> — ${item.sessionMinutes} min today (about ${item.totalStudyMinutes} min total). ${this.escapeHTML(item.reason)} <strong>Method:</strong> ${this.escapeHTML(item.studyMethod)}</p>`).join('') || '<p>No quizzes or tests to study for in this class right now.</p>'}</div></section>`;
            this.updateFocusTimerDisplay();
        }

        getSchoolSchedule(date) {
            return window.PlannerEngine?.getPCHSBlockSchedule(date) || null;
        }

        getSchedulePattern(schoolSchedule) {
            if (schoolSchedule?.type === 'All') return 'all';
            if (schoolSchedule?.type === 'Odd') return 'odd';
            if (schoolSchedule?.type === 'Even') return 'even';
            return null;
        }

        getPeriodMap() {
            // One period per class; legacy odd/even entries are folded in
            const schedule = AppState.get('schedule') || {};
            return { ...(schedule.odd || {}), ...(schedule.even || {}), ...(schedule.all || {}) };
        }

        renderSchedulePage() {
            this.renderImportedScheduleStatus();
            const container = document.getElementById('schedule-course-list');
            if (!container) return;
            const courses = AppState.get('courses') || [];
            if (!courses.length) {
                container.innerHTML = '<p class="empty-state">Add a class before assigning it to a period.</p>';
                return;
            }
            const periodMap = this.getPeriodMap();
            const periodOptions = '<option value="">Not scheduled</option>' +
                [1, 2, 3, 5, 6, 7, 8].map(number => `<option value="${number}">Period ${number} · ${number % 2 ? 'Odd' : 'Even'} days</option>`).join('');
            container.innerHTML = `
                <div class="schedule-pattern-headings"><span>Class</span><span>Period</span></div>
                ${courses.map(course => `<div class="schedule-course-row">
                    <strong>${this.escapeHTML(course.title)}</strong>
                    <label class="schedule-period-select"><select aria-label="${this.escapeHTML(course.title)} period" data-course="${this.escapeHTML(course.code)}">${periodOptions}</select></label>
                </div>`).join('')}`;
            container.querySelectorAll('select[data-course]').forEach(select => {
                const assignedPeriod = Object.entries(periodMap).find(([, code]) => code === select.dataset.course)?.[0];
                if (assignedPeriod) select.value = assignedPeriod;
            });
        }

        saveSchedule() {
            const all = {};
            document.querySelectorAll('#schedule-course-list select[data-course]').forEach(select => {
                if (!select.value) return;
                if (all[select.value]) throw new Error(`Two classes are set to period ${select.value}. Give each class its own period.`);
                all[select.value] = select.dataset.course;
            });
            const current = AppState.get('schedule') || {};
            AppState.set('schedule', { ...(current.ic ? { ic: current.ic } : {}), all, odd: {}, even: {} });
            this.renderDashboard();
            this.renderCalendar();
            window.StudBudDialogs.notify('Class schedule saved.');
        }

        renderImportedScheduleStatus() {
            const card = document.getElementById('ic-schedule-status');
            const text = document.getElementById('ic-schedule-status-text');
            if (!card || !text) return;
            const ic = (AppState.get('schedule') || {}).ic;
            const imported = Boolean(window.StudBudIC?.hasImportedSchedule(ic));
            card.classList.toggle('hidden', !imported);
            if (!imported) return;
            const when = new Date(ic.importedAt);
            const days = Object.values(ic.calendars || {}).reduce((sum, list) => sum + Object.keys(list || {}).length, 0);
            text.textContent = `Using your Infinite Campus schedule${Number.isFinite(when.getTime()) ? ` from ${when.toLocaleDateString()}` : ''}: ${(ic.sections || []).length} class periods with real times${days ? ` and ${days} school-calendar days` : ''}. The periods above still apply on days Campus doesn't cover.`;
        }

        async removeImportedSchedule() {
            const schedule = AppState.get('schedule') || {};
            if (!schedule.ic) return;
            if (!await window.StudBudDialogs.confirm('Remove the imported Infinite Campus times and school calendar? Your class periods above stay saved.')) return;
            const { ic, ...rest } = schedule;
            AppState.set('schedule', rest);
            this.renderSchedulePage();
            this.renderDashboard();
            this.renderCalendar();
        }

        openInfiniteCampusImport() {
            if (!window.StudBudIC) throw new Error('The Infinite Campus importer did not load. Refresh the page and try again.');
            const link = document.getElementById('ic-bookmarklet-link');
            const origin = /^https?:$/.test(window.location.protocol) ? window.location.origin : '';
            if (link) link.setAttribute('href', window.StudBudIC.buildBookmarklet(origin));
            const bookmarkUrl = document.getElementById('ic-bookmarklet-url');
            if (bookmarkUrl) bookmarkUrl.value = window.StudBudIC.buildBookmarklet(origin);
            const mobileInstructions = document.getElementById('ic-mobile-instructions');
            if (mobileInstructions && window.matchMedia('(pointer: coarse), (max-width: 680px)').matches) mobileInstructions.open = true;
            const urlInput = document.getElementById('ic-district-url');
            if (urlInput && !urlInput.value) urlInput.value = localStorage.getItem('studbud-ic-url') || (this.isParkwaySchool() ? PARKWAY_CAMPUS_URL : '');
            const moreAddress = urlInput?.closest('details');
            if (moreAddress && !urlInput.value) moreAddress.open = true;
            this.setInfiniteCampusStatus('');
            this.showInfiniteCampusSteps(!this.icImport);
            this.openModal('ic-import-modal');
        }

        showInfiniteCampusSteps(show) {
            document.getElementById('ic-import-modal')?.classList.toggle('ic-has-preview', !show);
        }

        restartInfiniteCampusImport() {
            this.icImport = null;
            const preview = document.getElementById('ic-import-preview');
            if (preview) {
                preview.innerHTML = '';
                preview.classList.add('hidden');
            }
            this.setInfiniteCampusStatus('');
            this.showInfiniteCampusSteps(true);
        }

        async pasteInfiniteCampusFromClipboard() {
            let text = '';
            try {
                if (!navigator.clipboard?.readText) throw new Error('unavailable');
                text = String(await navigator.clipboard.readText() || '').trim();
            } catch {
                const manual = document.getElementById('ic-import-textarea');
                const details = manual?.closest('details');
                if (details) details.open = true;
                manual?.focus();
                this.setInfiniteCampusStatus('Your browser blocked reading the clipboard. Tap and hold in the data box and choose Paste on a phone, or press Ctrl+V (Cmd+V on Mac), then choose Preview.', 'warn');
                return;
            }
            if (!text) throw new Error('Your clipboard is empty. On the Campus tab, choose Copy data in the StudBud box first.');
            this.previewInfiniteCampusData(text);
        }

        setInfiniteCampusStatus(message, tone = '') {
            const status = document.getElementById('ic-import-status');
            if (!status) return;
            status.textContent = message;
            status.dataset.tone = tone;
        }

        openInfiniteCampusSite() {
            const input = document.getElementById('ic-district-url');
            let value = String(input?.value || '').trim();
            if (!value) throw new Error('Open "Different Campus address?" and paste your Infinite Campus address first (it usually ends in infinitecampus.org).');
            if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
            let url;
            try {
                url = new URL(value);
            } catch {
                throw new Error('That Infinite Campus address does not look like a web address.');
            }
            if (url.protocol !== 'https:') throw new Error('Use the secure https:// Infinite Campus address.');
            localStorage.setItem('studbud-ic-url', url.href);
            this.icAllowedOrigin = url.origin;
            // Keep the opener link so the helper can hand data straight back to this tab
            this.icWindow = window.open(url.href, 'studbud-ic');
            this.setInfiniteCampusStatus(this.icWindow
                ? 'Campus opened in a new tab. Sign in on the website (not the Campus app), then run your saved StudBud Import bookmark. On Chrome for Android, type the bookmark name in the address bar and tap the saved bookmark suggestion.'
                : 'Your browser blocked the new tab. Open Campus yourself, then run the helper there.');
        }

        async copyInfiniteCampusBookmarklet() {
            const origin = /^https?:$/.test(window.location.protocol) ? window.location.origin : '';
            const input = document.getElementById('ic-bookmarklet-url');
            input.value = window.StudBudIC.buildBookmarklet(origin);
            try {
                if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
                await navigator.clipboard.writeText(input.value);
                this.setInfiniteCampusStatus('Bookmark URL copied. Bookmark a page as StudBud Import, edit that bookmark, and replace its entire address with the copied URL. Then run the bookmark on the signed-in Campus website.');
            } catch {
                document.getElementById('ic-mobile-instructions').open = true;
                input.focus();
                input.select();
                input.setSelectionRange(0, input.value.length);
                this.setInfiniteCampusStatus('Automatic copying is blocked. The bookmark URL is selected below: tap and hold and choose Copy on a phone, or press Ctrl+C (Cmd+C on Mac). Paste it into the address of your StudBud Import bookmark.', 'warn');
            }
        }

        async copyInfiniteCampusScript() {
            const origin = /^https?:$/.test(window.location.protocol) ? window.location.origin : '';
            const script = window.StudBudIC.buildConsoleScript(origin);
            try {
                if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
                await navigator.clipboard.writeText(script);
                this.setInfiniteCampusStatus('Console script copied. On the signed-in Campus page press F12, open Console, paste it, and press Enter.');
            } catch {
                const textarea = document.getElementById('ic-import-textarea');
                const details = textarea.closest('details');
                if (details) details.open = true;
                textarea.value = script;
                textarea.select();
                this.setInfiniteCampusStatus('Copy blocked by the browser. The script is selected in the box below. Copy it with Ctrl+C, then clear the box.', 'warn');
            }
        }

        isTrustedInfiniteCampusMessage(event) {
            if (event.source && this.icWindow && event.source === this.icWindow) return true;
            if (this.icAllowedOrigin && event.origin === this.icAllowedOrigin) return true;
            const saved = localStorage.getItem('studbud-ic-url');
            try {
                if (saved && new URL(saved).origin === event.origin) return true;
            } catch { /* ignore a bad saved address */ }
            try {
                const host = new URL(event.origin).hostname;
                return new URL(event.origin).protocol === 'https:' && (host === 'infinitecampus.org' || host.endsWith('.infinitecampus.org') || host.endsWith('.infinitecampus.com'));
            } catch {
                return false;
            }
        }

        handleInfiniteCampusMessage(event) {
            const IC = window.StudBudIC;
            const data = event.data;
            if (!IC || !data || typeof data !== 'object' || data.format !== IC.FORMAT) return;
            // Data only opens a preview; nothing is saved until the student confirms the import
            if (!this.isTrustedInfiniteCampusMessage(event)) return;
            try {
                event.source?.postMessage({ format: IC.ACK_FORMAT }, event.origin);
            } catch { /* the helper still offers copy and download */ }
            if (document.getElementById('ic-import-modal')?.classList.contains('hidden')) this.openModal('ic-import-modal');
            this.previewInfiniteCampusData(data);
            window.focus();
        }

        async previewInfiniteCampusFromInput() {
            const file = document.getElementById('ic-import-file')?.files?.[0];
            const textarea = document.getElementById('ic-import-textarea');
            const text = file ? await file.text() : String(textarea?.value || '').trim();
            if (!text) throw new Error('Paste the copied Infinite Campus data or choose the downloaded .json file first.');
            this.previewInfiniteCampusData(text);
        }

        previewInfiniteCampusData(input) {
            const IC = window.StudBudIC;
            let model;
            try {
                model = IC.parsePayload(input);
            } catch (error) {
                this.setInfiniteCampusStatus(error.message || 'That does not look like StudBud Infinite Campus data.', 'error');
                return;
            }
            const school = this.currentSchool();
            const catalog = this.schoolCatalog(school);
            const plan = IC.buildImportPlan(model, { courses: AppState.get('courses') || [] }, { school, catalog });
            this.icImport = { model, plan };
            this.renderInfiniteCampusPreview();
            const warnings = model.warnings.length ? ` ${model.warnings.length} item(s) could not be read from Campus.` : '';
            this.setInfiniteCampusStatus(`Found ${plan.counts.classes} classes, ${plan.counts.assignments} assignments (${plan.counts.graded} graded), and ${plan.counts.days} calendar days. Check the matches below, then import.${warnings}`, warnings ? 'warn' : 'ok');
        }

        renderInfiniteCampusPreview() {
            const container = document.getElementById('ic-import-preview');
            if (!container || !this.icImport) return;
            const { plan, model } = this.icImport;
            const esc = value => this.escapeHTML(value ?? '');
            const pchs = this.isParkwaySchool(plan.school);
            const schoolTag = this.schoolShortName(plan.school);
            const catalog = this.schoolCatalog(plan.school).filter(course => course.code);
            const byCategory = new Map();
            catalog.forEach(course => {
                const key = course.category || 'Other';
                if (!byCategory.has(key)) byCategory.set(key, []);
                byCategory.get(key).push(course);
            });
            const fullCatalog = [...byCategory.entries()].map(([category, courses]) =>
                `<optgroup label="${esc(category)}">${courses.map(course => `<option value="${esc(course.code)}">${esc(course.title)}</option>`).join('')}</optgroup>`).join('');
            const existingTitles = new Map((AppState.get('courses') || []).map(course => [course.code, course.title]));
            const rows = plan.classes.map((entry, index) => {
                const selected = entry.include ? (entry.match?.code || '') : 'skip';
                const suggestionOptions = entry.suggestions.map(course => `<option value="${esc(course.code)}">${esc(course.title)}${entry.match?.code === course.code ? ' (best match)' : ''}</option>`).join('');
                const select = `<select data-ic-class="${index}" aria-label="StudBud class for ${esc(entry.name)}">
                    ${pchs && suggestionOptions ? `<optgroup label="Closest ${esc(schoolTag)} courses">${suggestionOptions}</optgroup>` : ''}
                    <option value="">Use Campus name: ${esc(entry.name)}</option>
                    <option value="skip">Don't import</option>
                    ${pchs ? `<optgroup label="All ${esc(schoolTag)} courses">${fullCatalog}</optgroup>` : ''}
                </select>`;
                const confidence = entry.match ? Math.round(entry.match.confidence * 100) : 0;
                const badge = !pchs ? ''
                    : entry.match ? `<span class="ic-badge ${confidence >= 85 ? 'ok' : 'check'}">${entry.match.method === 'number' ? 'Course # match' : `${confidence}% name match`}</span>`
                        : '<span class="ic-badge check">No catalog match</span>';
                const grade = entry.grades.length ? entry.grades[entry.grades.length - 1] : null;
                const details = [
                    entry.courseNumbers.length ? `#${entry.courseNumbers.join(', ')}` : '',
                    entry.periods.length ? `Period ${entry.periods.join(', ')}` : '',
                    entry.times.join(', '),
                    entry.teacher,
                    entry.term,
                    `${entry.assignmentCount} assignments`,
                    entry.categoryCount ? `${entry.categoryCount} categories` : '',
                    grade ? `${grade.task || grade.term}: ${grade.score || ''}${Number.isFinite(grade.percent) ? ` (${grade.percent}%)` : ''}` : '',
                    entry.existingCode ? `updates “${existingTitles.get(entry.existingCode) || entry.existingCode}”` : 'new class',
                    entry.dropped ? 'dropped' : ''
                ].filter(Boolean).map(esc).join(' · ');
                return `<div class="ic-class-row${entry.include ? '' : ' ic-skipped'}">
                    <div class="ic-class-info"><div><strong>${esc(entry.name)}</strong> ${badge}</div><small>${details}</small></div>
                    ${select}
                </div>`;
            }).join('');
            container.innerHTML = `
                <h3>${esc(model.studentName ? `${model.studentName}'s classes` : 'Classes found')}</h3>
                ${pchs ? `<p class="settings-hint">Each Campus class is matched to the closest ${esc(schoolTag)} catalog course (course number first, then name). Change any match that looks wrong.</p>` : ''}
                <div class="ic-class-list">${rows || '<p class="empty-state">No classes were found for this school year.</p>'}</div>
                <fieldset class="ic-options">
                    <legend>Also import</legend>
                    <label><input type="checkbox" data-ic-option="categories" checked> Grade categories &amp; weights</label>
                    <label><input type="checkbox" data-ic-option="graded" checked> Past graded work &amp; scores</label>
                    <label><input type="checkbox" data-ic-option="upcoming" checked> Upcoming assignments</label>
                    <label><input type="checkbox" data-ic-option="schedule" checked> Class periods &amp; times</label>
                    <label><input type="checkbox" data-ic-option="calendar" checked> School calendar (days off, notes)</label>
                </fieldset>
                <p class="settings-hint">Importing again later updates the same classes and assignments instead of duplicating them. Your study estimates and priorities are kept.</p>
                <div class="modal-footer"><button id="ic-restart-btn" class="secondary-btn" type="button"><i class="fas fa-rotate-left"></i> Start over</button><button id="ic-apply-import-btn" class="primary-btn" type="button"><i class="fas fa-file-import"></i> Import into StudBud</button></div>`;
            container.querySelectorAll('select[data-ic-class]').forEach(select => {
                const entry = plan.classes[Number(select.dataset.icClass)];
                select.value = entry.include ? (entry.match?.code || '') : 'skip';
            });
            container.classList.remove('hidden');
            this.showInfiniteCampusSteps(false);
        }

        applyInfiniteCampusImport() {
            if (!this.icImport) throw new Error('Preview your Infinite Campus data first.');
            const IC = window.StudBudIC;
            const { model, plan } = this.icImport;
            const container = document.getElementById('ic-import-preview');
            const overrides = {};
            container.querySelectorAll('select[data-ic-class]').forEach(select => {
                overrides[plan.classes[Number(select.dataset.icClass)].key] = select.value;
            });
            const options = { overrides, catalog: window.STUDBUD_COURSE_CATALOG || window.PCHS_COURSE_CATALOG || [] }; // full catalog so previously saved codes still resolve
            container.querySelectorAll('[data-ic-option]').forEach(box => { options[box.dataset.icOption] = box.checked; });
            if (Object.values(overrides).every(value => value === 'skip')) throw new Error('Choose at least one class to import.');
            const result = IC.applyImportPlan(model, plan, {
                courses: AppState.get('courses') || [],
                assignments: AppState.get('assignments') || [],
                schedule: AppState.get('schedule') || {}
            }, options);
            AppState.set('courses', result.courses);
            AppState.set('assignments', result.assignments);
            AppState.set('schedule', result.schedule);
            this.icImport = null;
            this.renderUI();
            if (Router.activeRoute === 'schedule') this.renderSchedulePage();
            this.renderCalendar();
            const s = result.summary;
            const parts = [
                s.coursesAdded ? `${s.coursesAdded} classes added` : '',
                s.coursesUpdated ? `${s.coursesUpdated} classes updated` : '',
                s.categories ? `${s.categories} categories` : '',
                s.gradedAdded + s.gradedUpdated ? `${s.gradedAdded + s.gradedUpdated} graded assignments` : '',
                s.upcomingAdded + s.upcomingUpdated ? `${s.upcomingAdded + s.upcomingUpdated} upcoming assignments` : '',
                s.periods ? `${s.periods} class periods` : '',
                s.days ? `${s.days} calendar days` : ''
            ].filter(Boolean);
            this.closeModal();
            const preview = document.getElementById('ic-import-preview');
            preview.innerHTML = '';
            preview.classList.add('hidden');
            document.getElementById('ic-import-textarea').value = '';
            document.getElementById('ic-import-file').value = '';
            this.showInfiniteCampusSteps(true);
            window.StudBudDialogs.notify(`Infinite Campus import complete: ${parts.join(', ') || 'nothing new to add'}.`);
        }

        getScheduleEntries(date) {
            const pchsSchedule = this.getSchoolSchedule(date);
            const courses = AppState.get('courses') || [];
            // Imported Infinite Campus data knows real school days, day notes, and class times
            const imported = window.StudBudIC?.scheduleForDate((AppState.get('schedule') || {}).ic, date, courses);
            if (imported && imported.school === false) {
                return { pchsSchedule: { title: imported.note || 'No school', classes: [] }, pattern: null, entries: [], note: imported.note || '', imported: true };
            }
            if (imported && imported.school && !imported.fallback) {
                return {
                    pchsSchedule: { title: pchsSchedule?.title || imported.psName || 'School day', classes: [] },
                    pattern: 'ic',
                    entries: imported.entries,
                    note: imported.note || '',
                    imported: true
                };
            }
            const pattern = this.getSchedulePattern(pchsSchedule);
            const periodMap = this.getPeriodMap();
            const entries = (pchsSchedule?.classes || []).map(slot => {
                const match = String(slot.period).match(/^\s*(\d+)/);
                const period = match ? Number(match[1]) : null;
                const courseCode = period ? periodMap[String(period)] : null;
                const course = courses.find(item => item.code === courseCode);
                return { ...slot, periodNumber: period, course };
            });
            return imported ? { pchsSchedule, pattern, entries, note: imported.note || '' } : { pchsSchedule, pattern, entries };
        }

        renderDailySchedule(date) {
            const list = document.getElementById('daily-schedule-list');
            const type = document.getElementById('daily-schedule-type');
            if (!list || !type) return;
            const { pchsSchedule, pattern, entries, note } = this.getScheduleEntries(date);
            const courses = AppState.get('courses') || [];
            const hasSchedule = Object.values(this.getPeriodMap()).some(code => courses.some(course => course.code === code))
                || Boolean(window.StudBudIC?.hasImportedSchedule((AppState.get('schedule') || {}).ic));
            const edit = document.getElementById('daily-schedule-edit');
            if (edit) edit.textContent = hasSchedule ? 'Edit schedule' : 'Set schedule';
            const noteText = note && note !== pchsSchedule?.title ? ` · ${note}` : '';
            type.textContent = pchsSchedule ? `${pchsSchedule.title} · ${date.toLocaleDateString(undefined, { weekday: 'long' })}${noteText}` : 'School schedule unavailable';
            const todayKey = localDateKey(date);
            const work = (AppState.get('assignments') || []).filter(item => String(item.dueDate || '').slice(0, 10) === todayKey && item.status !== 'completed' && !this.isGradedItem(item));
            const workMarkup = items => items.length ? `<ul class="schedule-due-work">${items.map(item => `<li><span class="schedule-work-kind">${this.escapeHTML(item.kind || 'assignment')}</span><button type="button" class="schedule-work-link" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">${this.escapeHTML(item.title)}</button></li>`).join('')}</ul>` : '';
            const todayCourses = new Set(entries.filter(entry => entry.course).map(entry => entry.course.code));
            const otherWork = work.filter(item => !todayCourses.has(item.courseCode));
            const otherMarkup = otherWork.length ? `<li class="schedule-extra-work"><strong>Also due today</strong>${workMarkup(otherWork)}</li>` : '';
            const nextDayMarkup = () => {
                if (!hasSchedule) return '';
                for (let offset = 1; offset <= 7; offset++) {
                    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
                    const upcoming = this.getScheduleEntries(next).entries.filter(entry => entry.course);
                    if (upcoming.length) return `<li><details class="schedule-next-day"><summary>Next classes · ${this.escapeHTML(next.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))}</summary><ul>${upcoming.map(entry => `<li class="daily-period-row"><span>${this.escapeHTML(entry.period)}<small>${this.escapeHTML(entry.time || '')}</small></span><strong>${this.escapeHTML(entry.course.title)}</strong></li>`).join('')}</ul></details></li>`;
                }
                return '';
            };
            if (!pattern) {
                list.innerHTML = `<li class="empty-state">${hasSchedule ? 'Your schedule is saved. No classes today.' : 'No classes today. Set your class periods to prepare for school days.'}</li>${otherMarkup}${nextDayMarkup()}`;
                return;
            }
            const configured = entries.filter(entry => entry.periodNumber && entry.course);
            if (!configured.length) {
                list.innerHTML = `<li class="empty-state">${hasSchedule ? 'Your schedule is saved, but none of your classes use today’s periods.' : 'Set your class periods to see today’s classes here.'}</li>${otherMarkup}${nextDayMarkup()}`;
                return;
            }
            list.innerHTML = entries.map(entry => entry.periodNumber
                ? `<li class="daily-period-row"><span>${this.escapeHTML(entry.period)}<small>${this.escapeHTML(entry.time || '')}${entry.room ? ` · Rm ${this.escapeHTML(entry.room)}` : ''}</small></span><div class="daily-period-class"><strong>${this.escapeHTML(entry.course?.title || 'No class assigned')}</strong>${workMarkup(work.filter(item => entry.course && item.courseCode === entry.course.code))}</div></li>`
                : `<li class="daily-period-row"><span>${this.escapeHTML(this.schoolTag() || 'School')} block</span><strong>${this.escapeHTML(entry.period)}</strong></li>`
            ).join('') + otherMarkup;
        }

        changeCalendarMonth(offset) {
            const selectedDay = new Date(`${this.selectedCalendarDate}T00:00:00`).getDate();
            this.calendarDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth() + offset, 1);
            const monthLength = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth() + 1, 0).getDate();
            this.selectedCalendarDate = localDateKey(new Date(
                this.calendarDate.getFullYear(),
                this.calendarDate.getMonth(),
                Math.min(selectedDay, monthLength)
            ));
            this.renderCalendar();
        }

        renderCalendar() {
            const daysElement = document.getElementById('calendar-days');
            if (!daysElement) return;
            const year = this.calendarDate.getFullYear();
            const month = this.calendarDate.getMonth();
            document.getElementById('calendar-month-label').textContent =
                this.calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            const firstWeekday = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const todayKey = localDateKey(new Date());
            const assignments = AppState.get('assignments') || [];
            let cells = '';
            for (let index = 0; index < firstWeekday; index++) cells += '<span class="calendar-day calendar-day-empty" aria-hidden="true"></span>';
            for (let day = 1; day <= daysInMonth; day++) {
                const dateKey = localDateKey(new Date(year, month, day));
                const due = assignments.filter(item => item.dueDate === dateKey);
                const studyCount = due.filter(item => ['quiz', 'test'].includes(String(item.kind).toLowerCase())).length;
                const count = due.length - studyCount;
                const eventCount = (AppState.get('calendarEvents') || []).filter(item => item.date === dateKey).length;
                const { pattern, entries, note } = this.getScheduleEntries(new Date(year, month, day));
                const classCount = pattern ? entries.filter(entry => entry.periodNumber && entry.course).length : 0;
                const classes = ['calendar-day'];
                if (dateKey === todayKey) classes.push('today');
                if (dateKey === this.selectedCalendarDate) classes.push('selected');
                if (note && !pattern) classes.push('calendar-day-off');
                const indicators = [
                    note ? `<small class="calendar-day-note" title="${this.escapeHTML(note)}">${this.escapeHTML(note.length > 18 ? `${note.slice(0, 17)}…` : note)}</small>` : '',
                    classCount ? `<small>${classCount} ${classCount === 1 ? 'class' : 'classes'}</small>` : '',
                    count ? `<small class="calendar-assignment-tag">${count} assignment${count === 1 ? '' : 's'}</small>` : '',
                    studyCount ? `<small class="calendar-study-tag">${studyCount} quiz/test${studyCount === 1 ? '' : 's'}</small>` : '',
                    eventCount ? `<small class="calendar-personal-tag">${eventCount} event${eventCount === 1 ? '' : 's'}</small>` : ''
                ].join('');
                cells += `<button class="${classes.join(' ')}" data-action="select-calendar-day" data-date="${dateKey}" aria-label="${dateKey}${note ? `, ${this.escapeHTML(note)}` : ''}, ${classCount} classes, ${count} assignments, ${studyCount} quizzes/tests, ${eventCount} events"><span>${day}</span>${indicators}</button>`;
            }
            daysElement.innerHTML = cells;
            const selected = new Date(`${this.selectedCalendarDate}T00:00:00`);
            document.getElementById('calendar-selected-label').textContent =
                selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            const agenda = document.getElementById('calendar-agenda-list');
            const events = assignments.filter(item => item.dueDate === this.selectedCalendarDate);
            const scheduleInfo = this.getScheduleEntries(selected);
            const dayNote = scheduleInfo.note && scheduleInfo.note !== scheduleInfo.pchsSchedule?.title ? `<p class="calendar-day-note-text">${this.escapeHTML(scheduleInfo.note)}</p>` : '';
            const scheduleItems = scheduleInfo.pattern
                ? `<section class="calendar-schedule"><h4>${this.escapeHTML(scheduleInfo.pchsSchedule.title)} · Classes</h4>${dayNote}${scheduleInfo.entries.filter(entry => entry.periodNumber).map(entry => `<p><strong>${this.escapeHTML(entry.period)}:</strong> ${this.escapeHTML(entry.course?.title || 'No class assigned')} <small>${this.escapeHTML(entry.time || '')}${entry.room ? ` · Rm ${this.escapeHTML(entry.room)}` : ''}</small></p>`).join('') || '<p>No class periods listed.</p>'}</section>`
                : `<section class="calendar-schedule"><h4>${this.escapeHTML(scheduleInfo.pchsSchedule?.title || 'Schedule')}</h4>${dayNote}<p>No classes are scheduled.</p></section>`;
            const recommendations = this.getStudyRecommendations();
            const renderItems = items => items.map(item => {
                const course = (AppState.get('courses') || []).find(entry => entry.code === item.courseCode);
                const recommendation = recommendations.find(entry => entry.id === item.id);
                const studyNote = recommendation ? `<small>Suggested session: ${recommendation.sessionMinutes} min · ${this.escapeHTML(recommendation.studyMethod)}</small><button type="button" class="secondary-btn" data-action="log-study" data-id="${this.escapeHTML(item.id)}">Log study</button>${this.assessmentStudyButton(item)}` : '';
                return `<article class="calendar-event"><div><strong>${this.escapeHTML(item.title)}</strong><span>${this.escapeHTML(course ? course.title : 'No class')} · ${this.escapeHTML(item.kind || 'assignment')}</span>${studyNote}</div><button class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">Edit</button></article>`;
            }).join('');
            const assessment = item => ['quiz', 'test'].includes(String(item.kind).toLowerCase());
            const personal = (AppState.get('calendarEvents') || []).filter(item => item.date === this.selectedCalendarDate)
                .sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title));
            agenda.innerHTML = `${scheduleItems}
                <section class="calendar-agenda-group"><h4 class="calendar-assignment-tag">Assignments due</h4>${renderItems(events.filter(item => !assessment(item))) || '<p class="settings-hint">No assignments due.</p>'}</section>
                <section class="calendar-agenda-group"><h4 class="calendar-study-tag">Tests &amp; quizzes to study for</h4>${renderItems(events.filter(assessment)) || '<p class="settings-hint">No tests or quizzes on this day.</p>'}</section>
                <section class="calendar-agenda-group"><h4 class="calendar-personal-tag">Your events</h4>${personal.map(item => `<article class="calendar-event"><div><strong>${this.escapeHTML(item.title)}</strong><span>${this.escapeHTML(item.time || 'All day')}</span>${item.notes ? `<small>${this.escapeHTML(item.notes)}</small>` : ''}</div><button type="button" class="secondary-btn" data-action="edit-calendar-event" data-id="${this.escapeHTML(item.id)}">Edit</button></article>`).join('') || '<p class="settings-hint">No events. Add a club meeting, reminder or study block.</p>'}</section>`;
        }

        openCalendarEvent(id = '') {
            const item = (AppState.get('calendarEvents') || []).find(event => event.id === id);
            if (id && !item) throw new Error('This calendar event no longer exists.');
            document.getElementById('calendar-event-form').reset();
            document.getElementById('calendar-event-id').value = item?.id || '';
            document.getElementById('calendar-event-title').value = item?.title || '';
            document.getElementById('calendar-event-date').value = item?.date || this.selectedCalendarDate || localDateKey(new Date());
            document.getElementById('calendar-event-time').value = item?.time || '';
            document.getElementById('calendar-event-notes').value = item?.notes || '';
            document.getElementById('delete-calendar-event-btn').classList.toggle('hidden', !item);
            this.openModal('calendar-event-modal');
        }

        saveCalendarEvent() {
            const id = document.getElementById('calendar-event-id').value;
            const title = document.getElementById('calendar-event-title').value.trim();
            const date = document.getElementById('calendar-event-date').value;
            const time = document.getElementById('calendar-event-time').value;
            const notes = document.getElementById('calendar-event-notes').value.trim();
            const parsed = new Date(`${date}T00:00:00`);
            if (!title || title.length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(date)
                || !Number.isFinite(parsed.getTime()) || localDateKey(parsed) !== date
                || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || notes.length > 2000) {
                throw new Error('Enter an event title (up to 120 characters), a valid date and time, and notes up to 2,000 characters.');
            }
            const previous = AppState.get('calendarEvents') || [];
            if (id && !previous.some(item => item.id === id)) throw new Error('This event was removed. Close and reopen the editor.');
            const item = { id: id || `event_${window.crypto.randomUUID()}`, title, date, time, notes };
            const next = id ? previous.map(event => event.id === id ? item : event) : [...previous, item];
            this.saveCalendarEvents(next);
            this.selectedCalendarDate = date;
            this.calendarDate = parsed;
            this.renderCalendar();
        }

        saveCalendarEvents(events) {
            const previous = AppState.get('calendarEvents');
            try {
                AppState.set('calendarEvents', events);
            } catch (error) {
                AppState.state.calendarEvents = previous;
                throw error;
            }
        }

        getStudyRecommendations() {
            const courses = AppState.get('courses') || [];
            const assignments = AppState.get('assignments') || [];
            const profile = AppState.get('profile') || {};
            const targetGpa = Number(profile.targetGpa || 0);
            const trackedGpa = this.calculateTrackedGPA(courses);
            const currentWeightedGpa = Number(trackedGpa.weighted);
            const gpaGap = Number(trackedGpa.totalCredits) > 0 && Number.isFinite(currentWeightedGpa) && targetGpa > 0
                ? Math.max(0, targetGpa - currentWeightedGpa) : 0;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const history = AppState.get('studyHistory') || [];
            // Only quizzes and tests need studying; homework is just done and turned in
            const recommended = assignments.filter(item => item.status !== 'completed' && !this.isGradedItem(item) && ['quiz', 'test'].includes(String(item.kind || 'assignment').toLowerCase())).map(item => {
                const course = courses.find(entry => entry.code === item.courseCode);
                const grade = course ? this.calculateCourseGrade(course) : null;
                const target = course ? this.effectiveCourseTarget(course, targetGpa) : NaN;
                const targetFromGpa = course && !this.hasCourseTarget(course) && Number.isFinite(target);
                const gradeGap = Number.isFinite(grade) && Number.isFinite(target) ? Math.max(0, target - grade) : 0;
                const due = item.dueDate ? new Date(`${item.dueDate}T00:00:00`) : null;
                const daysUntilDue = due && Number.isFinite(due.getTime()) ? Math.round((due - today) / 86400000) : 7;
                const urgency = daysUntilDue < 0 ? 2 : 1 / Math.max(1, daysUntilDue + 1);
                const importance = Math.min(5, Math.max(1, Number(item.importance || 3)));
                const kind = String(item.kind || 'assignment').toLowerCase();
                const title = String(item.title || '').toLowerCase();
                let minimumMinutes = kind === 'test' ? 90 : kind === 'quiz' ? 45 : 30;
                if (/\b(essay|paper|lab|project|presentation)\b/.test(title)) minimumMinutes = Math.max(minimumMinutes, 90);
                if (/\b(reading|chapter|vocabulary)\b/.test(title)) minimumMinutes = Math.max(minimumMinutes, 45);
                let totalStudyMinutes = Math.max(minimumMinutes, Number(item.estimatedMinutes || 30));
                if (importance >= 4) totalStudyMinutes += 15;
                if (gradeGap >= 5) totalStudyMinutes += 15;
                if (gpaGap >= 0.25) totalStudyMinutes += 15;
                const taskSessions = history.filter(session => session.assignmentId === item.id)
                    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
                const minutesStudied = Math.round(taskSessions.reduce((sum, session) =>
                    sum + Math.max(0, Number(session.durationSec || 0)), 0) / 60);
                const recentRatings = taskSessions.slice(0, 3).map(session => Number(session.effectiveness)).filter(rating => Number.isFinite(rating) && rating >= 1 && rating <= 5);
                const averageEffectiveness = recentRatings.length
                    ? recentRatings.reduce((sum, rating) => sum + rating, 0) / recentRatings.length
                    : null;
                if (averageEffectiveness !== null && averageEffectiveness <= 2) totalStudyMinutes += 15;
                totalStudyMinutes = Math.min(240, Math.round(totalStudyMinutes / 5) * 5);
                const remainingStudyMinutes = Math.max(15, totalStudyMinutes - minutesStudied);
                const planningDays = daysUntilDue <= 0 ? 1 : Math.min(3, daysUntilDue);
                const sessionMinutes = Math.min(remainingStudyMinutes, 60, Math.max(15, Math.ceil(remainingStudyMinutes / planningDays / 5) * 5));
                const sessionCount = Math.ceil(remainingStudyMinutes / sessionMinutes);
                const size = Math.sqrt(remainingStudyMinutes / 30);
                const assessmentBoost = kind === 'test' ? 1.5 : kind === 'quiz' ? 1.25 : 1;
                const studyCoverage = Math.min(1, minutesStudied / totalStudyMinutes);
                const effectivenessFactor = averageEffectiveness === null ? 1 : averageEffectiveness <= 2 ? 1.2 : averageEffectiveness >= 4 ? 0.9 : 1;
                const score = urgency * importance * size * assessmentBoost * (1 + gradeGap / 20) * (1 + gpaGap / 2) *
                    Math.max(0.45, 1 - studyCoverage * 0.55) * effectivenessFactor;
                let reason = daysUntilDue < 0 ? 'Past due; finish or reschedule it first.' :
                    daysUntilDue <= 1 ? 'Due very soon; give it priority today.' :
                    `${daysUntilDue} days until due; split the work into ${sessionCount} focused session${sessionCount === 1 ? '' : 's'}.`;
                if (minutesStudied) reason += ` You have logged ${minutesStudied} min; about ${remainingStudyMinutes} min remain in the estimate.`;
                if (gradeGap > 0) reason += ` ${gradeGap.toFixed(2)} points below the ${target.toFixed(2)}% ${targetFromGpa ? `needed in this class for your ${targetGpa.toFixed(2)} GPA goal` : 'class target'}.`;
                if (gpaGap > 0) reason += ` Your current weighted GPA (${currentWeightedGpa.toFixed(2)}) is below your ${targetGpa.toFixed(2)} target.`;
                const deckLinks = this.decksForAssessment(item);
                const flashcardMinutes = Math.round(taskSessions.filter(session => session.source === 'flashcards')
                    .reduce((sum, session) => sum + Math.max(0, Number(session.durationSec || 0)), 0) / 60);
                const studyMethodKey = this.getStudyMethodKey(item, taskSessions);
                const studyMethod = this.studyMethodLabel(studyMethodKey);
                return {
                    ...item,
                    courseCode: course ? course.code : item.courseCode,
                    courseTitle: course ? course.title : 'Class not found',
                    reason,
                    score,
                    totalStudyMinutes,
                    remainingStudyMinutes,
                    minutesStudied,
                    sessionMinutes,
                    sessionCount,
                    studyMethod,
                    studyMethodKey,
                    averageEffectiveness,
                    deckLinks,
                    flashcardMinutes,
                    grade,
                    target
                };
            }).sort((a, b) => b.score - a.score);
            return recommended;
        }

        hasCourseTarget(course) {
            return course && course.targetPct !== null && course.targetPct !== undefined && course.targetPct !== '' && Number.isFinite(Number(course.targetPct));
        }

        /** The class's own target %, or the % this class needs in the cheapest plan that reaches the target GPA. */
        effectiveCourseTarget(course, targetGpa = Number((AppState.get('profile') || {}).targetGpa || 0)) {
            if (this.hasCourseTarget(course)) return Number(course.targetPct);
            if (!(targetGpa > 0)) return NaN;
            const courses = AppState.get('courses') || [];
            const plan = this.gpaTargetPlan(targetGpa, 'weighted', courses.some(item => item.code === course.code) ? courses : [course]);
            const entry = plan.byCode.get(course.code);
            return entry ? Number(entry.minPct) : NaN;
        }

        /** Minimize the sum of class target percentages while meeting the credit-weighted GPA goal. */
        gpaTargetPlan(targetGpa, mode = 'weighted', courses = AppState.get('courses') || []) {
            const scale = (window.studbudGradeScale?.() || window.PARKWAY_GRADE_SCALE || []).slice().sort((a, b) => a.minPct - b.minPct);
            const points = (item, course) => Number(mode === 'weighted' && course.isWeighted ? item.weighted : item.unweighted);
            const rows = courses.map(course => {
                const ladder = [];
                scale.forEach(item => {
                    if (!ladder.length || points(item, course) > points(ladder[ladder.length - 1], course)) ladder.push(item);
                });
                return { course, ladder, credits: Math.max(0, Number(course.credits) || 0) };
            });
            const prior = this.priorGPA();
            const priorCredits = prior ? prior.credits : 0;
            const totalCredits = rows.reduce((sum, row) => sum + row.credits, 0) + priorCredits;
            let plans = [{ earned: prior ? Math.round(prior[mode === 'weighted' ? 'weighted' : 'unweighted'] * priorCredits * 1e9) / 1e9 : 0, cost: 0, grades: [] }];
            for (const row of rows) {
                const options = row.credits > 0 ? row.ladder : row.ladder.slice(0, 1);
                const next = new Map();
                for (const plan of plans) for (const grade of options) {
                    const earned = Math.round((plan.earned + points(grade, row.course) * row.credits) * 1e9) / 1e9;
                    const cost = plan.cost + grade.minPct;
                    if (!next.has(earned) || cost < next.get(earned).cost) next.set(earned, { earned, cost, grades: [...plan.grades, grade] });
                }
                let cheapest = Infinity;
                plans = [...next.values()].sort((a, b) => b.earned - a.earned).filter(plan => {
                    if (plan.cost >= cheapest) return false;
                    cheapest = plan.cost;
                    return true;
                });
            }
            const reachablePlans = plans.filter(plan => plan.earned >= targetGpa * totalCredits - 1e-9);
            const best = reachablePlans.sort((a, b) => a.cost - b.cost || a.earned - b.earned)[0] || plans[0];
            const byCode = new Map(rows.map((row, i) => [row.course.code, best.grades[i]]));
            return { byCode, gpa: totalCredits > 0 ? best.earned / totalCredits : 0, reachable: totalCredits - priorCredits > 0 && reachablePlans.length > 0 };
        }

        /** Decks linked to a quiz/test first, then decks tagged with the same class. */
        decksForAssessment(item) {
            const decks = (AppState.get('flashcards') || []).filter(deck => (deck.cards || []).length);
            const exact = decks.filter(deck => String(this.deckLinkInfo(deck).assessment?.id || '') === String(item.id));
            const sameClass = decks.filter(deck => !exact.includes(deck) && !this.deckLinkInfo(deck).assessment && item.courseCode && this.deckLinkInfo(deck).courseCode === item.courseCode);
            return [...exact.map(deck => ({ deck, exact: true })), ...sameClass.map(deck => ({ deck, exact: false }))];
        }

        getStudyMethodKey(item, history = []) {
            const kind = String(item.kind || 'assignment').toLowerCase();
            const title = String(item.title || '').toLowerCase();
            let recommended = kind === 'test' ? 'practice' : kind === 'quiz' ? 'retrieval' :
                /\b(essay|paper|writing)\b/.test(title) ? 'outline' :
                /\b(lab|project|presentation)\b/.test(title) ? 'checklist' :
                /\b(problem|set|math|equation|calculus|physics)\b/.test(title) ? 'practice' :
                /\b(reading|chapter|vocabulary)\b/.test(title) ? 'chunk' : 'checklist';
            const lastSession = history[0];
            if (lastSession?.method && Number(lastSession.effectiveness) >= 4) recommended = lastSession.method;
            else if (lastSession?.method && Number(lastSession.effectiveness) >= 1 && Number(lastSession.effectiveness) <= 2) {
                const alternatives = { practice: 'explain', retrieval: 'flashcards', outline: 'explain', checklist: 'explain', chunk: 'retrieval', flashcards: 'explain', explain: 'practice' };
                recommended = alternatives[recommended] || recommended;
            }
            return recommended;
        }

        studyMethodLabel(method) {
            return ({
                retrieval: 'Closed-book recall: quiz yourself, check answers, then re-test missed ideas.',
                practice: 'Practice: attempt problems or timed questions without notes, then correct and redo misses.',
                explain: 'Teach-back: explain the idea aloud in your own words, find gaps, and check them.',
                flashcards: 'Spaced review: use flashcards or short retrieval rounds; repeat missed cards later.',
                outline: 'Plan and draft: follow the rubric, outline key evidence, draft one section, then revise.',
                chunk: 'Chunk and summarize: read a short section, summarize it from memory, and note key terms.',
                checklist: 'Checklist: split the rubric into deliverables, complete one step, and verify requirements.'
            })[method] || 'Use active recall, then check and correct your work.';
        }

        openStudyLog(assignmentId) {
            const assignment = (AppState.get('assignments') || []).find(item => item.id === assignmentId);
            if (!assignment) throw new Error('This assignment is no longer available.');
            const recommendation = this.getStudyRecommendations().find(item => item.id === assignmentId);
            document.getElementById('study-log-form').reset();
            document.getElementById('study-log-assignment-id').value = assignmentId;
            document.getElementById('study-log-minutes').value = recommendation?.sessionMinutes || 25;
            document.getElementById('study-log-method').value = recommendation?.studyMethodKey || 'retrieval';
            this.openModal('study-log-modal');
        }

        async saveStudyLog() {
            const assignmentId = document.getElementById('study-log-assignment-id').value;
            const assignment = (AppState.get('assignments') || []).find(item => item.id === assignmentId);
            if (!assignment) throw new Error('This assignment is no longer available.');
            const minutes = Number(document.getElementById('study-log-minutes').value);
            const effectiveness = Number(document.getElementById('study-log-effectiveness').value);
            if (!Number.isInteger(minutes) || minutes < 1 || minutes > 360 || !Number.isInteger(effectiveness) || effectiveness < 1 || effectiveness > 5) {
                throw new Error('Enter a study time from 1 to 360 minutes and an effectiveness rating from 1 to 5.');
            }
            const method = document.getElementById('study-log-method').value;
            await AppState.recordStudySession({
                id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                assignmentId,
                courseCode: assignment.courseCode,
                title: assignment.title,
                durationSec: minutes * 60,
                method,
                methodLabel: this.studyMethodLabel(method),
                effectiveness,
                notes: document.getElementById('study-log-notes').value.trim(),
                source: 'assignment'
            });
            this.closeModal();
        }

        renderStudyProgress() {
            const summary = document.getElementById('study-progress-summary');
            const weekSummary = document.getElementById('study-week-summary');
            const list = document.getElementById('study-history-list');
            if (!summary || !weekSummary || !list) return;
            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
            weekStart.setHours(0, 0, 0, 0);
            const sessions = (AppState.get('studyHistory') || []).filter(session => Number(session.durationSec) > 0)
                .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
            const thisWeek = sessions.filter(session => new Date(session.timestamp) >= weekStart);
            const minutes = Math.round(thisWeek.reduce((sum, session) => sum + Number(session.durationSec || 0), 0) / 60);
            const rated = thisWeek.map(session => Number(session.effectiveness)).filter(rating => Number.isFinite(rating) && rating > 0);
            const average = rated.length ? (rated.reduce((sum, rating) => sum + rating, 0) / rated.length).toFixed(2) : '—';
            const plan = this.getStudyRecommendations().slice(0, 5);
            const plannedMinutes = plan.reduce((sum, item) => sum + item.sessionMinutes, 0);
            weekSummary.textContent = `This week: ${thisWeek.length} session${thisWeek.length === 1 ? '' : 's'} · ${minutes} min logged · average effectiveness ${average}/5.`;
            summary.innerHTML = `<div><strong>${minutes}</strong><span>minutes studied this week</span></div><div><strong>${plannedMinutes}</strong><span>minutes in your next study plan</span></div><div><strong>${average}</strong><span>average effectiveness</span></div>`;
            list.innerHTML = sessions.length ? `<h4>Recent logged sessions</h4>${sessions.slice(0, 4).map(session => {
                const rated = Number(session.effectiveness) > 0 ? `Effectiveness ${Number(session.effectiveness)}/5` : 'Not rated';
                const game = session.gameSummary;
                const accuracy = game?.answered ? Math.round(game.correct / game.answered * 100) : 0;
                const standings = game?.standings || [];
                const detail = game ? `<details class="saved-game-summary"><summary>${session.source === 'solo' ? 'Singleplayer game' : 'Game'} summary · ${game.answered ? `${accuracy}% correct` : 'No answers submitted'} · ${Number(game.answered) || 0} answered</summary><p>${Number(game.correct) || 0} correct · ${Math.max(0, Number(game.answered || 0) - Number(game.correct || 0))} incorrect · ${(game.questions || []).filter(question => question.correct === null).length} skipped</p>${standings.length ? `<ol>${standings.map(row => `<li>${this.escapeHTML(row.name)} · ${['crypto', 'market'].includes(game.mode) ? `$${this.formatNumber(game.objectiveBased ? row.goal : row.score)}` : `${this.formatNumber(game.objectiveBased ? row.goal : row.score)} ${this.escapeHTML(game.objectiveUnit || 'pts')}`}</li>`).join('')}</ol>` : ''}${window.StudBudArcade.util.questionHistoryMarkup(game.questions || [])}${game.studySet ? this.studySetMarkup(game.studySet) : ''}</details>` : '';
                return `<article class="study-history-item"><div><strong>${this.escapeHTML(session.title || 'Study session')}</strong><span>${this.formatStudyDuration(session.durationSec)} · ${this.escapeHTML(session.methodLabel || this.studyMethodLabel(session.method || 'retrieval'))}</span><small>${new Date(session.timestamp).toLocaleDateString()} · ${rated}${session.notes ? ` · ${this.escapeHTML(session.notes)}` : ''}</small></div>${detail}</article>`;
            }).join('')}` : '<p class="empty-state">Log a study session from a recommendation to help tune your future plan.</p>';
        }

        assignmentPriority(item, courses = AppState.get('courses') || []) {
            const course = courses.find(course => course.code === item.courseCode);
            return window.PlannerEngine.calculatePriorityScore(item, course ? { currentPct: this.calculateCourseGrade(course) } : null);
        }

        renderAssignments() {
            const assignments = AppState.get('assignments') || [];
            const courses = AppState.get('courses') || [];
            const body = document.getElementById('assignment-body');
            const search = document.getElementById('assignment-search');
            const courseFilter = document.getElementById('assignment-course-filter');
            const statusFilter = document.getElementById('assignment-status-filter');
            const resultCount = document.getElementById('assignment-result-count');
            if (courseFilter) {
                const selectedCourse = courseFilter.value;
                courseFilter.innerHTML = '<option value="">All classes</option>' + courses.map(course =>
                    `<option value="${this.escapeHTML(course.code)}">${this.escapeHTML(course.title)}</option>`
                ).join('');
                if (courses.some(course => course.code === selectedCourse)) courseFilter.value = selectedCourse;
            }
            const query = (search?.value || '').trim().toLocaleLowerCase();
            const selectedCourse = courseFilter?.value || '';
            const selectedStatus = statusFilter?.value || 'all';
            const today = localDateKey(new Date());
            const visibleAssignments = assignments.filter(item => {
                const course = courses.find(entry => entry.code === item.courseCode);
                const matchesSearch = !query || `${item.title} ${item.kind || ''} ${course?.title || item.courseCode || ''}`.toLocaleLowerCase().includes(query);
                const matchesCourse = !selectedCourse || item.courseCode === selectedCourse;
                const state = this.assignmentState(item);
                const matchesStatus = selectedStatus === 'all' || state === selectedStatus
                    || (selectedStatus === 'todo' && state === 'overdue');
                return matchesSearch && matchesCourse && matchesStatus;
            }).sort((left, right) =>
                (left.dueDate || '9999-12-31').localeCompare(right.dueDate || '9999-12-31')
            );
            const assessmentBody = document.getElementById('planner-assessment-body');
            const isAssessment = item => ['quiz', 'test'].includes(String(item.kind || '').toLowerCase());
            const renderRows = items => items.map(item => {
                    const course = courses.find(entry => entry.code === item.courseCode);
                    const status = item.status || 'pending';
                    const graded = this.isGradedItem(item);
                    return `<tr class="assignment-row is-${this.assignmentState(item)}">
                        <td>${this.assignmentStatusControl(item)}</td>
                        <td>${this.escapeHTML(item.title)}</td>
                        <td>${this.escapeHTML(course ? course.title : item.courseCode || 'Unassigned')}</td>
                        <td>${graded ? `${this.formatNumber(item.pointsEarned || 0)} / ${this.formatNumber(item.maxPoints || 0)}` : this.escapeHTML(item.dueDate || 'No due date')}</td>
                        <td>${graded || status === 'completed' ? '—' : `About ${this.plannerTaskMinutes(item)} min`}</td>
                        <td class="actions">
                            ${this.assessmentStudyButton(item)}
                            <button class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">Edit</button>
                            <button class="danger-btn" data-action="delete-assignment" data-id="${this.escapeHTML(item.id)}">Delete</button>
                        </td>
                    </tr>`;
                }).join('');
            if (body) body.innerHTML = renderRows(visibleAssignments.filter(item => !isAssessment(item)))
                || '<tr><td colspan="6" class="empty-state">No assignments match these filters.</td></tr>';
            if (assessmentBody) assessmentBody.innerHTML = renderRows(visibleAssignments.filter(isAssessment))
                || '<tr><td colspan="6" class="empty-state">No quizzes or tests match these filters.</td></tr>';
            if (resultCount) resultCount.textContent = `${visibleAssignments.length} of ${assignments.length} work item${assignments.length === 1 ? '' : 's'} across both sections`;
            this.renderStudyRecommendations('planner-study-list');
            const summary = document.getElementById('assignment-status-summary');
            if (summary) {
                const counts = { todo: 0, overdue: 0, awaiting: 0, graded: 0 };
                assignments.forEach(item => { counts[this.assignmentState(item)] += 1; });
                const chip = (state, label, icon) => `<button type="button" class="status-summary-chip is-${state}${selectedStatus === state ? ' selected' : ''}" data-action="assignment-status-filter" data-status="${state}" aria-pressed="${selectedStatus === state}"><i class="fas ${icon}" aria-hidden="true"></i><strong>${counts[state]}</strong><span>${label}</span></button>`;
                summary.innerHTML = chip('todo', 'To do', 'fa-clock') + chip('overdue', 'Overdue', 'fa-triangle-exclamation')
                    + chip('awaiting', 'Waiting for grade', 'fa-hourglass-half') + chip('graded', 'Graded', 'fa-circle-check');
            }

            const priorityList = document.getElementById('priority-task-list');
            if (priorityList) {
                const upcoming = assignments.filter(item => item.status !== 'completed' && !this.isGradedItem(item))
                    .sort((a, b) => this.assignmentPriority(b, courses).score - this.assignmentPriority(a, courses).score)
                    .slice(0, 3);
                priorityList.classList.toggle('empty-list', upcoming.length === 0);
                priorityList.innerHTML = upcoming.length ? upcoming.map(item =>
                    `<li>${this.escapeHTML(item.title)} <small>${this.escapeHTML(item.dueDate || '')}</small></li>`
                ).join('') : '<li class="empty-state">No upcoming tasks.</li>';
            }

            const openWork = assignments.filter(item => !isAssessment(item) && item.status !== 'completed' && !this.isGradedItem(item))
                .map(item => ({ item, priority: this.assignmentPriority(item, courses) }))
                .sort((a, b) => b.priority.score - a.priority.score);
            const nextTask = document.getElementById('planner-next-task');
            if (nextTask) {
                const total = openWork.reduce((sum, { item }) => sum + this.plannerTaskMinutes(item), 0);
                const urgent = openWork.filter(({ item }) => item.dueDate && item.dueDate.slice(0, 10) <= today).length;
                const next = openWork[0]?.item;
                const course = next && courses.find(entry => entry.code === next.courseCode);
                nextTask.innerHTML = next ? `<p class="planner-workload"><strong>${openWork.length} to do</strong> · about ${total} min estimated total · ${urgent} due today or overdue</p>
                    <article class="planner-next-card"><span class="status-pill is-todo">Start here · about ${this.plannerTaskMinutes(next)} min</span>
                    <h3>${this.escapeHTML(next.title)}</h3><p>${this.escapeHTML(course?.title || next.courseCode || 'Unassigned')} · ${this.escapeHTML(this.dueLabel(next.dueDate).text)}</p>
                    <p><strong>Why this task:</strong> ${this.escapeHTML(this.plannerTaskReason(next))}</p>
                    <button type="button" class="primary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(next.id)}">Open task</button>
                    ${this.assignmentStatusControl(next)}</article>` : '<p class="empty-state">You’re caught up! No open tasks. Add an assignment when you have new work.</p>';
            }
            const matrixGroups = [['quad-1-list', 'doFirst'], ['quad-2-list', 'schedule'], ['quad-3-list', 'quickFinish'], ['quad-4-list', 'lowPriority']];
            matrixGroups.forEach(([id, quadrant]) => {
                const list = document.getElementById(id);
                if (!list) return;
                const matches = openWork.filter(({ item, priority }) => window.PlannerEngine.getEisenhowerQuadrant(priority, Number(item.estimatedMinutes) || 30).id === quadrant);
                list.innerHTML = matches.map(({ item }) => `<li><button type="button" class="text-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">${this.escapeHTML(item.title)}</button><small>${this.escapeHTML(this.dueLabel(item.dueDate).text)} · about ${this.plannerTaskMinutes(item)} min</small><small>${this.escapeHTML(this.plannerTaskReason(item))}</small></li>`).join('') || '<li class="empty-state">No open tasks here.</li>';
            });
        }

        plannerTaskMinutes(item) {
            const minutes = Number(item.estimatedMinutes);
            return Number.isFinite(minutes) && minutes > 0 ? Math.ceil(minutes) : 30;
        }

        plannerTaskReason(item) {
            const today = localDateKey(new Date());
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const due = String(item.dueDate || '').slice(0, 10);
            if (due && due < today) return 'Overdue — check what still needs to be finished or turned in.';
            if (due === today) return 'Due today — finish or turn it in before moving on.';
            if (due === localDateKey(tomorrow)) return 'Due tomorrow — make time for it today.';
            if (['high', 'critical'].includes(item.priority)) return 'Marked high priority; due date and class grade also affect its order.';
            if (this.plannerTaskMinutes(item) <= 15) return 'A short task you can fit into a small break.';
            return due ? 'Plan a work block before its due date.' : 'No due date yet — add one to help plan when to work.';
        }

        deckStudyCount(deck) {
            return (deck.cards || []).filter(card => card && !card.suspended).length;
        }

        deckSortMode() {
            const saved = localStorage.getItem('studbud-deck-sort');
            return ['custom', 'recent', 'test', 'name', 'weakest'].includes(saved) ? saved : 'custom';
        }

        deckUpcomingTestAt(deck) {
            const assessment = this.deckLinkInfo(deck).assessment;
            if (!assessment?.dueDate || assessment.status === 'completed') return Infinity;
            const at = Date.parse(`${String(assessment.dueDate).slice(0, 10)}T00:00:00`);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            return Number.isFinite(at) && at >= today.getTime() ? at : Infinity;
        }

        deckLastActivity(deck) {
            let latest = Date.parse(deck.studiedAt) || 0;
            for (const card of deck.cards || []) {
                latest = Math.max(latest, Date.parse(card?.lastReviewed) || 0, Date.parse(card?.practiceStats?.lastAnswered) || 0);
            }
            return latest;
        }

        /** Pinned decks first, then the chosen sort; ties (and "custom") fall back to the saved drag order, then creation order. */
        orderedDecks(decks = AppState.get('flashcards') || [], mode = this.deckSortMode()) {
            const position = new Map(decks.map((deck, index) => [deck.id, index]));
            const custom = deck => Number.isFinite(deck.sortIndex) ? deck.sortIndex : 1e6 + position.get(deck.id);
            const keys = new Map(decks.map(deck => [deck.id,
                mode === 'recent' ? -this.deckLastActivity(deck)
                    : mode === 'test' ? this.deckUpcomingTestAt(deck)
                    : mode === 'weakest' ? (deck.cards || []).length ? this.deckMastery(deck).pct : Infinity
                    : 0]));
            const diff = (a, b) => {
                const x = keys.get(a.id), y = keys.get(b.id);
                return x === y ? 0 : x < y ? -1 : 1;
            };
            return [...decks].sort((a, b) => (Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
                || (mode === 'name' ? String(a.title || '').localeCompare(String(b.title || ''), undefined, { numeric: true, sensitivity: 'base' }) : diff(a, b))
                || custom(a) - custom(b));
        }

        /** Moves a deck before/after another in the saved custom order; crossing into the pinned group pins it (and vice versa). */
        async moveDeck(id, targetId, place = 'before') {
            if (id === targetId) return;
            const ordered = this.orderedDecks();
            const moving = ordered.find(deck => deck.id === id), target = ordered.find(deck => deck.id === targetId);
            if (!moving || !target) return;
            const rest = ordered.filter(deck => deck !== moving);
            rest.splice(rest.indexOf(target) + (place === 'after' ? 1 : 0), 0, moving);
            const patches = new Map();
            rest.forEach((deck, sortIndex) => {
                const patch = {};
                if (deck.sortIndex !== sortIndex) patch.sortIndex = sortIndex;
                if (deck === moving && Boolean(deck.pinned) !== Boolean(target.pinned)) patch.pinned = Boolean(target.pinned);
                if (Object.keys(patch).length) patches.set(deck.id, patch);
            });
            localStorage.setItem('studbud-deck-sort', 'custom');
            await AppState.patchFlashcardDecks(patches);
        }

        visibleDecks() {
            const search = (document.getElementById('my-deck-search')?.value || '').trim().toLowerCase();
            return this.orderedDecks().filter(deck => !search || `${deck.title} ${this.deckLinkInfo(deck).course?.title || ''}`.toLowerCase().includes(search));
        }

        async stepDeck(id, direction) {
            const visible = this.visibleDecks();
            const index = visible.findIndex(deck => deck.id === id);
            const neighbor = visible[index + direction];
            if (index < 0 || !neighbor || Boolean(neighbor.pinned) !== Boolean(visible[index].pinned)) return;
            await this.moveDeck(id, neighbor.id, direction < 0 ? 'before' : 'after');
            document.querySelector(`#deck-grid [data-action="deck-move-${direction < 0 ? 'up' : 'down'}"][data-id="${CSS.escape(id)}"]`)?.focus();
        }

        renderDecks() {
            // Sync and author updates must not replace the nodes holding an active pointer.
            if (this.deckDragActive) {
                this.deckRenderPending = true;
                return;
            }
            const grid = document.getElementById('deck-grid');
            if (!grid) return;
            const previousGridBox = grid.getBoundingClientRect();
            const previousPositions = new Map([...grid.querySelectorAll('.deck-card')].map(card => {
                const box = card.getBoundingClientRect();
                return [card.dataset.deckId, { left: box.left - previousGridBox.left, top: box.top - previousGridBox.top }];
            }));
            const search = (document.getElementById('my-deck-search')?.value || '').trim().toLowerCase();
            const decks = this.visibleDecks();
            const sortSelect = document.getElementById('my-deck-sort');
            if (sortSelect) sortSelect.value = this.deckSortMode();
            const reordering = Boolean(this.deckReorderMode);
            grid.classList.toggle('is-reordering', reordering);
            const reorderBtn = document.getElementById('my-deck-reorder');
            if (reorderBtn) {
                reorderBtn.setAttribute('aria-pressed', String(reordering));
                reorderBtn.innerHTML = reordering ? '<i class="fas fa-check"></i> Done' : '<i class="fas fa-arrows-up-down"></i> Reorder';
            }
            this.refreshCommunityDeckActions();
            const myId = window.StudBudCloud?.user?.id;
            grid.innerHTML = decks.length ? decks.map((deck, index) => {
                const studyCount = this.deckStudyCount(deck);
                const id = this.escapeHTML(deck.id);
                const cardCount = (deck.cards || []).length;
                const mastery = this.deckMastery(deck);
                // Sets added from the community belong to their author: credit them and don't allow reposting.
                const borrowed = Boolean((deck.communitySourceId && deck.communitySourceOwnerId && deck.communitySourceOwnerId !== myId) || deck.classDeckId);
                const author = deck.classDeckId
                    ? `<small class="deck-author teacher-set"><i class="fas fa-chalkboard-user"></i> Class set from ${this.escapeHTML(deck.communitySourceAuthor || 'your teacher')}</small>`
                    : borrowed
                    ? `<small class="deck-author">by <button type="button" class="link-btn" data-action="view-profile" data-id="${this.escapeHTML(deck.communitySourceOwnerId)}">${this.escapeHTML(deck.communitySourceAuthor || 'another student')}</button> ${this.accountTagMarkup(deck.communitySourceAuthor)}</small>`
                    : deck.communityPublished ? '<small class="deck-author">by you · shared</small>' : '';
                const share = borrowed
                    ? '<button class="deck-menu-item" type="button" role="menuitem" disabled title="Sets added from other students can\'t be reposted"><i class="fas fa-lock"></i> Not yours to share</button>'
                    : deck.communityPublished ? `<button class="deck-menu-item" type="button" role="menuitem" data-action="unpublish-community-deck" data-id="${this.escapeHTML(deck.id)}"><i class="fas fa-eye-slash"></i> Stop sharing</button>`
                        : `<button class="deck-menu-item" type="button" role="menuitem" data-action="publish-community-deck" data-id="${this.escapeHTML(deck.id)}"><i class="fas fa-users"></i> Share with community</button>`;
                const link = this.deckLinkInfo(deck);
                const tags = link.course || link.assessment ? `<div class="deck-tags">
                        ${link.course ? `<span class="deck-chip" title="Shown publicly if you share this set"><i class="fas fa-book"></i> ${this.escapeHTML(link.course.title || link.course.code)}</span>` : ''}
                        ${link.assessment ? `<span class="deck-chip private" title="Only you can see this"><i class="fas fa-lock"></i> ${this.escapeHTML(this.deckAssessmentLabel(link.assessment))}</span>` : ''}
                    </div>` : '';
                const linkEditor = `<details class="deck-link-edit">
                        <summary><i class="fas fa-tag"></i> Class &amp; test</summary>
                        <div class="deck-link-fields">
                            <label>Class<select data-deck-link="course" data-id="${this.escapeHTML(deck.id)}">${this.deckCourseOptions(link.courseCode)}</select></label>
                            <label>Test / quiz<select data-deck-link="assessment" data-id="${this.escapeHTML(deck.id)}">${this.deckAssessmentOptions(link.courseCode, deck.assessmentId)}</select></label>
                        </div>
                    </details>`;
                const pinned = Boolean(deck.pinned);
                const title = this.escapeHTML(deck.title);
                const sameGroup = other => other && Boolean(other.pinned) === pinned;
                const pin = `<button type="button" class="deck-pin-btn${pinned ? ' is-pinned' : ''}" data-action="toggle-deck-pin" data-id="${id}" aria-pressed="${pinned}" title="${pinned ? 'Unpin' : 'Pin to the top'}" aria-label="${pinned ? 'Unpin' : 'Pin'} ${title}"><i class="fas fa-thumbtack"></i></button>`;
                const reorder = `<div class="deck-reorder-controls">
                        <button type="button" class="deck-drag-handle" aria-label="Drag to move ${title}" title="Drag to move this set. Use Reorder for keyboard move buttons."><i class="fas fa-grip-vertical" aria-hidden="true"></i> Move</button>
                        ${reordering ? `
                        <button type="button" class="secondary-btn" data-action="deck-move-up" data-id="${id}" ${sameGroup(decks[index - 1]) ? '' : 'disabled'} aria-label="Move ${title} up"><i class="fas fa-arrow-up"></i></button>
                        <button type="button" class="secondary-btn" data-action="deck-move-down" data-id="${id}" ${sameGroup(decks[index + 1]) ? '' : 'disabled'} aria-label="Move ${title} down"><i class="fas fa-arrow-down"></i></button>
                        ` : ''}
                    </div>`;
                return `
                <article class="glass-card deck-card${pinned ? ' is-pinned' : ''}" data-deck-id="${id}">
                    ${reorder}
                    <div class="deck-card-top">
                        <div class="deck-ring" style="--p:${mastery.pct}" title="${mastery.pct}% recall estimate · Written answers and Study/Cram self-ratings count fully; multiple-choice and matching count half · Separate from scheduled reviews"><span>${mastery.pct}%</span></div>
                        <div class="deck-card-title">
                            <h3>${title}</h3>
                            ${author}
                        </div>
                        ${pin}
                        <details class="deck-menu">
                            <summary class="deck-menu-btn" title="More options" aria-label="More options for ${this.escapeHTML(deck.title)}"><i class="fas fa-ellipsis-vertical"></i></summary>
                            <div class="deck-menu-panel" role="menu">
                                <button class="deck-menu-item" type="button" role="menuitem" data-action="add-card" data-id="${id}"><i class="fas fa-plus"></i> Add a card</button>
                                <button class="deck-menu-item" type="button" role="menuitem" data-action="view-weak-cards" data-id="${id}"><i class="fas fa-triangle-exclamation"></i> View weak cards (${mastery.weak})</button>
                                ${mastery.starred ? `<button class="deck-menu-item" type="button" role="menuitem" data-action="cram-starred" data-id="${id}"><i class="fas fa-star"></i> Study starred (${mastery.starred})</button>` : ''}
                                ${share}
                                ${linkEditor}
                                <button class="deck-menu-item is-danger" type="button" role="menuitem" data-action="delete-deck" data-id="${id}"><i class="fas fa-trash"></i> Delete set</button>
                            </div>
                        </details>
                    </div>
                    <div class="deck-meta">
                        <div class="deck-stats">
                            <span><i class="fas fa-clone"></i> ${cardCount} cards</span>
                            ${mastery.starred ? `<span class="is-star" title="Starred cards"><i class="fas fa-star"></i> ${mastery.starred}</span>` : ''}
                            ${mastery.weak ? `<button type="button" class="is-weak" data-action="view-weak-cards" data-id="${id}" aria-label="View ${mastery.weak} weak cards in ${title}" title="View cards under 75% accuracy · Uses the last four answers once available"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> ${mastery.weak} weak</button>` : ''}
                        </div>
                        ${tags}
                    </div>
                    <div class="deck-main-actions">
                        <button class="primary-btn" data-action="study-deck" data-id="${id}" ${studyCount ? '' : 'disabled'}><i class="fas fa-play"></i> Study</button>
                        <button class="secondary-btn" data-action="cram-deck" data-id="${id}" ${cardCount ? '' : 'disabled'} title="Go through every card without changing your learning progress"><i class="fas fa-bolt"></i> Cram</button>
                        <button class="secondary-btn deck-edit-btn" data-action="edit-deck" data-id="${id}" title="Edit set" aria-label="Edit set"><i class="fas fa-pen"></i></button>
                    </div>
                </article>`;
            }).join('') : `<div class="empty-state glass-card full-width">${search ? 'No decks match your search. Try a different title or class.' : 'No decks yet. Create a deck, import flashcards, or browse community decks above.'}</div>`;
            const missingAuthors = decks.filter(deck => deck.communitySourceOwnerId && !deck.communitySourceAuthor);
            if (missingAuthors.length && myId && !this.deckAuthorBackfillStarted) {
                this.deckAuthorBackfillStarted = true;
                window.StudBudCommunityGames?.getAuthorNames(missingAuthors.map(deck => deck.communitySourceOwnerId))
                    .then(async names => {
                        for (const deck of missingAuthors) {
                            if (names[deck.communitySourceOwnerId]) await this.updateSavedDeck(deck.id, { communitySourceAuthor: names[deck.communitySourceOwnerId] });
                        }
                    })
                    .catch(error => console.warn('[NexusApp] Deck authors could not load:', error));
            }
            this.syncDeckLinkSelects(document.getElementById('import-deck-course'), document.getElementById('import-deck-assessment'), false);
            this.renderDeckRecommendations();
            this.animateDeckPositions(grid, previousPositions);
        }

        animateDeckPositions(grid, previousPositions) {
            if (!previousPositions.size || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
            const gridBox = grid.getBoundingClientRect();
            const moves = [...grid.querySelectorAll('.deck-card')].map(card => {
                const previous = previousPositions.get(card.dataset.deckId);
                if (!previous || !card.animate) return null;
                const box = card.getBoundingClientRect();
                return { card, x: previous.left - (box.left - gridBox.left), y: previous.top - (box.top - gridBox.top) };
            }).filter(move => move && (Math.abs(move.x) > 1 || Math.abs(move.y) > 1));
            for (const { card, x, y } of moves) {
                card.animate([
                    { transform: `translate(${x}px, ${y}px)`, opacity: .85 },
                    { transform: 'translate(0, 0)', opacity: 1 }
                ], { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
            }
        }

        bindDeckReorderDrag() {
            const grid = document.getElementById('deck-grid');
            if (!grid || this.deckDragBound) return;
            this.deckDragBound = true;
            let drag = null, frame = null, suppressClickUntil = 0;
            const clearMarkers = () => grid.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
            const cleanup = () => {
                if (!drag) return;
                const previous = drag;
                drag = null;
                this.deckDragActive = false;
                cancelAnimationFrame(frame);
                previous.ghost?.remove();
                previous.card.classList.remove('is-dragging');
                clearMarkers();
                if (grid.hasPointerCapture(previous.pointerId)) grid.releasePointerCapture(previous.pointerId);
                if (this.deckRenderPending) {
                    this.deckRenderPending = false;
                    this.renderDecks();
                }
            };
            this.cancelDeckDrag = cleanup;
            const placeFor = (card, x, y) => {
                const box = card.getBoundingClientRect();
                const wide = getComputedStyle(grid).gridTemplateColumns.split(' ').length > 1;
                return (wide ? x - box.left < box.width / 2 : y - box.top < box.height / 2) ? 'before' : 'after';
            };
            const update = (schedule = true) => {
                if (!drag?.ghost) return;
                const { x, y, offsetX, offsetY, ghost } = drag;
                ghost.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px) rotate(2deg)`;
                const bounds = drag.scroller === document.scrollingElement
                    ? { top: 0, bottom: window.innerHeight } : drag.scroller.getBoundingClientRect();
                const speed = y < bounds.top + 64 ? -12 : y > bounds.bottom - 64 ? 12 : 0;
                if (speed) drag.scroller.scrollTop += speed;
                const gridBox = grid.getBoundingClientRect();
                const nearby = x >= gridBox.left - 48 && x <= gridBox.right + 48
                    && y >= gridBox.top - 48 && y <= gridBox.bottom + 48;
                let target = null, nearest = Infinity;
                if (nearby) {
                    for (const card of grid.querySelectorAll('.deck-card')) {
                        if (card === drag.card) continue;
                        const box = card.getBoundingClientRect();
                        const dx = Math.max(box.left - x, 0, x - box.right);
                        const dy = Math.max(box.top - y, 0, y - box.bottom);
                        const distance = dx * dx + dy * dy;
                        if (distance < nearest) { nearest = distance; target = card; }
                    }
                }
                clearMarkers();
                drag.target = target;
                if (drag.target) {
                    drag.place = placeFor(drag.target, x, y);
                    drag.target.classList.add(`drop-${drag.place}`);
                }
                if (schedule) frame = requestAnimationFrame(() => update());
            };
            grid.addEventListener('pointerdown', event => {
                if (event.button !== 0 || event.isPrimary === false || drag) return;
                const card = event.target.closest?.('.deck-card');
                const handle = event.target.closest?.('.deck-drag-handle');
                if (!card || (!handle && (event.pointerType !== 'mouse' || event.target.closest('button, a, input, select, textarea, summary, details')))) return;
                event.preventDefault();
                const box = card.getBoundingClientRect();
                let scroller = grid.parentElement;
                while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
                drag = { card, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
                    x: event.clientX, y: event.clientY, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top,
                    box, scroller: scroller || document.scrollingElement };
                this.deckDragActive = true;
                grid.setPointerCapture(event.pointerId);
            });
            grid.addEventListener('pointermove', event => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                drag.x = event.clientX; drag.y = event.clientY;
                if (!drag.ghost && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6) return;
                event.preventDefault();
                if (!drag.ghost) {
                    const ghost = drag.card.cloneNode(true);
                    ghost.classList.add('deck-drag-ghost');
                    ghost.setAttribute('aria-hidden', 'true');
                    ghost.inert = true;
                    ghost.style.width = `${drag.box.width}px`;
                    ghost.style.height = `${drag.box.height}px`;
                    document.body.append(ghost);
                    drag.ghost = ghost;
                    drag.card.classList.add('is-dragging');
                    update();
                }
            });
            grid.addEventListener('pointerup', event => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                drag.x = event.clientX; drag.y = event.clientY;
                update(false);
                const { card, target, place, ghost } = drag;
                if (ghost) suppressClickUntil = Date.now() + 400;
                cleanup();
                if (!ghost || !target) return;
                this.moveDeck(card.dataset.deckId, target.dataset.deckId, place)
                    .then(() => {
                        this.renderDecks();
                        grid.querySelector(`[data-deck-id="${CSS.escape(card.dataset.deckId)}"] .deck-drag-handle`)?.focus({ preventScroll: true });
                    })
                    .catch(error => {
                        this.renderDecks();
                        console.error('[NexusApp] Deck order could not be saved:', error);
                        AppState.setSaveStatus(`Deck order could not be saved. ${this.friendlyErrorMessage(error)}`, 'error');
                    });
            });
            const cancelPointer = event => { if (drag?.pointerId === event.pointerId) cleanup(); };
            grid.addEventListener('pointercancel', cancelPointer);
            grid.addEventListener('lostpointercapture', cancelPointer);
            window.addEventListener('blur', cleanup);
            grid.addEventListener('dragstart', event => event.preventDefault());
            grid.addEventListener('click', event => {
                if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); return; }
                const handle = event.target.closest?.('.deck-drag-handle');
                if (handle) {
                    const id = handle.closest('.deck-card').dataset.deckId;
                    this.deckReorderMode = true;
                    localStorage.setItem('studbud-deck-sort', 'custom');
                    this.renderDecks();
                    grid.querySelector(`[data-deck-id="${CSS.escape(id)}"] .deck-reorder-controls .secondary-btn:not(:disabled)`)?.focus();
                }
            }, true);
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && drag) {
                    suppressClickUntil = Date.now() + 400;
                    cleanup();
                }
            });
        }

        bindDeckMenus() {
            if (this.deckMenusBound || typeof document === 'undefined') return;
            this.deckMenusBound = true;
            const closeAll = except => document.querySelectorAll('details.deck-menu[open]').forEach(menu => { if (menu !== except) menu.open = false; });
            document.addEventListener('toggle', event => {
                const menu = event.target;
                if (!menu?.classList?.contains('deck-menu') || !menu.open) return;
                closeAll(menu);
                const panel = menu.querySelector('.deck-menu-panel');
                // flip the panel upward when there isn't room below (last row, short phone screens)
                menu.classList.remove('opens-up');
                const rect = panel?.getBoundingClientRect();
                const bottom = window.visualViewport?.height || window.innerHeight;
                if (rect && rect.bottom > bottom - 8 && rect.height < menu.getBoundingClientRect().top - 8) menu.classList.add('opens-up');
            }, true);
            document.addEventListener('click', event => {
                const menu = event.target.closest?.('details.deck-menu');
                if (!menu) { closeAll(); return; }
                if (event.target.closest('.deck-menu-item[data-action]')) menu.open = false;
            });
            document.addEventListener('keydown', event => {
                if (event.key !== 'Escape') return;
                const open = document.querySelector('details.deck-menu[open]');
                if (!open) return;
                open.open = false;
                open.querySelector('summary')?.focus();
            });
        }

        deckMastery(deck) {
            const cards = (deck.cards || []).filter(Boolean);
            let mastered = 0, starred = 0, weak = 0;
            for (const card of cards) {
                const progress = window.FlashcardTools.cardProgress(card);
                mastered += progress.mastery;
                if (card.starred) starred += 1;
                if (progress.weak) weak += 1;
            }
            return { pct: cards.length ? Math.round(mastered / cards.length * 100) : 0, starred, weak };
        }

        renderDeckRecommendations() {
            const section = document.getElementById('deck-recommendations');
            const list = document.getElementById('deck-recommendation-list');
            if (!section || !list) return;
            const seen = new Set();
            const rows = [];
            this.getStudyRecommendations().forEach(item => {
                (item.deckLinks || []).forEach(({ deck, exact }) => {
                    if (seen.has(deck.id) || rows.length >= 4) return;
                    seen.add(deck.id);
                    rows.push({ deck, exact, item });
                });
            });
            section.classList.toggle('hidden', !rows.length);
            list.innerHTML = rows.map(({ deck, exact, item }) => {
                const studyCount = this.deckStudyCount(deck);
                const due = item.dueDate ? new Date(`${String(item.dueDate).slice(0, 10)}T00:00:00`) : null;
                const days = due && Number.isFinite(due.getTime()) ? Math.ceil((due - new Date(new Date().toDateString())) / 86400000) : null;
                const when = days === null ? '' : days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
                const studied = item.flashcardMinutes ? `${item.flashcardMinutes} min on flashcards so far` : 'No flashcard time yet';
                return `<article class="deck-recommendation">
                    <div><strong>${this.escapeHTML(deck.title)}</strong>
                        <span>${exact ? 'For' : 'Same class as'} ${this.escapeHTML(this.deckAssessmentLabel(item))}${when ? ` · ${when}` : ''}</span>
                        <small>${this.escapeHTML(studied)} · suggested ${item.sessionMinutes} min today</small></div>
                    <button class="primary-btn" data-action="study-deck" data-id="${this.escapeHTML(deck.id)}" ${studyCount ? '' : 'disabled'}><i class="fas fa-play"></i> Study</button>
                </article>`;
            }).join('');
        }

        deckAssessments() {
            return (AppState.get('assignments') || [])
                .filter(item => ['quiz', 'test'].includes(String(item.kind || '').toLowerCase()))
                .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
        }

        deckAssessmentOptionsIds() {
            const today = localDateKey(new Date());
            return this.deckAssessments().filter(item => item.status !== 'completed' && (!item.dueDate || String(item.dueDate).slice(0, 10) >= today)).map(item => String(item.id));
        }

        deckAssessmentLabel(item) {
            const kind = String(item.kind).toLowerCase() === 'test' ? 'Test' : 'Quiz';
            const due = item.dueDate ? new Date(`${String(item.dueDate).slice(0, 10)}T00:00:00`) : null;
            const date = due && Number.isFinite(due.getTime()) ? ` · ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
            return `${kind}: ${item.title || 'Untitled'}${date}`;
        }

        deckLinkInfo(deck) {
            const courses = AppState.get('courses') || [];
            const assessment = deck.assessmentId ? this.deckAssessments().find(item =>
                String(item.id) === String(deck.assessmentId) && (!deck.courseCode || item.courseCode === deck.courseCode)) || null : null;
            const courseCode = deck.courseCode || assessment?.courseCode || '';
            const course = courseCode ? courses.find(item => item.code === courseCode) || { code: courseCode, title: deck.courseTitle || courseCode }
                : deck.courseTitle ? { code: '', title: deck.courseTitle } : null;
            return { courseCode, course, assessment };
        }

        assessmentStudyButton(item) {
            if (!['quiz', 'test'].includes(String(item.kind).toLowerCase())) return '';
            const linked = (AppState.get('flashcards') || []).some(deck => String(deck.assessmentId) === String(item.id));
            return `<button type="button" class="secondary-btn" data-action="assessment-study-set" data-id="${this.escapeHTML(item.id)}">${linked ? 'Open study set' : 'Create study set'}</button>`;
        }

        studySetMarkup(info = {}) {
            if (window.StudBudCloud?.guestLobbyOpen) return `<div class="review-study-set"><strong>Study set: ${this.escapeHTML(info.title || 'Flashcards')}</strong><small>Leave the match and sign in to save study sets to an account.</small></div>`;
            const deck = (AppState.get('flashcards') || []).find(item => item.id === info.deckId
                || (info.publicId && [item.communityDeckId, item.communitySourceId].includes(info.publicId)));
            const action = deck ? `<button type="button" class="secondary-btn" data-action="open-study-set" data-id="${this.escapeHTML(deck.id)}">Open study set</button>`
                : info.publicId ? this.communityDeckActionMarkup(info.publicId) : '<small>This private set is not in your library.</small>';
            return `<div class="review-study-set"${info.publicId ? ` data-review-public-id="${this.escapeHTML(info.publicId)}" data-review-title="${this.escapeHTML(info.title || deck?.title || 'Flashcards')}"` : ''}><strong>Study set: ${this.escapeHTML(info.title || deck?.title || 'Flashcards')}</strong>${action}</div>`;
        }

        roomStudyDeck(room) {
            const ownId = window.StudBudCloud?.user?.id;
            const localId = room.deck_id || (room.host_id === ownId ? room.state?.source_deck_id : '');
            const local = localId ? (AppState.get('flashcards') || []).find(deck => deck.id === localId) : null;
            return local || (room.state?.public_deck_id ? this.findCommunityDeck(room.state.public_deck_id) : null);
        }

        openStudySet(deckId) {
            if (!(AppState.get('flashcards') || []).some(deck => deck.id === deckId)) throw new Error('This study set is no longer in your library.');
            this.closePractice();
            this.destroyArcadeSession();
            Router.navigate('flashcard');
            this.openDeckEditor(deckId);
        }

        deckCourseOptions(selected = '') {
            const courses = AppState.get('courses') || [];
            const known = courses.some(course => course.code === selected);
            return `<option value="">No class</option>${courses.map(course =>
                `<option value="${this.escapeHTML(course.code)}"${course.code === selected ? ' selected' : ''}>${this.escapeHTML(course.title || course.code)}</option>`).join('')}${selected && !known ? `<option value="${this.escapeHTML(selected)}" selected>${this.escapeHTML(selected)}</option>` : ''}`;
        }

        deckAssessmentOptions(courseCode = '', selected = '') {
            const courses = AppState.get('courses') || [];
            const today = localDateKey(new Date());
            // Upcoming quizzes/tests for the chosen class (or all classes); keep the current pick even if it has passed.
            const items = this.deckAssessments().filter(item =>
                (!courseCode || item.courseCode === courseCode) &&
                (String(item.id) === String(selected) || (item.status !== 'completed' && (!item.dueDate || String(item.dueDate).slice(0, 10) >= today))));
            const classTitle = code => courses.find(course => course.code === code)?.title || code || '';
            return `<option value="">${items.length ? 'No test or quiz' : 'No upcoming tests or quizzes'}</option>${items.map(item =>
                `<option value="${this.escapeHTML(item.id)}"${String(item.id) === String(selected) ? ' selected' : ''}>${this.escapeHTML(`${courseCode ? '' : `${classTitle(item.courseCode)} – `}${this.deckAssessmentLabel(item)}${item.status === 'completed' ? ' (completed)' : item.dueDate && String(item.dueDate).slice(0, 10) < today ? ' (past)' : ''}`)}</option>`).join('')}`;
        }

        syncDeckLinkSelects(courseSelect, assessmentSelect, assessmentChanged) {
            if (!courseSelect || !assessmentSelect) return;
            let courseCode = courseSelect.value;
            let assessmentId = assessmentSelect.value;
            if (assessmentChanged && assessmentId) {
                courseCode = this.deckAssessments().find(item => String(item.id) === assessmentId)?.courseCode || courseCode;
            } else if (assessmentId && this.deckAssessments().find(item => String(item.id) === assessmentId)?.courseCode !== courseCode) {
                assessmentId = '';
            }
            courseSelect.innerHTML = this.deckCourseOptions(courseCode);
            assessmentSelect.innerHTML = this.deckAssessmentOptions(courseCode, assessmentId);
        }

        importerDeckLink() {
            const courseCode = document.getElementById('import-deck-course')?.value || '';
            const assessmentId = document.getElementById('import-deck-assessment')?.value || '';
            const assessment = assessmentId ? this.deckAssessments().find(item => String(item.id) === assessmentId) : null;
            return { courseCode: courseCode || assessment?.courseCode || '', assessmentId };
        }

        resetImporterDeckLink() {
            const course = document.getElementById('import-deck-course');
            const assessment = document.getElementById('import-deck-assessment');
            if (course) course.value = '';
            if (assessment) assessment.value = '';
            this.syncDeckLinkSelects(course, assessment, false);
        }

        async updateDeckLink(deckId, field, value) {
            const deck = (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!deck) throw new Error('The selected deck no longer exists.');
            let courseCode = deck.courseCode || '';
            let assessmentId = deck.assessmentId || '';
            if (field === 'course') {
                courseCode = value;
                const current = this.deckAssessments().find(item => String(item.id) === String(deck.assessmentId));
                if (!current || current.courseCode !== value) assessmentId = '';
            } else if (field === 'assessment') {
                assessmentId = value;
                const picked = this.deckAssessments().find(item => String(item.id) === value);
                if (picked?.courseCode) courseCode = picked.courseCode;
            } else throw new Error('Unknown flashcard link field.');
            const next = { ...deck, ...this.validatedDeckLink(courseCode, assessmentId) };
            await this.saveEditedDeck(next, next.courseTitle !== (deck.courseTitle || this.deckLinkInfo(deck).course?.title || ''));
        }

        validatedDeckLink(courseCode, assessmentId) {
            const course = (AppState.get('courses') || []).find(item => item.code === courseCode);
            if (courseCode && !course) throw new Error('That class is no longer available. Choose another class.');
            const assessment = assessmentId ? this.deckAssessments().find(item => String(item.id) === String(assessmentId)) : null;
            if (assessmentId && !assessment) throw new Error('That test or quiz is no longer available. Choose another one.');
            if (assessment && assessment.courseCode !== courseCode) throw new Error('Choose a test or quiz from the selected class.');
            return { courseCode, courseTitle: course?.title || course?.code || '', assessmentId };
        }

        async saveEditedDeck(deck, updateShared = true) {
            await AppState.saveFlashcardDeck(deck);
            if (updateShared) await this.refreshEditedSharedDeck(deck);
        }

        async updateSavedDeck(deckId, changes) {
            const current = (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!current) throw new Error('This set was removed before the update finished.');
            await AppState.saveFlashcardDeck({ ...current, ...changes });
        }

        async refreshEditedSharedDeck(deck) {
            if (deck.communityPublished) {
                if (window.StudBudCloud?.offlineMode || window.navigator?.onLine === false) {
                    await this.updateSavedDeck(deck.id, { communityUpdatePending: true });
                    AppState.setSaveStatus('Saved on this device. Shared-set updates are queued until you reconnect.', 'saved');
                    return;
                }
                try {
                    await window.StudBudCommunityGames.publishDeck({ ...deck, courseTitle: this.deckLinkInfo(deck).course?.title || '' });
                } catch (error) {
                    throw Object.assign(new Error(`Your changes were saved locally, but the shared copy could not update. Retry Save changes or Share when connected, or stop sharing. ${this.friendlyErrorMessage(error)}`), { localChangesSaved: true });
                }
            }
        }

        async refreshPendingSharedDecks() {
            const signature = deck => JSON.stringify([deck.title, deck.courseCode, deck.cards.map(card => [card.front, card.back, card.distractors])]);
            for (const deck of (AppState.get('flashcards') || []).filter(item => item.communityPublished && item.communityUpdatePending)) {
                try {
                    await window.StudBudCommunityGames.publishDeck({ ...deck, courseTitle: this.deckLinkInfo(deck).course?.title || '' });
                } catch (error) {
                    console.error('[NexusApp] Queued shared-set update failed:', error);
                    AppState.setSaveStatus(`Your private changes are saved. Shared-set update is still queued: ${this.friendlyErrorMessage(error)}`, 'error');
                    return;
                }
                const latest = (AppState.get('flashcards') || []).find(item => item.id === deck.id);
                if (latest && signature(latest) === signature(deck)) await this.updateSavedDeck(deck.id, { communityUpdatePending: false });
            }
        }

        openDeckEditor(deckId = '', initialFilter = 'all') {
            const deck = deckId ? (AppState.get('flashcards') || []).find(item => item.id === deckId)
                : { id: `deck_${window.crypto.randomUUID()}`, title: '', cards: [] };
            if (!deck) throw new Error('The selected deck no longer exists.');
            this.deckEditorDraft = { ...deck, cards: (deck.cards || []).map(card => ({ ...card, tags: [...(card.tags || [])] })) };
            this.deckEditorExisting = Boolean(deckId);
            this.deckEditorUndo = [];
            this.deckEditorOriginalCards = new Map(this.deckEditorDraft.cards.map(card => [card.id, { ...card, tags: [...card.tags] }]));
            const link = this.deckLinkInfo(deck);
            document.getElementById('deck-editor-title').value = deck.title;
            document.getElementById('deck-editor-course').innerHTML = this.deckCourseOptions(link.courseCode);
            document.getElementById('deck-editor-assessment').innerHTML = this.deckAssessmentOptions(link.courseCode, link.assessment?.id || '');
            document.getElementById('deck-editor-search').value = '';
            const filter = document.getElementById('deck-editor-filter');
            if (filter) filter.value = initialFilter;
            const bulk = document.getElementById('deck-editor-bulk');
            if (bulk) bulk.value = '';
            this.renderDeckEditorCards();
            this.openModal('deck-editor-modal');
        }

        renderDeckEditorCards() {
            const draft = this.deckEditorDraft;
            if (!draft) return;
            const query = document.getElementById('deck-editor-search').value.trim().toLowerCase();
            const filter = document.getElementById('deck-editor-filter')?.value || 'all';
            const cards = draft.cards.filter(card => `${card.front} ${card.back} ${(card.tags || []).join(' ')} ${(card.distractors || []).join(' ')}`.toLowerCase().includes(query)
                && (filter === 'all' || (filter === 'images' && window.FlashcardTools.imageSource(card.answerImage))
                    || (filter === 'attachments' && (card.attachments || []).some(item => window.FlashcardTools.attachmentSource(item)))
                    || (filter === 'keywords' && card.answerMode === 'keywords')
                    || (filter === 'paused' && card.suspended) || (filter === 'starred' && card.starred) || (filter === 'weak' && window.FlashcardTools.cardProgress(card).weak)));
            document.getElementById('deck-editor-undo')?.classList.toggle('hidden', !this.deckEditorUndo?.length);
            document.getElementById('deck-editor-count').textContent = `${cards.length} of ${draft.cards.length} cards`;
            document.getElementById('deck-editor-cards').innerHTML = cards.map(card => `
                <article class="deck-editor-card">
                    <strong>${this.escapeHTML(card.front)}</strong><p>${this.escapeHTML(card.back)}</p>
                    ${card.tags?.length ? `<small>${this.escapeHTML(card.tags.join(', '))}</small>` : ''}
                    <small>${card.practiceStats?.attempts > 0 ? `${Math.round(window.FlashcardTools.cardProgress(card).accuracy * 100)}% accuracy${card.practiceStats.recentAnswers?.length === 4 ? ' (last 4)' : ''} · ${Number(card.practiceStats.attempts)} attempts` : 'Not practiced yet'}${card.suspended ? ' · Paused scheduled study' : ''}${window.FlashcardTools.imageSource(card.answerImage) ? ' · Private image' : ''}</small>
                    <small>${card.answerMode === 'keywords' ? 'Definition keywords' : card.answerMode === 'vocabulary' ? 'Vocabulary / translation' : card.answerMode === 'exact' ? 'Exact answer' : 'Test grading default'}${card.acceptedAnswers?.length ? ` · ${card.acceptedAnswers.length} alternative answers` : ''}${card.attachments?.length ? ` · ${card.attachments.length} private attachments` : ''}</small>
                    <div class="actions">
                        <button type="button" class="secondary-btn star-toggle${card.starred ? ' is-on' : ''}" data-action="editor-star-card" data-id="${this.escapeHTML(card.id)}" aria-pressed="${card.starred ? 'true' : 'false'}" aria-label="${card.starred ? 'Unstar' : 'Star'} card"><i class="${card.starred ? 'fas' : 'far'} fa-star"></i></button>
                        <button type="button" class="secondary-btn" data-action="editor-edit-card" data-id="${this.escapeHTML(card.id)}">Edit card</button>
                        <button type="button" class="secondary-btn" data-action="editor-copy-card" data-id="${this.escapeHTML(card.id)}">Duplicate</button>
                        <button type="button" class="secondary-btn" data-action="editor-reverse-card" data-id="${this.escapeHTML(card.id)}">Reverse copy</button>
                        <button type="button" class="secondary-btn" data-action="editor-pause-card" data-id="${this.escapeHTML(card.id)}">${card.suspended ? 'Resume' : 'Pause'} scheduled study</button>
                        <button type="button" class="danger-btn" data-action="editor-delete-card" data-id="${this.escapeHTML(card.id)}">Delete card</button>
                    </div>
                </article>`).join('') || `<p class="empty-state">${filter === 'weak' && !query ? 'No weak cards in this set. Cards appear here after at least two attempts with accuracy below 75%, using the last four answers once available.' : query || filter !== 'all' ? 'No cards match your search or filter.' : 'No cards yet. Add your first card.'}</p>`;
        }

        addBulkEditorCards() {
            if (!this.deckEditorDraft) throw new Error('Open a set before adding cards.');
            const input = document.getElementById('deck-editor-bulk');
            const parsed = window.FlashcardTools.parseBulkCards(input.value);
            const key = card => JSON.stringify([this.answerKey(card.front), this.answerKey(card.back)]);
            const used = new Set(this.deckEditorDraft.cards.map(key));
            const added = [];
            for (const card of parsed) {
                if (used.has(key(card))) continue;
                used.add(key(card));
                added.push({ ...card, id: `card_${window.crypto.randomUUID()}`, repetitions: 0, interval: 0, easeFactor: 2.5 });
            }
            this.deckEditorDraft.cards.push(...added);
            input.value = '';
            this.renderDeckEditorCards();
            document.getElementById('deck-editor-count').textContent += ` · Added ${added.length}; skipped ${parsed.length - added.length} duplicates. Save changes to keep them.`;
        }

        quickAddEditorCard() {
            if (!this.deckEditorDraft) throw new Error('Open a set before adding cards.');
            const front = document.getElementById('deck-quick-front');
            const back = document.getElementById('deck-quick-back');
            const term = front.value.trim(), answer = back.value.trim();
            if (!term) { front.focus(); return; }
            if (!answer) { back.focus(); return; }
            this.deckEditorDraft.cards.push({ id: `card_${window.crypto.randomUUID()}`, front: term, back: answer, tags: [], repetitions: 0, interval: 0, easeFactor: 2.5 });
            front.value = '';
            back.value = '';
            this.renderDeckEditorCards();
            document.getElementById('deck-editor-count').textContent += ' · Added. Save changes to keep it.';
            front.focus();
        }

        copyEditorCard(cardId, reverse = false) {
            const card = this.deckEditorDraft?.cards.find(item => item.id === cardId);
            if (!card) throw new Error('This card is no longer in the editor.');
            const next = { id: `card_${window.crypto.randomUUID()}`, front: reverse ? card.back : card.front,
                back: reverse ? card.front : card.back, tags: [...(card.tags || [])],
                repetitions: 0, interval: 0, easeFactor: 2.5, suspended: false };
            if (!reverse) {
                next.answerImage = card.answerImage || ''; next.distractors = [...(card.distractors || [])];
                next.answerMode = card.answerMode; next.acceptedAnswers = [...(card.acceptedAnswers || [])];
                next.keywords = (card.keywords || []).map(group => [...group]);
                next.attachments = (card.attachments || []).map(attachment => ({ ...attachment }));
            }
            this.deckEditorDraft.cards.splice(this.deckEditorDraft.cards.indexOf(card) + 1, 0, next);
            this.renderDeckEditorCards();
        }

        async saveDeckEditor() {
            const draft = this.deckEditorDraft;
            if (!draft) throw new Error('Open a flashcard set before saving.');
            const title = document.getElementById('deck-editor-title').value.trim();
            if (!title || title.length > 100) throw new Error('Set names must be between 1 and 100 characters.');
            const link = this.validatedDeckLink(document.getElementById('deck-editor-course').value, document.getElementById('deck-editor-assessment').value);
            const current = (AppState.get('flashcards') || []).find(deck => deck.id === draft.id);
            if (!current && this.deckEditorExisting) throw new Error('This set was removed while you were editing. Reopen the editor.');
            const cards = draft.cards.map(card => {
                const latest = (current?.cards || []).find(item => item.id === card.id);
                const original = this.deckEditorOriginalCards.get(card.id);
                if (current && original && !latest) throw new Error('A card was removed while you were editing. Reopen the editor.');
                if (!latest) return card;
                const next = { ...latest };
                for (const field of ['front', 'back', 'tags', 'answerImage', 'distractors', 'suspended', 'starred', 'answerMode', 'acceptedAnswers', 'keywords', 'attachments']) {
                    const before = JSON.stringify(original?.[field]);
                    const edited = JSON.stringify(card[field]);
                    const saved = JSON.stringify(field === 'tags' ? latest.tags || [] : latest[field]);
                    if (original && edited === before) continue;
                    if (original && saved !== before && saved !== edited) throw new Error('This card was also edited elsewhere. Reopen the editor to review its latest version.');
                    next[field] = card[field];
                }
                return next;
            });
            cards.push(...(current?.cards || []).filter(card => !this.deckEditorOriginalCards.has(card.id) && !cards.some(item => item.id === card.id)));
            const next = { ...(current || draft), title, ...link, cards };
            await AppState.saveFlashcardDeck(next);
            this.deckEditorExisting = true;
            this.deckEditorDraft = { ...next, cards: cards.map(card => ({ ...card, tags: [...(card.tags || [])] })) };
            this.deckEditorOriginalCards = new Map(this.deckEditorDraft.cards.map(card => [card.id, { ...card, tags: [...card.tags] }]));
            await this.refreshEditedSharedDeck(next);
        }

        openCardForm(deckId, cardId = '', fromEditor = false) {
            const deck = fromEditor ? this.deckEditorDraft : (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!deck) throw new Error('The selected deck no longer exists.');
            const card = cardId ? (deck.cards || []).find(item => item.id === cardId) : null;
            if (cardId && !card) throw new Error('The selected card no longer exists.');
            document.getElementById('card-form').reset();
            document.getElementById('card-deck-id').value = deck.id;
            document.getElementById('card-id').value = cardId;
            document.getElementById('card-front').value = card?.front || '';
            document.getElementById('card-back').value = card?.back || '';
            document.getElementById('card-tags').value = (card?.tags || []).join(', ');
            document.getElementById('card-distractors').value = (card?.distractors || []).join('\n');
            const setValue = (id, value) => { const node = document.getElementById(id); if (node) node.value = value; };
            setValue('card-answer-mode', card?.answerMode || 'exact');
            setValue('card-accepted-answers', (card?.acceptedAnswers || []).join('\n'));
            setValue('card-keywords', (card?.keywords || []).map(group => group.join(' | ')).join('\n'));
            setValue('card-attachments', '');
            const removeAttachments = document.getElementById('card-remove-attachments');
            if (removeAttachments) removeAttachments.checked = false;
            const attachmentsList = document.getElementById('card-attachments-list');
            if (attachmentsList) attachmentsList.innerHTML = this.cardAttachmentMarkup(card || {});
            document.getElementById('card-remove-image').checked = false;
            document.getElementById('card-answer-image').value = '';
            const imagePreview = document.getElementById('card-answer-image-preview');
            if (imagePreview) {
                const image = window.FlashcardTools.imageSource(card?.answerImage);
                if (image) imagePreview.src = image;
                else imagePreview.removeAttribute('src');
                imagePreview.classList.toggle('hidden', !image);
            }
            document.querySelector('#card-studio-modal h2').textContent = card ? 'Edit flashcard' : 'Add flashcard';
            this.cardEditorReturnToDeck = fromEditor;
            this.openModal('card-studio-modal');
        }

        renderHostedGameDecks() {
            const select = document.getElementById('host-game-deck');
            if (!select) return;
            const previous = select.value;
            const extraSelects = ['practice-multiplayer-deck', 'solo-game-deck'].map(id => document.getElementById(id)).filter(Boolean);
            const previousExtra = extraSelects.map(extra => extra.value);
            const decks = this.orderedDecks(AppState.get('flashcards') || [], 'custom').map(deck => ({
                ...deck,
                completeCards: (deck.cards || []).filter(card =>
                    String(card.front || '').trim() && String(card.back || '').trim()
                )
            })).filter(deck => deck.completeCards.length >= 1);
            select.innerHTML = decks.length
                ? decks.map(deck => `<option value="${this.escapeHTML(deck.id)}">${this.escapeHTML(deck.title)} · ${deck.completeCards.length} cards</option>`).join('')
                : '<option value="">Add a set with at least 1 complete card</option>';
            extraSelects.forEach((practiceSelect, index) => {
                practiceSelect.innerHTML = decks.length
                    ? decks.map(deck => `<option value="${this.escapeHTML(deck.id)}">${this.escapeHTML(deck.title)} · ${deck.completeCards.length} cards</option>`).join('')
                    : '<option value="">Add a set with at least 1 complete card</option>';
                const previousPracticeDeck = previousExtra[index] || previous;
                if (decks.some(deck => deck.id === previousPracticeDeck)) practiceSelect.value = previousPracticeDeck;
                practiceSelect.disabled = !decks.length;
            });
            if (decks.some(deck => deck.id === previous)) select.value = previous;
            let nickname;
            try {
                nickname = this.gameNickname();
            } catch (error) {
                if (error.code !== 'INAPPROPRIATE_NAME') throw error;
                console.warn('[Multiplayer] Choose a different nickname:', error);
                nickname = 'Enter an appropriate nickname';
            }
            ['host-game-nickname', 'join-game-nickname'].forEach(id => {
                const input = document.getElementById(id);
                if (input) input.placeholder = nickname;
            });
        }

        multiplayerDisplayName() {
            const user = window.StudBudCloud?.user;
            const profile = AppState.get('profile') || {};
            const fullName = [profile.firstName, profile.lastName].map(name => String(name || '').trim()).filter(Boolean).join(' ');
            return fullName || user?.user_metadata?.username || (window.StudBudCloud?.isGuest?.() ? (profile.guestName || 'Guest') : 'Student');
        }

        // Player names are optional: a blank name uses your username, so joining never stalls on an empty field.
        gameNickname(preferred) {
            if (String(preferred || '').trim()) window.StudBudNameModeration.assertAllowed(preferred, 'Nickname');
            const clean = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
            const cloud = window.StudBudCloud, profile = AppState.get('profile') || {};
            const username = cloud?.user?.user_metadata?.username;
            for (const candidate of [preferred, username, cloud?.isGuest?.() ? profile.guestName : '', this.multiplayerDisplayName()]) {
                const name = clean(candidate);
                if (name.length >= 2) {
                    window.StudBudNameModeration.assertAllowed(name, 'Nickname');
                    return name;
                }
            }
            return 'Student';
        }

        profileCosmetics(profile) {
            return window.StudBudArcade?.util?.playerCosmetics?.(profile) || {};
        }

        multiplayerAvatarMarkup(cos = {}, large = false, extraClass = '') {
            const util = window.StudBudArcade?.util;
            const avatar = util?.avatarMarkup({ color: cos.color, cos });
            return `<span class="player-avatar char-avatar${large ? ' player-avatar-large' : ''}${extraClass ? ` ${this.escapeHTML(extraClass)}` : ''}">${avatar || '<i class="fas fa-user" aria-hidden="true"></i>'}</span>`;
        }

        shopItemPreview(profile, item, large = false) {
            if (item.type === 'palette') return item.hue != null
                ? `<span class="shop-palette" style="background: linear-gradient(135deg, hsl(${item.hue} 75% 55%), hsl(${item.hue2} 80% 40%))"></span>`
                : `<span class="shop-palette ${this.escapeHTML(item.color)}"></span>`;
            const slotKey = { skin: 'skin', hat: 'hat', accessory: 'acc', effect: 'effect' };
            const base = profile ? this.profileCosmetics(profile) : {};
            return this.multiplayerAvatarMarkup({ ...base, [slotKey[item.type]]: item.id }, large, item.type === 'effect' ? 'aura-preview' : '');
        }

        shopItemCard(profile, item) {
            const owned = profile.owned_items || [];
            const equippedBy = { skin: profile.equipped_skin, hat: profile.equipped_hat, accessory: profile.equipped_accessory, effect: profile.equipped_effect, palette: profile.equipped_palette };
            const has = owned.includes(item.id);
            const equipped = equippedBy[item.type] === item.id;
            const price = item.price == null ? '' : ` · ${item.price} <i class="fas fa-coins"></i>`;
            let button;
            if (has && equipped) button = `<button type="button" class="ghost-btn" data-action="multiplayer-unequip" data-slot="${item.type}">Unequip</button>`;
            else if (has) button = `<button type="button" class="secondary-btn" data-action="multiplayer-equip" data-id="${this.escapeHTML(item.id)}">Equip</button>`;
            else if (item.season) button = `<button type="button" class="secondary-btn" disabled>${this.escapeHTML(item.set)} box</button>`;
            else if (item.price == null) button = '<button type="button" class="secondary-btn" disabled>Box only</button>';
            else button = `<button type="button" class="secondary-btn" data-action="multiplayer-buy" data-id="${this.escapeHTML(item.id)}" ${profile.coins < item.price ? 'disabled' : ''}>Buy${price}</button>`;
            const search = this.escapeHTML(`${item.name} ${item.rarity} ${item.description || ''} ${item.set || item.collectionName || ''}`.toLocaleLowerCase());
            const setName = item.set || item.collectionName;
            const setTag = setName ? `<small class="shop-set-tag"><i class="fas ${item.season ? 'fa-calendar' : 'fa-box-open'}" aria-hidden="true"></i> ${this.escapeHTML(setName)} set</small>` : '';
            return `<article class="multiplayer-shop-item rarity-${item.rarity}${equipped ? ' equipped' : ''}" data-search="${search}"><span class="shop-preview" aria-hidden="true">${this.shopItemPreview(profile, item)}</span><div><strong>${this.escapeHTML(item.name)}</strong><small class="rarity-label">${item.rarity}${equipped ? ' · Equipped' : has ? ' · Owned' : ''}</small>${setTag}${item.description ? `<small>${this.escapeHTML(item.description)}</small>` : ''}</div>${button}</article>`;
        }

        shopSetPreview(profile, items) {
            const owned = profile.owned_items || [];
            return `<div class="season-set-preview">${items.map(item => `<span class="season-set-item rarity-${item.rarity}${owned.includes(item.id) ? ' owned' : ''}" title="${this.escapeHTML(`${item.name} (${item.rarity})${owned.includes(item.id) ? ' · owned' : ''}`)}">${this.shopItemPreview(profile, item)}<small>${this.escapeHTML(item.name)}</small></span>`).join('')}</div>`;
        }

        // Flat, front-facing open box: lid knocked off to the side and the best reward peeking over the rim.
        openBoxArt(profile, box, all = window.StudBudCommunityGames.boxPool(box), owned = profile?.owned_items || [], extraClass = '') {
            const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
            const rank = item => order.indexOf(item.rarity);
            const pool = all;
            const peek = (pool.length ? pool : all).slice().sort((a, b) => rank(b) - rank(a))[0];
            const preview = peek ? this.shopItemPreview(profile, peek) : `<i class="fas ${box.icon}"></i>`;
            return `<span class="shop-preview open-box${extraClass ? ` ${extraClass}` : ''}${peek ? ` peek-${peek.rarity}` : ''}" aria-hidden="true">
                <span class="ob-glow"></span>
                <span class="ob-back"></span>
                <span class="ob-peek">${preview}</span>
                <span class="ob-front"><span class="ob-band"></span><span class="ob-emblem"><i class="fas ${box.icon}"></i></span></span>
                <span class="ob-lid"><span class="ob-band"></span></span>
                <span class="ob-spark s1"></span><span class="ob-spark s2"></span><span class="ob-spark s3"></span>
            </span>`;
        }

        shopBoxCard(profile, box, featured = false) {
            const games = window.StudBudCommunityGames;
            const owned = profile.owned_items || [];
            const all = games.boxPool(box);
            const remaining = games.boxPool(box, owned).length;
            const complete = !remaining;
            const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
            const inside = order.filter(rarity => all.some(item => item.rarity === rarity)).map(rarity =>
                `<li class="rarity-${rarity}"><b>${rarity}</b> ${all.filter(item => item.rarity === rarity).map(item => `<span class="${owned.includes(item.id) ? 'owned' : ''}">${owned.includes(item.id) ? '<i class="fas fa-check" aria-hidden="true"></i> ' : ''}${this.escapeHTML(item.name)}</span>`).join('')}</li>`).join('');
            const capsule = this.openBoxArt(profile, box, all, owned);
            const colors = box.seasonal ? box.season.colors : box.colors;
            const style = colors ? ` style="--box-accent: ${colors[0]}; --box-accent-2: ${colors[1]}"` : '';
            const now = new Date();
            const daysLeft = Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - now) / 86400000));
            const chances = `<span class="box-chances" aria-label="Rarity drop chances">${Object.entries(games.boxChances(box)).map(([rarity, chance]) => `<span class="rarity-${rarity}">${rarity} <b>${chance}%</b></span>`).join('')}</span>`;
            return `<article class="multiplayer-shop-item box-card box-${box.id}${featured ? ' box-featured' : ''}${complete ? ' collection-complete' : ''}"${style} data-search="${this.escapeHTML(`${box.name} ${box.id} ${all.map(item => item.name).join(' ')}`.toLocaleLowerCase())}">
                        ${capsule}
                        <div class="box-details">${featured ? `<span class="season-badge"><i class="fas fa-hourglass-half" aria-hidden="true"></i> Limited · leaves in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</span>` : ''}<strong>${this.escapeHTML(box.name)}</strong><small>${this.escapeHTML(box.odds)}</small><span class="box-progress">${complete ? 'All rewards collected' : `${all.length - remaining} / ${all.length} collected · ${remaining} left`}</span></div>
                        ${featured ? this.shopSetPreview(profile, all) : ''}
                        <details class="box-odds"><summary>What's inside</summary><div class="box-contents-scroll" tabindex="0" role="region" aria-label="${this.escapeHTML(box.name)} rewards">${chances}<ul class="box-contents">${inside}</ul></div><button type="button" class="ghost-btn" data-action="box-contents-close">Close what's inside</button></details>
                        <small class="box-duplicate-note">Duplicates auto-sell for ${Math.floor(box.price / 2)} coins (50% of box price).</small>
                        <button type="button" class="${featured ? 'primary-btn' : 'secondary-btn'}" data-action="multiplayer-mystery" data-id="${box.id}" ${box.seasonal ? `data-season-month="${box.season.month}"` : ''} ${profile.coins < box.price ? 'disabled' : ''}>Open · ${box.price} <i class="fas fa-coins"></i></button></article>`;
        }

        renderShopFrame(containerId, tabs, tab, tabAttr, body, query, label, gridClass = '') {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = `
                <div class="shop-tabs" role="tablist">${tabs.map(([id, text]) => `<button type="button" class="shop-tab${tab === id ? ' selected' : ''}" role="tab" aria-selected="${tab === id}" ${tabAttr}="${id}">${text}</button>`).join('')}</div>
                <label class="shop-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><span class="sr-only">${label}</span><input class="shop-search-input" data-search-key="${containerId}" type="search" value="${this.escapeHTML(query || '')}" placeholder="Filter by name, rarity or set"></label>
                <div class="shop-grid ${gridClass}">${body}<p class="shop-search-empty" role="status" hidden>Nothing matches. Try another name or rarity.</p></div>`;
            this.filterShopGrid(container, query);
            if (this.shopPurchaseBusy) this.setShopControlsBusy(true);
        }

        filterShopGrid(container, query = '') {
            const grid = typeof container?.querySelector === 'function' ? container.querySelector('.shop-grid') : null;
            if (!grid?.querySelectorAll) return;
            const term = String(query || '').trim().toLocaleLowerCase();
            const cards = [...grid.querySelectorAll('.multiplayer-shop-item, .season-set-card')];
            for (const card of cards) card.hidden = Boolean(term) && !card.dataset.search?.includes(term);
            for (const heading of grid.querySelectorAll('.shop-category-title')) {
                let sibling = heading.nextElementSibling, hasItems = false;
                while (sibling && !sibling.matches('.shop-category-title')) {
                    if (!sibling.hidden && sibling.matches('.multiplayer-shop-item, .season-set-card')) hasItems = true;
                    sibling = sibling.nextElementSibling;
                }
                heading.hidden = Boolean(term) && !hasItems;
            }
            const empty = grid.querySelector('.shop-search-empty');
            if (empty) empty.hidden = !term || cards.some(card => !card.hidden);
        }

        renderMultiplayerShop(profile) {
            const games = window.StudBudCommunityGames;
            const Games = games.constructor;
            const owned = profile.owned_items || [];
            const tabs = [['boxes', 'Boxes'], ['sets', 'Sets'], ['skin', 'Characters'], ['hat', 'Hats'], ['accessory', 'Accessories'], ['effect', 'Auras'], ['palette', 'Colors']];
            const tab = tabs.some(([id]) => id === this.shopTab) ? this.shopTab : 'boxes';
            const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
            const rank = item => { const i = order.indexOf(item.rarity); return i < 0 ? order.length : i; };
            let body;
            if (tab === 'boxes') {
                body = `<h4 class="shop-category-title"><i class="fas fa-calendar-day" aria-hidden="true"></i> This month only</h4>
                    ${this.shopBoxCard(profile, Games.seasonalBox, true)}
                    <h4 class="shop-category-title">Permanent themed boxes</h4>
                    ${Games.boxes.filter(box => box.themed).map(box => this.shopBoxCard(profile, box)).join('')}
                    <h4 class="shop-category-title">Item-category boxes · any permanent theme</h4>
                    ${Games.boxes.filter(box => ['hat', 'accessory', 'effect', 'palette', 'skin'].includes(box.id)).map(box => this.shopBoxCard(profile, box)).join('')}
                    <h4 class="shop-category-title">Mixed boxes · all permanent themes and item types</h4>
                    ${Games.boxes.filter(box => !box.themed && !['hat', 'accessory', 'effect', 'palette', 'skin'].includes(box.id)).map(box => this.shopBoxCard(profile, box)).join('')}
                    <p class="settings-hint">Every opening can give any listed reward, including duplicates. Duplicates auto-sell for 50% of the box price; you keep your original item. Open "What's inside" to browse rewards.</p>`;
            } else if (tab === 'sets') {
                const current = Games.currentSeason();
                const monthName = month => new Date(Date.UTC(2024, month - 1, 1)).toLocaleString(undefined, { month: 'long', timeZone: 'UTC' });
                const seasons = [...Games.seasons].sort((a, b) => ((a.month - current.month + 12) % 12) - ((b.month - current.month + 12) % 12));
                body = `<h4 class="shop-category-title">Permanent sets · available all year</h4>` + Games.permanentSets.map(set => {
                    const items = games.catalog.filter(item => set.items.includes(item.id));
                    const have = items.filter(item => owned.includes(item.id)).length;
                    return `<article class="season-set-card${have === items.length ? ' complete' : ''}" style="--box-accent: ${set.colors[0]}; --box-accent-2: ${set.colors[1]}" data-search="${this.escapeHTML(`${set.name} ${items.map(item => item.name).join(' ')}`.toLocaleLowerCase())}">
                        <header><i class="fas ${set.icon}" aria-hidden="true"></i><div><strong>${this.escapeHTML(set.name)} set</strong><small>Always available · ${have}/${items.length} collected</small></div><button type="button" class="secondary-btn" data-shop-tab="boxes">View boxes</button></header>
                        ${this.shopSetPreview(profile, items)}
                    </article>`;
                }).join('') + `<h4 class="shop-category-title">Seasonal sets</h4>` + seasons.map(season => {
                    const items = games.catalog.filter(item => item.season === season.month);
                    const have = items.filter(item => owned.includes(item.id)).length;
                    const live = season.month === current.month;
                    return `<article class="season-set-card${live ? ' live' : ''}${have === items.length ? ' complete' : ''}" style="--box-accent: ${season.colors[0]}; --box-accent-2: ${season.colors[1]}" data-search="${this.escapeHTML(`${season.name} ${monthName(season.month)} ${items.map(item => item.name).join(' ')}`.toLocaleLowerCase())}">
                        <header><i class="fas ${season.icon}" aria-hidden="true"></i><div><strong>${this.escapeHTML(season.name)} set</strong><small>${live ? 'Available now' : `Returns in ${monthName(season.month)}`} · ${have}/${items.length} collected</small></div>${live ? '<button type="button" class="secondary-btn" data-shop-tab="boxes">Open box</button>' : ''}</header>
                        ${this.shopSetPreview(profile, items)}
                    </article>`;
                }).join('');
            } else {
                const items = games.catalog.filter(item => !item.legacy && !item.season && item.type === tab)
                    .sort((a, b) => rank(a) - rank(b) || (a.price ?? Infinity) - (b.price ?? Infinity) || String(a.name).localeCompare(String(b.name)));
                const count = items.filter(item => owned.includes(item.id)).length;
                const groups = [...new Set(items.map(item => item.rarity))].sort((a, b) => rank({ rarity: a }) - rank({ rarity: b }));
                body = `<h4 class="shop-category-title">${count} / ${items.length} owned</h4>${groups.map(rarity => {
                    const list = items.filter(item => item.rarity === rarity);
                    return `<h4 class="shop-category-title shop-rarity-title rarity-${this.escapeHTML(rarity)}">${this.escapeHTML(rarity.charAt(0).toUpperCase() + rarity.slice(1))} · ${list.filter(item => owned.includes(item.id)).length}/${list.length}</h4>${list.map(item => this.shopItemCard(profile, item)).join('')}`;
                }).join('')}`;
            }
            this.renderShopFrame('multiplayer-shop-items', tabs, tab, 'data-shop-tab', body, this.shopSearch, 'Filter shop items', tab === 'boxes' ? 'shop-grid-boxes' : tab === 'sets' ? 'shop-grid-sets' : '');
            this.renderInventory(profile);
            this.animateShopAuras();
        }

        renderInventory(profile) {
            const games = window.StudBudCommunityGames;
            const owned = profile.owned_items || [];
            const tabs = [['all', 'All'], ['skin', 'Characters'], ['hat', 'Hats'], ['accessory', 'Accessories'], ['effect', 'Auras'], ['palette', 'Colors']];
            const tab = tabs.some(([id]) => id === this.inventoryTab) ? this.inventoryTab : 'all';
            const typeNames = Object.fromEntries(tabs.slice(1));
            const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
            const mine = games.catalog.filter(item => item.type !== 'pet' && owned.includes(item.id));
            const total = games.catalog.filter(item => !item.legacy && item.type !== 'pet').length;
            const equippedBy = { skin: profile.equipped_skin, hat: profile.equipped_hat, accessory: profile.equipped_accessory, effect: profile.equipped_effect };
            const sections = Object.keys(typeNames).filter(type => tab === 'all' || tab === type).map(type => {
                const list = mine.filter(item => item.type === type).sort((a, b) => order.indexOf(b.rarity) - order.indexOf(a.rarity));
                if (!list.length) return tab === 'all' ? '' : `<p class="settings-hint">No ${typeNames[type].toLocaleLowerCase()} yet. Find them in the shop.</p>`;
                const remove = equippedBy[type] ? `<button type="button" class="ghost-btn shop-unequip" data-action="multiplayer-unequip" data-slot="${type}">Remove</button>` : '';
                return `<h4 class="shop-category-title">${typeNames[type]} · ${list.length} ${remove}</h4>${list.map(item => this.shopItemCard(profile, item)).join('')}`;
            }).join('');
            const body = `<h4 class="shop-category-title">${mine.filter(item => !item.legacy).length} / ${total} items collected</h4>${sections || '<p class="settings-hint">Your locker is empty. Open a mystery box or buy something in the shop!</p>'}`;
            this.renderShopFrame('multiplayer-inventory-items', tabs, tab, 'data-inventory-tab', body, this.inventorySearch, 'Filter your items');
        }

        // Full-screen unboxing: the box shakes while the server rolls, then a reel spins onto the reward.
        openUnboxing(box) {
            this.closeUnboxing();
            const overlay = document.createElement('div');
            overlay.className = 'unbox-overlay phase-shake';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-label', `Opening ${box.name}`);
            const colors = box.seasonal ? box.season.colors : box.colors;
            if (colors) {
                overlay.style.setProperty('--box-accent', colors[0]);
                overlay.style.setProperty('--box-accent-2', colors[1]);
            }
            overlay.innerHTML = `<div class="unbox-backdrop"></div>
                <div class="unbox-stage">
                    <p class="unbox-title">${this.escapeHTML(box.name)}</p>
                    <div class="unbox-rays" aria-hidden="true"></div>
                    <button type="button" class="unbox-box" data-action="unbox-shake" aria-label="Shake box, 4 taps to open">${this.openBoxArt(this.multiplayerProfile, box, undefined, [], 'open-box-lg mystery-peek')}</button>
                    <p class="unbox-prompt" role="status">Tap anywhere to break the seals · 0 / 4</p>
                    <div class="unbox-seals" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                    <div class="unbox-reel" aria-hidden="true"><div class="unbox-strip"></div><span class="unbox-marker"></span></div>
                    <div class="unbox-result" aria-live="polite"></div>
                    <div class="unbox-confetti" aria-hidden="true"></div>
                </div>
                <button type="button" class="ghost-btn unbox-skip" data-action="unbox-skip">Skip</button>`;
            document.body.appendChild(overlay);
            overlay.querySelector('.unbox-box').focus({ preventScroll: true });
            const state = this.unboxState = { overlay, box, skipped: false, taps: 0, startedAt: performance.now() };
            state.seals = new Promise(resolve => { state.releaseSeals = resolve; });
            overlay.addEventListener('click', event => {
                if (!event.target.closest('button') && overlay.classList.contains('phase-shake')) this.shakeUnboxing();
            });
            return overlay;
        }

        shakeUnboxing() {
            const state = this.unboxState;
            if (!state || state.taps >= 4 || state.skipped) return;
            state.taps++;
            const button = state.overlay.querySelector('.unbox-box');
            state.overlay.querySelector('.unbox-prompt').textContent = state.taps === 4 ? 'Seals broken! Opening…' : `Tap anywhere to break the seals · ${state.taps} / 4`;
            state.overlay.querySelectorAll('.unbox-seals i').forEach((seal, i) => seal.classList.toggle('broken', i < state.taps));
            button.setAttribute('aria-label', state.taps === 4 ? 'Opening box' : `Shake box, ${4 - state.taps} taps remaining`);
            if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
                state.shakeAnimation?.cancel();
                const tilt = 5 + state.taps * 3;
                state.shakeAnimation = button.animate([
                    { transform: 'translateX(0) rotate(0) scale(1)' },
                    { transform: `translateX(-10px) rotate(-${tilt}deg) scale(1.08)` },
                    { transform: `translateX(10px) rotate(${tilt}deg) scale(1.08)` },
                    { transform: 'translateX(-5px) rotate(-3deg) scale(1.03)' },
                    { transform: 'translateX(0) rotate(0) scale(1)' }
                ], { duration: 360, easing: 'ease-out' });
            }
            window.StudBudSfx?.play('coin', 'ui', 0);
            if (state.taps === 4) { button.disabled = true; state.releaseSeals(); }
        }

        closeUnboxing() {
            this.unboxState?.releaseSeals?.();
            this.unboxState?.shakeAnimation?.cancel();
            this.unboxState?.resizeObserver?.disconnect();
            clearTimeout(this.unboxState?.timer);
            this.unboxState?.resolve?.();
            this.unboxState?.overlay?.remove();
            this.unboxState = null;
        }

        unboxingLandingOffset(strip, winningTile, marker) {
            strip.style.transform = 'translateX(0px)';
            const tileRect = winningTile.getBoundingClientRect();
            const markerRect = marker.getBoundingClientRect();
            // Ancestor pop/reveal animations scale DOM rects, but translateX uses local pixels.
            const scale = markerRect.width / marker.offsetWidth || 1;
            return (markerRect.left + markerRect.width / 2 - tileRect.left - tileRect.width / 2) / scale;
        }

        mysteryDropMessage(item, profile) {
            const reward = item?.name || profile.unlocked_item || 'cosmetic';
            const rarity = item?.rarity || profile.rarity || '';
            return profile.duplicate
                ? `Duplicate: ${reward}. Automatically sold for ${Math.max(0, Number(profile.refund) || 0)} coins. You kept your original item.`
                : `New ${rarity} drop: ${reward}!`;
        }

        async revealUnboxing(item, profile) {
            const state = this.unboxState;
            if (!state || !item) return this.closeUnboxing();
            const { overlay, box } = state;
            const games = window.StudBudCommunityGames;
            const pool = games.boxPool(box).filter(entry => entry.id !== item.id);
            const chances = box.chances || {};
            const pick = () => {
                const total = pool.reduce((sum, entry) => sum + (chances[entry.rarity] || 1), 0);
                let roll = Math.random() * total;
                for (const entry of pool) { roll -= chances[entry.rarity] || 1; if (roll <= 0) return entry; }
                return pool[0] || item;
            };
            const winnerIndex = 30;
            const reel = Array.from({ length: 36 }, (_, index) => index === winnerIndex ? item : pick());
            const strip = overlay.querySelector('.unbox-strip');
            strip.innerHTML = reel.map(entry => `<span class="unbox-tile rarity-${entry.rarity}" data-item-id="${this.escapeHTML(entry.id)}">${this.shopItemPreview(profile, entry)}<small>${this.escapeHTML(entry.name)}</small></span>`).join('');
            const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (!state.skipped && state.seals) await state.seals;
            if (this.unboxState !== state) return;
            const wait = ms => new Promise(resolve => {
                state.resolve = resolve;
                state.timer = setTimeout(resolve, state.skipped || reduce ? 0 : ms);
            });
            await wait(Math.max(0, 1000 - (performance.now() - state.startedAt)));
            if (this.unboxState !== state) return;
            overlay.classList.replace('phase-shake', 'phase-spin');
            window.StudBudSfx?.play('open', 'ui');
            const winningTile = strip.children[winnerIndex];
            const marker = overlay.querySelector('.unbox-marker');
            const offset = this.unboxingLandingOffset(strip, winningTile, marker);
            // Commit the starting layout before enabling the transition (including cached/instant replies).
            void strip.offsetWidth;
            const spinMs = state.skipped || reduce ? 0 : 4200;
            strip.style.transition = `transform ${spinMs}ms cubic-bezier(.08, .72, .16, 1)`;
            strip.style.transform = `translateX(${offset}px)`;
            if (spinMs) {
                let last = -1;
                const started = performance.now();
                const tick = () => {
                    if (this.unboxState !== state || state.skipped) return;
                    const t = Math.min(1, (performance.now() - started) / spinMs);
                    const index = Math.floor((1 - Math.pow(1 - t, 3)) * winnerIndex);
                    if (index !== last) window.StudBudSfx?.play('coin', 'ui', 0);
                    last = index;
                    if (t < 1) requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }
            await wait(spinMs + 250);
            if (this.unboxState !== state) return;
            strip.style.transition = 'none';
            const alignWinner = () => {
                strip.style.transition = 'none';
                strip.style.transform = `translateX(${this.unboxingLandingOffset(strip, winningTile, marker)}px)`;
            };
            alignWinner();
            if (window.ResizeObserver) {
                state.resizeObserver = new window.ResizeObserver(alignWinner);
                state.resizeObserver.observe(overlay.querySelector('.unbox-reel'));
            }
            overlay.classList.remove('phase-spin');
            overlay.classList.add('phase-reveal', `rarity-${item.rarity}`);
            const big = ['legendary', 'mythic'].includes(item.rarity);
            const pieces = big ? 64 : ['epic', 'rare'].includes(item.rarity) ? 40 : 22;
            overlay.querySelector('.unbox-confetti').innerHTML = reduce ? '' : Array.from({ length: pieces }, (_, index) =>
                `<i style="--x:${(Math.random() * 2 - 1).toFixed(2)};--y:${(-Math.random() - .35).toFixed(2)};--r:${Math.round(Math.random() * 720)}deg;--d:${(index % 8) * 35}ms;--h:${Math.round(Math.random() * 360)}"></i>`).join('');
            const again = games.boxPool(box).length && profile.coins >= box.price;
            winningTile?.classList?.add('is-winner');
            overlay.querySelector('.unbox-result').innerHTML = `<div class="unbox-card rarity-${item.rarity}${profile.duplicate ? ' is-duplicate' : ''}">
                    <span class="unbox-badge">${profile.duplicate ? 'Duplicate' : 'New!'}</span>
                    <span class="unbox-card-preview">${this.shopItemPreview(profile, item, true)}</span>
                    <small class="rarity-label">${this.escapeHTML(item.rarity)}${item.set ? ` · ${this.escapeHTML(item.set)} set` : ''}</small>
                    <strong>${this.escapeHTML(item.name)}</strong>
                    <span>${this.escapeHTML(this.mysteryDropMessage(item, profile))}</span>
                    ${item.description ? `<span>${this.escapeHTML(item.description)}</span>` : ''}
                    <div class="unbox-actions">
                        <button type="button" class="primary-btn" data-action="multiplayer-equip" data-id="${this.escapeHTML(item.id)}">Equip now</button>
                        ${again ? `<button type="button" class="secondary-btn" data-action="multiplayer-mystery" data-id="${this.escapeHTML(box.id)}" ${box.seasonal ? `data-season-month="${box.season.month}"` : ''}>Open another · ${box.price} <i class="fas fa-coins"></i></button>` : ''}
                        <button type="button" class="ghost-btn" data-action="unbox-close">Done</button>
                    </div>
                </div>`;
            overlay.querySelector('.unbox-skip')?.remove();
            overlay.querySelector('.unbox-actions .primary-btn')?.focus({ preventScroll: true });
            this.animateShopAuras();
            window.StudBudSfx?.play(big || item.rarity === 'epic' ? 'win' : 'success', 'ui', 0);
        }

        animateShopAuras() {
            window.StudBudArcade.util.observeAvatars();
        }

        async renderMultiplayerProfile(force = false, profile = null) {
            if (profile) return this.loadMultiplayerProfile(profile);
            if (this.multiplayerProfilePromise) return this.multiplayerProfilePromise;
            if (this.multiplayerProfile && !force) return;
            this.multiplayerProfilePromise = this.loadMultiplayerProfile();
            try {
                await this.multiplayerProfilePromise;
            } finally {
                this.multiplayerProfilePromise = null;
            }
        }

        async loadMultiplayerProfile(suppliedProfile = null) {
            const revision = this.multiplayerProfileRevision = (this.multiplayerProfileRevision || 0) + 1;
            const name = this.multiplayerDisplayName();
            const nameNodes = ['multiplayer-header-name', 'multiplayer-player-name', 'multiplayer-identity-badge'];
            nameNodes.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.innerHTML = `${this.escapeHTML(name)} ${this.accountTagMarkup(window.StudBudCloud?.user?.user_metadata?.username)}`;
            });
            const defaultAvatar = document.getElementById('multiplayer-header-avatar');
            if (defaultAvatar) defaultAvatar.innerHTML = this.multiplayerAvatarMarkup({});
            const shopStatus = document.getElementById('multiplayer-shop-status');
            if (!shopStatus) return;
            if (window.StudBudCloud?.isGuest?.()) {
                shopStatus.textContent = 'Guests can play every game. Create a free account to earn coins, unlock cosmetics and claim daily rewards.';
                this.renderGuestAppearance?.();
                return;
            }
            shopStatus.textContent = 'Loading your multiplayer profile…';
            document.getElementById('guest-appearance')?.classList.add('hidden');
            try {
                const profile = suppliedProfile || await window.StudBudCommunityGames.getPlayerProfile();
                if (revision !== this.multiplayerProfileRevision) return;
                this.multiplayerProfile = profile;
                const cosmetics = this.profileCosmetics(profile);
                [defaultAvatar, document.getElementById('multiplayer-large-avatar')].forEach(element => {
                    if (element) element.innerHTML = this.multiplayerAvatarMarkup(cosmetics, element.id === 'multiplayer-large-avatar');
                });
                const palette = profile.equipped_palette?.replace('palette_', '') || 'default';
                document.getElementById('multiplayer-view')?.setAttribute('data-game-palette', palette);
                ['multiplayer-wallet-coins', 'multiplayer-sidebar-coins', 'shop-wallet-coins'].forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.innerHTML = id.includes('sidebar')
                        ? `${Number(profile.coins).toLocaleString()} <i class="fas fa-coins" aria-hidden="true"></i>`
                        : Number(profile.coins).toLocaleString();
                });
                const wins = document.getElementById('multiplayer-wins');
                if (wins) wins.textContent = Number(profile.wins).toLocaleString();
                this.renderMultiplayerShop(profile);
                shopStatus.textContent = 'Earn coins from flashcard quizzes, solo and multiplayer games, and your daily reward. Staff test games do not award coins.';
                this.renderDailyReward(profile);
                const best = document.getElementById('waiting-runner-best');
                if (best) {
                    this.waitingRunner.best = Math.max(Number(profile.best_crossing_rows || 0), this.readWaitingBest());
                    best.textContent = String(this.waitingRunner.best);
                }
                this.renderAppearanceShopSchemes();
            } catch (error) {
                if (revision !== this.multiplayerProfileRevision) return;
                console.error('[NexusApp] Multiplayer profile could not load:', error);
                shopStatus.textContent = `Your multiplayer profile could not load. ${this.friendlyErrorMessage(error, 'Please refresh the page and try again.')}`;
            }
        }

        renderGuestAppearance() {
            const games = window.StudBudCommunityGames;
            const grid = document.getElementById('guest-appearance');
            if (!games || !grid) return;
            grid.classList.remove('hidden');
            this.multiplayerProfileRevision = (this.multiplayerProfileRevision || 0) + 1;
            const browse = { owned_items: [], coins: 0, user_id: 'guest' };
            this.multiplayerProfile = browse;
            this.lastDrop = null;
            this.renderMultiplayerShop(browse);
            this.renderAppearanceShopSchemes();
            const locker = document.getElementById('multiplayer-inventory-items');
            if (locker) locker.innerHTML = '<p class="settings-hint">Your locker fills up as you collect cosmetics. <button type="button" class="primary-btn" data-action="guest-create-account">Create free account</button></p>';
            const current = games.guestColor() || games.guestColors[0];
            const cosmetics = { color: current };
            [document.getElementById('multiplayer-header-avatar'), document.getElementById('multiplayer-large-avatar')].forEach(element => {
                if (element) element.innerHTML = this.multiplayerAvatarMarkup(cosmetics, element.id === 'multiplayer-large-avatar');
            });
            grid.innerHTML = `<div class="guest-colors"><h4>Pick your player color</h4><div class="guest-color-row">${games.guestColors.map(color => `
                <button type="button" class="guest-color${color === current ? ' active' : ''}" data-action="guest-color" data-color="${color}" style="--swatch:${color}" aria-label="Player color ${color}" aria-pressed="${color === current}"></button>`).join('')}</div>
                <p class="muted">Used in every game you join as a guest.</p></div>`;
            const reward = document.getElementById('daily-reward-btn');
            const rewardText = document.getElementById('daily-reward-text');
            if (reward) { reward.disabled = false; reward.textContent = 'Create free account'; reward.dataset.action = 'guest-create-account'; }
            if (rewardText) rewardText.textContent = 'Accounts earn coins, daily rewards and cosmetics. Your guest decks and progress come with you.';
            ['multiplayer-wallet-coins', 'multiplayer-sidebar-coins', 'shop-wallet-coins'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = '0';
            });
        }

        setGuestColor(color) {
            const games = window.StudBudCommunityGames;
            if (!games?.guestColors.includes(color)) return;
            window.localStorage.setItem('studbud-guest-color', color);
            this.renderGuestAppearance();
        }

        renderDailyReward(profile) {
            const reward = document.getElementById('daily-reward-btn');
            if (reward && reward.dataset.action !== 'claim-daily-reward') reward.dataset.action = 'claim-daily-reward';
            const button = document.getElementById('daily-reward-btn');
            const text = document.getElementById('daily-reward-text');
            if (!button || !text) return;
            const claimed = Boolean(profile?.daily_claimed);
            const streak = Number(profile?.daily_streak || 0);
            button.disabled = claimed;
            button.textContent = claimed ? 'Claimed today' : 'Claim reward';
            text.textContent = claimed
                ? `Come back tomorrow to keep your ${streak}-day coin-reward streak going. This is separate from your study streak.`
                : `Claim free coins once a day. Keep a coin-reward streak going for bigger rewards (up to 85 coins). This is separate from your study streak.`;
        }

        // ---- Username changes (once a week; the admin can force a rename) ----
        async refreshUsernameCard() {
            const input = document.getElementById('settings-username');
            const button = document.getElementById('change-username-btn');
            const hint = document.getElementById('username-hint');
            if (!input || !window.StudBudCloud?.user) return;
            const current = String(window.StudBudCloud.user.user_metadata?.username || '');
            if (document.activeElement !== input) input.value = current;
            try {
                const status = await window.StudBudCommunityGames.getUsernameStatus();
                this.usernameStatus = status;
                const locked = !status.can_change;
                input.disabled = locked; button.disabled = locked;
                if (this.isAdmin) hint.textContent = 'The admin account\'s username can\'t be changed.';
                else if (status.forced) hint.textContent = 'An admin has asked you to pick a new username. Choose one now.';
                else if (locked && status.next_change_at) hint.textContent = `You can change your username once every 7 days. Next change available ${new Date(status.next_change_at).toLocaleString()}.`;
                else hint.textContent = 'You can change your username once every 7 days. Use your new username the next time you sign in.';
                if (status.forced && !this.isAdmin) this.showForcedUsernameModal();
            } catch (error) {
                hint.textContent = 'Username changes are unavailable right now. If this persists, re-run supabase-setup.sql in Supabase.';
                input.disabled = true; button.disabled = true;
            }
        }

        async submitUsernameChange(name, statusEl) {
            const username = String(name || '').trim().toLowerCase();
            if (!/^[a-z0-9_]{3,24}$/.test(username)) { statusEl.textContent = 'Use 3–24 letters, numbers, or underscores.'; return false; }
            statusEl.textContent = 'Saving…';
            try {
                window.StudBudNameModeration.assertAllowed(username, 'Username');
                await window.StudBudCommunityGames.changeUsername(username);
                const cloud = window.StudBudCloud;
                const { data } = await cloud.client.auth.refreshSession();
                if (data?.user) cloud.user = data.user;
                const accountName = document.getElementById('account-name');
                if (accountName) accountName.innerHTML = `${this.escapeHTML(this.multiplayerDisplayName())} ${this.accountTagMarkup(username, this.userTags)}`;
                statusEl.textContent = `Username changed to ${username}. Use it the next time you sign in.`;
                document.getElementById('forced-username-modal')?.remove();
                await this.refreshUsernameCard();
                Promise.resolve(this.refreshStudyLeaderboard?.(this.studyLeaderboardPeriod)).catch(() => { });
                return true;
            } catch (error) {
                statusEl.textContent = this.friendlyErrorMessage(error, 'Could not change your username.');
                return false;
            }
        }

        showForcedUsernameModal() {
            if (document.getElementById('forced-username-modal')) return;
            const modal = document.createElement('div');
            modal.id = 'forced-username-modal';
            modal.className = 'forced-username-modal';
            modal.setAttribute('role', 'alertdialog');
            modal.setAttribute('aria-modal', 'true');
            modal.innerHTML = `<form class="glass-card forced-username-card">
                <h2>Please choose a new username</h2>
                <p>An admin has asked you to change your username. You need to pick a new one before you continue.</p>
                <input type="text" id="forced-username-input" maxlength="24" autocomplete="off" placeholder="New username" aria-label="New username">
                <p id="forced-username-status" class="community-status" role="status"></p>
                <button type="submit" class="primary-btn">Save new username</button></form>`;
            document.body.appendChild(modal);
            const input = modal.querySelector('input');
            input.focus();
            modal.querySelector('form').addEventListener('submit', event => {
                event.preventDefault();
                this.submitUsernameChange(input.value, modal.querySelector('#forced-username-status'));
            });
        }

        // Admin tools. The server re-checks the account on every call; this only controls what is shown.
        async refreshAdminAccess() {
            // Show the tab to the admin accounts even if the server isn't set up yet, so the page can explain what is missing.
            const name = String(window.StudBudCloud?.user?.user_metadata?.username || '').toLowerCase();
            const accountName = document.getElementById('account-name');
            if (accountName) accountName.innerHTML = `${this.escapeHTML(this.multiplayerDisplayName())} ${this.accountTagMarkup(name)}`;
            this.isAdmin = ['overit', 'andy'].includes(name);
            try { if (await window.StudBudCommunityGames.isAdmin()) this.isAdmin = true; } catch (error) { /* keep the name check */ }
            try {
                const tags = await window.StudBudCommunityGames.friendCall('studbud_user_tags_for', {
                    p_user_id: window.StudBudCloud?.user?.id
                });
                this.userTags = Array.isArray(tags) ? tags : [];
            } catch (error) {
                console.warn('[Profile] Could not load account tags:', error.message);
                this.userTags = [];
            }
            if (accountName) accountName.innerHTML = `${this.escapeHTML(this.multiplayerDisplayName())} ${this.accountTagMarkup(name, this.userTags)}`;
            this.canModerateFlashcards = this.isAdmin || this.userTags.includes('moderator');
            this.canTestGames = this.isAdmin || this.userTags.includes('tester');
            this.canAccessStaff = this.canModerateFlashcards || this.canTestGames;
            window.NexusApp.isAdmin = this.isAdmin;
            window.NexusApp.canAccessStaff = this.canAccessStaff;
            document.getElementById('admin-nav-item')?.classList.toggle('hidden', !this.canAccessStaff);
            this.classrooms?.refreshNav();
            if (this.classrooms?.available() && /^#\/?classes$/i.test(window.location.hash) && Router.activeRoute !== 'classes') Router.handleHashChange();
            document.querySelectorAll('#admin-view [data-admin-tab]').forEach(button => {
                const allowed = this.isAdmin || (['decks', 'reports', 'users'].includes(button.dataset.adminTab) && this.canModerateFlashcards)
                    || (button.dataset.adminTab === 'games' && this.canTestGames);
                button.classList.toggle('hidden', !allowed);
            });
            if (this.canAccessStaff && /^#\/?admin$/i.test(window.location.hash) && Router.activeRoute !== 'admin') Router.handleHashChange();
            this.refreshUsernameCard();
            this.loadPublicProfileCard();
        }

        async loadPublicProfileCard() {
            if (!document.getElementById('public-bio') || !window.StudBudCloud?.user) return;
            try {
                const p = await window.StudBudCommunityGames.friendCall('studbud_get_public_profile');
                document.getElementById('public-bio').value = p.bio || '';
                document.getElementById('public-subject').value = p.favorite_subject || '';
                document.getElementById('public-grade').value = p.grade_level || '';
                document.getElementById('public-goal').value = p.study_goal || '';
                document.getElementById('public-show-real-name').checked = p.show_real_name === true;
                document.getElementById('public-show-school').checked = p.show_school === true;
                document.getElementById('public-show-stats').checked = p.show_stats !== false;
                const profile = AppState.get('profile') || {};
                const school = this.isKnownSchool(p.school) ? p.school : 'pchs';
                if (profile.school !== school) AppState.set('profile', { ...profile, school });
                document.getElementById('settings-school').value = school;
                this.updateCourseSchoolFields();
                this.renderOtherGradeScaleEditor();
                this.updatePublicSchoolOption();
            } catch (error) {
                const status = document.getElementById('public-profile-status');
                if (status) status.textContent = 'Profile sharing is unavailable right now. Re-run supabase-setup.sql in Supabase.';
            }
        }

        async savePublicProfile() {
            const status = document.getElementById('public-profile-status');
            status.textContent = 'Saving…';
            try {
                window.StudBudNameModeration.assertAllowed(document.getElementById('settings-first-name').value, 'First name');
                window.StudBudNameModeration.assertAllowed(document.getElementById('settings-last-name').value, 'Last name');
                await window.StudBudCommunityGames.friendCall('studbud_set_public_profile', {
                    p_bio: document.getElementById('public-bio').value,
                    p_favorite_subject: document.getElementById('public-subject').value,
                    p_grade_level: document.getElementById('public-grade').value,
                    p_study_goal: document.getElementById('public-goal').value,
                    p_first_name: document.getElementById('settings-first-name').value.trim(),
                    p_last_name: document.getElementById('settings-last-name').value.trim(),
                    p_show_real_name: document.getElementById('public-show-real-name').checked,
                    p_show_school: document.getElementById('public-show-school').checked,
                    p_show_stats: document.getElementById('public-show-stats').checked
                });
                status.textContent = 'Saved. Your buds will see this on your profile.';
            } catch (error) {
                status.textContent = this.friendlyErrorMessage(error, 'Could not save your profile.');
            }
        }

        async loadSiteNotice(force = false) {
            const userId = this.noticeUserId();
            if (!userId || window.navigator?.onLine === false || !window.StudBudCommunityGames?.getSiteNotice) return;
            if (!force && this.siteNoticeUserId === userId && Date.now() - (this.siteNoticeCheckedAt || 0) < 60000) return;
            this.siteNoticeUserId = userId;
            this.siteNoticeCheckedAt = Date.now();
            try {
                const notice = await window.StudBudCommunityGames.getSiteNotice();
                if (this.noticeUserId() !== userId) return;
                this.siteNotice = notice;
                const panel = document.getElementById('site-notice');
                document.getElementById('site-notice-message').textContent = notice?.message || '';
                const metadata = document.getElementById('site-notice-metadata');
                if (metadata) metadata.textContent = notice?.published_at
                    ? `${this.formatAnnouncementTime(notice.published_at)} · By ${notice.author_name || 'Site administrator'}`
                    : '';
                const dismissalKey = `${userId}:${notice?.publication_id}`;
                let savedDismissal = false;
                if (notice?.publication_id) {
                    try {
                        savedDismissal = localStorage.getItem(this.siteNoticeDismissalKey(userId, notice.publication_id)) === '1';
                    } catch (error) {
                        console.warn('[Announcements] Could not read device dismissal:', error);
                    }
                }
                panel.classList.toggle('hidden', !notice?.active || notice.dismissed || savedDismissal || dismissalKey === this.dismissedSiteNotice);
            } catch (error) {
                console.warn('[Announcements] Could not load site notice:', error.message);
            }
        }

        noticeUserId() {
            return window.StudBudCloud?.user?.id || (window.StudBudCloud?.isGuest?.() ? 'guest' : null);
        }

        siteNoticeDismissalKey(userId, publicationId) {
            return `STUDBUD_NOTICE_DISMISSED:${userId}:${publicationId}`;
        }

        formatAnnouncementTime(timestamp) {
            return new Date(timestamp).toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', second: '2-digit'
            });
        }

        async dismissSiteNotice() {
            const notice = this.siteNotice;
            const userId = this.noticeUserId();
            const button = document.querySelector('[data-action="dismiss-site-notice"]');
            const status = document.getElementById('site-notice-status');
            if (this.siteNoticeDismissing) return;
            this.siteNoticeDismissing = true;
            button.disabled = true;
            status.textContent = 'Saving dismissal…';
            try {
                if (!notice?.publication_id || !userId) {
                    throw new Error('Saved announcement dismissals require the latest supabase-setup.sql. Rerun it in Supabase, then refresh.');
                }
                if (userId !== 'guest') await window.StudBudCommunityGames.dismissSiteNotice(notice.publication_id);
                this.dismissedSiteNotice = `${userId}:${notice.publication_id}`;
                try {
                    localStorage.setItem(this.siteNoticeDismissalKey(userId, notice.publication_id), '1');
                } catch (error) {
                    console.warn('[Announcements] Device dismissal could not be cached; account dismissal is saved:', error);
                }
                if (this.noticeUserId() === userId && this.siteNotice?.publication_id === notice.publication_id) {
                    this.siteNotice.dismissed = true;
                    document.getElementById('site-notice').classList.add('hidden');
                }
                status.textContent = '';
            } catch (error) {
                console.error('[Announcements] Could not save dismissal:', error);
                status.textContent = this.friendlyErrorMessage(error, 'Could not save your dismissal. Please try again.');
            } finally {
                this.siteNoticeDismissing = false;
                button.disabled = false;
            }
        }

        async loadAnnouncementHistory() {
            const list = document.getElementById('announcement-history');
            const status = document.getElementById('announcement-history-status');
            if (!list || !status) return;
            status.textContent = 'Loading announcements…';
            try {
                const history = await window.StudBudCommunityGames.getSiteNoticeHistory();
                const chronological = [...history].sort((a, b) => {
                    const byDate = Date.parse(b.published_at) - Date.parse(a.published_at);
                    return byDate || String(b.publication_id).length - String(a.publication_id).length
                        || String(b.publication_id).localeCompare(String(a.publication_id));
                });
                list.innerHTML = chronological.map((notice, index) => {
                    return `<li>${index === 0 ? '<strong>Latest announcement</strong> ' : ''}<time datetime="${this.escapeHTML(notice.published_at)}">${this.escapeHTML(this.formatAnnouncementTime(notice.published_at))}</time><small>By ${this.escapeHTML(notice.author_name || 'Site administrator')} ${this.accountTagMarkup(notice.author_name)}</small><p>${this.escapeHTML(notice.message)}</p></li>`;
                }).join('');
                status.textContent = history.length ? '' : 'No announcements have been published yet.';
            } catch (error) {
                console.error('[Announcements] Could not load history:', error);
                list.innerHTML = '';
                status.textContent = this.friendlyErrorMessage(error, 'Could not load announcement history. Please try again.');
            }
        }

        async loadAdminList() {
            const list = document.getElementById('admin-list');
            const status = document.getElementById('admin-status');
            if (!list || !this.canAccessStaff) return;
            let tab = this.adminTab || (this.canModerateFlashcards ? 'decks' : 'games');
            if (tab === 'decks' && !this.canModerateFlashcards) tab = 'games';
            if (tab === 'games' && !this.canTestGames) tab = 'decks';
            if ((['users', 'reports'].includes(tab) && !this.canModerateFlashcards) || (tab === 'notices' && !this.isAdmin)) tab = this.canModerateFlashcards ? 'decks' : 'games';
            this.adminTab = tab;
            document.getElementById('admin-search-form')?.classList.toggle('hidden', ['games', 'notices', 'reports'].includes(tab));
            if (tab === 'reports') {
                status.textContent = 'Loading reports?';
                try {
                    const rows = await window.StudBudCommunityGames.adminCall('studbud_admin_list_reports', { p_status: 'open' });
                    const esc = value => this.escapeHTML(String(value ?? ''));
                    const reasonLabel = { inappropriate: 'Inappropriate', wrong: 'Wrong answers', spam: 'Spam', copyright: 'Copyright', harassment: 'Harassment', other: 'Other' };
                    status.textContent = rows.length ? `${rows.length} reported item${rows.length === 1 ? '' : 's'} waiting for review.` : 'No open reports. Nice and quiet.';
                    list.innerHTML = rows.map(row => {
                        const isDeck = row.target_type === 'deck';
                        const gone = !row.target_name;
                        return `<article class="admin-row report-row">
                        <div><strong>${isDeck ? '<i class="fas fa-layer-group" aria-hidden="true"></i>' : '<i class="fas fa-user" aria-hidden="true"></i>'} ${esc(row.target_name || (isDeck ? 'Deleted set' : 'Deleted account'))}</strong>
                            <span class="admin-badge">${Number(row.report_count)} report${Number(row.report_count) === 1 ? '' : 's'}</span>
                            ${(row.reasons || []).map(reason => `<span class="deck-chip">${esc(reasonLabel[reason] || reason)}</span>`).join(' ')}
                            <ul class="report-details">${(row.reports || []).slice(0, 5).map(r => `<li><small>${esc(r.reporter)} ? ${esc(new Date(r.created_at).toLocaleString())}</small>${r.details ? `<p>${esc(r.details)}</p>` : ''}</li>`).join('')}</ul></div>
                        <div class="admin-actions">
                            ${isDeck && !gone ? `<button type="button" class="secondary-btn" data-admin-action="inspect-deck" data-id="${esc(row.target_id)}">Inspect cards</button>` : ''}
                            ${row.owner_id && !gone ? `<button type="button" class="secondary-btn" data-admin-action="profile" data-id="${esc(row.owner_id)}">${isDeck ? 'Author profile' : 'View profile'}</button>` : ''}
                            ${isDeck && !gone ? `<button type="button" class="danger-btn" data-admin-action="delete-deck" data-id="${esc(row.target_id)}" data-name="${esc(row.target_name)}" data-report-type="deck">Delete set</button>` : ''}
                            <button type="button" class="primary-btn" data-admin-action="resolve-report" data-report-type="${esc(row.target_type)}" data-id="${esc(row.target_id)}">Mark handled</button>
                            <button type="button" class="secondary-btn" data-admin-action="dismiss-report" data-report-type="${esc(row.target_type)}" data-id="${esc(row.target_id)}">Dismiss</button>
                        </div>${isDeck ? `<div id="admin-deck-${esc(row.target_id)}" class="admin-deck-details hidden"></div>` : ''}</article>`;
                    }).join('');
                } catch (error) {
                    status.textContent = this.friendlyErrorMessage(error, 'Could not load reports.');
                    list.innerHTML = '';
                }
                return;
            }
            if (tab === 'games') {
                status.textContent = 'Test games default to unlimited energy and never award rewards.';
                list.innerHTML = `<article class="admin-row">
                    <div><strong>Multiplayer game test bench</strong><small>Launch an arena with bots or share a room code with other testers. Test sessions do not award coins or affect leaderboards.</small></div>
                    <div class="admin-test-settings">
                        <label>Game to test<select id="admin-game-test-mode">
                            <option value="skyline">Escape to Space</option><option value="river">River Fishing</option>
                            <option value="defense">Team Tower Defense</option>
                            <option value="market">Package Delivery</option><option value="miner">Crystal Mining</option>
                            <option value="duel">King of the Hill</option><option value="shooter">Arena Shooter</option>
                            <option value="chess">Question Chess</option>
                        </select></label>
                        <label>Test mode<select id="admin-game-test-session"><option value="single">Single player (with bots)</option><option value="multiplayer">Multiplayer (other testers can join)</option></select></label>
                        <label>Simulated players (single player only)<select id="admin-game-test-bots"><option value="0">No bots</option><option value="1">1 bot</option><option value="2">2 bots</option><option value="3" selected>3 bots</option></select></label>
                        <label>Map seed (optional)<input id="admin-game-test-seed" type="number" min="0" max="4294967295" step="1" placeholder="Default map"></label>
                        <label>Energy<select id="admin-game-test-energy"><option value="unlimited">Unlimited</option><option value="limited">Limited</option></select></label>
                        <label id="admin-game-test-reward-label" class="hidden">Energy per question<input id="admin-game-test-reward" type="number" min="5" max="100" step="1" value="20" disabled><small>Question Chess always grants one move per answer.</small></label>
                    </div>
                    <div class="admin-actions">
                        <button type="button" class="primary-btn" data-admin-action="test-game"><i class="fas fa-flask" aria-hidden="true"></i> Launch test</button>
                    </div>
                </article>`;
                return;
            }
            if (tab === 'notices') {
                status.textContent = 'Loading announcement…';
                try {
                    const notice = await window.StudBudCommunityGames.getSiteNotice();
                    status.textContent = notice?.active ? 'This announcement is currently visible to signed-in students.' : 'No announcement is currently published.';
                    list.innerHTML = `<form id="admin-notice-form" class="admin-notice-form">
                        <label>Announcement message<textarea id="admin-notice-message" rows="5" maxlength="1000" required>${this.escapeHTML(notice?.message || '')}</textarea></label>
                        <small>Publish one site-wide message at a time. Students can dismiss it; updating the message makes it visible again.</small>
                        <div class="admin-actions"><button type="submit" class="primary-btn">Publish announcement</button>${notice?.active ? '<button type="button" class="secondary-btn" data-admin-action="hide-notice">Unpublish</button>' : ''}</div>
                    </form>`;
                    const history = await window.StudBudCommunityGames.getSiteNoticeHistory();
                    list.innerHTML += `<section class="admin-notice-history"><h4>Announcement history</h4><p class="settings-hint">Unpublish hides the current banner. Delete permanently removes a selected announcement for everyone.</p>${history.map(item => `<article class="admin-row"><div><strong>${this.escapeHTML(this.formatAnnouncementTime(item.published_at))}</strong><p>${this.escapeHTML(item.message)}</p><small>By ${this.escapeHTML(item.author_name || 'Site administrator')}</small></div><button type="button" class="danger-btn" data-admin-action="delete-notice" data-id="${this.escapeHTML(item.publication_id)}">Delete announcement</button></article>`).join('') || '<p>No announcements yet.</p>'}</section>`;
                } catch (error) {
                    status.textContent = this.friendlyErrorMessage(error, 'Could not load announcements.');
                    list.innerHTML = '';
                }
                return;
            }
            const query = document.getElementById('admin-search')?.value.trim() || '';
            status.textContent = 'Loading…';
            try {
                const games = window.StudBudCommunityGames;
                const rows = await games.adminCall(tab === 'users' ? 'studbud_admin_list_users' : 'studbud_admin_list_decks', { p_query: query });
                status.textContent = rows.length ? `${rows.length} shown` : 'Nothing found.';
                const esc = value => this.escapeHTML(String(value ?? ''));
                list.innerHTML = tab === 'users'
                    ? rows.map(user => {
                        const tags = Array.isArray(user.tags) ? user.tags : [];
                        const protectedAccount = !this.isAdmin && (user.id === window.StudBudCloud?.user?.id || tags.includes('moderator') || ['overit', 'andy'].includes(String(user.username).toLowerCase()));
                        const roleControl = this.isAdmin ? `<details class="admin-tools"><summary>Manage tags</summary><div class="admin-actions admin-tag-options">
                            ${[['teacher', 'Teacher'], ['tester', 'Tester'], ['moderator', 'Moderator']].map(([tag, label]) => `<label><input type="checkbox" data-user-tag="${tag}"${tags.includes(tag) ? ' checked' : ''}> ${label}</label>`).join('')}
                            <button type="button" class="primary-btn" data-admin-action="save-user-tags" data-id="${esc(user.id)}" data-name="${esc(user.username)}">Save tags</button>
                        </div></details>` : '';
                        return `<article class="admin-row">
                        <div><strong>${esc(user.username)} ${this.accountTagMarkup(user.username, tags)}</strong>${user.banned ? ' <span class="admin-badge">banned</span>' : ''}${user.force_change ? ' <span class="admin-badge">rename required</span>' : ''}
                        <small>${Number(user.coins)} coins · ${Number(user.wins)} wins · ${Number(user.decks)} public decks · School: ${esc(this.schoolTag(user.school) || 'Other')} · joined ${esc(new Date(user.created_at).toLocaleDateString())}</small></div>${roleControl}
                        <details class="admin-tools"><summary>Manage user</summary><div class="admin-actions">
                            <button type="button" class="secondary-btn" data-admin-action="profile" data-id="${esc(user.id)}">Public profile</button>
                            ${this.isAdmin ? `<button type="button" class="secondary-btn" data-admin-action="coins" data-id="${esc(user.id)}" data-name="${esc(user.username)}">Coins</button>` : ''}
                            ${protectedAccount ? '<small>This staff account cannot be moderated by your role.</small>' : `<button type="button" class="secondary-btn" data-admin-action="remove-decks" data-id="${esc(user.id)}" data-name="${esc(user.username)}">Remove decks</button>
                            <button type="button" class="secondary-btn" data-admin-action="${user.force_change ? 'cancel-rename' : 'force-rename'}" data-id="${esc(user.id)}" data-name="${esc(user.username)}">${user.force_change ? 'Cancel rename' : 'Force rename'}</button>
                            <button type="button" class="${user.banned ? 'secondary-btn' : 'danger-btn'}" data-admin-action="${user.banned ? 'unban' : 'ban'}" data-id="${esc(user.id)}" data-name="${esc(user.username)}">${user.banned ? 'Unban' : 'Ban'}</button>`}
                        </div><small>Last sign-in: ${esc(user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never')}${user.ban_reason ? ` · Ban reason: ${esc(user.ban_reason)}` : ''}</small></details></article>`;
                    }).join('')
                    : rows.map(deck => `<article class="admin-row">
                        <div><strong>${esc(deck.title)}</strong> <small>by ${esc(deck.owner)} ${this.accountTagMarkup(deck.owner)} · ${Number(deck.card_count)} cards · ${Number(deck.study_count)} studies</small>
                        ${deck.description ? `<small>${esc(deck.description)}</small>` : ''}
                        <small class="admin-preview">${(deck.preview || []).map(card => `${esc(card.front)} → ${esc(card.back)}`).join(' · ')}</small></div>
                        <details class="admin-tools"><summary>Review & moderate</summary><div class="admin-actions">
                            <button type="button" class="secondary-btn" data-admin-action="inspect-deck" data-id="${esc(deck.id)}">Inspect all cards</button>
                            <button type="button" class="secondary-btn" data-admin-action="profile" data-id="${esc(deck.owner_id)}">Author profile</button>
                            <button type="button" class="danger-btn" data-admin-action="delete-deck" data-id="${esc(deck.id)}" data-name="${esc(deck.title)}">Delete</button>
                        </div></details><div id="admin-deck-${esc(deck.id)}" class="admin-deck-details hidden"></div></article>`).join('');
            } catch (error) {
                status.textContent = this.friendlyErrorMessage(error, 'Could not load admin data.');
                list.innerHTML = '';
            }
        }

        async runAdminAction(action, data) {
            const games = window.StudBudCommunityGames;
            const status = document.getElementById('admin-status');
            try {
                if (['coins', 'save-user-tags', 'publish-notice', 'hide-notice', 'delete-notice'].includes(action) && !this.isAdmin) throw new Error('This action is restricted to administrators.');
                if (['inspect-deck', 'delete-deck', 'remove-decks', 'ban', 'unban', 'force-rename', 'cancel-rename', 'resolve-report', 'dismiss-report'].includes(action) && !this.canModerateFlashcards) throw new Error('This action requires a moderator or administrator.');
                if (action === 'test-game') {
                    if (!this.canTestGames) throw new Error('Game testing is available only to testers and administrators.');
                    const mode = document.getElementById('admin-game-test-mode')?.value;
                    if (!window.StudBudArcade?.games?.[mode]) throw new Error('Choose a valid game to test.');
                    const botCount = Number(document.getElementById('admin-game-test-bots').value);
                    const seedText = document.getElementById('admin-game-test-seed').value.trim();
                    const seed = seedText ? Number(seedText) : undefined;
                    if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)) throw new Error('Map seed must be a whole number from 0 to 4294967295.');
                    const limitedTestEnergy = document.getElementById('admin-game-test-energy')?.value === 'limited';
                    const questionReward = limitedTestEnergy ? Number(document.getElementById('admin-game-test-reward')?.value) : 100;
                    if (!Number.isInteger(questionReward) || questionReward < 5 || questionReward > 100) throw new Error('Energy per question must be a whole number from 5 to 100.');
                    if (document.getElementById('admin-game-test-session')?.value === 'multiplayer') {
                        await this.hostStaffTest(mode, seed, { limitedTestEnergy, questionReward });
                    } else this.startPractice(mode, { testing: true, limitedTestEnergy, timeLimitSeconds: 0, questionReward, botCount, seed });
                    return;
                } else if (action === 'inspect-deck') {
                    if (!this.canModerateFlashcards) throw new Error('Flashcard moderation is available only to moderators and administrators.');
                    const deck = await games.adminCall('studbud_admin_get_deck', { p_deck_id: data.id });
                    const panel = document.getElementById(`admin-deck-${data.id}`);
                    panel.innerHTML = `<details open><summary>${Number(deck.card_count)} cards · ${this.escapeHTML(deck.title)}</summary><ol class="admin-deck-cards">${deck.cards.map(card => `<li><strong>${this.escapeHTML(card.front)}</strong><p>${this.escapeHTML(card.back)}</p></li>`).join('')}</ol></details>`;
                    panel.classList.remove('hidden');
                    return;
                } else if (action === 'save-user-tags') {
                    if (!this.isAdmin) throw new Error('Only administrators can assign account tags.');
                    const row = document.querySelector(`[data-admin-action="save-user-tags"][data-id="${CSS.escape(data.id)}"]`)?.closest('.admin-row');
                    if (!row) throw new Error('The selected account controls are no longer available.');
                    const tags = [...row.querySelectorAll('[data-user-tag]:checked')].map(input => input.dataset.userTag);
                    await games.adminCall('studbud_admin_set_user_tags', { p_user_id: data.id, p_tags: tags });
                    await this.refreshAdminAccess();
                    status.textContent = `Tags updated for ${data.name}.`;
                    await this.loadAdminList();
                    return;
                } else if (action === 'profile') {
                    await this.openUserProfile(data.id);
                    return;
                } else if (action === 'delete-notice') {
                    if (!await window.StudBudDialogs.confirm('Permanently remove this announcement from the banner and history?')) return;
                    await games.adminCall('studbud_admin_delete_site_notice', { p_publication_id: data.id });
                    await this.loadSiteNotice(true);
                    await this.loadAnnouncementHistory();
                } else if (action === 'publish-notice' || action === 'hide-notice') {
                    const message = document.getElementById('admin-notice-message').value.trim();
                    if (action === 'publish-notice' && !message) throw new Error('Enter an announcement message.');
                    await games.adminCall('studbud_admin_set_site_notice', { p_message: message, p_active: action === 'publish-notice' });
                    await this.loadSiteNotice(true);
                    await this.loadAnnouncementHistory();
                } else if (action === 'resolve-report' || action === 'dismiss-report') {
                    await games.adminCall('studbud_admin_resolve_reports', { p_target_type: data.reportType, p_target_id: data.id, p_status: action === 'resolve-report' ? 'resolved' : 'dismissed' });
                    status.textContent = action === 'resolve-report' ? 'Report marked as handled.' : 'Report dismissed.';
                } else if (action === 'delete-deck') {
                    if (!await window.StudBudDialogs.confirm(`Remove "${data.name}" from the community and everyone's saved decks? Offline devices will remove it when they reconnect.`)) return;
                    await games.adminCall('studbud_admin_delete_deck', { p_deck_id: data.id });
                    await this.reconcileRemovedDecks();
                    if (data.reportType === 'deck') await games.adminCall('studbud_admin_resolve_reports', { p_target_type: 'deck', p_target_id: data.id, p_status: 'resolved' }).catch(() => {});
                } else if (action === 'remove-decks') {
                    if (!await window.StudBudDialogs.confirm(`Remove all public decks from ${data.name}, including everyone's saved copies? Offline devices will remove them when they reconnect.`)) return;
                    await games.adminCall('studbud_admin_remove_user_decks', { p_user_id: data.id });
                    await this.reconcileRemovedDecks();
                } else if (action === 'ban') {
                    const reason = await window.StudBudDialogs.prompt(`Ban ${data.name}? They will lose their public decks and can't publish new ones. Reason (optional):`);
                    if (reason === null) return;
                    await games.adminCall('studbud_admin_set_ban', { p_user_id: data.id, p_banned: true, p_reason: reason });
                    await this.reconcileRemovedDecks();
                } else if (action === 'force-rename') {
                    if (!await window.StudBudDialogs.confirm(`Force ${data.name} to choose a new username? They'll be blocked from the app until they do.`)) return;
                    await games.adminCall('studbud_admin_force_username', { p_user_id: data.id, p_force: true });
                } else if (action === 'cancel-rename') {
                    await games.adminCall('studbud_admin_force_username', { p_user_id: data.id, p_force: false });
                } else if (action === 'unban') {
                    await games.adminCall('studbud_admin_set_ban', { p_user_id: data.id, p_banned: false });
                } else if (action === 'coins') {
                    const input = await window.StudBudDialogs.prompt(`Add or remove coins for ${data.name} (use a negative number to remove):`, '100');
                    if (input === null) return;
                    const amount = Number(input);
                    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 2147483647) throw new Error('Enter a non-zero whole-number coin adjustment within the supported range.');
                    await games.adminCall('studbud_admin_adjust_coins', { p_user_id: data.id, p_delta: amount });
                }
                await this.loadAdminList();
            } catch (error) {
                status.textContent = this.friendlyErrorMessage(error, 'That admin action failed.');
            }
        }

        async claimDailyReward() {
            try {
                const profile = await window.StudBudCommunityGames.claimDailyReward();
                this.multiplayerProfile = profile;
                await this.renderMultiplayerProfile(true);
                window.StudBudSfx?.play('win', 'ui');
                document.getElementById('multiplayer-shop-status').textContent = `You claimed ${profile.daily_reward} coins! Streak: ${profile.daily_streak} day${profile.daily_streak === 1 ? '' : 's'}.`;
            } catch (error) {
                document.getElementById('multiplayer-shop-status').textContent = this.friendlyErrorMessage(error, 'Could not claim your reward right now.');
            }
        }

        setShopControlsBusy(busy) {
            if (!busy) {
                for (const [button, disabled] of this.shopBusyButtons || []) {
                    button.disabled = disabled;
                    button.removeAttribute('aria-busy');
                }
                this.shopBusyButtons = null;
                return;
            }
            this.shopBusyButtons ||= new Map();
            document.querySelectorAll('[data-action="multiplayer-buy"], [data-action="multiplayer-equip"], [data-action="multiplayer-unequip"], [data-action="multiplayer-mystery"], .scheme-option[data-shop-item]').forEach(button => {
                if (!this.shopBusyButtons.has(button)) this.shopBusyButtons.set(button, button.disabled);
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
            });
        }

        async updateMultiplayerShop(action, itemId, seasonMonth = null) {
            if (this.shopPurchaseBusy) {
                const status = document.getElementById('multiplayer-shop-status');
                if (status) status.textContent = 'A shop action is already in progress. Please wait.';
                return false;
            }
            this.shopPurchaseBusy = true;
            let box;
            try {
                this.setShopControlsBusy(true);
                const Games = window.StudBudCommunityGames.constructor;
                box = action === 'multiplayer-mystery' ? [Games.seasonalBox, ...Games.boxes].find(entry => entry.id === (itemId || 'basic')) : null;
                if (box?.seasonal && seasonMonth != null && Number(seasonMonth) !== box.season.month) {
                    if (this.multiplayerProfile) this.renderMultiplayerShop(this.multiplayerProfile);
                    throw new Error('The seasonal box has changed. Review the new rewards before opening it.');
                }
                if (box) { this.openUnboxing(box); this.unboxState.startedAt = performance.now(); }
                const previousProfile = this.multiplayerProfile || {};
                const profile = action === 'multiplayer-buy'
                    ? await window.StudBudCommunityGames.purchaseItem(itemId)
                    : action === 'multiplayer-mystery'
                        ? await window.StudBudCommunityGames.buyMysteryItem(itemId || 'basic', box?.season?.month)
                        : action === 'multiplayer-unequip'
                            ? await window.StudBudCommunityGames.unequipSlot(itemId)
                            : await window.StudBudCommunityGames.equipItem(itemId);
                if (action === 'multiplayer-equip') {
                    const equippedField = {
                        skin: 'equipped_skin',
                        hat: 'equipped_hat',
                        accessory: 'equipped_accessory',
                        effect: 'equipped_effect',
                        palette: 'equipped_palette'
                    };
                    const item = window.StudBudCommunityGames.catalog.find(entry => entry.id === itemId);
                    const field = item && equippedField[item.type];
                    if (!field || profile[field] !== itemId) {
                        throw new Error('The server did not equip that item in its own slot. Run the latest supabase-setup.sql and try again.');
                    }
                    if ((item.type === 'accessory' && profile.equipped_effect !== previousProfile.equipped_effect)
                        || (item.type === 'effect' && profile.equipped_accessory !== previousProfile.equipped_accessory)) {
                        throw new Error('The server changed your other equipped cosmetic. Run the latest supabase-setup.sql and try again.');
                    }
                }
                const unlockedItem = profile.unlocked_item;
                if (profile.collection_complete) {
                    throw new Error('Duplicate-enabled boxes need the latest supabase-setup.sql. No coins were spent. Ask the site admin to run it.');
                }
                if (action !== 'multiplayer-mystery') window.StudBudSfx?.play(action === 'multiplayer-buy' ? 'buy' : 'success', 'ui');
                this.multiplayerProfile = profile;
                if (action === 'multiplayer-mystery') this.lastDrop = { unlocked_item: unlockedItem, rarity: profile.rarity, duplicate: profile.duplicate, refund: profile.refund };
                await this.renderMultiplayerProfile(true, profile);
                if (action === 'multiplayer-mystery') {
                    const item = window.StudBudCommunityGames.catalog.find(entry => entry.id === unlockedItem);
                    document.getElementById('multiplayer-shop-status').textContent = this.mysteryDropMessage(item, profile);
                    await this.revealUnboxing(item, profile);
                }
                return true;
            } catch (error) {
                if (box) this.closeUnboxing();
                throw error;
            } finally {
                this.shopPurchaseBusy = false;
                this.setShopControlsBusy(false);
            }
        }

        renderAppearanceShopSchemes() {
            const owned = this.multiplayerProfile?.owned_items || [];
            document.querySelectorAll('.scheme-option[data-shop-item]').forEach(button => {
                const unlocked = owned.includes(button.dataset.shopItem);
                if (this.shopBusyButtons?.has(button)) this.shopBusyButtons.set(button, !unlocked);
                button.disabled = !unlocked || Boolean(this.shopPurchaseBusy);
                button.classList.toggle('scheme-locked', !unlocked);
                const note = button.querySelector('.scheme-lock-note');
                if (note) note.textContent = unlocked ? 'Unlocked · select to apply' : 'Unlock in multiplayer shop';
                button.setAttribute('aria-label', `${button.dataset.colorScheme} color scheme${unlocked ? ', unlocked' : ', locked; unlock in multiplayer shop'}`);
            });
            const current = AppState.get('settings')?.colorScheme || 'studbud';
            const activePremiumScheme = Array.from(document.querySelectorAll('.scheme-option[data-shop-item]'))
                .find(button => button.dataset.colorScheme === current);
            const equipped = window.StudBudCommunityGames?.catalog.find(item => item.type === 'palette' && item.id === this.multiplayerProfile?.equipped_palette);
            const selectedScheme = equipped?.color || (activePremiumScheme ? 'studbud' : current);
            if (selectedScheme !== current) {
                AppState.set('settings', { ...AppState.get('settings'), colorScheme: selectedScheme, schemePicked: true });
                this.applyAppearance();
            }
            document.querySelectorAll('.scheme-option').forEach(button => {
                const selected = button.dataset.colorScheme === selectedScheme;
                button.classList.toggle('selected', selected);
                button.setAttribute('aria-pressed', String(selected));
            });
        }

        updateMultiplayerGoalInputs() {
            const minutes = Number(document.getElementById('host-game-time')?.value || 5);
            const label = document.getElementById('host-game-time-value');
            if (label) label.textContent = minutes >= 60 ? '1 hour' : `${minutes} min`;
            const soloTime = document.getElementById('solo-game-time');
            const soloLabel = document.getElementById('solo-game-time-value');
            const unlimited = document.getElementById('solo-game-unlimited')?.checked;
            if (soloTime) soloTime.disabled = Boolean(unlimited) || Boolean(soloTime.closest('.multiplayer-goals')?.classList.contains('hidden'));
            if (soloTime && soloLabel) {
                const soloMinutes = Number(soloTime.value || 10);
                soloLabel.textContent = unlimited ? 'No limit' : soloMinutes >= 60 ? '1 hour' : `${soloMinutes} min`;
            }
        }

        questionRewardInfo(mode) {
            const resource = ({ miner: 'Fuel', frenzy: 'Bait', fishing: 'Bait', shooter: 'Ammo', crypto: 'Research cash', hack: 'Crypto', defense: 'Shared team cash' })[mode] || 'Energy';
            const multiplier = mode === 'crypto' ? 8 : ['hack', 'defense'].includes(mode) ? 3 : 1;
            return { resource, multiplier };
        }

        questionRewardValue(value) {
            const amount = Number(value);
            if (!Number.isInteger(amount) || amount < 5 || amount > 100) throw new Error('Choose a whole-number resource amount from 5 to 100.');
            return amount;
        }

        questionRewardRecommendation(mode) {
            const recommendations = {
                skyline: [20, 35, 'Default 30 energy buys 10 seconds of walking at 3 energy/s, or about 8-10 seconds of mixed climbing. Air steering costs 2/s, jumps 2, air/wall jumps 3 and dashes 8. Waiting is free.'],
                duel: [25, 45, 'About 10 seconds of fighting: swings cost 3, the Special 10 and shielding 5 per second.'],
                defense: [20, 40, 'Pays $60-120 into your shared team wallet; troops, enemies and upgrades all cost cash.'],
                miner: [30, 45, 'About 10 seconds of active mining: 7 seconds digging at 2.8 fuel/s plus 2.3 seconds jetting at 9 fuel/s uses about 40 fuel.'],
                river: [30, 50, 'Default 40 energy buys about 10 seconds of moving and casting: steering costs 3 energy/s and a net costs 4 energy. Waiting and riding a wave forward remain free.'],
                frenzy: [10, 20, 'About 10 seconds of fishing: each cast costs 10 bait and a full cast, bite and reel takes about 6-7 seconds.'],
                fishing: [10, 20, 'About 10 seconds of fishing: each cast costs 10 bait and a full cast, bite and reel takes about 6-7 seconds.'],
                market: [40, 60, 'Default 50 energy buys about 10 seconds of deliveries: walking costs 4 energy/s and sprinting 10/s. Walking without sprinting lasts 12.5 seconds; waiting is free.'],
                shooter: [50, 70, 'Default 60 ammo buys about 10 seconds of continuous basic fire at one shot per 0.16 seconds. Rapid weapons and the 30-ammo shockwave use it faster.'],
                crypto: [15, 30, 'Pays 120-240 research cash before analyst bonuses. Trading has no refill cycle.'],
                hack: [10, 25, 'Pays 30-75 crypto per mining answer. This changes payouts, not question frequency.']
            };
            const [min, max, explanation] = recommendations[mode] || recommendations.skyline;
            return { min, max, suggested: Math.round((min + max) / 10) * 5, explanation };
        }

        updateQuestionRewardGuidance(mode = this.selectedMultiplayerMode || 'skyline') {
            const { min, max, suggested, explanation } = this.questionRewardRecommendation(mode);
            for (const prefix of ['host', 'solo']) {
                const input = document.getElementById(`${prefix}-game-reward`);
                const guidance = document.getElementById(`${prefix}-game-reward-guidance`);
                if (!input || !guidance) continue;
                // the amount follows each game's recommendation until the player picks their own
                if (mode !== 'chess' && !input.dataset?.custom && Number(input.value) !== suggested) {
                    input.value = suggested;
                    const slider = document.querySelector(`[data-reward-slider="${prefix}-game-reward"]`);
                    if (slider) slider.value = suggested;
                }
                if (mode === 'chess') {
                    guidance.textContent = 'Chess always awards exactly one move per correct answer. Resource amount does not apply.';
                    continue;
                }
                const amount = Number(input.value);
                const warning = !Number.isInteger(amount) || amount < 5 || amount > 100 ? ' Choose a whole number from 5 to 100.'
                    : amount < min ? ' Below recommended: expect more frequent questions.'
                        : amount > max ? ' Above recommended: expect fewer questions or larger payouts.' : ' Within the recommended range.';
                guidance.textContent = `Recommended setting: ${min}-${max}. ${explanation}${warning} Recommendations are guidance; the allowed range is 5-100 in steps of 1. Play style affects pacing.`;
                const button = document.querySelector(`[data-action="recommended-reward"][data-id="${prefix}-game-reward"]`);
                if (button) button.textContent = `Use recommended: ${suggested}`;
            }
        }

        updateMultiplayerModeSetup(mode) {
            const chess = mode === 'chess';
            const lateJoin = document.getElementById('host-game-late-join');
            if (lateJoin) {
                lateJoin.disabled = chess;
                lateJoin.closest('label').classList.toggle('hidden', chess);
                document.getElementById('host-game-late-join-hint')?.classList.toggle('hidden', chess);
            }
            const controls = [
                document.getElementById('host-game-time')?.closest('.multiplayer-goals'),
                document.getElementById('host-game-reward')?.closest('.question-reward-control'),
                document.getElementById('solo-game-time')?.closest('.multiplayer-goals'),
                document.getElementById('solo-game-reward')?.closest('.question-reward-control')
            ];
            for (const control of controls.filter(Boolean)) {
                const hidden = chess || (mode === 'defense' && (control === controls[0] || control === controls[2]));
                control.classList.toggle('hidden', hidden);
                control.querySelectorAll('input, select, button').forEach(input => { input.disabled = hidden; });
            }
            const bots = document.getElementById('solo-game-bots');
            if (bots) {
                bots.closest('label')?.classList.toggle('hidden', chess);
                bots.disabled = chess;
            }
            this.updateMultiplayerGoalInputs();
            document.getElementById('chess-setup-note')?.classList.toggle('hidden', !chess);
            const soloNote = document.getElementById('solo-game-note');
            if (soloNote) soloNote.textContent = chess ? 'You play a computer opponent. One correct answer earns one move. No time limit; checkmate wins.'
                : mode === 'defense' ? 'Share cash from correct answers, not kills. Buy enemies to add +1 every wave against rivals. Reduce the opposing base to 0 HP.'
                : 'Same game as multiplayer, with computer players instead of a room. Correct answers earn coins when you are signed in.';
            const labels = {
                defense: ['Team Tower Defense', 'Red vs blue, 1v1 or teams. Questions earn team cash; kills do not. Each enemy purchase adds +1 to every future wave against rivals. First base to 0 HP loses.'],
                skyline: ['Escape to Space', 'Climb rooftop switchbacks, cross a factory and reach space. Lower routes can catch a fall.'],
                river: ['River Fishing', 'Catch fish, surf waves or hold left to paddle through them. Nearby rivals trigger an 8-second flashcard duel: answer first to steal fish points. Whirlpools spin and launch your boat.'],
                market: ['Package Delivery', 'Deliver packages across town and dodge cars.'],
                miner: ['Crystal Mining', 'Dig crystals, bank them at base, avoid lava.'],
                duel: ['King of the Hill', 'King of the Hill: hold the glowing zone to score and knock rivals off.'],
                crypto: ['Crypto Trading', 'Trade six assets and answer questions for cash.'],
                shooter: ['Arena Shooter', 'Twin-stick combat: dash, upgrade your blaster and battle rival pilots, with drones as a secondary threat.'],
                chess: ['Question Chess', '1v1 chess: each correct answer earns one move. Checkmate wins; the checked player has priority to escape.']
            };
            const [title, description] = labels[mode] || labels.skyline;
            document.getElementById('multiplayer-preview-title').textContent = title;
            document.getElementById('multiplayer-preview-description').textContent = description;
            const { resource, multiplier } = this.questionRewardInfo(mode);
            const resourceLabel = `${resource} per correct answer${multiplier > 1 ? ` (${multiplier}x setting${mode === 'crypto' ? ' + analysts' : ''})` : ''}`;
            for (const id of ['host-game-resource-label', 'solo-game-resource-label']) {
                const label = document.getElementById(id);
                if (label) label.textContent = resourceLabel;
                const slider = document.querySelector(`[data-reward-slider="${id === 'host-game-resource-label' ? 'host-game-reward' : 'solo-game-reward'}"]`);
                if (slider) slider.setAttribute('aria-label', resourceLabel);
            }
            this.updateQuestionRewardGuidance(mode);
        }

        setMultiplayerScreen(screen) {
            this.multiplayerScreen = ['join', 'solo'].includes(screen) ? screen : 'host';
            const hosting = this.multiplayerScreen !== 'join';
            const solo = this.multiplayerScreen === 'solo';
            document.getElementById('multiplayer-host-flow').classList.toggle('hidden', !hosting);
            document.getElementById('multiplayer-host-flow').setAttribute('aria-labelledby', solo ? 'multiplayer-solo-tab' : 'multiplayer-host-tab');
            document.getElementById('multiplayer-join-flow').classList.toggle('hidden', hosting);
            document.getElementById('host-game-form')?.classList.toggle('hidden', solo);
            document.getElementById('solo-game-settings')?.classList.toggle('hidden', !solo);
            document.getElementById('preview-solo-btn')?.classList.toggle('hidden', solo);
            const heading = document.getElementById('multiplayer-flow-heading');
            const subheading = document.getElementById('multiplayer-flow-subheading');
            if (heading) heading.textContent = solo ? 'Choose a singleplayer game' : 'Choose a live game';
            if (subheading) subheading.textContent = solo ? 'The same games as multiplayer, played on your own against computer players.' : 'Every correct answer powers a different animated challenge.';
            const title = document.getElementById('game-club-heading');
            const description = document.getElementById('game-club-description');
            if (title) title.textContent = solo ? 'Singleplayer Study Club' : 'Multiplayer Study Club';
            if (description) description.textContent = solo
                ? 'Choose a game, your flashcards and computer opponents. No room, invite code or waiting for other players.'
                : 'Race buds, earn coins, and customize your player. Multiplayer rewards stay separate from your school planner.';
            document.querySelectorAll('[data-multiplayer-tab]').forEach(tab => {
                const selected = tab.dataset.multiplayerTab === this.multiplayerScreen;
                tab.classList.toggle('selected', selected);
                tab.setAttribute('aria-selected', String(selected));
            });
            this.updateMultiplayerGoalInputs();
        }

        stopWaitingRunner() {
            this.waitingRunner.running = false;
            this.waitingRunner.started = false;
            this.waitingRunner.hop = null;
        }

        waitingBestKey() {
            return `studbud.scholar-crossing.rows-v2.${window.StudBudCloud?.user?.id || 'local'}`;
        }

        readWaitingBest() {
            try {
                const value = Number(localStorage.getItem(this.waitingBestKey()));
                return Number.isSafeInteger(value) && value >= 0 && value <= 100000 ? value : 0;
            }
            catch (_) { return 0; }
        }

        saveWaitingBestLocal(score) {
            const best = Math.max(this.readWaitingBest(), Math.floor(Number(score) || 0));
            try { localStorage.setItem(this.waitingBestKey(), String(best)); } catch (_) { /* Keep this best for the current run. */ }
            return best;
        }

        startWaitingRunner(reset = true) {
            const runner = this.waitingRunner;
            if (reset && runner.dead && runner.deathAge < 0.55) return;
            const profile = this.multiplayerProfile;
            const cloudBest = profile?.user_id === window.StudBudCloud?.user?.id ? Number(profile?.best_crossing_rows || 0) : 0;
            runner.best = Math.max(cloudBest, this.readWaitingBest());
            document.getElementById('waiting-runner-best').textContent = String(runner.best);
            if (reset) {
                runner.x = 4; runner.row = 0; runner.rowFloat = 0; runner.score = 0;
                runner.cameraX = Number.isFinite(runner.cameraX) ? runner.cameraX : 4;
                runner.cameraRow = runner.started ? runner.cameraRow : -3.5;
                runner.restarting = true; runner.clock = 0; runner.hop = null; runner.dead = false; runner.pressure = 0;
                runner.deathAge = 0; runner.bump = 0; runner.lanes = new Map();
                runner.coins = 0; runner.queued = null; runner.fx = [];
                runner.seed = Math.floor(Math.random() * 0x7fffffff) || 127;
                this.waitingLane(runner, 0);
                document.getElementById('waiting-runner-score').textContent = '0';
            }
            runner.running = true; runner.started = true;
            document.getElementById('waiting-runner-start').textContent = 'Restart warm-up';
        }

        waitingRandom(runner, row, salt = 0) {
            let value = Math.imul((row + runner.seed + salt) | 0, 0x45d9f3b);
            value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
            value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
            return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
        }

        waitingLane(runner, row) {
            if (row <= 0) {
                if (!runner.lanes.has(0)) runner.lanes.set(0, { row: 0, type: 'grass', blockers: [] });
                return runner.lanes.get(0);
            }
            if (runner.lanes.has(row)) return runner.lanes.get(row);
            const roll = this.waitingRandom(runner, row, 3), previous = runner.lanes.get(row - 1)?.type;
            let type = roll < 0.32 ? 'grass' : roll < 0.65 ? 'road' : roll < 0.89 ? 'river' : 'rail';
            if (type === 'rail' && previous === 'rail') type = 'grass';
            const direction = this.waitingRandom(runner, row, 7) < 0.5 ? -1 : 1;
            // Traffic and currents speed up gradually the further you get.
            const ramp = 1 + Math.min(row, 220) / 240;
            const lane = { row, type, blockers: [], speed: (0.55 + this.waitingRandom(runner, row, 5) * 0.85) * direction * (1 + (ramp - 1) * 0.5), phase: this.waitingRandom(runner, row, 11) * 9 };
            if (type === 'grass') {
                for (let col = 0; col < 9; col++) if (col !== 4 && this.waitingRandom(runner, row, col + 19) < 0.22) lane.blockers.push({ col, kind: this.waitingRandom(runner, row, col + 41) < 0.66 ? 'tree' : 'rock' });
            } else if (type === 'road') {
                lane.speed = direction * (1.2 + this.waitingRandom(runner, row, 81) * 2.8) * ramp;
                lane.vehicles = [0, 1, 2].map(i => ({ x: i * 5 + this.waitingRandom(runner, row, i + 53) * 1.7, w: this.waitingRandom(runner, row, i + 71) < 0.35 ? 2.1 : 1.1, speed: lane.speed, color: ['#38bdf8', '#fbbf24', '#f472b6', '#a78bfa', '#ef4444', '#f8fafc'][Math.floor(this.waitingRandom(runner, row, i + 91) * 6)] }));
            }
            if ((type === 'grass' || type === 'road') && this.waitingRandom(runner, row, 151) < (type === 'grass' ? 0.2 : 0.12)) {
                const col = Math.floor(this.waitingRandom(runner, row, 157) * 9);
                if (!lane.blockers.some(blocker => blocker.col === col)) lane.coin = { col, taken: false };
            }
            if (type === 'river') {
                lane.platforms = [0, 1, 2].map(i => ({ x: i * 4.5 + this.waitingRandom(runner, row, i + 101), w: 2.2 + this.waitingRandom(runner, row, i + 121) * 0.7, speed: lane.speed, kind: 'log' }));
                if (this.waitingRandom(runner, row, 137) < 0.6) lane.platforms.push({ x: 1 + Math.floor(this.waitingRandom(runner, row, 139) * 7), w: 0.82, speed: 0, kind: 'pad' });
            }
            runner.lanes.set(row, lane);
            return lane;
        }

        waitingWrap(value, length) { return ((value % length) + length) % length; }
        waitingVehicleX(lane, vehicle, time) { return this.waitingWrap(vehicle.x + (vehicle.speed ?? lane.speed) * time + 3, 17) - 3; }
        waitingPlatformX(lane, platform, time) { return platform.kind === 'pad' ? platform.x : this.waitingWrap(platform.x + (platform.speed ?? lane.speed) * time + 3, 14) - 3; }

        pointOnCanvas(canvas, event) {
            const bounds = canvas.getBoundingClientRect();
            return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        }

        waitingHop(dx, dy) {
            const runner = this.waitingRunner;
            if (runner.dead && runner.deathAge < 0.55) return;
            if (runner.dead || !runner.running) this.startWaitingRunner();
            // Buffer one input pressed mid-hop so quick taps never feel dropped.
            if (runner.hop) { runner.queued = [dx, dy]; return; }
            if (!runner.running || runner.restarting) return;
            const row = Math.max(0, runner.row + dy), destination = this.waitingLane(runner, row);
            const onLand = destination.type === 'grass' || destination.type === 'road' || destination.type === 'rail';
            const col = Math.max(0, Math.min(8, onLand ? Math.round(runner.x + dx) : runner.x + dx));
            if (Math.abs(col - runner.x) < 0.01 && row === runner.row) return;
            const blocked = destination.blockers.some(blocker => blocker.col === Math.round(col));
            runner.hop = { x: runner.x, from: runner.row, to: row, targetX: col, dx, dy, elapsed: 0, duration: blocked ? 0.22 : 0.2, t: 0, blocked };
            if (blocked) runner.bump = 0.22;
            window.StudBudSfx?.play(blocked ? 'act' : 'jump', 'game');
        }

        beginWaitingHop(event) {
            event.preventDefault();
            if (this.waitingRunner.dead && this.waitingRunner.deathAge < 0.55) return;
            if (!this.waitingRunner.running || this.waitingRunner.dead) this.startWaitingRunner();
            this.waitingRunner.pointer = this.pointOnCanvas(event.currentTarget, event);
            event.currentTarget.setPointerCapture?.(event.pointerId);
        }

        finishWaitingHop(event) {
            const runner = this.waitingRunner, start = runner.pointer;
            runner.pointer = null;
            if (!start || event.type === 'pointercancel') return;
            const end = this.pointOnCanvas(event.currentTarget, event), dx = end.x - start.x, dy = end.y - start.y;
            const threshold = Math.max(22, event.currentTarget.getBoundingClientRect().width / 18);
            if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) this.waitingHop(0, 1);
            else if (Math.abs(dx) > Math.abs(dy)) this.waitingHop(dx > 0 ? 1 : -1, 0);
            else this.waitingHop(0, dy < 0 ? 1 : -1);
            event.preventDefault();
        }

        waitingDeath(reason) {
            const runner = this.waitingRunner;
            if (runner.dead) return;
            runner.dead = true; runner.running = false; runner.hop = null; runner.deathReason = reason;
            runner.deathAge = 0;
            window.StudBudSfx?.play(reason.startsWith('Splash!') || reason === 'Carried beyond the bank' ? 'splash' : 'hit', 'game');
            document.getElementById('waiting-runner-start').textContent = 'Oops...';
            this.saveWaitingRunnerBest();
        }

        waitingPlatformAt(lane, x, time) {
            const platforms = lane.platforms || [];
            const covers = platform => Math.abs(x - this.waitingPlatformX(lane, platform, time)) <= platform.w / 2 + (platform.kind === 'log' ? 0.1 : 0.04);
            return platforms.find(platform => platform.kind === 'pad' && covers(platform))
                || platforms.find(platform => platform.kind === 'log' && covers(platform));
        }

        waitingPlatformCovers(lane, x, time) { return Boolean(this.waitingPlatformAt(lane, x, time)); }

        waitingTrain(lane, time) {
            const phase = this.waitingWrap(time + lane.phase, 9);
            if (phase < 6 || phase > 7.65) return null;
            return { x: lane.speed > 0 ? -6 + (phase - 6) * 16 : 14 - (phase - 6) * 16, w: 5.4, active: true };
        }

        // Sweep relative motion against an expanded AABB, including the ground footprint mid-hop.
        waitingSweptHit(from, to, x0, x1, row, halfWidth, halfHeight = 0.28) {
            const px = from.x - x0, py = from.row - row;
            const vx = to.x - x1 - px, vy = to.row - row - py;
            const limits = [halfWidth + 0.23, halfHeight + 0.21];
            let enter = 0, exit = 1;
            for (const [p, v, bound] of [[px, vx, limits[0]], [py, vy, limits[1]]]) {
                if (Math.abs(v) < 1e-9) { if (Math.abs(p) > bound) return false; }
                else {
                    const a = (-bound - p) / v, b = (bound - p) / v;
                    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
                    if (enter > exit) return false;
                }
            }
            return true;
        }

        stepWaitingRunner(elapsed) {
            const runner = this.waitingRunner, dt = Math.min(0.1, Math.max(0, elapsed));
            if (!runner.started) return;
            if (runner.dead) {
                runner.deathAge += dt;
                if (runner.deathAge >= 0.55) document.getElementById('waiting-runner-start').textContent = 'Run again';
                return;
            }
            if (!runner.running) return;
            if (runner.fx?.length) runner.fx = runner.fx.filter(effect => (effect.age += dt) < 0.7);
            runner.cameraX += (4 + (runner.viewCols < 9 ? (runner.x - 4) * 0.38 : 0) - runner.cameraX) * (1 - Math.exp(-4 * dt));
            if (runner.restarting) {
                runner.cameraRow += (-3.5 - runner.cameraRow) * (1 - Math.exp(-7 * dt));
                if (Math.abs(runner.cameraRow + 3.5) < 0.08) runner.restarting = false;
                else return;
            }
            const steps = Math.max(1, Math.ceil(dt * 240)), tick = dt / steps;
            for (let step = 0; step < steps && !runner.dead; step++) {
                const before = { x: runner.x, row: runner.rowFloat ?? runner.row }, oldTime = runner.clock;
                runner.clock += tick;
                runner.cameraRow += tick * (0.85 + Math.min(0.65, Math.max(0, runner.score - 12) * 0.0025));
                const followAhead = (runner.rowFloat ?? runner.row) - 3.5 - runner.cameraRow;
                if (followAhead > 0) runner.cameraRow += followAhead * (1 - Math.exp(-7 * tick));
                const ahead = Math.max(runner.row + 9, Math.ceil(runner.cameraRow + 13));
                for (let row = Math.max(0, Math.floor(runner.cameraRow) - 2); row <= ahead; row++) this.waitingLane(runner, row);
                let landed = false;
                if (runner.hop) {
                    const hop = runner.hop;
                    hop.elapsed += tick; hop.t = Math.min(1, hop.elapsed / hop.duration);
                    const ease = hop.t * hop.t * (3 - 2 * hop.t);
                    const travel = hop.blocked ? Math.sin(hop.t * Math.PI) * 0.18 : ease;
                    runner.x = hop.x + (hop.targetX - hop.x) * travel;
                    runner.rowFloat = hop.from + (hop.to - hop.from) * travel;
                    if (hop.t >= 1) {
                        runner.x = hop.blocked ? hop.x : hop.targetX;
                        runner.row = hop.blocked ? hop.from : hop.to; runner.rowFloat = runner.row;
                        runner.hop = null; landed = true;
                        if (!hop.blocked) (runner.fx ||= []).push({ x: runner.x, row: runner.row, age: 0, kind: 'dust' });
                        const landLane = this.waitingLane(runner, runner.row);
                        if (landLane.coin && !landLane.coin.taken && Math.round(runner.x) === landLane.coin.col) {
                            landLane.coin.taken = true; runner.coins = (runner.coins || 0) + 1;
                            runner.fx.push({ x: runner.x, row: runner.row, age: 0, kind: 'coin' });
                            window.StudBudSfx?.play('coin', 'game');
                        }
                        if (runner.row > runner.score) {
                            runner.score = runner.row; document.getElementById('waiting-runner-score').textContent = String(runner.score);
                            if (runner.score > runner.best) {
                                runner.best = this.saveWaitingBestLocal(runner.score);
                                document.getElementById('waiting-runner-best').textContent = String(runner.best);
                            }
                        }
                        const landedLane = this.waitingLane(runner, runner.row);
                        if (landedLane.type === 'river') {
                            const platform = this.waitingPlatformAt(landedLane, runner.x, runner.clock);
                            if (!platform) { this.waitingDeath('Splash! Missed a log or lily pad'); break; }
                            runner.ridingPlatform = platform.kind;
                            if (platform.kind === 'log') runner.fx.push({ x: runner.x, row: runner.row, age: 0, kind: 'log-land' });
                        } else runner.ridingPlatform = null;
                        if (!hop.blocked) window.StudBudSfx?.play('act', 'game', 45, .35);
                    }
                } else {
                    const lane = this.waitingLane(runner, runner.row);
                    if (lane.type === 'river') {
                        const platform = this.waitingPlatformAt(lane, runner.x, oldTime);
                        if (!platform) { this.waitingDeath('Splash! Missed a log or lily pad'); break; }
                        runner.ridingPlatform = platform.kind;
                        if (platform.kind !== 'pad') runner.x += (platform.speed ?? lane.speed) * tick;
                    } else {
                        runner.ridingPlatform = null;
                    }
                }
                const after = { x: runner.x, row: runner.rowFloat ?? runner.row };
                for (let row = Math.max(1, Math.floor(Math.min(before.row, after.row) - 0.5)); row <= Math.ceil(Math.max(before.row, after.row) + 0.5); row++) {
                    const lane = this.waitingLane(runner, row);
                    if (lane.type === 'road') for (const vehicle of lane.vehicles) {
                        const x0 = this.waitingVehicleX(lane, vehicle, oldTime);
                        const x1 = x0 + (vehicle.speed ?? lane.speed) * tick;
                        if (this.waitingSweptHit(before, after, x0, x1, row, vehicle.w / 2 - 0.07)) { this.waitingDeath('Bumped by traffic'); break; }
                    }
                    if (lane.type === 'rail') {
                        const train = this.waitingTrain(lane, runner.clock), previous = this.waitingTrain(lane, oldTime);
                        if (train && this.waitingSweptHit(before, after, previous?.x ?? train.x, train.x, row, train.w / 2 - 0.08, 0.34)) this.waitingDeath('The express caught you');
                    }
                }
                if (runner.dead) break;
                if (landed && runner.queued) { const [qx, qy] = runner.queued; runner.queued = null; this.waitingHop(qx, qy); }
                if (landed && this.waitingLane(runner, runner.row).type === 'river' && !this.waitingPlatformCovers(this.waitingLane(runner, runner.row), runner.x, runner.clock)) this.waitingDeath('Splash! Missed a log or lily pad');
                if (runner.x < -0.28 || runner.x > 8.28 || (!runner.hop && this.waitingLane(runner, runner.row).type === 'river' && Math.abs(runner.x - runner.cameraX) > (runner.viewCols || 9) / 2 + 0.23)) this.waitingDeath('Carried beyond the bank');
                if (after.row < runner.cameraRow - 1.15) this.waitingDeath('The trail caught up');
                runner.pressure = Math.max(0, runner.cameraRow - after.row + 2.25);
                runner.bump = Math.max(0, (runner.bump || 0) - tick);
            }
        }

        async saveWaitingRunnerBest() {
            const runner = this.waitingRunner;
            if (runner.score > 0) runner.best = Math.max(runner.best, this.saveWaitingBestLocal(runner.score));
            if (!window.StudBudCommunityGames?.hasAccount?.()) return;
            if (runner.saving || runner.score <= 0 || runner.score <= Number(this.multiplayerProfile?.best_crossing_rows || 0)) return;
            const accountKey = this.waitingBestKey();
            runner.saving = true;
            try {
                const profile = await window.StudBudCommunityGames.recordWaitingGameBest(runner.score);
                if (accountKey !== this.waitingBestKey()) return;
                this.multiplayerProfile = profile;
                runner.best = Math.max(Number(profile.best_crossing_rows || 0), this.readWaitingBest());
                document.getElementById('waiting-runner-best').textContent = String(runner.best);
            } catch (error) {
                console.error('[NexusApp] Warm-up personal best could not sync:', error);
                document.getElementById('hosted-game-message').textContent = `Run complete. Your personal best could not sync. ${this.friendlyErrorMessage(error)}`;
            } finally {
                runner.saving = false;
            }
        }

        startMultiplayerAnimation() {
            if (!this.multiplayerVisibilityHandler) {
                this.multiplayerVisibilityHandler = () => {
                    if (document.visibilityState === 'hidden') this.stopMultiplayerAnimation();
                    else if (Router.activeRoute === 'multiplayer') this.startMultiplayerAnimation();
                };
                document.addEventListener('visibilitychange', this.multiplayerVisibilityHandler);
            }
            if (this.multiplayerFrame) return;
            if (!this.livePreviews) this.livePreviews = new Map();
            this.multiplayerFrameTime = performance.now();
            const animate = now => {
                this.multiplayerFrame = null;
                if (Router.activeRoute !== 'multiplayer' || document.visibilityState === 'hidden') {
                    this.stopMultiplayerAnimation();
                    return;
                }
                const delta = Math.min(0.1, Math.max(0, (now - this.multiplayerFrameTime) / 1000));
                this.multiplayerFrameTime = now;
                if (document.body.classList.contains('mpg-active')) {
                    this.livePreviews.clear();
                    this.multiplayerFrame = requestAnimationFrame(animate);
                    return;
                }
                const drawPreviews = now - (this.lastPreviewDrawAt ?? -Infinity) >= 1000 / (window.StudBudArcade?.graphicsProfile().previewFps || 24);
                if (drawPreviews) {
                    this.lastPreviewDrawAt = now;
                    for (const canvas of document.querySelectorAll('.mode-preview-canvas')) {
                        if (this.canvasIsVisible(canvas)) this.drawLivePreview(canvas, canvas.dataset.previewMode, now);
                        else if (this.livePreviews.has(canvas)) this.livePreviews.delete(canvas);
                    }
                    const preview = document.getElementById('multiplayer-game-canvas');
                    const previewActive = !document.getElementById('multiplayer-host-flow').classList.contains('hidden');
                    if (previewActive && this.canvasIsVisible(preview)) this.drawLivePreview(preview, this.selectedMultiplayerMode, now);
                    const roomActive = this.hostedGameRoom && this.hostedGameRoom.status !== 'waiting' && !document.getElementById('hosted-game-room').classList.contains('hidden');
                    const roomCanvas = document.getElementById('multiplayer-room-canvas');
                    if (roomActive && this.canvasIsVisible(roomCanvas)) this.drawLivePreview(roomCanvas, this.hostedGameRoom.mode, now);
                }
                const waiting = document.getElementById('waiting-arcade-card');
                if (waiting && !waiting.classList.contains('hidden') && this.canvasIsVisible(document.getElementById('waiting-runner-canvas'))) {
                    this.stepWaitingRunner(delta);
                    // the waiting runner is playable, so it renders every display frame rather than at the thumbnail rate
                    this.drawWaitingWarmup(document.getElementById('waiting-runner-canvas'), now / 1000);
                }
                this.multiplayerFrame = requestAnimationFrame(animate);
            };
            this.multiplayerFrame = requestAnimationFrame(animate);
        }

        canvasIsVisible(canvas) {
            if (!canvas || !canvas.isConnected || canvas.getClientRects().length === 0) return false;
            const rect = canvas.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
        }

        stopMultiplayerAnimation() {
            if (this.multiplayerFrame) cancelAnimationFrame(this.multiplayerFrame);
            this.multiplayerFrame = null;
            if (this.livePreviews) this.livePreviews.clear();
        }

        drawCharacter(context, x, y, color, scale, time, swinging = false, accessoryId = '', tool = '') {
            context.save();
            context.translate(x, y + Math.sin(time * 7 + x) * 1.8);
            context.scale(scale, scale);
            context.lineCap = 'round';
            context.lineWidth = 7;
            context.strokeStyle = '#172033';
            const swing = swinging ? Math.sin(time * 8) * 0.7 : Math.sin(time * 5) * 0.18;
            context.beginPath();
            context.moveTo(-5, 20); context.lineTo(-10, 34 + Math.sin(time * 7) * 2);
            context.moveTo(5, 20); context.lineTo(11, 34 - Math.sin(time * 7) * 2);
            context.moveTo(-7, 4); context.lineTo(-15, 16);
            context.moveTo(7, 4); context.lineTo(15, 16);
            context.stroke();
            context.fillStyle = color;
            context.beginPath(); context.roundRect(-11, -2, 22, 27, 8); context.fill();
            context.fillStyle = '#ffd8b1';
            context.beginPath(); context.arc(0, -11, 11, 0, Math.PI * 2); context.fill();
            context.fillStyle = '#243147';
            context.beginPath(); context.arc(0, -15, 11, Math.PI, Math.PI * 2); context.fill();
            context.fillStyle = '#fff';
            context.beginPath(); context.arc(4, -10, 2.5, 0, Math.PI * 2); context.fill();
            context.fillStyle = '#172033';
            context.beginPath(); context.arc(5, -10, 1.1, 0, Math.PI * 2); context.fill();
            if (accessoryId === 'accessory_cap') {
                context.fillStyle = '#f8d46a';
                context.beginPath(); context.ellipse(0, -21, 12, 5, 0, Math.PI, Math.PI * 2); context.fill();
                context.fillRect(-12, -22, 18, 3);
            } else if (accessoryId === 'accessory_halo') {
                context.strokeStyle = '#ffe786';
                context.lineWidth = 3;
                context.beginPath(); context.ellipse(0, -28, 12, 4, 0, 0, Math.PI * 2); context.stroke();
            } else if (accessoryId === 'accessory_headphones') {
                context.strokeStyle = '#71d9ff';
                context.lineWidth = 4;
                context.beginPath(); context.arc(0, -11, 13, Math.PI, Math.PI * 2); context.stroke();
                context.fillStyle = '#71d9ff';
                context.beginPath(); context.roundRect(-14, -14, 5, 10, 2); context.roundRect(9, -14, 5, 10, 2); context.fill();
            }
            if (tool) {
                context.save();
                context.translate(13, 5);
                context.rotate(swinging ? swing : -0.15);
                if (tool === 'hammer' || tool === 'pickaxe') {
                    context.strokeStyle = '#9b694b';
                    context.lineWidth = 5;
                    context.beginPath(); context.moveTo(0, 0); context.lineTo(28, -25); context.stroke();
                    context.fillStyle = tool === 'hammer' ? '#94a3b8' : '#b8c1d2';
                    context.beginPath();
                    if (tool === 'hammer') context.roundRect(20, -38, 24, 17, 5);
                    else {
                        context.moveTo(19, -33); context.lineTo(38, -42); context.lineTo(30, -27); context.closePath();
                    }
                    context.fill();
                } else if (tool === 'blaster') {
                    context.fillStyle = '#90e8ff';
                    context.beginPath(); context.roundRect(7, -6, 29, 10, 3); context.fill();
                    context.fillStyle = '#f9df7b';
                    context.fillRect(32, -3, 9, 4);
                } else if (tool === 'rod') {
                    context.strokeStyle = '#e5c78d';
                    context.lineWidth = 3;
                    context.beginPath(); context.moveTo(0, 0); context.lineTo(28, -34); context.lineTo(43, -8); context.stroke();
                    context.fillStyle = '#ffb36e';
                    context.beginPath(); context.arc(43, -7, 3, 0, Math.PI * 2); context.fill();
                }
                context.restore();
            }
            context.restore();
        }

        // ---- Simulated lobby players for the live previews: they fight each other and the demo player like a real match ----
        initPreviewBots(demo, mode, game) {
            const U = window.StudBudArcade.util;
            const names = [['b1', 'Nova', '#f472b6'], ['b2', 'Kite', '#facc15'], ['b3', 'Rook', '#4ade80']].slice(0, mode === 'chess' ? 1 : 3);
            const bots = names.map(([id, name, color], i) => {
                const rng = U.mulberry32(U.hashStr(`${mode}:${id}:studbud-bot`));
                const bot = {
                    id, name, color, cos: { skin: ['skin_robot', 'skin_ninja', 'skin_alien'][i] }, i, x: 0, y: 0, vx: 0, vy: 0, f: 0, a: 0, hp: 100, ex: {}, score: 0,
                    tx: 0, ty: 0, respawn: 0, invuln: 0, stun: 0, cd: rng(), seen: performance.now(),
                    ai: { rng, speed: 0.82 + rng() * 0.42, aggression: 0.25 + rng() * 0.65, reaction: 0.16 + rng() * 0.48,
                        area: (i + rng() * 0.55) / names.length, lane: i, side: i % 2 ? 1 : -1, phase: rng() * Math.PI * 2,
                        nextThink: 0, target: null, targetUntil: 0, lastX: 0, lastY: 0, stuck: 0, route: i }
                };
                const W = game.W || game.WIDTH || 1600, H = game.H || 800;
                bot.x = W * (0.16 + i * 0.32); bot.y = H * (0.28 + (i % 2) * 0.42);
                if (mode === 'miner') {
                    const sector = this.minerSectors(game)[i];
                    bot.w = 26; bot.h = 40; bot.x = ((sector[0] + sector[1]) / 2) * 48 - bot.w / 2;
                    bot.y = 4 * 48 - bot.h; bot.vx = 0; bot.vy = 0;
                    bot.ai.sector = sector; bot.ai.dig = null; bot.ai.fuel = 100;
                } else if (mode === 'market') {
                    bot.r = 15;
                    bot.x = game.roadsX[i + 1]; bot.y = game.roadsY[1];
                }
                return bot;
            });
            if (mode === 'duel') {
                const sp = game.botSpawns;
                bots.forEach((b, i) => Object.assign(b, { w: 34, h: 56, sp: sp[i], x: sp[i][0], y: sp[i][1] - 60, dmg: 0, airJumps: 1, swingT: 0, swingCd: 0.5 + i * 0.4, f: i === 1 ? -1 : 1, ai: { ...b.ai, role: ['west-route', 'east-route', 'upper-route'][i], routeX: game.W / 2 + [-30, 30, 0][i] } }));
                bots.forEach(b => game.placeAtSpawn(b, b.sp));
                demo.onEmit = ev => { if (ev.k === 'sw') this.duelSwing(demo, ev); };
            } else if (mode === 'shooter') {
                bots.forEach((b, i) => { b.r = 16; b.strafe = i % 2 ? -1 : 1; this.placeShooterBot(game, b, i); });
                game.hitBot = bullet => this.hitShooterBot(demo, bullet);
                demo.onEmit = ev => {
                    const attacker = bots.find(b => b.id === ev.by);
                    if (!attacker) return;
                    if (ev.k === 'hit') attacker.score += 4;
                    else if (ev.k === 'ko') { attacker.score += 100; attacker.playerKills = (attacker.playerKills || 0) + 1; }
                };
            } else if (mode === 'miner') {
                bots.forEach((b, i) => { b.x = (game.spawnCol ?? 35) * 48 + (i - 1) * 76; b.y = 3.6 * 48; b.fuel = 100; b.carry = 0; b.items = 0; b.ai.sector = this.minerSectors(game)[i]; });
            } else if (mode === 'market') {
                const shops = game.shops || [], houses = game.houses || [];
                bots.forEach((b, i) => {
                    const shopIndex = shops.length ? i % shops.length : 0;
                    const houseIndex = houses.length > 1 ? Math.round(i * (houses.length - 1) / (bots.length - 1)) : 0;
                    const home = houses[houseIndex];
                    b.x = home?.door?.x ?? b.x; b.y = home?.door?.y ?? b.y;
                    b.ai.carrying = false; b.ai.shopIndex = shopIndex; b.ai.houseIndex = houseIndex;
                    b.ai.target = null;
                });
            } else if (mode === 'river') {
                bots.forEach((b, i) => { b.x = 620 + i * 720; b.y = game.H * (0.25 + i * 0.24); b.ai.fishIndex = (i * 13 + 4) % Math.max(1, game.fish.length); b.ai.castTimer = 0.3 + i * 0.9; });
            } else if (mode === 'hack') {
                bots.forEach((b, i) => { const term = game.terms?.[i % Math.max(1, game.terms?.length || 1)]; b.x = term?.x || b.x; b.y = term?.y || b.y; b.ai.termIndex = i; });
            } else if (mode === 'skyline') {
                const route = this.skyRoute(game);
                const start = route.list[0];
                bots.forEach((b, i) => {
                    b.w = 26; b.h = 44; b.st = { i: 0, flagDone: true, jump: null, wait: i * 0.16, air: false, moving: false };
                    b.x = start.x + 10 + i * 8; b.y = start.y - b.h; b.f = i % 2 ? -1 : 1;
                    b.onGround = true; b.ground = start; b.airJumps = 1; b.dashCd = 0;
                });
            } else if (mode === 'frenzy' || mode === 'fishing') {
                bots.forEach((b, i) => { b.ai.fishingState = 0; b.ai.fishingTimer = 0.7 + i * 0.8; b.ai.power = 0; b.ai.powerDir = 1; b.ai.fishY = 100 + i * 45; });
            } else if (mode === 'crypto') {
                bots.forEach((b, i) => { b.ai.asset = (i * 2 + 1) % 6; b.ai.cash = 200; b.ai.units = Array(6).fill(0); b.ai.tradeAt = i * 0.7; });
            }
            return bots;
        }

        duelSwing(demo, ev, skip = null) {
            const game = demo.game;
            const dx = Math.cos(ev.a), dy = Math.sin(ev.a), hit = skip || new Set();
            for (const t of demo.bots) {
                if (hit.has(t.id) || t.id === ev.by || t.respawn > 0 || t.invuln > 0 || t.stun > 0.2 || !game.attackHits(ev, t)) continue;
                hit.add(t.id);
                const impact = game.hitImpact(ev, t.dmg), force = impact.force;
                t.dmg = impact.damage;
                t.vx = dx * force; t.vy = dy * force * 0.58 - (150 + t.dmg * 2.2); t.onGround = false;
                t.stun = impact.stun; t.lastHit = ev.by;
                game.particles.burst(t.x + 17, t.y + 28, '#fca5a5', 14, 260, 0.4, 5);
                if (ev.by === demo.meId) game.shake = Math.max(game.shake, 0.12);
            }
            // the Special stays live for its whole slam, matching multiplayer fighters
            if (ev.h === 1 && !skip) (demo.pendingHeavy ||= []).push({ ev, hit, t: game.constructor.HEAVY_ACTIVE || 0.3 });
        }

        stepDuelHeavies(demo, dt) {
            if (!demo.pendingHeavy?.length) return;
            const game = demo.game;
            demo.pendingHeavy = demo.pendingHeavy.filter(p => {
                p.t -= dt;
                if (p.t <= 0) return false;
                const from = p.ev.by === demo.meId ? game.me : demo.bots.find(b => b.id === p.ev.by);
                if (!from || (p.ev.by === demo.meId ? game.respawn > 0 : from.respawn > 0)) return false;
                this.duelSwing(demo, { ...p.ev, x: from.x + 17, y: from.y + 28 }, p.hit);
                return true;
            });
        }

        stepDuelBots(demo, dt) {
            const U = window.StudBudArcade.util, game = demo.game, me = game.me, now = performance.now();
            this.stepDuelHeavies(demo, dt);
            const zone = game.hill().zone;
            const hillCenter = zone.x + zone.w / 2;
            for (const b of demo.bots) {
                const ready = this.botResourceReady(demo, b, dt);
                if (b.respawn > 0) {
                    b.respawn -= dt; b.a = 5;
                    if (b.respawn <= 0) { game.placeAtSpawn(b, b.sp); b.dmg = 0; b.stun = b.swingT = 0; b.airJumps = 1; b.invuln = 2; b.a = 0; }
                    b.seen = now; continue;
                }
                b.stun = Math.max(0, b.stun - dt); b.invuln = Math.max(0, b.invuln - dt); b.swingT = Math.max(0, b.swingT - dt); b.swingCd -= dt;
                let tgt = null, bd = 1e9;
                const contenders = demo.bots.filter(o => o !== b && o.respawn <= 0 && game.inHill({ x: o.x, y: o.y }, zone));
                if (game.respawn <= 0 && game.inHill(me, zone)) contenders.push({ x: me.x, y: me.y, id: demo.meId });
                for (const o of contenders) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < bd) { bd = d; tgt = o; } }
                const routeOffset = (b.i - 1) * 58;
                const objectiveX = U.clamp(hillCenter + routeOffset, zone.x + 35, zone.x + zone.w - 35);
                const off = b.y + 56 > game.stage.y + 5 && (b.x + 17 < game.stage.x || b.x + 17 > game.stage.x + game.stage.w);
                let want = 0;
                if (off) want = Math.sign(game.W / 2 - b.x);
                else if (tgt && Math.abs(tgt.x - b.x) > 60) want = Math.sign(tgt.x - b.x);
                else if (!tgt && Math.abs(objectiveX - (b.x + 17)) > 28) want = Math.sign(objectiveX - (b.x + 17));
                if (b.stun <= 0) {
                    if (!ready) want = 0;
                    const acc = (b.onGround ? 3000 : 1500) * dt;
                    b.vx += U.clamp(want * 300 - b.vx, -acc, acc);
                    if (tgt) b.f = tgt.x >= b.x ? 1 : -1;
                }
                b.vy = Math.min(1200, b.vy + 2400 * dt);
                if (b.onGround) b.airJumps = 1;
                if (b.stun <= 0 && ready) {
                    if (off) { if (!b.onGround && b.vy > 0 && b.airJumps > 0) { b.vy = -820; b.airJumps--; } }
                    else if (b.onGround && ((!tgt && zone.y < b.y + 20 && Math.abs(objectiveX - (b.x + 17)) < 260) || (tgt && tgt.y < b.y - 50 && Math.abs(tgt.x - b.x) < 320) || (b.wall && want))) b.vy = -900;
                    else if (!b.onGround && b.vy > 0 && b.airJumps > 0 && (tgt ? tgt.y < b.y - 40 : zone.y < b.y + 36 && Math.abs(objectiveX - (b.x + 17)) < 340)) { b.vy = -820; b.airJumps--; }
                }
                U.moveBody(b, game.solids, dt);
                if (ready && tgt && b.swingCd <= 0 && b.stun <= 0 && bd < 115) {
                    b.ai.energy = Math.max(0, (b.ai.energy ?? 100) - window.StudBudArcade.ENERGY_COSTS.duel.swing);
                    const ang = Math.atan2(tgt.y - b.y, tgt.x - b.x);
                    b.swingT = 0.22; b.swingCd = 0.6 + (b.ai?.rng?.() || 0.5) * 0.5; b.swing = now; b.swingAim = ang;
                    const ev = { k: 'sw', x: b.x + 17, y: b.y + 28, d: b.f, a: ang, p: 1, by: b.id, c: b.dmg };
                    game.onEvent(ev, b); this.duelSwing(demo, ev);
                }
                if (b.x < -180 || b.x > game.W + 180 || b.y > game.H || b.y < -650
                    || (b.y > game.stage.y + 80 && b.x + b.w > game.stage.x && b.x < game.stage.x + game.stage.w)) {
                    b.respawn = 1.4; game.particles.burst(b.x, Math.min(b.y, 880), b.color, 30, 500, 0.8, 6);
                    if (b.lastHit === demo.meId) game.onEvent({ k: 'ko', by: demo.meId }, b);
                    b.lastHit = null;
                }
                const contested = (game.respawn <= 0 && game.inHill(me, zone)) || demo.bots.some(other => other !== b && other.respawn <= 0 && game.inHill(other, zone));
                if (b.respawn <= 0 && !contested && game.inHill(b, zone)) {
                    b.hillTick = (b.hillTick || 0) + dt;
                    const seconds = Math.floor(b.hillTick + 1e-9);
                    if (seconds > 0) { b.hillSecs = (b.hillSecs || 0) + seconds; b.hillTick = Math.max(0, b.hillTick - seconds); }
                }
                b.a = b.swingT > 0 ? 3 : !b.onGround ? 2 : Math.abs(b.vx) > 40 ? 1 : 0;
                b.ex = { d: Math.round(b.dmg), h: 0, i: b.invuln > 0 ? 1 : 0, t: b.swingAim || 0 };
                b.tx = b.x; b.ty = b.y; b.seen = now;
            }
        }

        driveDuel(demo, hold, tap, session) {
            const game = demo.game, me = game.me;
            const foes = demo.bots.filter(b => b.respawn <= 0);
            let tgt = null, bd = 1e9;
            for (const b of foes) { const d = Math.hypot(b.x - me.x, b.y - me.y); if (d < bd) { bd = d; tgt = b; } }
            const cx = me.x + 17;
            if (me.y + 56 > game.stage.y + 5 && (cx < game.stage.x || cx > game.stage.x + game.stage.w)) {
                hold.add(cx < game.W / 2 ? 'KeyD' : 'KeyA');
                if (!me.onGround && me.vy > 0 && game.airJumps > 0) tap.add('Space');
                return;
            }
            if (!tgt) return;
            const dx = tgt.x - me.x;
            if (Math.abs(dx) > 70) hold.add(dx > 0 ? 'KeyD' : 'KeyA');
            if (me.onGround && ((tgt.y < me.y - 50 && Math.abs(dx) < 320) || (me.wall && Math.abs(dx) > 70))) tap.add('Space');
            else if (!me.onGround && me.vy > 0 && game.airJumps > 0 && tgt.y < me.y - 40) tap.add('Space');
            const z = game.view?.z || 1;
            session.mouse.x = (game.offX || 0) + (tgt.x + 17) * z; session.mouse.y = (game.offY || 0) + (tgt.y + 28) * z;
            session.mouse.pressed = bd < 120;
        }

        placeShooterBot(game, b, index = b.i || 0) {
            const U = window.StudBudArcade.util, rng = b.ai?.rng || Math.random;
            const sectors = [[0.18, 0.2], [0.82, 0.23], [0.5, 0.78], [0.18, 0.75], [0.82, 0.72]];
            const [sx, sy] = sectors[index % sectors.length];
            for (let attempt = 0; attempt < 28; attempt++) {
                const x = U.clamp(game.W * sx + (rng() - 0.5) * 420, 120, game.W - 120);
                const y = U.clamp(game.H * sy + (rng() - 0.5) * 360, 120, game.H - 120);
                if (game.walls.some(w => U.overlap({ x: x - 22, y: y - 22, w: 44, h: 44 }, w))) continue;
                b.x = x; b.y = y; return;
            }
            for (let y = 60; y < game.H - 60; y += 60) for (let x = 60; x < game.W - 60; x += 60) {
                if (!game.walls.some(wall => U.overlap({ x: x - 22, y: y - 22, w: 44, h: 44 }, wall))) {
                    b.x = x; b.y = y; return;
                }
            }
            throw new Error('The arena has no safe bot respawn position.');
        }

        stepShooterBots(demo, dt) {
            const U = window.StudBudArcade.util, game = demo.game, me = game.me, now = performance.now();
            for (const b of demo.bots) {
                const ready = this.botResourceReady(demo, b, dt);
                b.seen = now;
                if (b.respawn > 0) {
                    b.respawn -= dt; b.a = 1;
                    if (b.respawn <= 0) { this.placeShooterBot(game, b, b.i); b.hp = 100; b.vx = b.vy = 0; b.stun = 0; b.a = 0; b.invuln = 1.5; }
                    continue;
                }
                b.cd -= dt; b.invuln = Math.max(0, b.invuln - dt); b.sfT = (b.sfT || 0) - dt;
                if (b.sfT <= 0) { b.strafe = -b.strafe; b.sfT = 1.2 + (b.ai?.rng?.() || 0.5) * 1.8; }
                let tgt = null, bd = 1e9;
                const foes = demo.bots.filter(o => o !== b && o.respawn <= 0);
                if (game.dead <= 0) foes.push(me);
                for (const o of foes) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < bd) { bd = d; tgt = o; } }
                let mx = 0, my = 0;
                if (tgt && ready) {
                    const ang = Math.atan2(tgt.y - b.y, tgt.x - b.x), dir = bd > 420 ? 1 : bd < 260 ? -1 : 0;
                    mx = Math.cos(ang) * dir + Math.cos(ang + Math.PI / 2) * b.strafe * 0.8;
                    my = Math.sin(ang) * dir + Math.sin(ang + Math.PI / 2) * b.strafe * 0.8;
                    const lead = bd / 950;
                    b.aim = Math.atan2(tgt.y + (tgt.vy || 0) * lead - b.y, tgt.x + (tgt.vx || 0) * lead - b.x)
                        + ((b.ai?.rng?.() || 0.5) - 0.5) * (0.08 + (1 - (b.ai?.aggression || 0.5)) * 0.1);
                    if (b.cd <= 0 && bd < 780 && this.botLineClear(b.x, b.y, tgt.x, tgt.y, game.walls)) {
                        b.ai.energy = Math.max(0, (b.ai.energy ?? 100) - 1);
                        b.cd = (b.ai?.reaction || 0.3) + (b.ai?.rng?.() || 0.5) * 0.25;
                        game.onEvent({ k: 'sh', x: b.x + Math.cos(b.aim) * 24, y: b.y + Math.sin(b.aim) * 24, a: b.aim, by: b.id }, b);
                    }
                }
                const k = Math.min(1, dt * 6);
                b.vx = U.lerp(b.vx, mx * 230, k); b.vy = U.lerp(b.vy, my * 230, k);
                if (tgt && ready && !this.botLineClear(b.x, b.y, tgt.x, tgt.y, game.walls, b.r + 3)) {
                    this.moveNavigatingBot(b, tgt.x, tgt.y, 230, dt, game.walls, game);
                } else {
                    b.x += b.vx * dt; b.y += b.vy * dt;
                    b.ai.navPath = null;
                }
                for (const w of game.walls) U.pushCircleOutOfRect(b, w);
                b.x = U.clamp(b.x, 30, game.W - 30); b.y = U.clamp(b.y, 30, game.H - 30);
                b.f = b.aim || 0; b.a = 0; b.ex = { o: 0 }; b.tx = b.x; b.ty = b.y;
            }
        }

        hitShooterBot(demo, bullet) {
            const attacker = bullet.own ? demo.meId : bullet.by;
            if (!attacker || bullet.life <= 0) return false;
            const bot = demo.bots.find(b => b.respawn <= 0 && b.id !== attacker && b.invuln <= 0 && Math.hypot(bullet.x - b.x, bullet.y - b.y) <= b.r + 4);
            if (!bot) return false;
            const game = demo.game;
            bullet.life = 0; bot.hp -= bullet.dmg;
            game.particles.burst(bullet.x, bullet.y, '#fde68a', 5, 120, 0.25, 3);
            const shooter = demo.bots.find(b => b.id === attacker);
            if (attacker === demo.meId) game.onEvent({ k: 'hit', by: demo.meId, dmg: bullet.dmg }, bot);
            else if (shooter) shooter.score = (shooter.score || 0) + 4;
            if (bot.hp <= 0) {
                bot.respawn = 2;
                game.particles.burst(bot.x, bot.y, bot.color, 30, 380, 0.8, 6);
                if (attacker === demo.meId) game.onEvent({ k: 'ko', by: demo.meId }, bot);
                else if (shooter) { shooter.score = (shooter.score || 0) + 100; shooter.playerKills = (shooter.playerKills || 0) + 1; }
            }
            return true;
        }

        driveShooter(demo, hold, tap, session, c) {
            const game = demo.game, me = game.me;
            let tgt = null, best = 1e9;
            for (const t of [...game.drones.filter(d => d.hp > 0), ...demo.bots.filter(b => b.respawn <= 0)]) {
                const d = Math.hypot(t.x - me.x, t.y - me.y) - (t.id ? 150 : 0);
                if (d < best) { best = d; tgt = t; }
            }
            if (!tgt) { hold.add('KeyD'); return; }
            const d = Math.hypot(tgt.x - me.x, tgt.y - me.y), lead = d / 950;
            const ax = tgt.x + (tgt.vx || 0) * lead, ay = tgt.y + (tgt.vy || 0) * lead;
            const ang = Math.atan2(tgt.y - me.y, tgt.x - me.x), dir = d > 380 ? 1 : d < 230 ? -1 : 0, sg = Math.sin(c * 0.8) > 0 ? 1 : -1;
            const mx = Math.cos(ang) * dir + Math.cos(ang + Math.PI / 2) * sg * 0.9, my = Math.sin(ang) * dir + Math.sin(ang + Math.PI / 2) * sg * 0.9;
            if (mx > 0.3) hold.add('KeyD'); else if (mx < -0.3) hold.add('KeyA');
            if (my > 0.3) hold.add('KeyS'); else if (my < -0.3) hold.add('KeyW');
            const z = game.zoom || 1;
            session.mouse.x = session.vw / 2 + (ax - game.cam.x) * z; session.mouse.y = session.vh / 2 + (ay - game.cam.y) * z;
            session.mouse.down = d < 750;
            if (Math.floor(c / 4) !== demo.lastDash) { demo.lastDash = Math.floor(c / 4); tap.add('ShiftLeft'); }
            if (game.drones.filter(o => Math.hypot(o.x - me.x, o.y - me.y) < 250).length >= 3) tap.add('KeyE');
        }

        // ---- Escape to Space autoplay ----
        // The route provides navigation targets; movement still uses the game's physical jump and collision rules.
        skyRoute(game) {
            if (game.botRoute) return game.botRoute;
            const cps = game.checkpoints;
            const start = game.solids.find(p => !p.slope && p.y === cps[0].y && cps[0].x >= p.x && cps[0].x + 26 <= p.x + p.w);
            const list = [start];
            const flags = new Map(), cpNode = [0];
            flags.set(0, cps[0].x + 20);
            let last = list[0];
            const node = solid => solid.navX !== undefined ? {
                    x: solid.navX - 35, y: solid.y, w: 70, h: 14, surface: solid
                } : solid.slope ? {
                    x: solid.curve === 'arch' ? solid.x + solid.w / 2 - 35 : solid.slope > 0 ? solid.x + solid.w - 70 : solid.x,
                    y: solid.y, w: 70, h: 14, surface: solid
                } : solid;
            // The city runs sideways (and sometimes down) across rooftops, so it follows the generator's ordered path.
            const cityPath = game.cityPath || [];
            const startIndex = cityPath.indexOf(start);
            for (const solid of cityPath.slice(startIndex + 1)) { list.push(node(solid)); last = list[list.length - 1]; }
            for (const solid of game.climbPath) {
                if (solid.via) for (const lane of solid.via) {
                    list.push({ laneTarget: lane, x: lane.x0, y: lane.y, w: lane.size, h: lane.h, off: true });
                }
                const p = node(solid);
                if ((last.surface || last) !== (p.surface || p)) list.push(p);
                last = list[list.length - 1];
                cps.forEach((c, k) => {
                    if (k > 0 && cpNode[k] === undefined && Math.abs(p.y - c.y) < 1 && c.x + 20 >= p.x && c.x + 20 <= p.x + p.w) { cpNode[k] = list.length - 1; flags.set(list.length - 1, c.x + 20); }
                });
            }
            if (last !== game.summit) {
                const approach = game.solids.filter(p => !p.wall && !p.ground && p.y < last.y && p.y >= game.summit.y && p !== game.summit);
                list.push(...approach, game.summit);
            }
            cps.forEach((c, k) => {
                if (cpNode[k] !== undefined) return;
                let best = 1, d = 1e9;
                list.forEach((p, i) => { const dd = Math.abs(p.y - c.y) * 3 + Math.abs(p.x + p.w / 2 - c.x - 20); if (i > 0 && dd < d) { d = dd; best = i; } });
                cpNode[k] = best; flags.set(best, c.x + 20);
            });
            return game.botRoute = { list, flags, cpNode, props: game.solids.filter(p => p.prop) };
        }

        // Opponents use the same movement, collisions, hazards and checkpoints as the player.
        skyStep(demo, game, b, st, dt, speed) {
            const U = window.StudBudArcade.util, route = this.skyRoute(game);
            const actor = st.actor || (st.actor = this.skyBotActor(demo, b));
            actor.s.t = demo.clock;
            actor.s.testFreezeHazards = demo.session.testFreezeHazards;
            actor.s.limitedTestEnergy = demo.session.limitedTestEnergy;
            if (actor.dead > 0) {
                actor.updatePlayer(dt);
                if (actor.dead <= 0) {
                    st.i = route.cpNode[actor.cp.id]; st.jump = null; st.nextThink = 0;
                    st.progressNode = st.i; st.progressAt = demo.clock;
                }
                b.respawn = actor.dead; st.air = !b.onGround; return;
            }
            if (b.onGround && b.y > actor.cp.y + 600 && b.y < 1500) {
                actor.returnToCheckpoint();
                st.i = route.cpNode[actor.cp.id]; st.jump = null; st.nextThink = 0;
                st.progressNode = st.i; st.progressAt = demo.clock;
                st.air = true; st.moving = false;
                return;
            }
            for (const p of route.list) if (p.laneTarget) {
                const rocks = game.meteors.filter(rock => rock.lane === p.laneTarget && !rock.off);
                const rock = rocks.reduce((best, candidate) => !best || Math.abs(candidate.x - b.x) < Math.abs(best.x - b.x) ? candidate : best, null);
                if (rock) Object.assign(p, { x: rock.x, y: rock.y, w: rock.w, h: rock.h, surface: rock, off: false });
                else p.off = true;
            }
            const groundIndex = b.onGround ? route.list.findIndex(p => p === b.ground || p.surface === b.ground) : -1;
            if (groundIndex >= 0 && groundIndex !== st.i) { st.i = groundIndex; st.jump = null; st.nextThink = demo.clock + (b.ground.crumble || b.ground.w < 180 ? 0 : Math.min(b.ai.reaction, .2)); }
            if (st.progressNode === undefined || st.i > st.progressNode) {
                st.progressNode = st.i; st.progressAt = demo.clock;
            }
            let target = route.list[st.i + 1] || route.list[st.i];
            let crossingMachine = false;
            let waitingPoint = b.x + b.w / 2;
            if (b.onGround && b.ground && !b.ground.crumble) {
                const dir = Math.sign(target.x + target.w / 2 - b.x - b.w / 2);
                const hazards = [...game.drills, ...game.lasers.filter(l => l.support === b.ground)
                    .map(l => ({ x: l.x + l.w / 2, width: l.w, surfaceY: b.ground.y }))];
                const machine = hazards.filter(d => d.surfaceY === b.ground.y
                    && dir * (d.x - b.x - b.w / 2) > -d.width / 2
                    && dir * (d.x - b.x - b.w / 2) < 200)
                    .sort((a, c) => dir * (a.x - c.x))[0];
                if (machine) {
                    waitingPoint = U.clamp(machine.x - dir * (machine.width / 2 + b.w / 2 + 30),
                        b.ground.x + b.w / 2 + 4, b.ground.x + b.ground.w - b.w / 2 - 4);
                    const aim = U.clamp(machine.x + dir * (machine.width / 2 + b.w / 2 + 30),
                        b.ground.x + b.w / 2 + 4, b.ground.x + b.ground.w - b.w / 2 - 4);
                    target = { x: aim - 20, y: b.ground.y, w: 40, h: b.ground.h,
                        navX: aim, surface: b.ground };
                    crossingMachine = true;
                }
            }
            const brakingX = b.x + b.vx * Math.abs(b.vx) / (2 * (b.ground?.ice ? 420 : 3400));
            const safeRecharge = b.onGround && b.ground.w >= 180 && !b.ground.crumble && !b.ground.mover
                && brakingX >= b.ground.x + 4 && brakingX + b.w <= b.ground.x + b.ground.w - 4;
            if (b.ai.rechargeAt || actor.res.value < .5 || (actor.res.value < 50 && safeRecharge)) {
                b.ai.rechargeAt ||= demo.clock + 1.5 + b.ai.reaction;
                if (demo.clock < b.ai.rechargeAt) {
                    actor.s.botKeys = { x: b.onGround ? U.clamp(-(b.ground?.belt || 0) / 340, -1, 1) : 0, hold: !b.onGround };
                    actor.updatePlayer(dt);
                    b.ai.energy = actor.res.value; b.respawn = actor.dead;
                    st.air = !b.onGround; st.moving = Math.abs(b.vx) > 35;
                    return;
                }
                actor.res.add(demo.session.rewardAmount()); b.ai.rechargeAt = 0; st.jump = null; st.nextThink = 0;
            }
            const shaft = game.cityCrossings.find(c => c.kind === 'scale' && c.to === target);
            let keys = { x: 0, hold: false, jump: false, dash: false };
            if (shaft) {
                st.wallDirection ||= 1;
                keys = { x: st.wallDirection, hold: true, jump: false, dash: false };
                const feet = b.y + b.h;
                if (b.onGround && b.ground === shaft.from) {
                    keys.x = 1;
                    const blocked = game.solids.some(p => p !== b.ground && !p.off && !p.oneway
                        && p.x >= b.x + b.w - 2 && p.x < b.x + b.w + 70
                        && p.y < b.y + b.h && p.y + p.h > b.y);
                    if (b.x >= shaft.from.x + shaft.from.w - 45 || blocked) keys.jump = true;
                }
                if (b.onGround && b.ground === shaft.rig[0]) { keys.x = 1; keys.jump = Math.abs(b.vx) > 300; }
                if (actor.wallDir && b.vy > 0) { keys.jump = true; keys.x = st.wallDirection = -actor.wallDir; }
                else if (!b.onGround && !actor.wallDir && b.vy > 0 && actor.airJumps > 0 && Math.abs(feet - target.y) < 70) {
                    keys.jump = true; keys.x = st.wallDirection = 1;
                }
                if (feet < target.y - 4) keys.x = U.clamp((target.x + 80 - b.x - b.w / 2) / 35, -1, 1);
            } else if (st.jump?.walk && b.onGround && Math.abs(st.jump.aim - b.x - b.w / 2) > 15) {
                keys = this.skyPlanKeys(actor, st.jump, demo.clock - st.jump.started);
            } else if (b.onGround && demo.clock >= (st.nextThink || 0)) {
                st.jump = this.skyPlanJump(actor, target, route, st.i, dt);
                st.nextThink = demo.clock + (b.ground.crumble ? .05 : .25 + b.ai.reaction * .25);
                if (st.jump) { st.jump.started = demo.clock; keys = this.skyPlanKeys(actor, st.jump, 0); keys.jump = !st.jump.walk; }
            } else if (!b.onGround && st.jump) keys = this.skyPlanKeys(actor, st.jump, demo.clock - st.jump.started);
            else if (!b.onGround) {
                const surface = target.surface || target;
                const aim = this.skyLandingAim(target, b.x < target.x ? -1 : 1, route);
                st.jump = { target, aim, side: b.x + b.w / 2 < surface.x + surface.w / 2 ? -1 : 1,
                    doubleAt: .3, dashAt: null, started: demo.clock, doubled: false };
                keys = this.skyPlanKeys(actor, st.jump, 0);
            }
            if (!shaft && b.onGround && !keys.jump && !st.jump?.walk) {
                const ground = b.ground;
                const dir = Math.sign(target.x + target.w / 2 - b.x - b.w / 2);
                const edge = dir > 0 ? ground.x + ground.w - b.w - 24 : ground.x + 24;
                if (actor.res.value >= 30) keys.x = crossingMachine
                    ? U.clamp((waitingPoint - b.x - b.w / 2) * 8 / 340 - (ground.belt || 0) / 340, -1, 1)
                    : U.clamp((edge - b.x) / 60, -1, 1) * Math.min(1, speed);
            }
            if (crossingMachine && b.onGround && !keys.jump) actor.stuckT = 0;
            if (st.stallX === undefined || Math.hypot(b.x - st.stallX, b.y - st.stallY) > 80 || st.stallNode !== st.i) {
                st.stallX = b.x; st.stallY = b.y; st.stallNode = st.i; st.stallAt = demo.clock;
            }
            if (b.onGround && (demo.clock - st.stallAt > 12 || demo.clock - st.progressAt > 45)) {
                keys.reset = true;
                st.stallAt = demo.clock; st.progressAt = demo.clock; st.progressNode = route.cpNode[actor.cp.id];
            }
            actor.s.botKeys = keys;
            const falling = b.vy >= 0;
            actor.updatePlayer(dt);
            if (keys.reset) { st.i = route.cpNode[actor.cp.id]; st.jump = null; st.nextThink = 0; }
            if (falling && actor.sprung && b.vy < -500) {
                const springNode = route.list.findIndex(p => Math.abs(p.y - b.y - b.h) < 24
                    && b.x + b.w > p.x && b.x < p.x + p.w);
                if (springNode > st.i) { st.i = springNode; st.jump = null; }
            }
            b.ai.energy = actor.res.value;
            b.respawn = actor.dead; b.done = actor.finished;
            if (b.done && !b.ft) b.ft = Math.max(1, Math.round(demo.session.t * 1000));
            st.checkpoint = actor.cp.id;
            st.air = !b.onGround; st.moving = Math.abs(b.vx) > 35;
        }

        skyBotActor(demo, bot) {
            const actor = Object.create(demo.game), A = window.StudBudArcade;
            Object.assign(actor, {
                me: bot, cp: demo.game.checkpoints[bot.st.checkpoint || 0], res: new A.Resource('Energy', '#facc15', 100, 30),
                dead: 0, finished: false, deaths: 0, maxH: 0, biomeSeen: 0, dash: 0, dashCd: 0,
                kick: 0, buffer: 0, coyote: .1, airJumps: 1, sprung: false, boost: 0, slow: 0,
                stuckT: 0, stuckX: undefined, stuckY: undefined, strandedT: 0, trapT: 0,
                particles: { burst() {}, update() {} }
            });
            actor.s = {
                game: actor, user: { id: bot.id }, local: { color: bot.color }, t: demo.clock,
                testing: demo.session.testing, limitedTestEnergy: demo.session.limitedTestEnergy, preview: demo.session.preview,
                botKeys: {}, axis() { return { x: this.botKeys.x || 0 }; },
                down(...codes) { return codes.includes('Space') && Boolean(this.botKeys.hold); },
                pressed(...codes) { return codes.includes('Space') ? Boolean(this.botKeys.jump) : codes.includes('ShiftLeft') ? Boolean(this.botKeys.dash) : codes.includes('KeyR') ? Boolean(this.botKeys.reset) : false; },
                spend(n) { return (this.testing && !this.limitedTestEnergy) || this.preview || actor.res.spend(n); }, sfx() {}, toast() {}, setGoal() {}
            };
            return actor;
        }

        skyPlanKeys(actor, plan, elapsed) {
            const b = actor.me, target = plan.target;
            const surface = target.surface || target;
            const x = surface.mover ? surface.x + surface.w / 2 : plan.aim;
            const feet = b.y + b.h;
            const blockedBelow = !surface.oneway && feet > surface.y + 2;
            const side = plan.side;
            const aim = blockedBelow ? side < 0 ? surface.x - b.w / 2 - 6 : surface.x + surface.w + b.w / 2 + 6 : x;
            const dx = aim - b.x - b.w / 2;
            const keys = { x: window.StudBudArcade.util.clamp(dx * 8 / 340, -1, 1), hold: true, jump: false, dash: false };
            if (plan.walk) {
                keys.x = window.StudBudArcade.util.clamp((dx * 8 - (b.ground?.belt || 0)) / 340, -1, 1);
                keys.hold = false; return keys;
            }
            if (!plan.doubled && elapsed + 1e-6 >= plan.doubleAt && actor.airJumps > 0) { keys.jump = true; plan.doubled = true; }
            if (!plan.dashed && plan.dashAt !== null && elapsed + 1e-6 >= plan.dashAt && Math.abs(dx) > 80) { keys.dash = true; plan.dashed = true; }
            return keys;
        }

        skyLandingAim(target, side, route) {
            if (target.navX !== undefined) return target.navX;
            if (target.crumble && target.w > 250) {
                const index = route.list.indexOf(target), next = route.list[index + 1];
                if (next) return next.x + next.w / 2 < target.x + target.w / 2 ? target.x + 35 : target.x + target.w - 35;
            }
            return target.w > 250 ? side < 0 ? target.x + 35 : target.x + target.w - 35 : target.x + target.w / 2;
        }

        skyPlanJump(actor, target, route, index, step = 1 / 60) {
            if (actor.res.value < 5) return null;
            const b = actor.me, U = window.StudBudArcade.util;
            const frozen = actor.s.testing === true && actor.s.testFreezeHazards === true;
            const near = actor.solids.filter(p => p.x < b.x + 1100 && p.x + p.w > b.x - 1100 && p.y < b.y + 900 && p.y + p.h > b.y - 1500);
            const obstacles = near.filter(p => p !== b.ground && !p.off && !p.wall
                && (p.y < b.y + b.h || (p.prop && p.y < b.y + b.h + 200)) && p.y > b.y - 180
                && p.x < Math.max(b.x, target.x) + b.w && p.x + p.w > Math.min(b.x, target.x));
            const forward = Math.sign(target.x + target.w / 2 - b.x - b.w / 2);
            const support = near.find(p => p !== b.ground && !p.wall && !p.off && p.y >= b.y + b.h
                && p.y < b.y + b.h + 200 && p.x < b.x && p.x + p.w > b.x + b.w + 40);
            const stepDown = support && { ...support, surface: support, x: U.clamp(b.x + forward * 240, support.x + 30, support.x + support.w - 60), w: 40 };
            if (stepDown) for (const spring of actor.springs) {
                if (spring.y + spring.h !== support.y) continue;
                const center = stepDown.x + stepDown.w / 2;
                if (center + b.w / 2 + 20 < spring.x || center - b.w / 2 - 20 > spring.x + spring.w) continue;
                stepDown.x = U.clamp((forward > 0 ? spring.x - b.w / 2 - 20 : spring.x + spring.w + b.w / 2 + 20)
                    - stepDown.w / 2, support.x + 30, support.x + support.w - 60);
            }
            const shortcuts = [route.list[index + 3], route.list[index + 2]].filter(p => p && !p.off && !p.laneTarget
                && p.y < b.y + b.h && b.y + b.h - p.y < 450);
            const nearby = (x, y, w, h) => x < b.x + 1100 && x + w > b.x - 1100 && y < b.y + 900 && y + h > b.y - 1500;
            const springs = actor.springs.filter(p => nearby(p.x, p.y, p.w, p.h));
            const lasers = actor.lasers.filter(p => nearby(p.x, p.y, p.w, p.h));
            const drills = actor.drills.filter(p => nearby(p.x - p.width / 2, p.mountY - 34, p.width, p.surfaceY - p.mountY + 34));
            const debris = actor.debris.filter(p => nearby(p.x - p.r, p.lane.y0, p.r * 2, p.lane.y1 - p.lane.y0));
            const saws = actor.saws.filter(p => nearby(p.cx - p.r, p.cy - p.amp - p.r, p.r * 2, (p.amp + p.r) * 2));
            const balls = actor.balls.filter(p => nearby(p.px - p.len - p.r, p.py - p.len - p.r, (p.len + p.r) * 2, (p.len + p.r) * 2));
            const overhead = target.surface || target, ground = b.ground;
            const staging = ground && !ground.crumble && overhead !== ground && !overhead.oneway
                && overhead.y + overhead.h < b.y + b.h && overhead.x < b.x + b.w && overhead.x + overhead.w > b.x
                ? [overhead.x - b.w / 2 - 12, overhead.x + overhead.w + b.w / 2 + 12]
                    .filter(x => x > ground.x + b.w / 2 && x < ground.x + ground.w - b.w / 2
                        && Math.abs(x - b.x - b.w / 2) > 25)
                    .map(x => ({ x: x - 20, y: ground.y, w: 40, h: ground.h, navX: x, surface: ground }))
                : [];
            const targets = target.surface === b.ground ? [target] : [...shortcuts, target, ...obstacles.filter(p => forward * (p.x + p.w / 2 - b.x - b.w / 2) > 0)
                .sort((a, c) => Math.abs(a.x - b.x) - Math.abs(c.x - b.x)).slice(0, 2), ...staging, ...(stepDown ? [stepDown] : [])];
            for (const destination of targets) {
                if (destination.off) continue;
                const surface = destination.surface || destination;
                if (Math.max(0, surface.x - b.x - b.w, b.x - surface.x - surface.w) > 700) continue;
                const preferredSide = b.x + b.w / 2 < surface.x + surface.w / 2 ? -1 : 1;
                for (const walk of surface === b.ground ? [true, false] : [false])
                for (const side of [preferredSide, -preferredSide]) for (const doubleAt of [9, .22, .4]) for (const dashAt of [null, .35]) {
                    if (walk && (side !== preferredSide || doubleAt !== 9 || dashAt !== null)) continue;
                    let aim = this.skyLandingAim(destination, side, route);
                    if (destination.navX === undefined && destination.w > 250) {
                        for (let attempt = 0; attempt < 12; attempt++) {
                            if (!actor.drills.some(d => d.surfaceY === surface.y && Math.abs(d.x - aim) < d.width / 2 + b.w / 2 + 12)) break;
                            aim = U.clamp(aim - side * 32, destination.x + 20, destination.x + destination.w - 20);
                        }
                    }
                    const plan = { target: destination, aim, side, doubleAt, dashAt, walk };
                    const sim = Object.create(actor), clones = new Map(near.map(p => [p, { ...p }]));
                    Object.assign(sim, {
                        me: { ...b, ground: clones.get(b.ground) || null }, solids: [...clones.values()],
                        res: new window.StudBudArcade.Resource('Energy', '#fff', 100, actor.res.value),
                        captureCheckpoint() {}, dead: 0, finished: false, stuckT: 0, strandedT: 0, trapChecks: false,
                        springs: springs.map(p => ({ ...p })), boxes: [],
                        lasers: lasers.map(p => ({ ...p })), drills: drills.map(p => ({ ...p })),
                        debris: debris.map(p => ({ ...p })), saws: saws.map(p => ({ ...p })),
                        balls: balls.map(p => ({ ...p }))
                    });
                    sim.s = { ...actor.s, game: sim, spend(n) { return sim.res.spend(n); } };
                    const simulatedPlan = { ...plan, target: { ...destination, surface: clones.get(surface) || surface } };
                    let airborne = false;
                    for (let frame = 0; frame < Math.ceil(4 / step); frame++) {
                        const elapsed = frame * step;
                        sim.hazardClock = (actor.hazardClock || 0) + (frozen ? 0 : elapsed);
                        for (const copy of clones.values()) if (frame > 0 && !frozen && copy.mover) {
                            if (copy.lane) sim.updateLaneRock(copy, sim.hazardClock);
                            else if (!copy.sinker) {
                                const pos = (copy.vert ? copy.by : copy.bx) + Math.sin(sim.hazardClock * copy.speed + copy.phase) * copy.amp;
                                copy.dx = copy.vert ? 0 : pos - copy.x; copy.dy = copy.vert ? pos - copy.y : 0;
                                if (copy.vert) copy.y = pos; else copy.x = pos;
                            }
                        }
                        for (const copy of clones.values()) if (frame > 0 && !frozen) {
                            if (copy.blink) copy.off = ((actor.hazardAnim || 0) + elapsed + copy.phase) % copy.period > copy.on;
                            if (copy.crumble) {
                                if (copy.gone > 0) {
                                    copy.gone -= step;
                                    if (copy.gone <= 0) { copy.off = false; copy.timer = 0; }
                                } else if (copy.timer > 0) {
                                    copy.timer -= step;
                                    if (copy.timer <= 0) { copy.off = true; copy.gone = 3; }
                                }
                            }
                        }
                        for (const drill of sim.drills) sim.updateDrill(drill, sim.hazardClock);
                        for (const debris of sim.debris) sim.updateDebris(debris, sim.hazardClock);
                        for (const saw of sim.saws) {
                            saw.x = saw.cx;
                            saw.y = saw.cy + Math.sin(sim.hazardClock * saw.speed + saw.phase) * saw.amp;
                        }
                        for (const ball of sim.balls) {
                            const angle = ball.amp * Math.sin(sim.hazardClock * ball.speed + ball.phase);
                            ball.x = ball.px + ball.len * Math.sin(angle); ball.y = ball.py + ball.len * Math.cos(angle);
                        }
                        sim.s.botKeys = this.skyPlanKeys(sim, simulatedPlan, elapsed);
                        if (frame === 0) sim.s.botKeys.jump = !walk;
                        sim.updatePlayer(step);
                        if (sim.dead) break;
                        airborne ||= !sim.me.onGround;
                        if (sim.me.onGround && (airborne || (walk && Math.abs(aim - sim.me.x - sim.me.w / 2) < 15))) {
                            const original = [...clones].find(([, copy]) => copy === sim.me.ground)?.[0];
                            const landedIndex = route.list.findIndex(p => p === original || p.surface === original);
                            if (original === surface || landedIndex > index) {
                                if (surface === b.ground && Math.abs(aim - sim.me.x - sim.me.w / 2) >= 20) break;
                                if (original === surface && surface.crumble && surface.w > 250
                                    && Math.abs(aim - sim.me.x - sim.me.w / 2) > 80) break;
                                if (sim.drills.some(d => d.surfaceY === sim.me.ground.y
                                    && Math.abs(d.x - sim.me.x - sim.me.w / 2) < d.width / 2 + sim.me.w / 2 + 8)) break;
                                const safeUntil = sim.hazardClock + .4;
                                const threatened = sim.drills.some(d => {
                                    for (let at = sim.hazardClock; at <= safeUntil; at += .1) {
                                        sim.updateDrill(d, at);
                                        if (sim.drillHits(sim.me, d)) return true;
                                    }
                                    return false;
                                }) || sim.lasers.some(l => {
                                    const lethal = l.steam ? { x: l.x + 4, y: l.y + 30, w: l.w - 8, h: l.h - 30 } : l;
                                    for (let at = sim.hazardClock; at <= safeUntil; at += .1) {
                                        if (((at + l.phase) % l.period) < l.period * .55 && U.overlap(sim.me, lethal)) return true;
                                    }
                                    return false;
                                });
                                if (!threatened) return plan;
                            }
                            break;
                        }
                        if (sim.me.y > b.y + 650) break;
                    }
                }
            }
            return null;
        }

        skylineBot(demo, game, c, dt, hold, tap) {
            const me = game.me, R = this.skyRoute(game);
            if (!demo.sky) {
                demo.sky = { start: -1, cur: 0, lastProg: c, flagDone: true, jump: null };
                game.hurt = () => { };
                game.crumbles.length = 0; game.blinkers.length = 0;
                this.skylineCut(demo, game, c);
            }
            const S = demo.sky;
            if (c - S.sceneStarted >= 15 || game.finished) {
                this.skylineCut(demo, game, c);
                return;
            }
            if (game.cp.id > S.start) {
                S.reachT = S.reachT ?? c;
                if (c - S.reachT > 0.9) { this.skylineCut(demo, game, c); return; }
            }
            this.skyDrive(game, S, R, c, hold, tap);
        }

        skyPlace(game, S, node, c) {
            const me = game.me;
            me.x = node.x + node.w / 2 - me.w / 2; me.y = node.y - me.h; me.vx = 0; me.vy = 0;
            Object.assign(me, { onGround: false, ground: null, wall: 0 });
            Object.assign(game, { dash: 0, kick: 0, dashCd: 0, buffer: 0, coyote: .1,
                airJumps: 1, sprung: false, wallDir: 0, finished: false, dead: 0,
                stuckT: 0, strandedT: 0, snapCam: true, stuckX: undefined, stuckY: undefined });
            S.jump = null; S.lastProg = c;
        }

        // Presses the same keys a player would; the real game physics does the movement. Gets teleported forward only if it ever stalls.
        skyDrive(game, S, R, c, hold, tap) {
            const me = game.me, list = R.list, cx = me.x + me.w / 2, feet = me.y + me.h;
            const gi = list.findLastIndex(p => p === me.ground || p.surface === me.ground);
            if (me.onGround && gi >= 0 && gi !== S.cur) {
                if (gi > S.cur) S.lastProg = c;
                S.cur = gi; S.flagDone = !R.flags.has(gi); S.jump = null; S.fail = 0; S.runBack = false;
            }
            const nx = list[S.cur + 1];
            if (!nx) return;
            if (feet > list[S.cur].y + 520) { this.skyPlace(game, S, list[S.cur], c); return; }
            if (c - S.lastProg > 3) { S.cur = Math.min(list.length - 1, S.cur + 1); S.flagDone = true; this.skyPlace(game, S, list[S.cur], c); return; }
            const ncx = nx.x + nx.w / 2;
            if (me.onGround && me.ground) {
                const n = me.ground;
                S.jump = null;
                const fx = gi >= 0 ? R.flags.get(gi) : undefined;
                if (fx !== undefined && !S.flagDone) {
                    if (Math.abs(cx - fx) > 6) hold.add(fx > cx ? 'KeyD' : 'KeyA'); else S.flagDone = true;
                    return;
                }
                const rise = n.y - nx.y;
                const walls = rise > 250 ? game.solids.filter(w => w.wallJ && w.y + w.h > n.y - 320 && w.y < n.y && Math.abs(w.x + w.w / 2 - cx) < 420) : [];
                if (walls.length) {
                    const gx = (Math.min(...walls.map(w => w.x)) + Math.max(...walls.map(w => w.x + w.w))) / 2;
                    const exitDir = ncx >= gx ? 1 : -1;
                    const low = walls.reduce((a, w) => (w.y + w.h > a.y + a.h ? w : a), walls[0]);
                    const lowSide = Math.sign(low.x + low.w / 2 - gx) || exitDir;
                    S.shaft = { gx, top: Math.min(...walls.map(w => w.y)), exitDir, side: lowSide, best: feet };
                    const standX = Math.max(n.x + 12, Math.min(n.x + n.w - 12, gx));
                    if (Math.abs(cx - standX) > 18) { hold.add(standX > cx ? 'KeyD' : 'KeyA'); return; }
                    hold.add(lowSide > 0 ? 'KeyD' : 'KeyA'); hold.add('Space'); tap.add('Space');
                    S.jump = { t: c, v: { dbl: 0.2, dash: null }, dbl: false, dash: false };
                    return;
                }
                S.shaft = null;
                // Jump pads: if the next platform is too high for a double jump, bounce off a spring on this platform
                const spring = rise > 200 ? game.springs.find(sp => sp.x >= n.x - 4 && sp.x + sp.w <= n.x + n.w + 4 && Math.abs(sp.y + sp.h - n.y) < 6) : null;
                if (spring) {
                    const sx = spring.x + spring.w / 2;
                    if (Math.abs(cx - sx) > 5) hold.add(sx > cx ? 'KeyD' : 'KeyA');
                    else if (Math.abs(me.vx) > 40) hold.add(me.vx > 0 ? 'KeyA' : 'KeyD');
                    else { hold.add(ncx > sx ? 'KeyD' : 'KeyA'); }
                    return;
                }
                const d = ncx >= n.x + n.w / 2 ? 1 : -1;
                const tx = Math.max(n.x + 12, Math.min(n.x + n.w - 12, d > 0 ? Math.min(n.x + n.w - 12, nx.x - 22) : Math.max(n.x + 12, nx.x + nx.w + 22)));
                const atEdge = d * (cx - tx) >= -6;
                if (nx.mover) {
                    if (!atEdge) { hold.add(d > 0 ? 'KeyD' : 'KeyA'); return; }
                    // Moving platforms: wait at the edge until the target swings (or rises) into jumping range
                    const gap = Math.max(0, nx.x - (n.x + n.w), n.x - (nx.x + nx.w));
                    if (nx.vert ? (rise > 130 || rise < -170) : gap > 190) { S.lastProg = c; return; }
                    hold.add(d > 0 ? 'KeyD' : 'KeyA'); hold.add('Space'); tap.add('Space');
                    S.jump = { t: c, v: { dbl: 0, dash: null }, dbl: false, dash: false };
                    return;
                }
                // Try several jump styles from here and only jump when one is known to land on a platform further along the route
                const variants = [{ dbl: 0.05, dash: null }, { dbl: 0.2, dash: null }, { dbl: 0.4, dash: null }, { dbl: 0.1, dash: 0.3 }, { dbl: 0.3, dash: 0.15 }, { dbl: 0.2, dash: 0.5 }, { dbl: 9, dash: 0.1 }, { dbl: 9, dash: null }];
                let pick = null, bestIdx = S.cur;
                for (const v of variants) {
                    const idx = this.skyPredict(game, R, S, me, me.vx, d, v);
                    if (idx > bestIdx && idx <= S.cur + 3) { bestIdx = idx; pick = v; if (idx === S.cur + 1) break; }
                }
                if (pick) {
                    S.fail = 0; S.runBack = false;
                    hold.add(d > 0 ? 'KeyD' : 'KeyA'); hold.add('Space'); tap.add('Space');
                    S.jump = { t: c, v: pick, dbl: false, dash: false };
                    return;
                }
                // No jump from here is known to land: back up for a longer run-up, and as a last resort skip this hop
                if (S.runBack) {
                    const far = d > 0 ? n.x + 14 : n.x + n.w - 14;
                    if (Math.abs(cx - far) > 8) { hold.add(far > cx ? 'KeyD' : 'KeyA'); return; }
                    S.runBack = false;
                }
                if (!atEdge) { hold.add(d > 0 ? 'KeyD' : 'KeyA'); return; }
                S.fail = (S.fail || 0) + 1;
                if (S.fail <= 2) { S.runBack = true; return; }
                S.fail = 0; S.cur = Math.min(list.length - 1, S.cur + 1); S.flagDone = true;
                this.skyPlace(game, S, list[S.cur], c);
                return;
            }
            const sh = S.shaft;
            if (sh && feet > sh.top + 24) {
                if (feet < sh.best - 10) { sh.best = feet; S.lastProg = c; }
                if (game.wallDir) {
                    sh.side = -game.wallDir;
                    if (c - (S.wjT || 0) > 0.14) { tap.add('Space'); S.wjT = c; }
                }
                hold.add('Space');
                hold.add((feet < sh.top + 130 ? sh.exitDir : sh.side) > 0 ? 'KeyD' : 'KeyA');
                return;
            }
            const j = S.jump || (S.jump = { t: c, v: { dbl: 0, dash: null }, dbl: false, dash: false });
            const k = this.skyAirKeys({ x: me.x, y: me.y, w: me.w, h: me.h, vx: me.vx, vy: me.vy }, nx, j, c - j.t, game.airJumps, game.dashCd);
            if (k.dir) hold.add(k.dir > 0 ? 'KeyD' : 'KeyA');
            if (k.hold) hold.add('Space');
            if (k.dbl) { tap.add('Space'); hold.add('Space'); j.dbl = true; }
            if (k.dash) { tap.add('ShiftLeft'); j.dash = true; }
        }

        // The airborne controller. Shared by the live bot and by skyPredict, so a jump is only taken if the very same controller is known to land.
        skyAirKeys(b, nx, j, tj, airJumps, dashCd) {
            const cx = b.x + b.w / 2, feet = b.y + b.h, ncx = nx.x + nx.w / 2;
            const over = cx > nx.x + 14 && cx < nx.x + nx.w - 14;
            const out = { dir: 0, hold: b.vy < 0, dbl: false, dash: false };
            if (!over || feet < nx.y - 30) out.dir = ncx > cx ? 1 : -1;
            else if (Math.abs(b.vx) > 120) out.dir = b.vx > 0 ? -1 : 1;
            const farX = Math.max(0, nx.x - cx, cx - (nx.x + nx.w));
            if (!j.dbl && airJumps > 0 && tj >= j.v.dbl && b.vy > -150 && nx.y < feet - 8 && !(over && feet < nx.y)) { out.dbl = true; out.hold = true; }
            else if (j.v.dash != null && !j.dash && tj >= j.v.dash && farX > 50 && dashCd <= 0 && feet < nx.y + 60) out.dash = true;
            return out;
        }

        // Replays a jump with the game's real collision code and the same physics constants; returns the route index it lands on (-1 if it misses).
        skyPredict(game, R, S, from, vx0, dirNow, v) {
            const U = window.StudBudArcade.util, nx = R.list[S.cur + 1];
            const near = game.solids.filter(p => !p.off && !p.wall && p.x < from.x + 900 && p.x + p.w > from.x - 900 && p.y < from.y + 800 && p.y + p.h > from.y - 900);
            const b = { x: from.x, y: from.y, w: from.w, h: from.h, vx: vx0, vy: -850, onGround: false, ground: null, wall: 0 };
            const j = { v, dbl: false, dash: false };
            let airJumps = 1, dash = 0, dashCd = Math.max(0, game.dashCd || 0), face = dirNow || 1;
            const DT = 1 / 60;
            for (let i = 0; i < 170; i++) {
                const tj = i * DT;
                const k = this.skyAirKeys(b, nx, j, tj, airJumps, dashCd);
                const dir = i === 0 ? dirNow : k.dir;
                dashCd -= DT;
                if (dash > 0) { dash -= DT; b.vx = face * 760; b.vy = 0; }
                else {
                    b.vx += U.clamp(dir * 340 - b.vx, -2300 * DT, 2300 * DT);
                    if (dir) face = dir;
                    b.vy = Math.min(1150, b.vy + 2300 * DT);
                    if (!(k.hold || b.vy >= -250) ) b.vy += 2600 * DT;
                    if (k.dbl) { b.vy = -780; airJumps--; j.dbl = true; }
                    if (k.dash) { dash = 0.16; dashCd = 0.9; j.dash = true; }
                }
                U.moveBody(b, near, DT);
                if (b.onGround && i > 2) return R.list.indexOf(b.ground);
                if (b.y > from.y + 700) return -1;
            }
            return -1;
        }

        // Starts the preview runner at a random checkpoint; used at the start and each time the next checkpoint has been reached.
        skylineCut(demo, game, c) {
            const S = demo.sky, me = game.me, cps = game.checkpoints, R = this.skyRoute(game);
            const k = (S.start + 1) % cps.length;
            const n = R.list[R.cpNode[k]];
            S.start = k; S.sceneStarted = c; S.reachT = undefined; S.cur = R.cpNode[k]; S.flagDone = true;
            this.skyPlace(game, S, n, c);
            me.x = cps[k].x + 20 - me.w / 2; me.face = 1;
            Object.assign(game, { cp: cps[k], dead: 0 });
            game.maxH = Math.max(game.maxH, -cps[k].y);
            demo.trail = [];
        }

        // Runs the real game class with scripted bot input, so the lobby preview always matches the actual game.
        previewControls(demo, dt) {
            const { mode, game, hold, tap, session } = demo;
            const me = game.me;
            const bots = demo.bots;
            const clock = demo.clock;
            const press = (...keys) => keys.forEach(key => hold.add(key));
            const tapKey = (...keys) => keys.forEach(key => tap.add(key));
            if (mode === 'skyline') {
                this.skylineBot(demo, game, clock, dt, hold, tap);
                bots.forEach((bot, i) => this.stepSkylineBot(demo, bot, i, dt));
                return;
            }
            if (mode === 'duel') {
                this.stepDuelBots(demo, dt); this.driveDuel(demo, hold, tap, session); return;
            }
            if (mode === 'shooter') {
                this.stepShooterBots(demo, dt); this.driveShooter(demo, hold, tap, session, clock); return;
            }
            if (mode === 'defense') {
                this.stepDefenseBots(demo, dt);
                const target = game.paths[game.myTeam][3];
                if (Math.abs(target.x - me.x) > 35) press(target.x > me.x ? 'KeyD' : 'KeyA');
                if (Math.abs(target.y - me.y) > 35) press(target.y > me.y ? 'KeyS' : 'KeyW');
                return;
            }
            if (mode === 'miner') {
                const carry = Number(game.items || 0), lowFuel = Number(game.res?.value || 0) < 35;
                if ((carry >= game.cap * 0.55 || lowFuel) && me.y > game.base.y + game.base.h) {
                    const dx = game.base.x + game.base.w / 2 - (me.x + me.w / 2);
                    if (Math.abs(dx) > 22) press(dx > 0 ? 'KeyD' : 'KeyA');
                    press('KeyW');
                } else {
                    let target = null, best = Infinity;
                    const x0 = Math.max(1, Math.floor(me.x / 48) - 10), x1 = Math.min((game.cols || 70) - 2, x0 + 20);
                    const y0 = Math.max(4, Math.floor(me.y / 48) - 2), y1 = Math.min((game.rows || 46) - 2, y0 + 12);
                    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                        const type = game.tile(x, y);
                        if (![3, 4, 5, 7, 8, 9].includes(type)) continue;
                        const score = Math.abs(x * 48 + 24 - me.x - me.w / 2) + Math.abs(y * 48 + 24 - me.y - me.h / 2) * 1.5;
                        if (score < best) { best = score; target = { x, y }; }
                    }
                    if (target) {
                        const tx = target.x * 48 + 24, ty = target.y * 48 + 24, dx = tx - me.x - me.w / 2, dy = ty - me.y - me.h / 2;
                        if (Math.abs(dx) > 30) press(dx > 0 ? 'KeyD' : 'KeyA');
                        if (dy > 34 && Math.abs(dx) < 115) press('KeyS');
                        if (dy < -70) press('KeyW');
                        if (game.res.value < 82 && me.y > 260) press('KeyW');
                    } else { press(clock % 4 < 2 ? 'KeyD' : 'KeyA'); press('KeyS'); }
                }
                bots.forEach((b, i) => this.stepAmbientBot(demo, b, i, dt));
                return;
            }
            if (mode === 'market') {
                const shops = game.shops || [];
                const target = game.pkg ? game.pkg.to.door : shops.length ? shops[(demo.shopIndex || 0) % shops.length].door : null;
                if (!target) { bots.forEach((b, i) => this.stepAmbientBot(demo, b, i, dt)); return; }
                const dx = target.x - game.me.x, dy = target.y - game.me.y;
                const avoidance = game.cars.find(car => {
                    const rect = game.carRect(car, clock);
                    return Math.abs(rect.x + rect.w / 2 - me.x) < 95 && Math.abs(rect.y + rect.h / 2 - me.y) < 65;
                });
                if (avoidance) {
                    if (avoidance.horiz) press(me.y < avoidance.c ? 'KeyW' : 'KeyS');
                    else press(me.x < avoidance.c ? 'KeyA' : 'KeyD');
                } else {
                    if (Math.abs(dx) > 25) press(dx > 0 ? 'KeyD' : 'KeyA');
                    if (Math.abs(dy) > 25) press(dy > 0 ? 'KeyS' : 'KeyW');
                    if (Math.hypot(dx, dy) > 210) press('ShiftLeft');
                }
                bots.forEach((b, i) => this.stepAmbientBot(demo, b, i, dt));
                return;
            }
            if (mode === 'river') {
                const seconds = clock;
                let target = null, best = Infinity;
                for (const fish of game.fish) {
                    const p = game.fishPos(fish, seconds), d = Math.hypot(p.x - me.x, p.y - me.y);
                    if (d < best) { best = d; target = p; }
                }
                if (target) {
                    const dx = target.x - me.x, dy = target.y - me.y;
                    if (Math.hypot(dx, dy) > 145) {
                        if (Math.abs(dx) > Math.abs(dy)) press(dx > 0 ? 'KeyD' : 'KeyA');
                        else press(dy > 0 ? 'KeyS' : 'KeyW');
                    }
                    const hazards = [...game.rocks.map(r => ({ x: r.x, y: r.y, r: r.r })), ...game.pools.map(pool => ({ ...game.poolPos(pool, seconds), r: pool.r * 0.75 }))];
                    const hazard = hazards.find(item => Math.hypot(item.x - me.x, item.y - me.y) < item.r + 80);
                    if (hazard) {
                        const side = me.x < hazard.x ? -1 : 1; press(side < 0 ? 'KeyA' : 'KeyD');
                    }
                    if (!game.cast && game.castCd <= 0 && best < 270 && clock - (demo.lastCast || -2) > 1.2) {
                        session.mouse.x = (target.x - game.camX) * game.zoom + session.vw / 2;
                        session.mouse.y = (target.y - game.camY) * game.zoom + session.vh / 2;
                        session.mouse.pressed = true; demo.lastCast = clock;
                    }
                }
                bots.forEach((b, i) => this.stepAmbientBot(demo, b, i, dt));
                return;
            }
            if (mode === 'crypto') {
                if (Math.floor(clock / 2) !== demo.lastTrade) {
                    demo.lastTrade = Math.floor(clock / 2); tapKey(`Digit${(demo.lastTrade % 6) + 1}`);
                    tapKey(game.price(game.sel, clock) >= game.price(game.sel, Math.max(0, clock - 3)) ? 'KeyB' : 'KeyS');
                }
                bots.forEach((b, i) => this.stepAmbientBot(demo, b, i, dt));
                return;
            }
            if (mode === 'frenzy') {
                if (game.st === 0 && clock - (demo.lastAction || -2) > 1.2) { tapKey('Space'); demo.lastAction = clock; }
                else if (game.st === 1) {
                    if (game.power < 0.9) press('Space');
                    else { demo.lastAction = clock; }
                } else if (game.st === 3) tapKey('Space');
                else if (game.st === 4) { if (game.fishY > game.zone.y + 42) press('Space'); }
                bots.forEach((b, i) => this.stepAmbientBot(demo, b, i, dt));
                return;
            }
            const axis = game.me && game.me.x < (game.W || 900) * 0.55 ? 'KeyD' : 'KeyA';
            press(axis); if (Math.floor(clock * 1.6) !== demo.lastJump) { demo.lastJump = Math.floor(clock * 1.6); tapKey('Space'); }
            bots.forEach((b, i) => this.stepAmbientBot(demo, b, i, dt));
        }

        stepSkylineBot(demo, bot, index, dt) {
            const game = demo.game, now = performance.now(), route = this.skyRoute(game);
            if (game.testTeleportVersion && bot.st?.teleportVersion !== game.testTeleportVersion) {
                const i = route.cpNode[game.cp.id], start = route.list[i];
                bot.st = { i, checkpoint: game.cp.id, teleportVersion: game.testTeleportVersion, jump: null, air: false, moving: false };
                Object.assign(bot, { x: start.x + 10 + index * 8, y: start.y - 44,
                    vx: 0, vy: 0, onGround: true, ground: start, done: false, ft: 0, respawn: 0 });
                bot.ai.rechargeAt = 0;
            }
            if (!bot.st) {
                const start = route.list[0];
                bot.w = 26; bot.h = 44; bot.st = { i: 0, flagDone: true, jump: null, wait: 0, air: false, moving: false };
                bot.x = start.x + 10 + index * 8; bot.y = start.y - bot.h;
                bot.vx = 0; bot.vy = 0; bot.onGround = true; bot.ground = start; bot.airJumps = 1; bot.dashCd = 0;
            }
            bot.w = 26; bot.h = 44;
            if (bot.done) {
                bot.vx = 0; bot.vy = 0; bot.seen = now;
                return;
            }
            if (bot.onGround && bot.ground === game.summit) {
                bot.done = true; bot.ft ||= Math.max(1, Math.round(demo.session.t * 1000));
                bot.vx = 0; bot.vy = 0; bot.seen = now;
                return;
            }
            const speed = bot.ai.speed * (0.78 + bot.ai.aggression * 0.24);
            this.skyStep(demo, game, bot, bot.st, dt, speed);
            if (bot.onGround && bot.ground === game.summit) {
                bot.done = true; bot.ft ||= Math.max(1, Math.round(demo.session.t * 1000));
            }
            bot.f = bot.face || 1; bot.a = bot.respawn > 0 ? 4 : bot.st.air ? 2 : bot.st.moving ? 1 : 0;
            const actor = bot.st.actor;
            bot.tx = bot.x; bot.ty = bot.y;
            bot.ex = { g: Boolean(bot.onGround), wa: actor?.wallPose || 0, ws: actor?.wallSide || 0, wk: actor?.kick || 0,
                dp: actor?.dashPose || 0, jp: actor?.jumpPulse || 0, j: actor?.airJumpPulse || 0, l: actor?.landingPose || 0 };
            bot.seen = now;
        }

        minerSectors(game) {
            const cols = game?.cols || 70, third = Math.floor((cols - 4) / 3);
            return [[2, 2 + third], [2 + third, 2 + third * 2], [2 + third * 2, cols - 2]];
        }

        stepAmbientBot(demo, bot, index, dt) {
            const { mode, game, clock } = demo, now = performance.now();
            const U = window.StudBudArcade.util;
            const ai = bot.ai || (bot.ai = { rng: U.mulberry32(U.hashStr(`${mode}:${bot.id}`)), speed: 1, aggression: 0.5, reaction: 0.3, area: (index + 0.5) / 3, phase: index, stuck: 0, lastX: bot.x, lastY: bot.y });
            const rand = ai.rng || Math.random, W = game.W || game.WIDTH || 1600, H = game.H || 800;
            const costs = window.StudBudArcade.ENERGY_COSTS, moving = Math.hypot(bot.vx, bot.vy) > 20;
            const ready = mode === 'miner' || this.botResourceReady(demo, bot, dt, !moving ? 0 : mode === 'river' ? costs.river.walk : costs.market.walk);
            const speed = ready ? (mode === 'miner' ? 74 : mode === 'market' ? game.baseSpeed : mode === 'river' ? 115 : mode === 'hack' ? 112 : 84) * (ai.speed || 1) : 0;
            const setTarget = (target, duration = 2.2) => { ai.target = target; ai.targetUntil = clock + duration; };
            let target = ai.target;
            if (mode === 'market' && game.shops?.length && game.houses?.length) {
                const arrived = target && Math.hypot(bot.x - target.x, bot.y - target.y) < 24;
                if (!target || arrived) {
                    if (arrived && ai.carrying) {
                        bot.deliveries = (bot.deliveries || 0) + 1;
                        bot.cash = (bot.cash || 0) + 60;
                    }
                    ai.carrying = arrived ? !ai.carrying : false;
                    const shops = game.shops, houses = game.houses;
                    const list = [...(ai.carrying ? houses : shops)].sort((a, b) => Math.hypot(a.door.x - bot.x, a.door.y - bot.y) - Math.hypot(b.door.x - bot.x, b.door.y - bot.y)).slice(0, ai.carrying ? 3 : 1);
                    const cycle = ai.carrying ? (ai.houseIndex + Math.floor(clock / 3)) : (ai.shopIndex + Math.floor(clock / 3));
                    const item = list[((cycle + index) % list.length + list.length) % list.length];
                    setTarget(item.door, Infinity); target = ai.target;
                    const nearest = (values, value) => values.reduce((best, current) => Math.abs(current - value) < Math.abs(best - value) ? current : best);
                    const fromX = nearest(game.roadsX, bot.x), fromY = nearest(game.roadsY, bot.y);
                    const toX = nearest(game.roadsX, target.x), toY = nearest(game.roadsY, target.y);
                    ai.path = [{ x: fromX, y: fromY }, { x: toX, y: fromY }, { x: toX, y: toY }, { x: target.x, y: toY }, target];
                }
                while (ai.path?.length > 1 && Math.hypot(bot.x - ai.path[0].x, bot.y - ai.path[0].y) < 30) ai.path.shift();
                const waypoint = ai.path?.[0] || target;
                const dx = waypoint.x - bot.x, dy = waypoint.y - bot.y, length = Math.hypot(dx, dy) || 1;
                const future = { x: bot.x + dx / length * Math.min(length, speed * .3) - 14, y: bot.y + dy / length * Math.min(length, speed * .3) - 14, w: 28, h: 28 };
                const traffic = game.cars.some(car => U.overlap(future, game.carHitRect(car, clock + .3)));
                ai.waitingTraffic = traffic;
                if (clock < (ai.recoverUntil || 0)) this.moveNavigatingBot(bot, waypoint.x, waypoint.y, speed, dt, game.walls, game);
                else this.moveBotToward(bot, dx, dy, traffic ? 0 : speed, dt);
                for (const wall of game.walls) U.pushCircleOutOfRect(bot, wall);
                ai.hitCd = Math.max(0, (ai.hitCd || 0) - dt);
                if (ai.hitCd <= 0 && game.cars.some(car => U.overlap({ x: bot.x - 12, y: bot.y - 12, w: 24, h: 24 }, game.carHitRect(car, clock)))) {
                    ai.hitCd = 1.35; bot.cash = Math.max(0, (bot.cash || 0) - Math.max(12, Math.round((bot.cash || 0) * 0.12)));
                    if (ai.carrying) { ai.target = null; ai.path = null; }
                    ai.carrying = false;
                }
                bot.score = bot.cash || 0;
                bot.ex = { p: ai.carrying ? 1 : 0 };
            } else if (mode === 'river' && game.fish?.length) {
                let fish = game.fish[ai.fishIndex];
                if (!fish || (game.away.get(fish.i) || 0) > clock || clock >= ai.targetUntil) {
                    const available = game.fish.filter(item => (game.away.get(item.i) || 0) <= clock);
                    fish = available.sort((a, b) => {
                        const pa = game.fishPos(a, clock), pb = game.fishPos(b, clock);
                        return Math.hypot(pa.x - bot.x, pa.y - bot.y) - Math.hypot(pb.x - bot.x, pb.y - bot.y);
                    })[0];
                    ai.fishIndex = fish ? game.fish.indexOf(fish) : -1; ai.targetUntil = clock + 5;
                }
                const p = fish ? game.fishPos(fish, clock) : { x: bot.x, y: bot.y };
                target = ai.target = { x: p.x, y: p.y };
                let dx = target.x - bot.x, dy = target.y - bot.y;
                const hazards = [...game.rocks.map(r => ({ x: r.x, y: r.y, r: r.r })), ...(game.pools || []).map(pool => ({ ...game.poolPos(pool, clock), r: pool.r * 0.9 }))];
                const hazard = hazards.find(item => Math.hypot(item.x - bot.x, item.y - bot.y) < item.r + 65);
                if (hazard) { dx = bot.x - hazard.x + ai.side * 55; dy = bot.y - hazard.y; }
                this.moveBotToward(bot, dx, dy, speed, dt);
                ai.castTimer -= dt;
                const castCost = costs.river.cast, unlimited = (demo.session.testing && !demo.session.limitedTestEnergy) || demo.session.preview, canCast = unlimited || (ai.energy ?? 0) >= castCost;
                if (ready && canCast && fish && ai.castTimer <= 0 && Math.hypot(p.x - bot.x, p.y - bot.y) < 78 + game.fishSpec(fish.type).r) {
                    if (!unlimited) ai.energy = Math.max(0, ai.energy - castCost);
                    bot.score = (bot.score || 0) + game.fishSpec(fish.type).v;
                    ai.catches = (ai.catches || 0) + 1;
                    game.away.set(fish.i, clock + 9);
                    ai.targetUntil = 0;
                    ai.castTimer = 2.5 + rand() * 1.7 + ai.reaction;
                }
                bot.ex = { n: ai.castTimer > 2.2 ? 1 : 0, catches: ai.catches || 0 };
            } else if (mode === 'miner' && game.T) {
                const TS = 48, crystalValues = { 3: 5, 4: 12, 5: 25, 7: 50, 8: 90, 9: 160 };
                bot.w = 26; bot.h = 40; bot.fuel = (demo.session.testing && !demo.session.limitedTestEnergy) || demo.session.preview ? 100 : ai.fuel ?? (game.res?.value ?? 40); bot.carry = bot.carry || 0; bot.items = bot.items || 0;
                if (!(demo.session.testing && !demo.session.limitedTestEnergy) && !demo.session.preview && (bot.fuel < 35 || ai.rechargeAt)) {
                    ai.rechargeAt = ai.rechargeAt || clock + 1 + ai.reaction;
                    if (clock >= ai.rechargeAt) {
                        bot.fuel += demo.session.rewardAmount();
                        ai.rechargeAt = bot.fuel < 85 ? clock + 1 + ai.reaction : 0;
                    }
                    ai.fuel = bot.fuel; bot.vx = bot.vy = 0;
                    bot.ex = { c: bot.carry, n: bot.items }; bot.seen = now;
                    return;
                }
                const sector = ai.sector || this.minerSectors(game)[index % 3];
                const lastRow = (game.rows || 46) - 2, lastCol = (game.cols || 70) - 2;
                const depth = game.depthAt(bot.y + bot.h);
                if (bot.carry && !ai.tripStarted) ai.tripStarted = clock;
                const returning = bot.carry >= 40 || bot.items >= game.cap || (bot.carry > 0 && clock - ai.tripStarted > 22) || bot.fuel < Math.min(78, 28 + depth * 1.6);
                if (returning) {
                    target = { x: game.base.x + game.base.w / 2, y: game.base.y + game.base.h / 2 };
                    ai.ore = null;
                } else {
                    const targetTile = ai.ore, targetType = targetTile && game.tile(targetTile.x, targetTile.y);
                    if (!targetTile || !crystalValues[targetType] || clock > (ai.oreUntil || 0)) {
                        let best = -Infinity, pick = null;
                        for (let y = 6; y < lastRow; y++) for (let x = sector[0]; x < sector[1]; x++) {
                            const type = game.tile(x, y);
                            if (!crystalValues[type]) continue;
                            let lavaNear = false;
                            for (let ly = Math.max(4, y - 2); ly <= Math.min(lastRow, y + 2) && !lavaNear; ly++) {
                                for (let lx = Math.max(1, x - 2); lx <= Math.min(lastCol, x + 2); lx++) {
                                    if (game.tile(lx, ly) === 6) { lavaNear = true; break; }
                                }
                            }
                            if (lavaNear) continue;
                            const distance = Math.abs(x * TS + TS / 2 - (bot.x + bot.w / 2)) + Math.abs(y * TS + TS / 2 - (bot.y + bot.h / 2)) * 1.15;
                            const score = crystalValues[type] * (0.85 + rand() * 0.3) - distance * 0.16;
                            if (score > best) { best = score; pick = { x, y }; }
                        }
                        ai.ore = pick; ai.oreUntil = clock + 18; ai.dig = null;
                    }
                    if (ai.ore) target = { x: ai.ore.x * TS + TS / 2, y: ai.ore.y * TS + TS / 2 };
                    else target = { x: sector[0] * TS + TS / 2, y: 12 * TS };
                }

                const cx = bot.x + bot.w / 2, cy = bot.y + bot.h / 2;
                const dx = target.x - cx, dy = target.y - cy;
                const recharging = Boolean(ai.rechargeAt);
                const digX = Math.abs(dx) > TS * 0.65 ? Math.sign(dx) : 0, digY = digX ? 0 : Math.sign(dy);
                const tx = Math.floor(cx / TS) + digX, ty = Math.floor(cy / TS) + digY;
                const type = game.tile(tx, ty);
                const diggable = type > 0 && type !== 6 && type !== 10
                    && Math.hypot(tx * TS + TS / 2 - cx, ty * TS + TS / 2 - cy) < TS * 2.25;
                if (diggable && !recharging && bot.fuel >= window.StudBudArcade.ENERGY_COSTS.miner.dig * dt) {
                    bot.fuel = Math.max(0, bot.fuel - window.StudBudArcade.ENERGY_COSTS.miner.dig * dt);
                    if (!ai.dig || ai.dig.x !== tx || ai.dig.y !== ty) ai.dig = { x: tx, y: ty, progress: 0 };
                    ai.dig.progress += dt;
                    bot.vx *= Math.max(0, 1 - 10 * dt);
                    if (ai.dig.progress >= game.digDuration(type, ty)) {
                        game.breakTile(tx, ty, type, false);
                        game.s.emit({ k: 'dg', x: tx, y: ty, t: type });
                        if (crystalValues[type]) {
                            bot.carry += crystalValues[type]; bot.items++;
                            if (ai.ore?.x === tx && ai.ore?.y === ty) ai.ore = null;
                        }
                        ai.dig = null;
                    }
                } else {
                    ai.dig = null;
                    const desiredX = !recharging && Math.abs(dx) > 4 ? Math.sign(dx) * Math.min(game.baseSpeed, Math.abs(dx) * 6) : 0;
                    bot.vx += U.clamp(desiredX - bot.vx, -850 * dt, 850 * dt);
                }

                bot.vy = Math.min(860, (bot.vy || 0) + 1750 * dt);
                const shouldJet = !recharging && dy < -42 && bot.fuel >= window.StudBudArcade.ENERGY_COSTS.miner.jet * dt;
                if (shouldJet) {
                    bot.vy = Math.max(-590, bot.vy - 3000 * dt);
                    bot.fuel = Math.max(0, bot.fuel - window.StudBudArcade.ENERGY_COSTS.miner.jet * dt);
                }
                U.moveBody(bot, game.collisionSolids(bot), dt);
                bot.x = U.clamp(bot.x, TS + 1, game.W - TS - bot.w - 1);
                bot.y = U.clamp(bot.y, 0, game.H - TS - bot.h);

                let touchingLava = false;
                const x0 = Math.floor((bot.x + 3) / TS), x1 = Math.floor((bot.x + bot.w - 3) / TS);
                const y0 = Math.floor((bot.y + 3) / TS), y1 = Math.floor((bot.y + bot.h - 3) / TS);
                for (let ly = y0; ly <= y1 && !touchingLava; ly++) for (let lx = x0; lx <= x1; lx++) {
                    if (game.tile(lx, ly) === 6) { touchingLava = true; break; }
                }
                if (touchingLava && (ai.lavaCd || 0) <= 0) {
                    ai.lavaCd = 1.1; bot.carry = Math.max(0, bot.carry - Math.ceil(bot.carry * 0.2));
                    bot.vy = -360; ai.ore = null; ai.dig = null;
                }
                ai.lavaCd = Math.max(0, (ai.lavaCd || 0) - dt);
                if (U.overlap(bot, game.base)) {
                    if (bot.carry > 0) bot.score = (bot.score || 0) + bot.carry;
                    bot.carry = 0; bot.items = 0; ai.ore = null; ai.dig = null; ai.tripStarted = 0;
                }
                ai.fuel = bot.fuel;
                bot.ex = { c: bot.carry, n: bot.items }; bot.a = 1;
            } else if (mode === 'crypto') {
                ai.researchUntil ||= clock + 1 + ai.reaction;
                if (clock >= ai.researchUntil) {
                    ai.cash += demo.session.rewardAmount() * 8;
                    ai.researchAnswers = (ai.researchAnswers || 0) + 1;
                    ai.researchUntil = clock + 2 + ai.reaction;
                }
                ai.tradeAt -= dt;
                if (ai.tradeAt <= 0) {
                    const trend = game.price(ai.asset, clock) - game.price(ai.asset, Math.max(0, clock - 4));
                    const price = game.price(ai.asset, clock);
                    if (trend >= 0 && ai.cash >= price) { ai.cash -= price; ai.units[ai.asset]++; ai.trades = (ai.trades || 0) + 1; }
                    else if (ai.units[ai.asset] > 0) { ai.cash += price * ai.units[ai.asset]; ai.units[ai.asset] = 0; ai.trades = (ai.trades || 0) + 1; ai.asset = (ai.asset + 1 + Math.floor(rand() * 3)) % 6; }
                    else ai.asset = (ai.asset + 1 + Math.floor(rand() * 3)) % 6;
                    ai.tradeAt = 2.4 + rand() * 2.6;
                }
                const rigCost = Math.round(250 * Math.pow(1.7, ai.rigs || 0));
                if (ai.cash >= rigCost) { ai.cash -= rigCost; ai.rigs = (ai.rigs || 0) + 1; }
                ai.cash += dt * (ai.rigs || 0) * 7;
                bot.score = Math.round(ai.cash + ai.units.reduce((sum, units, asset) => sum + units * game.price(asset, clock), 0));
                bot.ex = { asset: ai.asset, balance: bot.score };
                this.wanderBot(bot, ai, W, H, speed * 0.35, dt, clock);
            } else if ((mode === 'frenzy' || mode === 'fishing') && game.st !== undefined) {
                if (ready) ai.fishingTimer -= dt;
                if (ready && ai.fishingTimer <= 0 && ai.fishingState !== 4) {
                    if (ai.fishingState === 0) {
                        ai.energy = Math.max(0, ai.energy - 10); ai.fishingState = 1; ai.power = 0;
                    } else if (ai.fishingState === 3) {
                        const depth = ai.depth || .5, weights = [.62 - depth * .5, .3 + depth * .05, .07 + depth * .3, .01 + depth * .15];
                        let roll = rand() * weights.reduce((sum, weight) => sum + weight, 0), type = 0;
                        for (; type < 3; type++) { roll -= weights[type]; if (roll <= 0) break; }
                        ai.catchType = type; ai.fishingState = 4; ai.progress = .3;
                        ai.zoneY = ai.fishY = ai.fishTarget = 150; ai.zoneV = 0;
                    } else {
                        if (ai.fishingState === 1) ai.depth = .12 + ai.power * .88;
                        ai.fishingState++;
                    }
                    ai.fishingTimer = [1.2, .8, 1.4 + (ai.depth || .5), .2, 2.2][ai.fishingState] + ai.reaction;
                }
                if (ai.fishingState === 1) ai.power = Math.max(0, Math.min(1, (ai.power || 0) + dt * ai.powerDir * 0.7));
                if (ai.power >= 1 || ai.power <= 0) ai.powerDir *= -1;
                if (ai.fishingState === 4) {
                    if (Math.abs(ai.fishY - ai.fishTarget) < 8 || rand() < dt * .9) ai.fishTarget = rand() * 230;
                    const fishSpeed = game.catchSpeed(ai.catchType);
                    ai.fishY += U.clamp(ai.fishTarget - ai.fishY, -1, 1) * 110 * fishSpeed * dt;
                    const held = ai.fishY < ai.zoneY + 37 + ai.zoneV * .12;
                    ai.zoneV = U.clamp(ai.zoneV + (held ? -1500 : 900) * dt, -420, 420);
                    ai.zoneY = U.clamp(ai.zoneY + ai.zoneV * dt, 0, 230);
                    const inside = ai.fishY > ai.zoneY - 4 && ai.fishY < ai.zoneY + 74;
                    ai.progress = U.clamp(ai.progress + (inside ? .34 : -.2 - fishSpeed * .03) * dt, 0, 1);
                    if (ai.progress >= 1) {
                        ai.catches = (ai.catches || 0) + 1; ai.combo = (ai.combo || 0) + 1;
                        bot.score = (bot.score || 0) + game.catchPoints(ai.catchType, ai.combo);
                        ai.fishingState = 0; ai.fishingTimer = 1.2 + ai.reaction;
                    } else if (ai.progress <= 0) { ai.combo = 0; ai.fishingState = 0; ai.fishingTimer = 1.2 + ai.reaction; }
                }
                bot.ex = { st: ai.fishingState, d: ai.depth || 0.4 + ai.area * 0.5, p: ai.power || 0 };
            } else if (mode === 'hack' && game.terms?.length) {
                bot.r = 15;
                if (!target || clock >= ai.targetUntil || Math.hypot(bot.x - target.x, bot.y - target.y) < 58) {
                    const terminals = game.terms.filter(term => term.kind === 'mine');
                    const term = terminals.reduce((best, item) => Math.hypot(item.x - bot.x, item.y - bot.y) < Math.hypot(best.x - bot.x, best.y - bot.y) ? item : best, terminals[0]);
                    setTarget({ x: term.x, y: term.y }, 6); target = ai.target;
                    ai.term = term;
                }
                this.moveNavigatingBot(bot, target.x, target.y, speed, dt, game.walls, game);
                for (const wall of game.walls) U.pushCircleOutOfRect(bot, wall);
                if (ready && ai.term && Math.hypot(bot.x - ai.term.x, bot.y - ai.term.y) < 46 && ai.term.cd <= 0) {
                    ai.miningUntil = ai.miningUntil || clock + 1 + ai.reaction;
                    if (clock >= ai.miningUntil) {
                        ai.term.cd = 1; bot.score = (bot.score || 0) + demo.session.rewardAmount() * 3;
                        ai.miningUntil = 0; ai.targetUntil = 0;
                    }
                } else ai.miningUntil = 0;
                bot.ex = { sh: Math.sin(clock + ai.phase) > 0.65 ? 1 : 0 };
            } else {
                this.wanderBot(bot, ai, W, H, speed * 0.55, dt, clock);
                bot.ex = {};
            }
            const moved = Math.hypot(bot.x - ai.lastX, bot.y - ai.lastY);
            ai.stuck = ready && !ai.waitingTraffic && moved < 1.4 ? ai.stuck + dt : 0; ai.lastX = bot.x; ai.lastY = bot.y;
            if (ai.stuck > 1.1) {
                if (mode === 'market') { ai.recoverUntil = clock + 4; ai.navPath = null; }
                else { ai.target = null; ai.targetUntil = 0; }
                ai.side *= -1; ai.stuck = 0;
            }
            bot.x = Math.max(20, Math.min(W - 20, bot.x)); bot.y = Math.max(20, Math.min(H - 20, bot.y));
            bot.f = Math.atan2((target?.y ?? bot.ty ?? bot.y) - bot.y, (target?.x ?? bot.tx ?? bot.x) - bot.x);
            bot.a = 1; bot.hp = 100; bot.tx = bot.x; bot.ty = bot.y; bot.seen = now; bot.ex = bot.ex || {};
        }

        botLineClear(x, y, tx, ty, walls, padding = 0) {
            return !walls.some(wall => {
                let enter = 0, exit = 1;
                for (const [start, delta, min, max] of [
                    [x, tx - x, wall.x - padding, wall.x + wall.w + padding],
                    [y, ty - y, wall.y - padding, wall.y + wall.h + padding]
                ]) {
                    if (Math.abs(delta) < 1e-9) {
                        if (start < min || start > max) return false;
                    } else {
                        const a = (min - start) / delta, b = (max - start) / delta;
                        enter = Math.max(enter, Math.min(a, b));
                        exit = Math.min(exit, Math.max(a, b));
                        if (enter > exit) return false;
                    }
                }
                return true;
            });
        }

        moveNavigatingBot(bot, x, y, speed, dt, walls, bounds) {
            if (speed === 0) { bot.vx = bot.vy = 0; return; }
            const padding = (bot.r || 15) + 3;
            const clearance = { x: bot.x, y: bot.y, r: padding + 1 };
            for (const wall of walls) window.StudBudArcade.util.pushCircleOutOfRect(clearance, wall);
            bot.x = clearance.x; bot.y = clearance.y;
            bot.ai.navElapsed = (bot.ai.navElapsed || 0) + dt;
            if (this.botLineClear(bot.x, bot.y, x, y, walls, padding)) {
                bot.ai.navPath = null;
                this.moveBotToward(bot, x - bot.x, y - bot.y, Math.min(speed, Math.hypot(x - bot.x, y - bot.y) * 6), dt);
                return;
            }
            const goalChanged = !bot.ai.navGoal || Math.hypot(x - bot.ai.navGoal.x, y - bot.ai.navGoal.y) > 80;
            if (!bot.ai.navPath || (goalChanged && bot.ai.navElapsed >= 1)) {
                bot.ai.navElapsed = 0;
                bot.ai.navGoal = { x, y };
                const corners = walls.flatMap(wall => [
                    { x: wall.x - padding - 4, y: wall.y - padding - 4 },
                    { x: wall.x + wall.w + padding + 4, y: wall.y - padding - 4 },
                    { x: wall.x - padding - 4, y: wall.y + wall.h + padding + 4 },
                    { x: wall.x + wall.w + padding + 4, y: wall.y + wall.h + padding + 4 }
                ]).filter(point => (!bounds || (point.x >= padding && point.x <= bounds.W - padding && point.y >= padding && point.y <= bounds.H - padding))
                    && this.botLineClear(point.x, point.y, point.x, point.y, walls, padding));
                const nodes = [{ x: bot.x, y: bot.y }, { x, y }, ...corners];
                const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set();
                costs[0] = 0;
                while (visited.size < nodes.length) {
                    let current = -1;
                    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
                    if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break;
                    visited.add(current);
                    for (let i = 0; i < nodes.length; i++) {
                        if (visited.has(i) || i === current) continue;
                        const from = nodes[current], to = nodes[i];
                        const cost = costs[current] + Math.hypot(to.x - from.x, to.y - from.y);
                        if (cost >= costs[i] || !this.botLineClear(from.x, from.y, to.x, to.y, walls, padding)) continue;
                        costs[i] = cost; previous[i] = current;
                    }
                }
                bot.ai.navPath = [];
                if (Number.isFinite(costs[1])) for (let i = 1; i > 0; i = previous[i]) bot.ai.navPath.unshift(nodes[i]);
            }
            const path = bot.ai.navPath;
            while (path.length > 1 && Math.hypot(path[0].x - bot.x, path[0].y - bot.y) < 10
                && this.botLineClear(bot.x, bot.y, path[1].x, path[1].y, walls, padding)) path.shift();
            const target = path[0];
            if (!target) {
                bot.vx = bot.vy = 0;
                if (bot.ai.navElapsed >= 1) bot.ai.navPath = null;
                return;
            }
            const distance = Math.hypot(target.x - bot.x, target.y - bot.y);
            this.moveBotToward(bot, target.x - bot.x, target.y - bot.y, Math.min(speed, distance * 6), dt);
        }

        moveBotToward(bot, dx, dy, speed, dt) {
            if (speed === 0) { bot.vx = bot.vy = 0; return; }
            const d = Math.hypot(dx, dy) || 1;
            const k = Math.min(1, dt * (3.2 + (bot.ai?.speed || 1) * 2.4));
            bot.vx = (bot.vx || 0) + ((dx / d) * speed - (bot.vx || 0)) * k;
            bot.vy = (bot.vy || 0) + ((dy / d) * speed - (bot.vy || 0)) * k;
            bot.x += bot.vx * dt; bot.y += bot.vy * dt;
            if (Math.abs(dx) + Math.abs(dy) > 0) bot.f = Math.atan2(dy, dx);
        }

        botResourceReady(demo, bot, dt, drain = 0) {
            const ai = bot.ai;
            const max = demo.game.res?.max || 100;
            if (!demo.game.res || (demo.session.testing && !demo.session.limitedTestEnergy) || demo.session.preview) { ai.energy = max; ai.rechargeAt = 0; return true; }
            ai.energy = ai.energy ?? demo.game.res?.value ?? max;
            if (ai.rechargeAt) {
                if (demo.clock < ai.rechargeAt) return false;
                ai.energy += demo.session.rewardAmount();
                ai.rechargeAt = 0;
            }
            if (ai.energy < 8) { ai.rechargeAt = demo.clock + 1 + ai.reaction; return false; }
            ai.energy = Math.max(0, ai.energy - drain * dt);
            return true;
        }

        wanderBot(bot, ai, W, H, speed, dt, clock) {
            if (!ai.target || clock >= ai.targetUntil || Math.hypot(bot.x - ai.target.x, bot.y - ai.target.y) < 42) {
                const region = ai.area || 0.5, x = W * (0.12 + region * 0.76), y = H * (0.2 + ((ai.lane + 1) % 3) * 0.28);
                ai.target = { x: Math.max(35, Math.min(W - 35, x + (ai.rng() - 0.5) * W * 0.22)), y: Math.max(35, Math.min(H - 35, y + (ai.rng() - 0.5) * H * 0.18)) };
                ai.targetUntil = clock + 2.5 + ai.rng() * 3;
            }
            const dx = ai.target.x - bot.x, dy = ai.target.y - bot.y;
            this.moveBotToward(bot, dx, dy, speed, dt);
        }

        drawLivePreview(canvas, mode, now) {
            const A = window.StudBudArcade;
            if (!canvas || !A?.games?.[mode] || !this.canvasIsVisible(canvas)) return false;
            A.previewDepth = (A.previewDepth || 0) + 1;
            try {
                const rect = canvas.getBoundingClientRect();
                const dpr = Math.min(rect.width < 400 ? 1 : 1.5, Math.max(1, window.devicePixelRatio || 1));
                const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr));
                if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
                const context = canvas.getContext('2d');
                if (!this.livePreviews) this.livePreviews = new Map();
                const viewWidth = 900, viewHeight = Math.round(viewWidth * height / width);
                let demo = this.livePreviews.get(canvas);
                if (!demo || demo.mode !== mode) {
                    context.setTransform(1, 0, 0, 1, 0, 0);
                    context.clearRect(0, 0, width, height);
                    const hold = new Set(), tap = new Set(), noop = () => {};
                    const mockClassList = { contains: () => false, add: noop, remove: noop, toggle: noop };
                    const mockCanvas = { style: {}, classList: mockClassList };
                    const mockElements = new Map();
                    const mockOverlay = {
                        classList: mockClassList,
                        querySelector: selector => {
                            if (selector === '.mpg-canvas') return mockCanvas;
                            if (!mockElements.has(selector)) {
                                const element = { style: {}, classList: mockClassList, textContent: '', innerHTML: '', value: '',
                                    querySelector: () => element, appendChild: noop, getBoundingClientRect: () => ({ width, height, left: 0, top: 0, right: width, bottom: height }) };
                                mockElements.set(selector, element);
                            }

                            return mockElements.get(selector);
                        }
                    };
                    const cosmetics = this.profileCosmetics(this.multiplayerProfile || {});
                    const base = {
                        preview: true, lowDetail: false, graphics: A.graphicsProfile(), stickJumpHeld: false, seed: 4242, local: { id: 'demo', color: '#38bdf8', nickname: 'You', cos: { skin: cosmetics.skin, hat: cosmetics.hat, acc: cosmetics.acc, effect: cosmetics.effect } }, user: { id: 'demo' }, t: 0, startedAt: Date.now(), done: false, finishMs: 0, over: false, paused: false, question: null, score: 0,
                        vw: viewWidth, vh: viewHeight, scale: 1, canvas: mockCanvas, overlay: mockOverlay, roster: new Map(), cards: [], keys: hold, hudBounds() { return { x: 12, y: 12, w: Math.max(1, this.vw - 24), h: Math.max(1, this.vh - 24) }; }, mouse: { x: width / 2, y: height / 2, down: false, pressed: false, touchAt: 0 },
                        down: (...keys) => keys.some(key => hold.has(key)), pressed: (...keys) => keys.some(key => tap.has(key)),
                        axis: () => ({ x: (hold.has('KeyD') || hold.has('ArrowRight') ? 1 : 0) - (hold.has('KeyA') || hold.has('ArrowLeft') ? 1 : 0), y: (hold.has('KeyS') || hold.has('ArrowDown') ? 1 : 0) - (hold.has('KeyW') || hold.has('ArrowUp') ? 1 : 0) }),
                        spend: () => true, rewardAmount: () => 20, refill: noop, sfx: noop, toast: noop, ask: () => false, remoteList: () => [], standings() { return [this.local, ...this.remoteList()].map(player => ({ id: player.id, n: player.nickname || player.name || player.id, color: player.color || '#94a3b8', s: Number(player.score) || 0 })); }, emit: event => demo?.onEmit?.(event), send: noop, setGoal: noop, addScore: noop,
                        placeHud(ctx, x, y, w, h, anchor = 'top-left') {
                            const scale = Math.max(0.35, Math.min(1, (session.vw - 24) / w, (session.vh - 24) / h));
                            const left = anchor.endsWith('right') ? session.vw - w * scale - 12 : anchor.endsWith('center') || anchor === 'center' ? (session.vw - w * scale) / 2 : 12;
                            const top = anchor.startsWith('bottom') ? session.vh - h * scale - 12 : anchor === 'center' ? (session.vh - h * scale) / 2 : 12;
                            ctx.save(); ctx.translate(left - x * scale, top - y * scale); ctx.scale(scale, scale);
                            return { x: left - x * scale, y: top - y * scale, scale };
                        }
                    };
                    const session = new Proxy(base, { get: (target, key) => key in target ? target[key] : (() => undefined) });
                    base.roster.set('demo', base.local);
                    [['b1', 'Nova', '#f472b6'], ['b2', 'Kite', '#facc15'], ['b3', 'Rook', '#4ade80']].forEach(([id, nickname, color]) => base.roster.set(id, { id, nickname, color, cos: {} }));
                    const game = new A.games[mode](session); session.game = game;
                    demo = { mode, session, game, hold, tap, last: now, clock: 0, accumulator: 0, meId: 'demo' };
                    demo.bots = this.initPreviewBots(demo, mode, game);
                    this.livePreviews.set(canvas, demo);
                }
                const { session, game, hold, tap } = demo;
                const cosmetics = this.profileCosmetics(this.multiplayerProfile || {});
                session.local.cos = { skin: cosmetics.skin, hat: cosmetics.hat, acc: cosmetics.acc, effect: cosmetics.effect };
                session.remoteList = () => demo.bots;
                session.remotes = new Map(demo.bots.map(bot => [bot.id, bot]));
                const elapsed = Math.min(0.1, Math.max(0, (now - demo.last) / 1000));
                demo.last = now;
                session.vw = viewWidth; session.vh = viewHeight;
                demo.accumulator += elapsed;
                const dt = 1 / 120;
                while (demo.accumulator + 1e-9 >= dt) {
                    demo.accumulator = Math.max(0, demo.accumulator - dt);
                    demo.clock += dt; session.t += dt; session.startedAt = Date.now() - demo.clock * 1000;
                    hold.clear(); tap.clear(); session.mouse.down = false; session.mouse.pressed = false;
                    this.previewControls(demo, dt);
                    if (game.res && game.res.value < 35) game.res.value = game.res.max;
                    game.update(dt);
                    if (mode === 'skyline' && game.finished && !demo.endAt) demo.endAt = demo.clock;
                }
                if (mode === 'skyline' && demo.endAt && demo.clock - demo.endAt > 1.5) this.livePreviews.delete(canvas);
                game.drawDt = elapsed;
                context.setTransform(1, 0, 0, 1, 0, 0);
                context.save();
                try {
                    context.scale(canvas.width / viewWidth, canvas.height / viewHeight);
                    game.draw(context, viewWidth, viewHeight);
                } finally {
                    context.restore();
                }
                return true;
            } catch (error) {
                console.warn(`[NexusApp] ${mode} live preview unavailable:`, error);
                if (this.livePreviews) this.livePreviews.delete(canvas);
                const context = canvas.getContext('2d');
                context.setTransform(1, 0, 0, 1, 0, 0);
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.fillStyle = '#fca5a5'; context.font = '600 14px system-ui'; context.textAlign = 'center';
                context.fillText('Game preview unavailable', canvas.width / 2, canvas.height / 2, canvas.width - 16);
                return false;
            } finally {
                A.previewDepth--;
            }
        }

        drawWaitingWarmup(canvas, time) {
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const runner = this.waitingRunner, width = canvas.width, height = canvas.height;
            const tile = Math.min(width / 7.8, height / 7.3), laneHeight = tile * 0.82;
            runner.viewCols = width / tile;
            const left = width / 2 - ((runner.cameraX ?? 4) + 0.5) * tile, clock = runner.clock || 0;
            const screenY = row => height - (row - runner.cameraRow + 1.8) * laneHeight;
            ctx.fillStyle = '#80bd5b'; ctx.fillRect(0, 0, width, height);
            const block = (x, y, w, h, rise, top, front, side) => {
                ctx.fillStyle = 'rgba(20,37,27,.22)'; ctx.fillRect(x + 5, y + 5, w, h);
                ctx.fillStyle = front; ctx.fillRect(x, y + h - rise, w, rise);
                ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(x + w, y - rise); ctx.lineTo(x + w + 4, y - rise + 4); ctx.lineTo(x + w + 4, y + h); ctx.lineTo(x + w, y + h - rise); ctx.fill();
                ctx.fillStyle = top; ctx.fillRect(x, y - rise, w, h);
            };
            const start = Math.max(-5, Math.floor(runner.cameraRow) - 2), rows = Math.ceil(height / laneHeight) + 7;
            for (let row = start; row < start + rows; row++) {
                const lane = this.waitingLane(runner, row), y = screenY(row);
                if (y < -laneHeight * 2 || y > height + laneHeight) continue;
                ctx.fillStyle = lane.type === 'grass' ? (row % 2 ? '#8cc967' : '#9bd573') : lane.type === 'road' ? '#646b73' : lane.type === 'river' ? '#3c9bd4' : '#bba582';
                ctx.fillRect(left, y, tile * 9, laneHeight);
                ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(left, y + laneHeight - 3, tile * 9, 3);
                if (lane.type === 'grass') {
                    for (let col = 0; col < 9; col++) {
                        ctx.fillStyle = 'rgba(67,117,46,.22)';
                        const gx = left + (col + this.waitingRandom(runner, Math.max(0, row), col + 171) * .7) * tile;
                        ctx.fillRect(gx, y + laneHeight * .25, tile * .07, 3); ctx.fillRect(gx + 7, y + laneHeight * .68, tile * .08, 3);
                    }
                    for (const blocker of lane.blockers) {
                        const x = left + (blocker.col + .5) * tile;
                        if (blocker.kind === 'tree') {
                            block(x - tile * .075, y + laneHeight * .5, tile * .15, tile * .25, tile * .13, '#a67840', '#75502d', '#634326');
                            block(x - tile * .3, y + laneHeight * .23, tile * .6, tile * .42, tile * .33, '#5eaa43', '#3c8134', '#326b2c');
                            block(x - tile * .2, y + laneHeight * .15, tile * .4, tile * .28, tile * .37, '#78bc51', '#509840', '#408033');
                        } else block(x - tile * .27, y + laneHeight * .4, tile * .54, tile * .36, tile * .15, '#b6bcc0', '#858e93', '#727a80');
                    }
                } else if (lane.type === 'road') {
                    ctx.fillStyle = '#d0d3d2';
                    for (let col = 0; col < 9; col++) ctx.fillRect(left + col * tile + tile * .15, y + laneHeight * .48, tile * .4, 3);
                    for (const vehicle of lane.vehicles) {
                        const x = left + (this.waitingVehicleX(lane, vehicle, clock) + .5) * tile, vw = vehicle.w * tile, truck = vehicle.w > 1.5;
                        ctx.fillStyle = '#2d343a'; ctx.fillRect(x - vw * .34, y + laneHeight * .69, vw * .17, tile * .12); ctx.fillRect(x + vw * .17, y + laneHeight * .69, vw * .17, tile * .12);
                        block(x - vw / 2, y + laneHeight * .27, vw, laneHeight * .5, tile * .12, vehicle.color, '#404851', '#333b44');
                        if (truck) block(x - vw * .43, y + laneHeight * .28, vw * .6, laneHeight * .44, tile * .24, '#ecded0', '#b5a596', '#948777');
                        else block(x - vw * .26, y + laneHeight * .32, vw * .52, laneHeight * .34, tile * .23, vehicle.color, '#394b5e', '#2a3746');
                        ctx.fillStyle = '#bfe8ed'; ctx.fillRect(x + (lane.speed > 0 ? vw * .18 : -vw * .36), y + laneHeight * .24 - tile * .13, vw * .18, laneHeight * .28);
                        ctx.fillStyle = '#fff0ac'; ctx.fillRect(x + (lane.speed > 0 ? vw / 2 - 4 : -vw / 2), y + laneHeight * .31, 4, laneHeight * .1);
                    }
                } else if (lane.type === 'river') {
                    ctx.fillStyle = 'rgba(191,238,255,.45)';
                    for (let col = 0; col < 9; col++) ctx.fillRect(left + this.waitingWrap(col * tile + clock * lane.speed * 12, tile * 9), y + laneHeight * (.23 + col % 3 * .21), tile * .28, 2);
                    for (const platform of lane.platforms) {
                        const x = left + (this.waitingPlatformX(lane, platform, clock) + .5) * tile, pw = platform.w * tile;
                        if (platform.kind === 'pad') {
                            block(x - pw / 2, y + laneHeight * .21, pw, laneHeight * .61, 3, '#82c954', '#579944', '#407835');
                            ctx.fillStyle = '#3c9bd4'; ctx.beginPath(); ctx.moveTo(x, y + laneHeight * .5); ctx.lineTo(x + pw / 2, y + laneHeight * .5); ctx.lineTo(x + pw / 2, y + laneHeight * .25); ctx.fill();
                            ctx.fillStyle = '#f6b9d1'; ctx.fillRect(x - 5, y + laneHeight * .34, 10, 6);
                        } else {
                            block(x - pw / 2, y + laneHeight * .25, pw, laneHeight * .5, tile * .06, '#ae7b45', '#7a502e', '#634028');
                            ctx.fillStyle = '#815630';
                            for (let xx = x - pw / 2 + 10; xx < x + pw / 2; xx += tile * .7) ctx.fillRect(xx, y + laneHeight * .29 - tile * .06, 2, laneHeight * .34);
                            ctx.fillStyle = '#d6a46c'; ctx.fillRect(x - pw / 2 + 4, y + laneHeight * .3 - tile * .06, pw - 8, 3);
                        }
                    }
                } else {
                    ctx.fillStyle = '#786047'; for (let xx = left; xx < left + tile * 9; xx += tile * .32) ctx.fillRect(xx, y + laneHeight * .18, tile * .14, laneHeight * .64);
                    ctx.fillStyle = '#454b53'; ctx.fillRect(left, y + laneHeight * .23, tile * 9, 5); ctx.fillRect(left, y + laneHeight * .7, tile * 9, 5);
                    ctx.fillStyle = '#e3e6e6'; ctx.fillRect(left, y + laneHeight * .23, tile * 9, 2); ctx.fillRect(left, y + laneHeight * .7, tile * 9, 2);
                    const phase = this.waitingWrap(clock + lane.phase, 9), warning = phase >= 4.6 && phase < 7.65;
                    const signalX = left + tile * .65;
                    block(signalX - 3, y + laneHeight * .3, 6, laneHeight * .45, tile * .25, '#58616a', '#343e48', '#26323b');
                    block(signalX - 12, y + laneHeight * .3 - tile * .28, 24, 14, 4, '#303b42', '#25313a', '#1d272f');
                    ctx.fillStyle = warning && Math.floor(clock * 7) % 2 ? '#ff554d' : warning ? '#7e2927' : '#8fe07c'; ctx.fillRect(signalX - 7, y + laneHeight * .3 - tile * .28 - 1, 8, 8);
                    const train = this.waitingTrain(lane, clock);
                    if (train) {
                        const x = left + (train.x + .5) * tile;
                        for (let car = 0; car < 3; car++) {
                            const tx = x - train.w * tile / 2 + car * train.w * tile / 3;
                            block(tx + 2, y + laneHeight * .18, train.w * tile / 3 - 4, laneHeight * .66, tile * .22, car ? '#e5c45a' : '#ed7852', '#a14834', '#76392e');
                            ctx.fillStyle = '#c8eaf1'; for (let j = 0; j < 3; j++) ctx.fillRect(tx + tile * (.2 + j * .45), y + laneHeight * .29 - tile * .22, tile * .3, laneHeight * .3);
                        }
                    }
                }
            }
            for (let row = start; row < start + rows; row++) {
                const coin = runner.lanes.get(row)?.coin;
                if (!coin || coin.taken) continue;
                const cx = left + (coin.col + .5) * tile, cy = screenY(row) + laneHeight * .48 - Math.sin(clock * 4 + row) * tile * .05;
                const spin = Math.abs(Math.cos(clock * 3 + row));
                ctx.fillStyle = 'rgba(34,49,38,.22)'; ctx.beginPath(); ctx.ellipse(cx, screenY(row) + laneHeight * .66, tile * .13, tile * .05, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#b7791f'; ctx.beginPath(); ctx.ellipse(cx + 2, cy, tile * .15 * spin + 2, tile * .15, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.ellipse(cx, cy, tile * .15 * spin + 1, tile * .15, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff7c2'; ctx.fillRect(cx - 1, cy - tile * .08, 2, tile * .16);
            }
            for (const effect of runner.fx || []) {
                const fx = left + (effect.x + .5) * tile, fy = screenY(effect.row) + laneHeight * .65, k = effect.age / .7;
                if (effect.kind === 'dust') {
                    ctx.fillStyle = `rgba(245,240,220,${.55 * (1 - k)})`;
                    for (let i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.arc(fx + i * tile * (.18 + k * .25), fy - k * 4, tile * (.06 + k * .05), 0, Math.PI * 2); ctx.fill(); }
                } else if (effect.kind === 'log-land') {
                    ctx.globalAlpha = 1 - k;
                    ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = Math.max(2, tile * .045);
                    ctx.beginPath(); ctx.ellipse(fx, fy, tile * (.22 + k * .45), tile * (.1 + k * .2), 0, 0, Math.PI * 2); ctx.stroke();
                    ctx.globalAlpha = 1;
                } else {
                    ctx.globalAlpha = 1 - k; ctx.fillStyle = '#fde047'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center';
                    ctx.fillText('+1', fx, fy - tile * (.8 + k * .5)); ctx.globalAlpha = 1;
                }
            }
            const hop = runner.hop, progress = hop?.t || 0, arc = hop ? Math.sin(progress * Math.PI) : 0;
            const px = left + (runner.x + .5) * tile, groundY = screenY(runner.rowFloat ?? runner.row) + laneHeight * .65;
            const death = runner.dead ? Math.min(1, (runner.deathAge || 0) / .55) : 0, splash = runner.dead && /Splash|Carried/.test(runner.deathReason || '');
            ctx.fillStyle = 'rgba(34,49,38,.25)'; ctx.fillRect(px - tile * .21, groundY + 2, tile * .5, tile * .1);
            ctx.save(); ctx.translate(px, groundY - arc * tile * .28);
            const stretch = hop ? 1 + arc * .12 - Math.sin(Math.min(1, progress * 4) * Math.PI) * .12 : 1;
            ctx.scale((2 - stretch) * (1 + death * .35), stretch * (1 - death * .72));
            ctx.globalAlpha = splash ? 1 - death : 1;
            const profile = this.multiplayerProfile || {}, cos = this.profileCosmetics(profile), util = window.StudBudArcade?.util;
            if (util?.drawFigureSide) util.drawFigureSide(ctx, { color: profile.color || '#38bdf8', cos }, -tile * .23, -tile * .72, tile * .46, tile * .72, hop?.dx < 0 ? -1 : 1, clock, Boolean(hop), 1);
            else this.drawCharacter(ctx, 0, -tile * .4, '#38bdf8', .8, clock, Boolean(hop));
            ctx.restore();
            if (splash) {
                ctx.strokeStyle = 'rgba(222,248,255,' + (1 - death) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, groundY, tile * (.2 + death * .6), tile * (.08 + death * .2), 0, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = '#d5f3ff'; for (let i = 0; i < 6; i++) ctx.fillRect(px + Math.cos(i) * death * tile * .6, groundY - Math.sin(death * Math.PI) * tile * .5 + Math.sin(i) * death * tile * .2, 4, 4);
            }
            ctx.fillStyle = 'rgba(29,48,40,.74)'; ctx.fillRect(0, 0, width, 31);
            ctx.fillStyle = '#f5ffe7'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'right'; ctx.fillText('ROWS ' + runner.score + ' / BEST ' + runner.best, width - 14, 21);
            ctx.textAlign = 'left'; ctx.fillStyle = '#fde047'; ctx.fillText('● ' + (runner.coins || 0), 14, 21);
            if (!runner.dead && runner.pressure > 1.1) {
                ctx.textAlign = 'center'; ctx.fillStyle = '#fb923c'; ctx.font = '900 11px system-ui';
                ctx.fillText('KEEP MOVING - THE TRAIL IS CATCHING UP', width / 2, 40);
            }
            const touch = window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0;
            const prompt = runner.dead ? (death < 1 ? (splash ? 'Splash!' : 'Ouch!') : runner.deathReason + (touch ? ' - tap to restart' : ' - press a key to restart')) : (touch ? 'TAP FORWARD · SWIPE TO CHANGE LANES' : 'WASD / ARROWS TO MOVE · SPACE TO HOP');
            ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; const pw = Math.min(width - 16, ctx.measureText(prompt).width + 20);
            ctx.fillStyle = 'rgba(29,48,40,.78)'; ctx.fillRect(width / 2 - pw / 2, height - 28, pw, 22);
            ctx.fillStyle = '#f4ffe8'; ctx.fillText(prompt, width / 2, height - 13, width - 30);
        }

        findCommunityDeck(deckId) {
            return (AppState.get('flashcards') || []).find(deck =>
                deck.communitySourceId === deckId || deck.communityDeckId === deckId
            );
        }

        communityDeckActionMarkup(deckId) {
            const id = this.escapeHTML(deckId);
            const deck = this.findCommunityDeck(deckId);
            return deck
                ? `<button class="secondary-btn community-deck-added" type="button" data-action="open-study-set" data-id="${this.escapeHTML(deck.id)}" data-community-deck-id="${id}"><i class="fas fa-check-circle" aria-hidden="true"></i> In your decks · Open</button>`
                : `<button class="secondary-btn" type="button" data-action="import-community-deck" data-id="${id}" data-community-deck-id="${id}"><i class="fas fa-download" aria-hidden="true"></i> Add to my decks</button>`;
        }

        refreshCommunityDeckActions() {
            document.querySelectorAll('[data-community-deck-id]').forEach(element => {
                const markup = this.communityDeckActionMarkup(element.dataset.communityDeckId);
                if (element.outerHTML !== markup) element.outerHTML = markup;
            });
            document.querySelectorAll('.review-study-set[data-review-public-id]').forEach(element => {
                if (!element.dataset.reviewPublicId) return;
                const markup = this.studySetMarkup({ publicId: element.dataset.reviewPublicId, title: element.dataset.reviewTitle });
                if (element.outerHTML !== markup) element.outerHTML = markup;
            });
        }

        async searchCommunityDecks(query) {
            const status = document.getElementById('community-deck-status');
            const results = document.getElementById('community-deck-results');
            if (!status || !results) return;
            if ((window.StudBudCloud?.offlineMode && !window.StudBudCloud?.isGuest?.()) || window.navigator?.onLine === false) {
                status.textContent = 'The community library needs an internet connection. Your saved sets remain available offline.';
                results.innerHTML = '<p class="empty-state">Open My sets to study, edit or practice offline.</p>';
                return;
            }
            status.textContent = 'Searching shared decks…';
            try {
                const decks = await window.StudBudCommunityGames.searchDecks(query);
                results.dataset.loaded = 'true';
                results.innerHTML = decks.length ? decks.map(deck => `
                    <article class="community-deck-card">
                        <div><strong>${this.escapeHTML(deck.title)}</strong>${deck.course ? ` <span class="deck-chip"><i class="fas fa-book"></i> ${this.escapeHTML(deck.course)}</span>` : ''}<p>${this.escapeHTML(deck.description || 'A student-shared study set.')}</p>
                            <small>${Number(deck.card_count)} cards · studied by ${Number(deck.study_count)} ${Number(deck.study_count) === 1 ? 'student' : 'students'}</small>
                            <small class="deck-author">by <button type="button" class="link-btn" data-action="view-profile" data-id="${this.escapeHTML(deck.owner_id)}">${this.escapeHTML(deck.author_name || 'Student')}</button> ${this.accountTagMarkup(deck.author_name)}</small></div>
                        <div class="community-deck-actions">${this.communityDeckActionMarkup(deck.id)}${this.reportButtonMarkup('deck', deck.id, deck.title)}</div>
                    </article>`).join('') : '<p class="empty-state">No shared decks found. Try another search, or share one of your own after studying it.</p>';
                status.textContent = `${decks.length} community deck${decks.length === 1 ? '' : 's'} found.`;
            } catch (error) {
                console.error('[NexusApp] Community deck search failed:', error);
                results.dataset.loaded = '';
                status.textContent = `The community library could not load. ${this.friendlyErrorMessage(error, 'Please check your connection and try again.')}`;
            }
        }

        async publishCommunityDeck(deckId) {
            const deck = (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!deck) throw new Error('That deck could not be found.');
            let published;
            try {
                published = await window.StudBudCommunityGames.publishDeck({ ...deck, courseTitle: this.deckLinkInfo(deck).course?.title || '' });
            } catch (error) {
                const message = String(error?.message || error);
                if (/already shared|same title|identical|duplicate|already exists|reposted|reposting/i.test(message)) { window.StudBudDialogs.notify(message); return; }
                throw error;
            }
            await this.updateSavedDeck(deckId, { communityPublished: true, communityDeckId: published.id });
            window.StudBudDialogs.notify('Deck shared. Its title, class, card terms and definitions, and any source attribution are visible in the public community library, including to guests. Your linked test or quiz stays private. You can stop sharing it at any time.');
        }

        async unpublishCommunityDeck(deckId) {
            const deck = (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!deck) throw new Error('This deck is no longer available.');
            await window.StudBudCommunityGames.unpublishDeck(deckId);
            await this.updateSavedDeck(deckId, { communityPublished: false, communityDeckId: null });
        }

        async importCommunityDeck(deckId) {
            const local = this.findCommunityDeck(deckId);
            if (local) {
                document.getElementById('community-deck-status').textContent = `“${local.title}” is already in your decks.`;
                this.refreshCommunityDeckActions();
                return;
            }
            const shared = await window.StudBudCommunityGames.importDeck(deckId);
            const existingDeck = this.findCommunityDeck(shared.id);
            if (existingDeck) {
                document.getElementById('community-deck-status').textContent = `“${shared.title}” is already in your decks.`;
                this.refreshCommunityDeckActions();
                return;
            }
            const localDeck = {
                id: `community_${window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
                title: shared.title,
                cards: shared.cards.map(card => ({
                    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    front: String(card.front || ''),
                    back: String(card.back || ''),
                    distractors: Array.isArray(card.distractors) ? card.distractors.map(text => String(text).slice(0, 5000)).slice(0, 3) : [],
                    repetitions: 0,
                    interval: 0,
                    easeFactor: 2.5
                })),
                communitySourceId: shared.id,
                communitySourceOwnerId: shared.owner_id,
                communitySourceTitle: shared.title,
                communitySourceAuthor: shared.author_name || 'Student',
                // Match the shared class to one of the user's own classes when possible.
                courseCode: shared.course ? ((AppState.get('courses') || []).find(course =>
                    [course.title, course.code].some(name => String(name || '').trim().toLowerCase() === String(shared.course).trim().toLowerCase()))?.code || '') : '',
                courseTitle: shared.course || '',
                studiedCount: 0
            };
            await AppState.saveFlashcardDeck(localDeck);
            this.refreshCommunityDeckActions();
            document.getElementById('community-deck-status').textContent = `Added “${shared.title}” to your private decks.`;
        }

        createRoomCode() {
            const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            const values = new Uint8Array(6);
            if (window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
            else values.forEach((_, index) => { values[index] = Math.floor(Math.random() * alphabet.length); });
            return Array.from(values, value => alphabet[value % alphabet.length]).join('');
        }

        async hostGame(form) {
            const nickname = this.gameNickname(form.elements.nickname.value);
            const deck = (AppState.get('flashcards') || []).find(item => item.id === form.elements.deckId.value);
            if (!deck) throw new Error('Add a flashcard set before hosting a game.');
            const cards = (deck.cards || []).filter(card => String(card.front || '').trim() && String(card.back || '').trim());
            if (cards.length < 1) throw new Error('Hosted games need a set with at least one complete card.');
            if (cards.some(card => String(card.front).trim().length > 1000 || String(card.back).trim().length > 1000)) {
                throw new Error('Hosted game terms and definitions must be 1000 characters or fewer.');
            }
            const options = {
                goal_type: form.elements.mode.value === 'chess' ? 'points' : 'time',
                point_limit: 1000,
                time_limit_seconds: ['chess', 'defense'].includes(form.elements.mode.value) ? 0 : Math.min(60, Math.max(1, Number(form.elements.timeLimit.value) || 5)) * 60,
                question_reward: form.elements.mode.value === 'chess' ? 1 : this.questionRewardValue(form.elements.questionReward.value),
                allow_late_join: form.elements.mode.value !== 'chess' && Boolean(form.elements.allowLateJoin?.checked)
            };
            let room;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    room = await window.StudBudCommunityGames.createRoom(
                        this.createRoomCode(), nickname, { ...deck, cards }, form.elements.mode.value, options
                    );
                    break;
                } catch (error) {
                    if (error.code !== '23505' && !/duplicate key|unique constraint/i.test(error.message)) throw error;
                    if (attempt === 2) throw new Error('Could not reserve a room code. Please try creating the room again.');
                }
            }
            this.openHostedGame(room);
            if (options.allow_late_join && !room.state?.allow_late_join) {
                window.StudBudDialogs.notify('This server did not save Allow late joining. Late joining is still off. The site administrator must apply the updated supabase-setup.sql before this option can work.');
            }
        }

        async hostStaffTest(mode, seed, { limitedTestEnergy = false, questionReward = 100 } = {}) {
            const cloud = window.StudBudCloud;
            if (!this.canTestGames || !cloud?.user || cloud.user.is_anonymous || cloud.offlineMode) throw new Error('Game testing requires a connected tester or administrator account.');
            if (this.hostedGameRoom) throw new Error('Leave your current room before hosting a test.');
            const deck = (AppState.get('flashcards') || []).find(item => item.cards?.some(card => card.front && card.back))
                || { title: 'Staff test cards', cards: [{ front: 'Staff test question', back: 'Test answer' }] };
            let room;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    room = await window.StudBudCommunityGames.createRoom(this.createRoomCode(), this.gameNickname(), deck, mode,
                        { staff_test: true, limited_test_energy: limitedTestEnergy, seed, time_limit_seconds: 3600, question_reward: mode === 'chess' ? 1 : questionReward });
                    break;
                } catch (error) {
                    if (attempt === 2 || (error.code !== '23505' && !/duplicate key|unique constraint/i.test(error.message))) throw error;
                }
            }
            Router.navigate('multiplayer');
            this.openHostedGame(room);
        }

        async joinGame(form) {
            const nickname = this.gameNickname(form.elements.nickname.value);
            const roomCode = form.elements.roomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const room = await window.StudBudCommunityGames.joinRoom(roomCode, nickname);
            this.openHostedGame(room);
        }

        gameUser() {
            return window.StudBudCloud.user || window.StudBudCloud.guestUser;
        }

        async copyHostedRoomCode() {
            const code = document.getElementById('hosted-room-code')?.textContent.trim();
            if (!code) return;
            try {
                if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
                await navigator.clipboard.writeText(code);
                document.getElementById('hosted-room-status').textContent = `Room code ${code} copied. Share it with your players.`;
            } catch (error) {
                console.error('[NexusApp] Room code could not be copied:', error);
                await window.StudBudDialogs.prompt('Copy this room code and share it with your players:', code);
            }
        }

        openHostedGame(room) {
            this.hostedGameRoom = room;
            this.arcadeLeft = false;
            this.hostedGamePollError = '';
            document.getElementById('hosted-game-room').classList.remove('hidden');
            document.getElementById('hosted-game-message').textContent = '';
            if (this.hostedGameInterval) clearInterval(this.hostedGameInterval);
            this.hostedGameInterval = setInterval(() => this.pollHostedGame(), 1200);
            if (!this.hostedVisibilityBound) {
                this.hostedVisibilityBound = true;
                document.addEventListener('visibilitychange', () => { if (!document.hidden && this.hostedGameRoom) this.refreshHostedGame(); });
            }
            this.hostedGameUnsubscribe?.();
            this.hostedGameUnsubscribe = null;
            try {
                this.hostedGameUnsubscribe = window.StudBudCommunityGames.watchRoom?.(room.room_code, () => this.refreshHostedGame());
            } catch (error) {
                console.warn('[Lobby] Realtime unavailable; polling remains active.', error);
            }
            this.renderHostedGameRoom(room);
        }

        // The host keeps its server heartbeat alive even while its tab is hidden.
        pollHostedGame() {
            if (!this.hostedGameRoom) return;
            if (document.hidden && this.hostedGameRoom.host_id !== this.gameUser().id) return;
            const session = this.arcadeSession, live = session && !session.destroyed && !session.over;
            if (live && Date.now() - (this.hostedLastFetch || 0) < 3600) return;
            this.refreshHostedGame();
        }

        async refreshHostedGame() {
            if (!this.hostedGameRoom) return;
            if (this.hostedGameBusy) { this.hostedRefreshQueued = true; return; }
            const code = this.hostedGameRoom.room_code;
            this.hostedGameBusy = true; this.hostedRefreshQueued = false;
            this.hostedLastFetch = Date.now();
            try {
                const room = await window.StudBudCommunityGames.getRoom(code);
                if (this.hostedGameRoom?.room_code !== code) return;
                this.hostedGamePollError = '';
                this.hostedGameRoom = room;
                this.renderHostedGameRoom(room);
            } catch (error) {
                if (this.hostedGameRoom?.room_code !== code) return;
                console.error('[NexusApp] Hosted game refresh failed:', error);
                if (error.message.includes('not in this game')) {
                    if (this.hostedGameInterval) clearInterval(this.hostedGameInterval);
                    this.hostedGameInterval = null;
                    this.hostedGameRoom = null;
                    this.hostedGameUnsubscribe?.();
                    this.hostedGameUnsubscribe = null;
                    document.getElementById('hosted-game-room').classList.add('hidden');
                    document.getElementById('hosted-game-message').textContent = 'You left the room or were removed by the host.';
                    this.hostedGamePollError = error.message;
                    if (!window.StudBudCloud.user) window.StudBudCloud.closeGuestLobby();
                    return;
                }
                const message = `Connection problem. ${this.friendlyErrorMessage(error, 'The game could not refresh. Please try again shortly.')}`;
                if (this.hostedGamePollError !== message) {
                    document.getElementById('hosted-room-status').textContent = message;
                    this.hostedGamePollError = message;
                }
            } finally {
                this.hostedGameBusy = false;
                if (this.hostedRefreshQueued && this.hostedGameRoom?.room_code === code) { this.hostedRefreshQueued = false; setTimeout(() => this.refreshHostedGame(), 150); }
            }
        }

        renderHostedGameRoom(room) {
            const panel = document.getElementById('hosted-game-room');
            if (!panel || !room) return;
            const isHost = room.host_id === this.gameUser().id;
            const state = room.state || {};
            const players = Array.isArray(state.players) ? state.players : [];
            const me = players.find(player => player.id === this.gameUser().id);
            const modeNames = {
                defense: 'Team Tower Defense',
                classic: 'Classic', rush: 'Rush', survival: 'Survival',
                skyline: 'Escape to Space', river: 'River Fishing', market: 'Package Delivery',
                miner: 'Crystal Mining', duel: 'King of the Hill',
                crypto: 'Crypto Trading', shooter: 'Arena Shooter', sports: 'Soccer', chess: 'Question Chess' };
            document.getElementById('hosted-room-title').textContent = `${room.deck_title} · ${modeNames[room.mode] || room.mode}`;
            const playerLimit = room.mode === 'chess' ? 2 : room.mode === 'duel' ? 8 : 16;
            const remainingSeconds = room.goal_type === 'time' && room.started_at
                ? Math.max(0, Math.ceil((new Date(room.started_at).getTime() + Number(room.time_limit_seconds) * 1000 - Date.now()) / 1000))
                : null;
            const goalLabel = room.mode === 'defense' ? 'Red vs blue · first base to 0 HP loses · no time limit' : room.mode === 'chess' ? 'Checkmate · one move per answer · no time limit' : room.goal_type === 'time'
                ? remainingSeconds === null
                    ? `${Math.round(Number(room.time_limit_seconds) / 60)} minute limit`
                    : `Time left · ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`
                : room.mode === 'skyline' ? '36-section rooftop route'
                    : room.mode === 'sports' ? `${room.point_limit} goal${Number(room.point_limit) === 1 ? '' : 's'}`
                    : room.mode === 'shooter' ? `${room.point_limit} combat points`
                        : `${Number(room.point_limit).toLocaleString()} point goal`;
            const joinLabel = room.mode !== 'chess' && state.allow_late_join ? 'Late joining allowed' : 'Joining locks at start';
            document.getElementById('hosted-room-meta').textContent = `${goalLabel} · ${players.length} / ${playerLimit} players · ${joinLabel}`;
            document.getElementById('hosted-room-code').textContent = room.room_code;
            const rankedPlayers = players.map(player => room.mode === 'defense'
                ? { ...player, score: Math.min(100, Math.max(0, Math.floor(Number(state.defense?.damage?.[state.defense?.teams?.[player.id]] ?? player.score) || 0))) }
                : player).sort((a, b) => {
                    if (room.mode === 'defense' && [0, 1].includes(state.defense?.winner)) {
                        const winner = player => Number(state.defense.teams?.[player.id] === state.defense.winner);
                        const order = winner(b) - winner(a);
                        if (order) return order;
                    }
                    return Number(b.score || 0) - Number(a.score || 0);
                });
            const lobbyColors = window.StudBudArcade?.util?.defaultPlayerColors?.(players) || new Map();
            const avatarFor = player => this.multiplayerAvatarMarkup({ ...this.profileCosmetics(player), ...(lobbyColors.get(player.id) ? { color: lobbyColors.get(player.id) } : {}) });
            document.getElementById('hosted-leaderboard-count').textContent = `${players.length} player${players.length === 1 ? '' : 's'}`;
            document.getElementById('hosted-leaderboard-title').textContent = room.status === 'waiting' ? 'Lobby' : 'Leaderboard';
            document.getElementById('hosted-room-players').innerHTML = rankedPlayers
                .map((player, index) => {
                    const isSelf = player.id === this.gameUser().id;
                    const kick = isHost && player.id !== room.host_id && room.status !== 'finished' ? `<button class="host-kick-btn" type="button" data-action="hosted-kick-player" data-id="${this.escapeHTML(player.id)}" aria-label="Remove ${this.escapeHTML(player.nickname)}">Remove</button>` : '';
                    if (room.status === 'waiting') {
                        return `<li class="leaderboard-player lobby-player${isSelf ? ' is-self' : ''}">${avatarFor(player)}<span class="leaderboard-name">${this.escapeHTML(player.nickname)} ${this.accountTagMarkup(player.username, player.tags)}${isSelf ? ' · you' : ''}</span><span class="lobby-tag${player.id === room.host_id ? ' is-host' : ''}">${player.id === room.host_id ? '<i class="fas fa-crown"></i> Host' : 'Ready'}</span>${kick}</li>`;
                    }
                    const progress = room.mode === 'defense' ? `${state.defense?.teams?.[player.id] ? 'Red' : 'Blue'} team · Wave ${Number(state.defense?.waveNumber || 0)} · Base ${Number(state.defense?.health?.[state.defense?.teams?.[player.id]] ?? 100)} HP`
                        : room.mode === 'sports' ? `${Number(player.touchdowns || 0)} goals`
                        : room.mode === 'shooter' ? `${Number(player.targets || 0)} targets · wave ${Number(player.wave || 1)}`
                            : room.mode === 'skyline' ? `${Number(player.distance || 0)} / 36 nodes · checkpoint ${Number(player.checkpoint || 0)}`
                                : room.mode === 'river' ? `${Number(player.loot || 0)} haul · ${player.last_action === 'deep_cast' ? 'deep cast' : 'shore'}`
                                    : room.mode === 'market' ? `${Number(player.deliveries || 0)} deliveries · ${Number(player.streak || 0)} streak`
                                        : room.mode === 'miner' ? `${Number(player.depth || 0)} depth · ${Number(player.loot || 0)} ore`
                                            : room.mode === 'crypto' ? `${Number(player.loot || 0)} chips · ${player.last_action || 'ready'}`
                                                : room.mode === 'duel' ? `${Number(player.score || 0)} pts`
                                                    : `${Number(player.score || 0)} points · ${Number(player.streak || 0)} streak`;
                    const unit = { defense: 'base damage', sports: 'goals', shooter: 'kill pts', skyline: 'm', river: 'fish pts', market: 'cash', miner: 'crystals', duel: 'sec on hill' }[room.mode];
                    const valueLabel = room.mode === 'crypto' || room.mode === 'market' ? `$${Number(player.score || 0).toLocaleString()}` : `${Number(player.score || 0).toLocaleString()} ${unit || 'score'}`;
                    const profileBtn = `<button class="host-kick-btn" type="button" data-action="view-profile" data-id="${this.escapeHTML(player.id)}">Profile</button>`;
                    return `<li class="leaderboard-player${isSelf ? ' is-self' : ''}">${avatarFor(player)}<span class="leaderboard-name">${index + 1}. ${this.escapeHTML(player.nickname)} ${this.accountTagMarkup(player.username, player.tags)}${isSelf ? ' · you' : ''}</span><span class="leaderboard-stat"><strong>${this.escapeHTML(valueLabel)}</strong><small>${this.escapeHTML(progress)}</small></span>${profileBtn}${kick}</li>`;
                }).join('');
            const sceneNames = {
                defense: 'Team Tower Defense',
                skyline: 'Escape to Space', river: 'River Fishing', market: 'Package Delivery',
                miner: 'Crystal Mining', duel: 'King of the Hill',
                crypto: 'Crypto Trading', shooter: 'Arena Shooter', sports: 'Soccer', chess: 'Question Chess',
                classic: 'Flashcard Face-off', rush: 'Rapid Recall', survival: 'Last Learner Standing'
            };
            document.getElementById('multiplayer-scene-name').textContent = sceneNames[room.mode] || 'Live match';
            document.getElementById('multiplayer-scene-goal').textContent =
                room.status === 'playing' ? goalLabel : room.status === 'waiting' ? `${players.length} players in lobby` : 'Match complete';
            const feed = document.getElementById('multiplayer-scene-feed');
            const lobbyInfo = document.getElementById('lobby-info');
            const inLobby = room.status === 'waiting';
            lobbyInfo.classList.toggle('hidden', !inLobby);
            document.getElementById('multiplayer-arena').classList.toggle('hidden', inLobby);
            if (inLobby) {
                const info = {
                    defense: ['Red vs blue: only correct answers earn new team cash; kills pay nothing. Build and upgrade towers. Each enemy purchase permanently adds +1 of that type per wave against rivals, starting next wave. Waves get stronger until a base falls.', 'WASD walk · Click build/select · Buy recurring enemies · Q/E earn cash'],
                    skyline: ['Climb rooftops, machinery and low-gravity Space. At narrow wall shafts, hold toward a wall and press Space, then steer toward the opposite wall and jump again. Blue arrows mark jump-through platforms. Falls can land on lower routes; R returns to your saved checkpoint.', 'A/D run · Space jump (twice) / wall jump · Shift dash · R checkpoint'],
                    river: ['Catch fish and surf waves for points. Hold left against a wave for a moment to paddle through, or shelter in pale shallows. Nearby rivals start an 8-second flashcard duel: the first correct answer steals fish points. Whirlpools spin and launch your boat.', 'WASD steer · click cast · Q recharge · answer rival duels quickly'],
                    market: ['Deliver packages across town and dodge cars.', 'WASD move · Shift sprint · Q recharge'],
                    miner: ['Dig through the cavern, haul ore back to base and avoid lava.', 'WASD move · hold click dig · Q recharge'],
                    duel: ['Hold the glowing hill alone to score. Charge Thunder Hammer by holding the hill or landing attacks.', 'A/D move · Space jump · S guard · E/click swing · R charged Special (12s cooldown) · Shift dodge · Q recharge'],
                    crypto: ['Trade six assets, react to market news and build mining rigs.', '1-6 pick · B buy · S sell'],
                    shooter: ['Eliminate other players to score. Solo runs without opponents use drones. Follow the edge arrows or minimap to find opponents.', 'WASD move · mouse aim · F/click fire · Space/E blast · Shift dash · Q reload'],
                    chess: ['Answer correctly to earn one move. Either player can move when ready; while in check, only the checked player moves.', 'Q / Answer for a move · Tap or drag a piece to a highlighted square']
                }[room.mode] || ['Answer flashcard questions faster than everyone else.', 'Answer correctly to score points.'];
                const { resource, multiplier } = this.questionRewardInfo(room.mode);
                lobbyInfo.innerHTML = `<div class="lobby-mode"><strong>${this.escapeHTML(modeNames[room.mode] || 'Live game')}</strong><span>${this.escapeHTML(goalLabel)} · ${room.mode === 'chess' ? '1 move per correct answer' : `+${(Number(room.state?.question_reward) || 20) * multiplier} ${resource.toLowerCase()} per correct answer`}</span></div>
                    <p>${this.escapeHTML(info[0])}</p>
                    <p class="lobby-controls"><i class="fas fa-keyboard"></i> ${this.escapeHTML(info[1])}</p>
                    <p class="lobby-controls"><i class="fas fa-circle-question"></i> Answering questions powers you up. Press Q in game to open one.</p>`;
            }
            const latest = rankedPlayers.filter(player => player.last_correct !== undefined)
                .sort((a, b) => Number(b.answered_count || 0) - Number(a.answered_count || 0))[0];
            feed.textContent = latest
                ? `${latest.nickname}: ${latest.last_event || (latest.last_correct ? 'Nice answer!' : 'Missed answer')}`
                : isHost ? 'Host controls are ready. Start the match or manage the player list.' : 'Waiting for the host to start.';
            feed.classList.toggle('feed-correct', Boolean(latest?.last_correct));
            feed.classList.toggle('feed-miss', Boolean(latest && !latest.last_correct));
            const startButton = document.getElementById('hosted-start-btn');
            const finishButton = document.getElementById('hosted-finish-btn');
            startButton.classList.toggle('hidden', !isHost || room.status !== 'waiting');
            startButton.disabled = players.length < 2;
            startButton.textContent = room.mode === 'duel' ? 'Start the hill brawl' : 'Start the game';
            finishButton.classList.toggle('hidden', !isHost || room.status === 'finished');
            const waitingCard = document.getElementById('waiting-arcade-card');
            const guestWaiting = room.status === 'waiting';
            const hasWorkspace = Boolean(window.StudBudCloud.user || window.StudBudCloud.isGuest?.());
            waitingCard.classList.toggle('hidden', !guestWaiting || !hasWorkspace);
            if (guestWaiting && hasWorkspace && !this.waitingRunner.started) this.startWaitingRunner();
            if (!guestWaiting) this.stopWaitingRunner();
            try { this.syncArcadeSession(room, isHost); }
            catch (error) { console.error('[NexusApp] Arcade session could not sync:', error); }
            document.getElementById('multiplayer-host-flow').classList.add('hidden');
            document.getElementById('multiplayer-join-flow').classList.add('hidden');
            document.querySelector('.multiplayer-tabs').classList.add('hidden');
            panel.classList.toggle('host-view', isHost);
            panel.classList.toggle('guest-view', !isHost);

            if (room.status === 'waiting') {
                document.getElementById('hosted-room-status').textContent = isHost
                    ? (players.length < 2 ? `Share the room code. ${room.mode === 'duel' ? 'Your rival' : 'At least one other player'} must join before the race starts.` : 'Host controls are ready. Kick a player or start when the lobby is set.')
                    : 'Waiting for the host to start the game.';
            } else if (room.status === 'finished') {
                document.getElementById('hosted-room-status').textContent = state.staff_test ? 'Staff test complete · no coins or progress awarded.' : this.gameUser().is_anonymous
                    ? 'Game over · final scores are below. Guests do not earn account coins.'
                    : 'Game over · final scores and multiplayer coin rewards are shown below.';
                const rewards = state.coin_rewards || {};
                document.getElementById('hosted-podium').classList.remove('hidden');
                const podiumUnit = { defense: 'base damage', sports: 'goals', shooter: 'kill pts', skyline: 'm', river: 'fish pts', market: '', miner: 'crystals', duel: 'sec on hill', crypto: '', chess: 'chess pts' }[room.mode] ?? 'points';
                document.getElementById('hosted-podium').innerHTML = rankedPlayers.slice(0, 3).map((player, index) =>
                    `<div class="podium-place place-${index + 1}"><span class="podium-rank">0${index + 1}</span><strong>${avatarFor(player)} ${this.escapeHTML(player.nickname)} ${this.accountTagMarkup(player.username, player.tags)}</strong><small>${room.mode === 'crypto' || room.mode === 'market' ? '$' : ''}${Number(player.score || 0).toLocaleString()} ${podiumUnit} · +${Number(rewards[player.id] || 0)} coins <button class="host-kick-btn" type="button" data-action="view-profile" data-id="${this.escapeHTML(player.id)}">Profile</button></small></div>`
                ).join('');
            } else {
                document.getElementById('hosted-podium').classList.add('hidden');
                document.getElementById('hosted-room-status').textContent = me?.eliminated
                    ? 'You are out of this round. Watch the scores until the game ends.'
                    : 'The match is live in full screen. If you left it, rejoin by reopening the room.';
            }

            if (room.status !== 'finished') document.getElementById('hosted-podium').classList.add('hidden');
            if (window.StudBudCloud.user && this.multiplayerProfile && room.status === 'finished') this.renderMultiplayerProfile(true);
            if (room.status === 'finished' && this.hostedGameInterval && (!this.arcadeSession || this.arcadeSession.rewards || this.arcadeSession.practice)) {
                clearInterval(this.hostedGameInterval);
                this.hostedGameInterval = null;
                this.hostedGameUnsubscribe?.();
                this.hostedGameUnsubscribe = null;
            }
        }

        syncArcadeSession(room, isHost) {
            const arcade = window.StudBudArcade;
            const api = window.StudBudCommunityGames;
            if (room.status === 'playing' && arcade && !this.arcadeLeft) {
                if (!this.arcadeSession || this.arcadeSession.destroyed) {
                    this.closePractice();
                    const deck = this.gameUser().is_anonymous ? null : this.roomStudyDeck(room);
                    this.arcadeSession = new arcade.Session({
                        room, user: this.gameUser(), api, isHost,
                        testing: Boolean(room.state?.staff_test), seed: room.state?.seed,
                        fallbackCards: (deck?.cards || []).filter(card => card.front && card.back),
                        studySet: { deckId: deck?.id, title: room.deck_title || deck?.title, publicId: room.state?.public_deck_id || deck?.communityDeckId || deck?.communitySourceId },
                        finishRoom: () => api.finishRoom(room.room_code),
                        onLeave: () => this.leaveHostedGame().catch(error => {
                            console.error('[NexusApp] Could not leave game:', error);
                            window.StudBudDialogs.notify(this.friendlyErrorMessage(error, 'Could not leave the game. Please try again.'));
                        })
                    });
                    document.body.classList.add('mpg-active');
                } else {
                    this.arcadeSession.updateRoom(room);
                }
            } else if (this.arcadeSession && room.status === 'finished') {
                this.arcadeSession.updateRoom(room);
            } else if (this.arcadeSession && room.status !== 'playing') {
                this.destroyArcadeSession();
            }
            if (room.status === 'waiting') this.arcadeLeft = false;
        }

        saveGameProgress(session) {
            if (session.testing || window.StudBudCloud?.guestLobbyOpen) return Promise.resolve();
            const save = async () => {
                const info = session.studySet || {};
                const deck = (AppState.get('flashcards') || []).find(item => item.id === info.deckId
                    || (info.publicId && [item.communityDeckId, item.communitySourceId].includes(info.publicId)));
                if (!deck) return;
                const through = session.questionHistory.length;
                const answers = session.questionHistory.slice(session.studyProgressSavedThrough || 0, through).filter(answer => typeof answer.correct === 'boolean');
                if (answers.length) {
                    const cards = deck.cards.map(card => {
                        const next = { ...card };
                        for (const answer of answers.filter(answer => answer.prompt === card.front && answer.answer === card.back)) {
                            window.FlashcardTools.recordAnswer(next, answer.correct);
                        }
                        return next;
                    });
                    await AppState.saveFlashcardDeck({ ...deck, cards });
                }
                session.studyProgressSavedThrough = through;
            };
            // Serialize answer saves and retry any unsaved history after a failed write.
            session.studyProgressSave = session.studyProgressSave ? session.studyProgressSave.then(save, save) : save();
            return session.studyProgressSave;
        }

        async saveGameSummary(session) {
            // Code-only guests have no local workspace; app guests keep summaries on this device.
            if (session.testing || window.StudBudCloud?.guestLobbyOpen) return;
            await this.saveGameProgress(session);
            await AppState.recordStudySession({
                id: `match_${window.crypto.randomUUID()}`, title: `${session.practice ? 'Practice game' : 'Study game'}: ${session.game.title}`,
                durationSec: Math.max(1, Math.round(session.t)), method: 'practice', source: session.practice ? 'solo' : 'multiplayer',
                gameSummary: {
                    mode: session.mode, score: session.score, answered: session.answered, correct: session.correct,
                    studySet: session.studySet,
                    objectiveBased: session.game.scoreGoal === false, objectiveUnit: session.game.goalUnit || 'pts',
                    questions: session.questionHistory.map(answer => ({ ...answer })),
                    standings: session.standingsCache.map(row => ({ id: row.id, name: row.n, score: row.s, goal: row.g }))
                }
            });
        }

        destroyArcadeSession() {
            if (this.arcadeSession) this.arcadeSession.destroy();
            this.arcadeSession = null;
            document.body.classList.remove('mpg-active');
        }

        closePractice() {
            if (this.practiceSession) this.practiceSession.destroy();
            this.practiceSession = null;
            if (!this.arcadeSession) document.body.classList.remove('mpg-active');
            this.pingPresence?.(true);
        }

        startMultiplayerPractice() {
            const mode = document.getElementById('practice-multiplayer-mode')?.value;
            const deckId = document.getElementById('practice-multiplayer-deck')?.value;
            const timeLimitSeconds = ['chess', 'defense'].includes(mode) ? 0 : Number(document.getElementById('practice-multiplayer-time')?.value);
            if (!mode || !deckId || !Number.isFinite(timeLimitSeconds) || timeLimitSeconds < 0) {
                throw new Error('Choose a game mode, flashcard set, and game time.');
            }
            this.startPractice(mode, { deckId, timeLimitSeconds });
        }

        startPractice(modeOverride, config = {}) {
            const arcade = window.StudBudArcade;
            if (this.practiceSession && (this.practiceSession.destroyed || !this.practiceSession.overlay?.isConnected)) {
                try { this.practiceSession.destroy(); } catch (_) { /* already gone */ }
                this.practiceSession = null;
            }
            const deckId = config.deckId || document.getElementById('host-game-deck')?.value;
            if (config.testing && (!this.canTestGames || window.StudBudCloud?.offlineMode)) throw new Error('Game testing is available to testers and administrators while connected.');
            const chosenMode = modeOverride || this.hostedGameRoom?.mode || this.selectedMultiplayerMode || 'skyline';
            const rewardInput = document.getElementById('solo-game-reward');
            const reward = chosenMode === 'chess' ? 1 : this.questionRewardValue(config.questionReward
                ?? (modeOverride ? undefined : this.hostedGameRoom?.state?.question_reward)
                ?? (rewardInput?.dataset?.custom ? rewardInput.value : this.questionRewardRecommendation(chosenMode).suggested));
            const botCount = chosenMode === 'chess' ? 1 : config.botCount ?? 3;
            if (!Number.isInteger(botCount) || botCount < 0 || botCount > 3) throw new Error('Choose between zero and three simulated players.');
            const selectedDeck = (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!config.testing && !(selectedDeck?.cards || []).some(card => card.front && card.back)) {
                throw new Error('Select a flashcard set with complete cards before starting the game.');
            }
            const room = modeOverride
                ? { mode: modeOverride, deck_id: deckId, state: { players: [] } }
                : this.hostedGameRoom || { mode: this.selectedMultiplayerMode || 'skyline', deck_id: deckId, state: { players: [] } };
            if (!arcade || this.practiceSession) return;
            const user = window.StudBudCloud?.user || { id: 'local-practice' };
            const roomPlayer = (room.state?.players || []).find(player => player.id === user.id) || { id: user.id, nickname: 'You' };
            const cosmetics = this.profileCosmetics(this.multiplayerProfile || roomPlayer);
            const hasProfile = !!this.multiplayerProfile;
            const me = {
                ...roomPlayer,
                username: user.user_metadata?.username || roomPlayer.username || '',
                skin: hasProfile ? cosmetics.skin : roomPlayer.skin || '',
                hat: hasProfile ? cosmetics.hat : roomPlayer.hat || '',
                accessory: hasProfile ? cosmetics.acc : roomPlayer.accessory || '',
                effect: hasProfile ? cosmetics.effect : roomPlayer.effect || ''
            };
            if (!hasProfile && window.StudBudCommunityGames?.guestColor?.()) me.color = window.StudBudCommunityGames.guestColor();
            const roomDeck = selectedDeck || this.roomStudyDeck(room);
            const botDefs = [['b1', 'Nova', '#f472b6'], ['b2', 'Kite', '#facc15'], ['b3', 'Rook', '#4ade80']].slice(0, botCount);
            const fake = {
                mode: room.mode, room_code: 'PRACTICE', goal_type: 'points', point_limit: 99999, host_id: user.id,
                deck_title: roomDeck?.title || 'Flashcards',
                started_at: new Date().toISOString(),
                state: { question_reward: reward, players: [me, ...botDefs.map(([id, nickname, color], i) => ({ id, nickname, color, skin: ['skin_robot', 'skin_ninja', 'skin_alien'][i] }))] }
            };
            const s = this.practiceSession = new arcade.Session({
                room: fake, user, api: window.StudBudCommunityGames, isHost: false, practice: true, testing: Boolean(config.testing),
                limitedTestEnergy: Boolean(config.limitedTestEnergy),
                timeLimitSeconds: room.mode === 'chess' ? 0 : config.timeLimitSeconds || 0, questionReward: reward,
                seed: config.seed,
                fallbackCards: (roomDeck?.cards || []).filter(card => card.front && card.back),
                studySet: { deckId: roomDeck?.id, title: roomDeck?.title, publicId: roomDeck?.communityDeckId || roomDeck?.communitySourceId },
                onLeave: () => this.closePractice(),
                onRestart: config.testing ? () => {
                    const nextConfig = { ...config, limitedTestEnergy: s.limitedTestEnergy, questionReward: s.rewardAmount() };
                    this.closePractice(); this.startPractice(room.mode, nextConfig);
                } : undefined
            });
            document.body.classList.add('mpg-active');
            this.pingPresence(true);
            try {
                const demo = { mode: room.mode, session: s, game: s.game, meId: user.id, clock: 0 };
                demo.bots = this.initPreviewBots(demo, room.mode, s.game).slice(0, botCount);
                demo.bots.forEach(b => {
                    const info = s.roster.get(b.id);
                    if (info) { b.name = info.nickname; b.color = info.color; b.cos = info.cos; }
                    s.remotes.set(b.id, b);
                });
                const baseEmit = s.emit.bind(s);
                s.emit = ev => { baseEmit(ev); demo.onEmit?.(ev); };
                s.onTick = dt => {
                    if (s.over || s.paused || s.countdown > 0) return;
                    try { this.tickPracticeBots(demo, dt); } catch (error) {
                        s.onTick = null;
                        console.error('[Practice] bots stopped:', error);
                        s.toast('Bot simulation stopped unexpectedly. Restart the game to try again.', '#f87171');
                    }
                };
            } catch (error) {
                console.error('[Practice] Could not add bots:', error);
                s.toast('Bots could not start. Restart the game to try again.', '#f87171');
            }
        }

        stepDefenseBots(demo, dt) {
            const { game, session, bots } = demo;
            if (game.finished || !game.authority) return;
            const pilots = session.preview ? [...bots, demo.defensePilot ||= { id: session.user.id, ai: { rng: window.StudBudArcade.util.mulberry32(825) } }] : bots;
            for (const [i, bot] of pilots.entries()) {
                if (!Object.hasOwn(game.teams, bot.id)) game.teams[bot.id] = (i + 1) % 2;
                const team = game.teamOf(bot.id), ai = bot.ai, rng = ai.rng;
                ai.defenseThink = (ai.defenseThink || 0) - dt;
                ai.defenseAnswer = (ai.defenseAnswer || 0) - dt;
                const order = (action, data = {}) => game.command({ seq: (game.lastSeq[bot.id] || 0) + 1, action, ...data }, bot.id);
                if (ai.defenseAnswer <= 0) {
                    ai.defenseAnswer = 7 + rng() * 5;
                    order('answer', { count: (game.answers[bot.id] || 0) + 1 });
                }
                const targetX = team * 1100 + 500, targetY = 650 + Math.sin(demo.clock + i) * 130;
                if (bot !== demo.defensePilot) {
                    bot.x += (targetX - bot.x) * Math.min(1, dt * .7);
                    bot.y += (targetY - bot.y) * Math.min(1, dt * .7);
                    bot.tx = bot.x; bot.ty = bot.y; bot.ex.team = team;
                }
                if (ai.defenseThink > 0) continue;
                ai.defenseThink = 2.5 + rng() * 2;
                const troops = game.troops.filter(t => t.team === team);
                if (game.troopCount(bot.id) < game.playerTroopLimit && game.canAfford(team, 60) && rng() < .55) {
                    for (let attempt = 0; attempt < 16; attempt++) {
                        const { x, y } = game.gridPoint(team * 1100 + 100 + rng() * 850, 230 + rng() * 900, team);
                        if (game.validPlacement(x, y, team) && game.distanceToPath(x, y, team) < 210) {
                            const affordable = game.troopTypes.map((type, index) => ({ type, index })).filter(({ type }) => game.canAfford(team, type.cost));
                            if (affordable.length) order('build', { type: affordable[Math.floor(rng() * affordable.length)].index, x, y });
                            break;
                        }
                    }
                } else if (rng() < .2 && troops.some(t => t.level < 3)) {
                    const troop = troops.find(t => t.level < 3);
                    if (game.canAfford(team, game.upgradeCost(troop))) order('upgrade', { id: troop.id });
                } else {
                    const affordable = game.enemyTypes.map((type, index) => ({ type, index })).filter(({ type }) => game.canAfford(team, type.cost));
                    if (affordable.length) order('send', { type: affordable[Math.floor(rng() * affordable.length)].index });
                }
            }
        }

        tickPracticeBots(demo, dt) {
            if (demo.mode === 'chess') {
                demo.game.updateScore();
                for (const bot of demo.bots) {
                    const player = demo.session.roster.get(bot.id);
                    if (player) { player.score = bot.score; player.goal = bot.goal; }
                }
                return;
            }
            const { mode, game, bots } = demo, me = game.me, now = performance.now();
            demo.clock += dt;
            const c = demo.clock;
            if (mode === 'duel') this.stepDuelBots(demo, dt);
            else if (mode === 'defense') this.stepDefenseBots(demo, dt);
            else if (mode === 'shooter') this.stepShooterBots(demo, dt);
            else if (mode === 'skyline') bots.forEach((bot, i) => this.stepSkylineBot(demo, bot, i, dt));
            else bots.forEach((bot, i) => this.stepAmbientBot(demo, bot, i, dt));
            for (const bot of bots) {
                if (mode === 'skyline') {
                    bot.goal = Math.round(Math.max(0, -(bot.y + bot.h)) / 40);
                    bot.score = bot.goal;
                } else if (mode === 'duel') {
                    bot.goal = Math.floor(bot.hillSecs || 0);
                    bot.score = bot.goal * 12;
                } else if (mode === 'defense') {
                    bot.goal = bot.score = game.teamValue(game.teamOf(bot.id));
                } else if (mode === 'shooter') {
                    bot.goal = (bot.playerKills || 0) * 3;
                } else if (mode === 'market') {
                    bot.goal = bot.cash || 0;
                    bot.score = bot.goal;
                } else if (mode === 'frenzy' || mode === 'fishing') {
                    bot.goal = bot.ai.catches || 0;
                } else if (mode === 'miner' || mode === 'river' || mode === 'crypto' || mode === 'shooter' || mode === 'hack') {
                    bot.goal = Math.round(Number(bot.score) || 0);
                }
                const rosterPlayer = demo.session.roster.get(bot.id);
                if (rosterPlayer) {
                    rosterPlayer.score = Math.round(Number(bot.score) || 0);
                    rosterPlayer.goal = Math.round(Number(bot.goal) || 0);
                }
            }
        }

        async leaveHostedGame() {
            if (!this.hostedGameRoom) return;
            const code = this.hostedGameRoom.room_code;
            await window.StudBudCommunityGames.leaveRoom(code);
            this.arcadeLeft = true;
            this.destroyArcadeSession();
            this.closePractice();
            if (window.StudBudCloud.user) await this.renderMultiplayerProfile(true);
            if (this.hostedGameInterval) clearInterval(this.hostedGameInterval);
            this.hostedGameInterval = null;
            this.hostedGameRoom = null;
            this.hostedGameUnsubscribe?.();
            this.hostedGameUnsubscribe = null;
            document.getElementById('hosted-game-room').classList.add('hidden');
            document.getElementById('hosted-game-message').textContent = 'You left the room.';
            document.querySelector('.multiplayer-tabs').classList.remove('hidden');
            document.getElementById('hosted-start-btn').classList.add('hidden');
            document.getElementById('hosted-finish-btn').classList.add('hidden');
            if (window.StudBudCloud.guestLobbyOpen) {
                window.StudBudCloud.closeGuestLobby();
                return;
            }
            this.setMultiplayerScreen(this.multiplayerScreen);
        }


        renderProfile() {
            const profile = AppState.get('profile') || {};
            const firstName = document.getElementById('settings-first-name');
            if (firstName) firstName.value = profile.firstName || '';
            const lastName = document.getElementById('settings-last-name');
            if (lastName) lastName.value = profile.lastName || '';
            const year = document.getElementById('settings-grad-year');
            if (year && profile.graduationYear) year.value = String(profile.graduationYear);
            const targetGpa = document.getElementById('settings-target-gpa');
            if (targetGpa) targetGpa.value = String(Number.isFinite(Number(profile.targetGpa)) && profile.targetGpa !== '' && profile.targetGpa !== null ? Number(Number(profile.targetGpa).toFixed(2)) : 3.8);
            const currentTermSetting = document.getElementById('settings-current-term');
            if (currentTermSetting) currentTermSetting.value = profile.currentTerm || 'auto';
            const priorFields = { 'settings-prior-credits': 'priorCredits', 'settings-prior-weighted': 'priorWeightedGpa', 'settings-prior-unweighted': 'priorUnweightedGpa' };
            for (const [id, key] of Object.entries(priorFields)) {
                const field = document.getElementById(id);
                if (field) field.value = Number(profile.priorCredits) > 0 && profile[key] !== null && profile[key] !== undefined ? String(profile[key]) : '';
            }
            const schoolSetting = document.getElementById('settings-school');
            if (schoolSetting && !schoolSetting.dataset?.dirty) {
                const stored = profile.school || window.StudBudCloud?.user?.user_metadata?.school;
                schoolSetting.value = this.isKnownSchool(stored) ? stored : 'pchs';
            }

            const classYear = profile.graduationYear || 2026;
            const displayName = this.multiplayerDisplayName();
            const headerName = document.getElementById('multiplayer-header-name');
            if (headerName) headerName.textContent = displayName;
            const accountName = document.getElementById('account-name');
            if (accountName) accountName.innerHTML = `${this.escapeHTML(displayName)} ${this.accountTagMarkup(window.StudBudCloud?.user?.user_metadata?.username, this.userTags)}`;
            const grade = document.getElementById('header-grade-level');
            if (grade) grade.textContent = `Class of ${classYear}`;
            const selectedTerm = this.configuredSemester();
            const termDisplay = document.getElementById('current-term-display');
            if (termDisplay) termDisplay.textContent = this.termLabel(selectedTerm);
            const saveStatus = document.getElementById('data-save-status');
            if (saveStatus && !saveStatus.textContent.trim()) saveStatus.textContent = 'Your classes, assignments, profile, and settings sync automatically to your account.';
            this.applyAppearance();
        }

        // Adds a picker button for every shop palette that has no hand-written button in index.html
        ensureSchemeButtons() {
            const picker = document.querySelector('.scheme-picker');
            const catalog = window.StudBudCommunityGames?.catalog;
            if (!picker || !catalog) return;
            const mono = picker.querySelector('[data-color-scheme="studbud"]');
            catalog.filter(item => item.type === 'palette').forEach(item => {
                if (picker.querySelector(`[data-color-scheme="${item.color}"]`)) return;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'scheme-option';
                button.dataset.colorScheme = item.color;
                button.dataset.shopItem = item.id;
                button.innerHTML = `<span class="scheme-swatch" style="--swatch: linear-gradient(90deg, hsl(${item.hue} 75% 55%), hsl(${item.hue2} 80% 68%))"></span><span>${this.escapeHTML(item.name)}</span><small class="scheme-lock-note">Unlock in multiplayer shop</small>`;
                picker.insertBefore(button, mono || null);
            });
        }

        applyAppearance() {
            this.ensureSchemeButtons();
            const settings = AppState.get('settings') || {};
            if (settings.gameAudio) window.StudBudSfx?.update(settings.gameAudio);
            const theme = settings.theme === 'light' ? 'light' : 'dark';
            const palettes = (window.StudBudCommunityGames?.catalog || []).filter(item => item.type === 'palette');
            const requestedPalette = palettes.find(item => item.color === settings.colorScheme);
            const freeScheme = ['studbud', 'monochrome'].includes(settings.colorScheme);
            const unlocked = requestedPalette && this.multiplayerProfile?.owned_items?.includes(requestedPalette.id);
            // The old black-and-white default moves to the new StudBud palette once; picking a scheme afterwards sticks.
            const migrated = settings.colorScheme === 'monochrome' && !settings.schemePicked;
            const colorScheme = !migrated && (freeScheme || unlocked) ? settings.colorScheme : 'studbud';
            document.body.classList.toggle('dark-theme', theme === 'dark');
            document.body.classList.toggle('light-theme', theme === 'light');
            document.body.classList.toggle('compact-ui', Boolean(settings.compactUi));
            document.body.classList.toggle('sidebar-collapsed', Boolean(settings.sidebarCollapsed));
            document.body.dataset.colorScheme = colorScheme;
            const palette = window.StudBudCommunityGames?.catalog.find(item => item.type === 'palette' && item.color === colorScheme && item.hue != null);
            document.body.toggleAttribute('data-shop-palette', Boolean(palette));
            if (palette) {
                document.body.style.setProperty('--ph', palette.hue);
                document.body.style.setProperty('--pa', palette.hue2);
            } else {
                document.body.style.removeProperty('--ph');
                document.body.style.removeProperty('--pa');
            }
            const themeSelect = document.getElementById('ui-theme-select');
            if (themeSelect) themeSelect.value = theme;
            const compact = document.getElementById('ui-compact-mode');
            if (compact) compact.checked = Boolean(settings.compactUi);
            document.querySelectorAll('.scheme-option').forEach(button => {
                const selected = button.dataset.colorScheme === colorScheme;
                button.classList.toggle('selected', selected);
                button.setAttribute('aria-pressed', String(selected));
            });
            const sidebarToggle = document.getElementById('sidebar-collapse-btn');
            if (sidebarToggle) this.updateSidebarToggle();
            this.syncMixerControls();
            this.syncMixerDrawer();
            if (this.gradeProgressChart) this.renderGradeProgress();
        }

        syncMixerControls() {
            const sfx = window.StudBudSfx?.settings;
            if (sfx) {
                const volume = document.getElementById('sfx-volume');
                if (volume) {
                    volume.value = String(Math.round(sfx.volume * 100));
                    document.getElementById('sfx-volume-value').value = `${volume.value}%`;
                }
                const ui = document.getElementById('sfx-ui');
                const game = document.getElementById('sfx-game');
                if (ui) ui.checked = sfx.ui;
                if (game) game.checked = sfx.game;
                const musicOn = document.getElementById('music-on');
                const musicVol = document.getElementById('music-volume');
                const musicStyle = document.getElementById('music-style');
                if (musicOn) musicOn.checked = sfx.music;
                if (musicVol) {
                    musicVol.value = String(Math.round(sfx.musicVolume * 100));
                    document.getElementById('music-volume-value').value = `${musicVol.value}%`;
                }
                if (musicStyle) musicStyle.value = sfx.musicStyle;
            }
            const levels = AppState.get('settings')?.audioLevels || {};
            const defaults = { lofi: 0.5, rain: 0.5, white: 0.3, binaural: 0.6 };
            Object.entries(defaults).forEach(([channel, fallback]) => {
                const slider = document.getElementById(`vol-${channel}`);
                if (!slider) return;
                const value = Math.round(Math.max(0, Math.min(1, Number(levels[channel] ?? fallback))) * 100);
                slider.value = String(value);
                const output = document.getElementById(`vol-${channel}-value`);
                if (output) output.value = `${value}%`;
            });
        }

        updateGameAudio(patch) {
            window.StudBudSfx.update(patch);
            AppState.set('settings', { ...AppState.get('settings'), gameAudio: { ...window.StudBudSfx.settings } });
            this.syncMixerControls();
        }

        syncMixerDrawer() {
            const drawer = document.getElementById('sound-drawer');
            if (!drawer) return;
            const expanded = !drawer.classList.contains('collapsed');
            document.querySelectorAll('#drawer-toggle-btn, #mobile-mixer-toggle-btn, #close-drawer-btn').forEach(button => {
                button.setAttribute('aria-expanded', String(expanded));
            });
            const closeButton = document.getElementById('close-drawer-btn');
            if (closeButton) {
                closeButton.setAttribute('aria-label', expanded ? 'Collapse audio mixer' : 'Expand audio mixer');
                closeButton.innerHTML = `<i class="fas fa-chevron-${expanded ? 'down' : 'up'}" aria-hidden="true"></i>`;
            }
        }

        updateSidebarToggle() {
            const sidebarToggle = document.getElementById('sidebar-collapse-btn');
            if (!sidebarToggle) return;
            const expanded = !AppState.get('settings')?.sidebarCollapsed;
            const topNavigation = window.matchMedia('(max-width: 768px)').matches;
            const orientation = topNavigation
                ? (expanded ? 'up' : 'down')
                : (expanded ? 'left' : 'right');
            const action = expanded ? 'Collapse' : 'Expand';
            const target = topNavigation ? 'navigation' : 'sidebar';
            sidebarToggle.setAttribute('aria-expanded', String(expanded));
            sidebarToggle.setAttribute('aria-label', `${action} ${target}`);
            sidebarToggle.title = `${action} ${target}`;
            sidebarToggle.innerHTML = `<i class="fas fa-chevron-${orientation}" aria-hidden="true"></i>`;
            document.querySelectorAll('.nav-item[data-target]').forEach(item => {
                const label = item.querySelector('span')?.textContent.trim();
                if (!label) return;
                item.setAttribute('aria-label', label);
                item.title = label;
            });
        }

        syncTutorialUI() {
            const seen = Boolean(AppState.get('settings')?.tutorialSeen);
            document.getElementById('tutorial-banner')?.classList.toggle('hidden', seen);
            document.getElementById('tutorial-card')?.classList.toggle('hidden', !seen);
        }

        // ---- Friends ----
        setFriendStatus(message, isError = false) {
            const node = document.getElementById('friend-status');
            if (!node) return;
            node.textContent = message || '';
            node.classList.toggle('error', Boolean(isError && message));
        }

        setFriendPolling(visible) {
            if (this.friendPollTimer) clearInterval(this.friendPollTimer);
            this.friendPollTimer = null;
            if (visible && window.StudBudCloud?.user && !window.StudBudCloud.user.is_anonymous && !window.StudBudCloud.offlineMode) {
                this.friendPollTimer = setInterval(() => {
                    if (!document.hidden && !document.getElementById('friends-view')?.classList.contains('hidden')) this.loadFriends();
                }, 20000);
            }
        }

        gameModeLabel(mode) {
            const names = {
                skyline: 'Escape to Space', river: 'River Fishing', market: 'Package Delivery', miner: 'Crystal Mining',
                duel: 'King of the Hill', shooter: 'Arena Shooter', defense: 'Team Tower Defense', chess: 'Question Chess',
                crypto: 'Crypto Trading', fishing: 'Fishing Frenzy', hack: 'Crypto Hack', frenzy: 'Fishing Frenzy',
                classic: 'Flashcard Face-off', rush: 'Rapid Recall', survival: 'Last Learner Standing', sports: 'Soccer'
            };
            const key = String(mode || '');
            return names[key] || (key ? key[0].toUpperCase() + key.slice(1) : 'a game');
        }

        presenceActivity() {
            const session = this.practiceSession;
            if (!session || session.destroyed || session.testing || session.over) return '';
            const mode = String(session.mode || '').toLowerCase();
            return /^[a-z]{2,16}$/.test(mode) ? `solo:${mode}` : '';
        }

        // Lets buds see you as online (and which solo game you're playing) while the app is open.
        pingPresence(force = false) {
            const cloud = window.StudBudCloud;
            if (!cloud?.pingPresence || !cloud.user || cloud.user.is_anonymous || cloud.offlineMode) return;
            if (document.hidden || window.navigator?.onLine === false) return;
            const activity = this.presenceActivity();
            const now = Date.now();
            if (!force && activity === this.lastPresenceActivity && now - (this.lastPresencePing || 0) < 40000) return;
            this.lastPresencePing = now;
            this.lastPresenceActivity = activity;
            cloud.pingPresence(activity).catch(() => { this.lastPresencePing = 0; });
        }

        startPresence() {
            if (this.presenceTimer) return;
            this.presenceTimer = setInterval(() => this.pingPresence(), 45000);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) this.pingPresence(true); });
            window.addEventListener('online', () => this.pingPresence(true));
            setTimeout(() => this.pingPresence(true), 1500);
        }

        friendPresenceMarkup(presence, fallbackRoom) {
            const status = presence?.status || (fallbackRoom ? 'hosting' : '');
            const mode = presence?.mode || fallbackRoom?.mode;
            const code = presence ? presence.room_code : fallbackRoom?.room_code;
            const label = status === 'hosting'
                ? `Hosting ${this.gameModeLabel(mode)}${presence?.room_status === 'playing' ? ' · in progress' : ''}${(presence || fallbackRoom)?.staff_test ? ' · staff test' : ''}`
                : status === 'in_game' ? `In a ${this.gameModeLabel(mode)} match`
                    : status === 'solo' ? `Playing ${this.gameModeLabel(mode)} solo`
                        : status === 'online' ? 'Online'
                            : status === 'offline' ? this.lastSeenLabel(presence.last_seen_at) : '';
            const cls = ['hosting', 'in_game', 'solo'].includes(status) ? 'is-playing' : status === 'online' ? 'is-online' : 'is-offline';
            const pill = label ? `<span class="friend-presence ${cls}"><i aria-hidden="true"></i>${this.escapeHTML(label)}</span>` : '';
            const join = status === 'hosting' && code
                ? `<button type="button" class="primary-btn" data-action="friend-join-game" data-code="${this.escapeHTML(code)}">Join</button>` : '';
            return { pill, join };
        }

        lastSeenLabel(value) {
            const time = value ? new Date(value).getTime() : NaN;
            if (!Number.isFinite(time)) return 'Offline';
            const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
            if (minutes < 60) return `Offline · seen ${minutes}m ago`;
            const hours = Math.round(minutes / 60);
            if (hours < 24) return `Offline · seen ${hours}h ago`;
            const days = Math.round(hours / 24);
            return days < 30 ? `Offline · seen ${days}d ago` : 'Offline';
        }

        async joinFriendGame(code) {
            try {
                if (!window.StudBudCloud?.user || window.StudBudCloud.user.is_anonymous || window.StudBudCloud.offlineMode) throw new Error('Sign in and connect to join a bud’s game.');
                if (this.hostedGameRoom) throw new Error('Leave your current room before joining another game.');
                const room = await window.StudBudCommunityGames.joinRoom(code, this.gameNickname(document.getElementById('join-game-nickname')?.value));
                Router.navigate('multiplayer');
                this.openHostedGame(room);
            } catch (error) {
                const message = this.friendlyErrorMessage(error, 'Could not join this game. It may have started or filled up.');
                this.setFriendStatus(message, true);
                this.showLobbyToast(message);
            }
        }

        showLobbyToast(message) {
            document.getElementById('lobby-toast')?.remove();
            const toast = document.createElement('div');
            toast.id = 'lobby-toast';
            toast.className = 'lobby-toast';
            toast.setAttribute('role', 'status');
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 6000);
        }

        async loadFriends() {
            const games = window.StudBudCommunityGames;
            const lists = { friends: document.getElementById('friend-list'), incoming: document.getElementById('friend-incoming'), outgoing: document.getElementById('friend-outgoing') };
            if (!lists.friends || !games) return;
            const cloud = window.StudBudCloud;
            if (!cloud?.user || cloud.user.is_anonymous || cloud.offlineMode || this.friendLoadBusy) return;
            const userId = cloud.user.id;
            this.friendLoadBusy = true;
            try {
                const data = await games.friendCall('studbud_friend_overview');
                // Presence needs the latest SQL; older databases fall back to the hosted-room lookup.
                const presenceList = await cloud.getFriendPresence?.().catch(() => null) ?? null;
                const rooms = presenceList ? [] : await cloud.getFriendRooms?.().catch(() => []) || [];
                if (cloud.user?.id !== userId || cloud.offlineMode) return;
                const hosted = new Map(rooms.map(room => [room.host_id, room]));
                const presence = new Map((presenceList || []).map(item => [item.user_id, item]));
                this.friendOverview = data;
                const person = (row, buttons, status = '') => `<li class="friend-row">${this.multiplayerAvatarMarkup(this.profileCosmetics(row), false, 'friend-avatar')}<span class="friend-identity"><strong>${this.escapeHTML(row.username)} ${this.accountTagMarkup(row.username, row.tags)}</strong>${status}</span><span class="friend-actions">${buttons}</span></li>`;
                const attrs = row => `data-id="${this.escapeHTML(row.friendship_id)}" data-name="${this.escapeHTML(row.username)}"`;
                const rank = { hosting: 0, in_game: 1, solo: 2, online: 3, offline: 4 };
                const friendRank = row => rank[presence.get(row.user_id)?.status || (hosted.has(row.user_id) ? 'hosting' : 'offline')] ?? 4;
                const friends = data.friends.slice().sort((a, b) => friendRank(a) - friendRank(b));
                lists.friends.innerHTML = friends.length
                    ? friends.map(row => {
                        const { pill, join } = this.friendPresenceMarkup(presence.get(row.user_id), hosted.get(row.user_id));
                        return person(row, `${join}<button type="button" class="secondary-btn" data-action="friend-view" data-id="${this.escapeHTML(row.user_id)}">Profile</button><button type="button" class="ghost-btn" data-action="friend-remove" ${attrs(row)}>Remove</button>`, pill);
                    }).join('')
                    : '<li class="empty-state">No buds yet. Send a request using a username above.</li>';
                lists.incoming.innerHTML = data.incoming.length
                    ? data.incoming.map(row => person(row, `<button type="button" class="primary-btn" data-action="friend-accept" ${attrs(row)}>Accept</button><button type="button" class="ghost-btn" data-action="friend-decline" ${attrs(row)}>Decline</button>`)).join('')
                    : '<li class="empty-state">No pending requests.</li>';
                lists.outgoing.innerHTML = data.outgoing.length
                    ? data.outgoing.map(row => person(row, `<button type="button" class="ghost-btn" data-action="friend-remove" ${attrs(row)}>Cancel</button>`)).join('')
                    : '<li class="empty-state">No requests sent.</li>';
                const badge = document.getElementById('friend-nav-badge');
                if (badge) { badge.textContent = String(data.incoming.length); badge.classList.toggle('hidden', !data.incoming.length); }
                this.setFriendStatus('');
            } catch (error) {
                this.setFriendStatus(this.friendlyErrorMessage(error, 'Could not load your buds.'), true);
            } finally {
                this.friendLoadBusy = false;
            }
        }

        async sendFriendRequest(input) {
            const name = input?.value.trim();
            if (!name) return;
            try {
                const result = await window.StudBudCommunityGames.friendCall('studbud_friend_request', { p_username: name });
                input.value = '';
                this.setFriendStatus(result?.status === 'accepted' ? `You and ${name} are now buds!` : `Bud request sent to ${name}.`);
                await this.loadFriends();
            } catch (error) {
                this.setFriendStatus(error.message || 'Could not send that request.', true);
            }
        }

        async friendAction(action, id, name) {
            const games = window.StudBudCommunityGames;
            try {
                if (action === 'friend-accept') await games.friendCall('studbud_friend_respond', { p_friendship_id: id, p_accept: true });
                else if (action === 'friend-decline') await games.friendCall('studbud_friend_respond', { p_friendship_id: id, p_accept: false });
                else await games.friendCall('studbud_friend_remove', { p_friendship_id: id });
                this.setFriendStatus(action === 'friend-accept' ? `You are now buds with ${name}.` : '');
                const panel = document.getElementById('friend-profile');
                if (panel && action === 'friend-remove') { panel.classList.add('hidden'); panel.innerHTML = ''; }
                await this.loadFriends();
            } catch (error) {
                this.setFriendStatus(error.message || 'That did not work.', true);
            }
        }

        reportButtonMarkup(type, id, name) {
            if (!id) return '';
            return `<button type="button" class="link-btn report-btn" data-action="report-content" data-report-type="${type}" data-id="${this.escapeHTML(id)}" data-name="${this.escapeHTML(name || '')}" title="Report this ${type === 'deck' ? 'set' : 'profile'} to moderators"><i class="fas fa-flag" aria-hidden="true"></i> Report</button>`;
        }

        openReportDialog(type, id, name) {
            if (!window.StudBudCloud?.user) { window.StudBudDialogs.notify('Sign in or continue as a guest to report content.'); return; }
            document.getElementById('report-overlay')?.remove();
            const overlay = document.createElement('div');
            overlay.id = 'report-overlay';
            overlay.className = 'user-profile-overlay report-overlay';
            const reasons = [['inappropriate', 'Inappropriate or offensive'], ['wrong', 'Wrong or misleading answers'], ['spam', 'Spam or nonsense'], ['copyright', 'Copied from a test or copyrighted'], ['harassment', 'Bullying or harassment'], ['other', 'Something else']];
            const label = type === 'deck' ? 'flashcard set' : 'profile';
            overlay.innerHTML = `<form class="user-profile-modal glass-card report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
                <h3 id="report-title"><i class="fas fa-flag" aria-hidden="true"></i> Report ${this.escapeHTML(label)}</h3>
                <p class="settings-hint">?${this.escapeHTML(name || 'Untitled')}? will be reviewed by a moderator. Your report is private.</p>
                <fieldset class="report-reasons"><legend>What's wrong?</legend>${reasons.map(([value, text], index) => `<label><input type="radio" name="reason" value="${value}"${index === 0 ? ' checked' : ''}> ${text}</label>`).join('')}</fieldset>
                <label>Details (optional)<textarea name="details" rows="3" maxlength="500" placeholder="Which card or what should a moderator look at?"></textarea></label>
                <p class="report-status" role="status"></p>
                <div class="admin-actions"><button type="submit" class="danger-btn">Send report</button><button type="button" class="secondary-btn" data-report-cancel>Cancel</button></div>
            </form>`;
            const form = overlay.firstElementChild;
            const close = () => overlay.remove();
            overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('[data-report-cancel]')) close(); });
            overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
            form.addEventListener('submit', async event => {
                event.preventDefault();
                const status = form.querySelector('.report-status');
                const button = form.querySelector('[type="submit"]');
                button.disabled = true;
                status.textContent = 'Sending?';
                try {
                    await window.StudBudCommunityGames.reportContent(type, id, form.elements.reason.value, form.elements.details.value.trim());
                    form.innerHTML = `<h3><i class="fas fa-circle-check" aria-hidden="true"></i> Thanks for reporting</h3><p>A moderator will review this ${this.escapeHTML(label)}. You don't need to do anything else.</p><div class="admin-actions"><button type="button" class="primary-btn" data-report-cancel>Done</button></div>`;
                    form.querySelector('[data-report-cancel]')?.focus();
                } catch (error) {
                    status.textContent = this.friendlyErrorMessage(error, 'Could not send the report. Please try again.');
                    button.disabled = false;
                }
            });
            document.body.appendChild(overlay);
            form.querySelector('input[name="reason"]')?.focus();
        }

        async openUserProfile(userId) {
            let overlay = document.getElementById('user-profile-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'user-profile-overlay';
                overlay.className = 'user-profile-overlay';
                overlay.innerHTML = '<div class="user-profile-modal glass-card" role="dialog" aria-modal="true" aria-label="Student profile"></div>';
                overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('[data-action="close-user-profile"]')) overlay.classList.add('hidden'); });
                document.body.appendChild(overlay);
            }
            const modal = overlay.firstElementChild;
            overlay.classList.remove('hidden');
            modal.innerHTML = '<p class="community-status">Loading profile…</p><button type="button" class="secondary-btn" data-action="close-user-profile">Close</button>';
            try {
                const p = await window.StudBudCommunityGames.getUserProfile(userId);
                const avatar = this.multiplayerAvatarMarkup(this.profileCosmetics(p), true);
                const stat = (label, value) => `<div class="friend-stat"><strong>${value}</strong><small>${label}</small></div>`;
                const facts = [p.grade_level && `🎓 ${p.grade_level}`, p.favorite_subject && `⭐ ${p.favorite_subject}`, p.study_goal && `🎯 ${p.study_goal}`].filter(Boolean).map(f => `<span class="friend-chip">${this.escapeHTML(f)}</span>`).join('');
                const decks = (p.decks || []).map(d => `<li class="friend-row"><div><strong>${this.escapeHTML(d.title)}</strong>${d.course ? ` <span class="deck-chip"><i class="fas fa-book"></i> ${this.escapeHTML(d.course)}</span>` : ''}<br><small>${Number(d.card_count)} cards · studied by ${Number(d.study_count)}</small></div>${p.is_me && !this.findCommunityDeck(d.id) ? '' : this.communityDeckActionMarkup(d.id)}</li>`).join('');
                modal.innerHTML = `<div class="friend-profile-head">${avatar}<div><h3>${this.escapeHTML(p.username)} ${this.accountTagMarkup(p.username, p.tags)}${p.is_me ? ' <em class="you-badge">you</em>' : ''}</h3>${p.display_name ? `<small class="profile-real-name">${this.escapeHTML(p.display_name)}</small>` : ''}</div><button type="button" class="icon-btn profile-close" data-action="close-user-profile" aria-label="Close profile"><i class="fas fa-xmark" aria-hidden="true"></i></button></div>
                    ${p.bio ? `<p class="friend-bio">${this.escapeHTML(p.bio)}</p>` : ''}${facts ? `<div class="friend-chips">${facts}</div>` : ''}
                    <div class="friend-stats">${p.show_stats === false ? stat('Match wins', Number(p.wins) || 0) : `${stat('Studied today', this.formatStudyDuration(p.today_seconds))}${stat('This week', this.formatStudyDuration(p.week_seconds))}${stat('All time', this.formatStudyDuration(p.total_seconds))}${stat('Day streak', `${Number(p.streak_days) || 0} 🔥`)}${stat('Match wins', Number(p.wins) || 0)}`}</div>
                    <h4>Shared flashcard sets</h4>
                    <ul class="friend-list">${decks || '<li class="empty-state">No shared sets yet.</li>'}</ul>
                    ${p.is_me ? `<div class="own-profile-actions"><button type="button" class="primary-btn" data-action="edit-public-profile"><i class="fas fa-pen" aria-hidden="true"></i> Edit public profile</button><button type="button" class="secondary-btn" data-action="open-my-shop"><i class="fas fa-store" aria-hidden="true"></i> Shop &amp; character</button></div>` : `<div class="profile-report-row">${this.reportButtonMarkup('profile', userId, p.username)}</div>`}`;
            } catch (error) {
                modal.innerHTML = `<p class="community-status error">${this.escapeHTML(error.message || 'Could not open that profile.')}</p><button type="button" class="secondary-btn" data-action="close-user-profile">Close</button>`;
            }
        }

        async showFriendProfile(userId) {
            const panel = document.getElementById('friend-profile');
            if (!panel) return;
            try {
                const p = await window.StudBudCommunityGames.friendCall('studbud_friend_profile', { p_user_id: userId });
                const avatar = this.multiplayerAvatarMarkup({ skin: p.skin, hat: p.hat, acc: p.accessory }, true);
                const stat = (label, value) => `<div class="friend-stat"><strong>${value}</strong><small>${label}</small></div>`;
                const facts = [p.grade_level && `🎓 ${p.grade_level}`, p.favorite_subject && `⭐ ${p.favorite_subject}`, p.study_goal && `🎯 ${p.study_goal}`].filter(Boolean).map(f => `<span class="friend-chip">${this.escapeHTML(f)}</span>`).join('');
                panel.innerHTML = `<div class="friend-profile-head">${avatar}<div><h3>${this.escapeHTML(p.username)} ${this.accountTagMarkup(p.username, p.tags)}</h3>${p.display_name ? `<small class="profile-real-name">${this.escapeHTML(p.display_name)}</small>` : ''}<small>Bud</small></div><button type="button" class="icon-btn profile-close" data-action="friend-profile-close" aria-label="Close profile"><i class="fas fa-xmark" aria-hidden="true"></i></button></div>
                    ${p.bio ? `<p class="friend-bio">${this.escapeHTML(p.bio)}</p>` : ''}${facts ? `<div class="friend-chips">${facts}</div>` : ''}
                    <div class="friend-stats">${p.show_stats === false ? stat('Match wins', Number(p.wins) || 0) : `${stat('Studied today', this.formatStudyDuration(p.today_seconds))}${stat('This week', this.formatStudyDuration(p.week_seconds))}${stat('All time', this.formatStudyDuration(p.total_seconds))}${stat('Day streak', `${Number(p.streak_days) || 0} 🔥`)}${stat('Match wins', Number(p.wins) || 0)}`}</div>`;
                panel.classList.remove('hidden');
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (error) {
                this.setFriendStatus(error.message || 'Could not open that profile.', true);
            }
        }

        tutorialSteps() {
            const nav = view => `.nav-item:not(.workspace-child)[data-target="${view}-view"], .nav-item:not(.workspace-child)[data-also~="${view}-view"]`;
            return [
                { title: 'Welcome to StudBud!', text: 'This quick tour follows a real week: bring in your classes, plan the next deadline, build a study set and practice it. Use the topic menu to jump around, and replay the tour any time from Settings.' },
                { route: 'dashboard', sel: '#sidebar', title: 'Your menu', text: 'Six workspaces keep things simple: Home, School, Plan, Study, Play and Settings. Related tools show up as pill tabs above each page. On a phone, swipe the menu or the tabs sideways.' },
                { route: 'gpa', sel: '#gpa-view .open-ic-import-btn', title: 'Import from Infinite Campus', text: 'Skip the typing: import your classes, grades, assignments, categories, class times and school calendar. On a computer, drag StudBud Import to your bookmarks bar. On a phone, follow the phone/tablet instructions to save the import bookmark. Run it on the signed-in Campus website, check the class matches and press Import. Re-import any time to update.' },
                { route: 'gpa', sel: '#workspace-tabs', title: 'Your school, your course list', text: 'Pick Parkway Central, North, South or West in Settings and the class search only shows that school\u2019s course catalog. Choose Other to type your classes yourself or import them from Infinite Campus. What-if grades is a safe sandbox that never touches your real scores.' },
                { route: 'planner', sel: '#workspace-tabs', title: 'Plan the next deadline', text: 'Tasks is your work list, Calendar shows the same due dates by month and Class schedule controls which classes appear on Home. Add a quiz or test to get a suggested study plan.' },
                { route: 'dashboard', sel: '.focus-sprint-widget', title: 'Choose what to do today', text: 'Home brings together today\u2019s classes and urgent work. Pick a quiz or test in Focus sprint, then start a timer. Finished focus time is logged automatically and keeps your streak alive.' },
                { route: 'flashcard', sel: '#create-deck-btn', title: 'Make a study set in seconds', text: 'Select New study set, name it and link it to a class or test. In the editor, Quick add lets you type a term, press Tab, type the definition and press Enter, over and over. Paste a whole list with bulk import, or star the tricky cards.' },
                { route: 'flashcard', sel: '#deck-grid .deck-card, #deck-grid', title: 'Study, cram or drill stars', text: 'Flashcards are practice, not assignments: study any set whenever you want. Study prioritizes cards that need practice: press Space to flip, 1\u20134 to rate, S to star and T to type your answer. Cram goes through every card without changing learning progress, and the pencil opens the editor. The \u22ee menu on each set adds a card, drills starred cards, links a class or test, shares or deletes it.' },
                { route: 'exam-arcade', sel: '#workspace-tabs', title: 'Practice games', text: 'Practice turns your sets into quick games: Streak Builder, Lightning Round, Survival, True or False and Memory Match. Answer with the 1\u20134 keys (T or F in True or False), build combos for bonus points and earn up to three stars. Practice Test mixes typing, choices and matching.' },
                { route: 'multiplayer', sel: '#workspace-tabs', title: 'Play, connect and customize', text: 'Games hosts or joins a room with friends, or plays solo for coins. Buds shows who is online or in a game, with a Join button when a bud is hosting. Leaderboards compares progress, and the Shop has boxes you can open with coins to collect characters, hats and auras for your Locker.' },
                { route: 'dashboard', sel: '#classes-nav-item:not(.hidden)', title: 'Classes for students and teachers', text: 'At a Parkway school there is nothing to join: when your teacher is on StudBud, their class and flashcard sets show up automatically for every course in your list. Teachers pick the courses they teach, then see each student\u2019s grades, missing work and study time, and publish flashcard sets the whole class can study.' },
                { route: 'profile', sel: '#public-profile-card:not(.hidden), #guest-appearance:not(.hidden)', title: 'Keep private data private', text: 'Your real name stays inside the app. Public profiles show your username; your real name and school appear only if you choose to share them. Settings \u2192 Data lets you export your saved data.' },
                { route: 'appearance', sel: '#ui-theme-select', title: 'Make it yours, keep it fast', text: 'Pick a color scheme and theme in Appearance. Games keep their full visuals and skip off-screen drawing to stay smooth. Open StudBud once online and it keeps working offline.' },
                { route: 'dashboard', title: 'Your first three steps', text: 'Import classes from Infinite Campus, add an upcoming quiz or assignment, then create a study set for it. Come back to Home each day to see what to work on next. Good luck!' }
            ];
        }

        startTutorial() {
            this.endTutorialUI();
            this.tutorialReturnFocus = document.activeElement;
            this.tutorialStep = 0;
            const root = document.createElement('div');
            root.id = 'tutorial-root';
            root.innerHTML = `<div class="tutorial-spot" hidden></div><div class="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-description"><div class="tutorial-brand"><span class="tutorial-brand-icon"><i class="fas fa-compass" aria-hidden="true"></i></span><span class="tutorial-brand-copy"><strong>STUDBUD GUIDE</strong><small>A quick tour of your study hub</small></span></div><div class="tutorial-progress"><span class="tutorial-progress-bar"></span></div><div class="tutorial-head"><small class="tutorial-count"></small><label class="tutorial-jump"><span class="sr-only">Jump to a topic</span><select aria-label="Jump to a topic">${this.tutorialSteps().map((step, index) => `<option value="${index}">${index + 1}. ${this.escapeHTML(step.title)}</option>`).join('')}</select></label></div><h3 id="tutorial-title"></h3><p id="tutorial-description" class="tutorial-text"></p><div class="tutorial-buttons"><button type="button" class="text-btn" data-tour="skip">Finish later</button><span class="tutorial-spacer"></span><button type="button" class="secondary-btn" data-tour="back">Back</button><button type="button" class="primary-btn" data-tour="next">Next</button></div></div>`;
            document.body.appendChild(root);
            root.querySelector('select').addEventListener('change', event => this.showTutorialStep(Number(event.target.value)));
            root.addEventListener('click', event => {
                const button = event.target.closest('[data-tour]');
                if (!button) return;
                event.stopPropagation();
                const kind = button.dataset.tour;
                if (kind === 'skip') this.finishTutorial();
                else if (kind === 'back') this.showTutorialStep(this.tutorialStep - 1);
                else if (this.tutorialStep >= this.tutorialSteps().length - 1) this.finishTutorial();
                else this.showTutorialStep(this.tutorialStep + 1);
            });
            this.tutorialKeys = event => {
                if (event.key === 'Escape') { this.finishTutorial(); return; }
                if (event.key !== 'Tab') return;
                const controls = [...root.querySelectorAll('button, select')].filter(node => !node.hidden);
                const first = controls[0], last = controls[controls.length - 1];
                if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last) || !root.contains(document.activeElement)) {
                    event.preventDefault(); (event.shiftKey ? last : first).focus();
                }
            };
            this.tutorialResize = () => this.refreshTutorialGeometry();
            this.tutorialObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this.tutorialResize) : null;
            this.tutorialObserver?.observe(root.querySelector('.tutorial-card'));
            this.tutorialTransition = event => {
                if (!root.contains(event.target)) this.refreshTutorialGeometry();
            };
            document.addEventListener('transitionend', this.tutorialTransition, true);
            document.addEventListener('animationend', this.tutorialTransition, true);
            window.addEventListener('orientationchange', this.tutorialResize);
            window.visualViewport?.addEventListener('resize', this.tutorialResize);
            window.visualViewport?.addEventListener('scroll', this.tutorialResize);
            document.fonts?.ready.then(() => {
                if (root.isConnected) this.refreshTutorialGeometry();
            });
            document.addEventListener('keydown', this.tutorialKeys);
            window.addEventListener('resize', this.tutorialResize);
            window.addEventListener('scroll', this.tutorialResize, { capture: true, passive: true });
            document.body.classList.add('tutorial-active');
            this.showTutorialStep(0);
        }

        showTutorialStep(index) {
            const steps = this.tutorialSteps();
            const root = document.getElementById('tutorial-root');
            if (!root) return;
            this.tutorialStep = Math.max(0, Math.min(steps.length - 1, index));
            const step = steps[this.tutorialStep];
            if (step.route) Router.navigate(step.route);
            root.querySelector('.tutorial-count').textContent = `Step ${this.tutorialStep + 1} of ${steps.length}`;
            root.querySelector('.tutorial-progress-bar').style.width = `${((this.tutorialStep + 1) / steps.length) * 100}%`;
            root.querySelector('#tutorial-title').textContent = step.title;
            root.querySelector('.tutorial-text').textContent = step.text;
            root.querySelector('select').value = String(this.tutorialStep);
            root.querySelector('[data-tour="back"]').hidden = this.tutorialStep === 0;
            root.querySelector('[data-tour="next"]').textContent = this.tutorialStep === steps.length - 1 ? 'Finish' : 'Next';
            root.querySelector('[data-tour="skip"]').hidden = this.tutorialStep === steps.length - 1;
            this.tutorialSel = step.sel || '';
            root.querySelector('.tutorial-spot').hidden = true;
            this.tutorialPreparing = true;
            this.tutorialScrollTarget = null;
            this.tutorialStableFrames = 0;
            this.tutorialLastRect = '';
            this.tutorialPrepareUntil = performance.now() + 1600;
            this.refreshTutorialGeometry();
            root.querySelector('[data-tour="next"]').focus({ preventScroll: true });
        }

        tutorialViewport() {
            const viewport = window.visualViewport;
            const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
            const width = viewport?.width || document.documentElement.clientWidth;
            const height = viewport?.height || window.innerHeight;
            return { left, top, width, height, right: left + width, bottom: top + height };
        }

        tutorialTarget() {
            if (!this.tutorialSel) return null;
            const selectors = [this.tutorialSel];
            if (this.tutorialSel.includes('#sidebar')) selectors.push('#main-nav', '#sidebar-collapse-btn');
            if (this.tutorialSel.includes('#classes-nav-item')) selectors.push('#workspace-tabs [aria-current="page"]', '#main-nav .nav-item.active');
            for (const selector of selectors) {
                for (const element of document.querySelectorAll(selector)) {
                    const rect = element.getBoundingClientRect();
                    const style = getComputedStyle(element);
                    if (element.getClientRects().length && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0') return element;
                }
            }
            return null;
        }

        refreshTutorialGeometry() {
            this.tutorialMeasureUntil = performance.now() + 500;
            if (this.tutorialFrame) return;
            const measure = () => {
                this.tutorialFrame = null;
                if (!document.getElementById('tutorial-root')) return;
                this.positionTutorialSpot();
                if (this.tutorialPreparing || performance.now() < this.tutorialMeasureUntil) this.tutorialFrame = requestAnimationFrame(measure);
            };
            this.tutorialFrame = requestAnimationFrame(measure);
        }

        positionTutorialSpot() {
            const root = document.getElementById('tutorial-root');
            const spot = root?.querySelector('.tutorial-spot');
            const card = root?.querySelector('.tutorial-card');
            if (!spot || !card) return;
            const view = this.tutorialViewport();
            const el = this.tutorialTarget();
            if (el !== this.tutorialObservedTarget) {
                if (this.tutorialObservedTarget) this.tutorialObserver?.unobserve(this.tutorialObservedTarget);
                this.tutorialObservedTarget = el;
                if (el) this.tutorialObserver?.observe(el);
            }
            if (this.tutorialPreparing && el && this.tutorialScrollTarget !== el) {
                this.tutorialScrollTarget = el;
                // Scroll every containing scroller before measuring, without a lingering smooth-scroll animation.
                el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
                const rect = el.getBoundingClientRect();
                let inset = view.top;
                for (const header of document.querySelectorAll('#sidebar, #top-header')) {
                    if (header === el || header.contains(el)) continue;
                    const style = getComputedStyle(header), bounds = header.getBoundingClientRect();
                    if (['sticky', 'fixed'].includes(style.position) && bounds.top <= view.top + 1 && bounds.right > rect.left && bounds.left < rect.right) inset = Math.max(inset, bounds.bottom + 12);
                }
                if (rect.top < inset) window.scrollBy({ top: rect.top - inset, behavior: 'instant' });
            }
            let rect = el?.getBoundingClientRect();
            if (this.tutorialPreparing) {
                const key = rect ? [rect.left, rect.top, rect.width, rect.height, view.width, view.height].map(value => value.toFixed(2)).join(',') : '';
                this.tutorialStableFrames = key === this.tutorialLastRect ? this.tutorialStableFrames + 1 : 0;
                this.tutorialLastRect = key;
                if (this.tutorialStableFrames >= 4 || performance.now() > this.tutorialPrepareUntil) this.tutorialPreparing = false;
            }
            // Only spotlight the visible intersection of a target and its clipping scroll containers.
            let bounds = rect ? { left: Math.max(view.left, rect.left), top: Math.max(view.top, rect.top), right: Math.min(view.right, rect.right), bottom: Math.min(view.bottom, rect.bottom) } : null;
            for (let parent = el?.parentElement; bounds && parent && parent !== document.body; parent = parent.parentElement) {
                const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
                if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { bounds.left = Math.max(bounds.left, clip.left); bounds.right = Math.min(bounds.right, clip.right); }
                if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { bounds.top = Math.max(bounds.top, clip.top); bounds.bottom = Math.min(bounds.bottom, clip.bottom); }
            }
            if (bounds && (bounds.right <= bounds.left || bounds.bottom <= bounds.top)) bounds = null;
            spot.hidden = !bounds || this.tutorialPreparing;
            const pad = 6, margin = 12, gap = 14;
            if (bounds) {
                const dpr = window.devicePixelRatio || 1;
                const left = Math.floor(Math.max(view.left, bounds.left - pad) * dpr) / dpr;
                const top = Math.floor(Math.max(view.top, bounds.top - pad) * dpr) / dpr;
                const right = Math.ceil(Math.min(view.right, bounds.right + pad) * dpr) / dpr;
                const bottom = Math.ceil(Math.min(view.bottom, bounds.bottom + pad) * dpr) / dpr;
                Object.assign(spot.style, { left: left + 'px', top: top + 'px', width: (right - left) + 'px', height: (bottom - top) + 'px' });
            }
            const width = Math.max(0, Math.min(500, view.width - margin * 2));
            const maxHeight = Math.max(0, view.height - margin * 2);
            // Measure intrinsic content without expanding a scrolled card and resetting its scroll position.
            let cardWidth = width, cardHeight = Math.min(maxHeight, card.scrollHeight ? card.scrollHeight + 2 : card.getBoundingClientRect().height);
            let chosen = null;
            let left = view.left + (view.width - cardWidth) / 2, top = view.top + (view.height - cardHeight) / 2;
            if (bounds) {
                const spaces = [
                    { side: 'right', width: view.right - bounds.right - gap - margin, height: maxHeight },
                    { side: 'left', width: bounds.left - view.left - gap - margin, height: maxHeight },
                    { side: 'bottom', width, height: view.bottom - bounds.bottom - gap - margin },
                    { side: 'top', width, height: bounds.top - view.top - gap - margin }
                ];
                const fits = spaces.filter(space => space.width >= Math.min(280, width) && space.height >= Math.min(140, cardHeight));
                fits.sort((a, b) => (Math.min(b.width, cardWidth) * Math.min(b.height, cardHeight)) - (Math.min(a.width, cardWidth) * Math.min(a.height, cardHeight)));
                chosen = fits[0];
                if (!chosen) {
                    // Big targets: dock the card to whichever screen edge leaves more of the target visible.
                    const below = view.bottom - bounds.bottom, above = bounds.top - view.top;
                    chosen = { side: below >= above ? 'dock-bottom' : 'dock-top', width, height: Math.max(Math.min(cardHeight, maxHeight * .5), Math.max(below, above) - gap - margin) };
                }
            }
            Object.assign(card.style, { width: Math.min(width, chosen?.width ?? width) + 'px', maxHeight: Math.min(maxHeight, chosen?.height ?? maxHeight) + 'px' });
            cardWidth = card.getBoundingClientRect().width; cardHeight = card.getBoundingClientRect().height;
            left = view.left + (view.width - cardWidth) / 2; top = view.top + (view.height - cardHeight) / 2;
            if (bounds && chosen) {
                const best = chosen;
                left = bounds.left + (bounds.right - bounds.left - cardWidth) / 2;
                top = bounds.top + (bounds.bottom - bounds.top - cardHeight) / 2;
                if (best.side === 'right') left = bounds.right + gap;
                if (best.side === 'left') left = bounds.left - gap - cardWidth;
                if (best.side === 'bottom') top = bounds.bottom + gap;
                if (best.side === 'top') top = bounds.top - gap - cardHeight;
                if (best.side === 'dock-bottom') top = view.bottom - margin - cardHeight;
                if (best.side === 'dock-top') top = view.top + margin;
            }
            left = Math.max(view.left + margin, Math.min(left, view.right - margin - cardWidth));
            top = Math.max(view.top + margin, Math.min(top, view.bottom - margin - cardHeight));
            Object.assign(card.style, { left: left + 'px', top: top + 'px' });
        }

        endTutorialUI() {
            document.getElementById('tutorial-root')?.remove();
            cancelAnimationFrame(this.tutorialFrame);
            this.tutorialFrame = null;
            this.tutorialPreparing = false;
            this.tutorialObserver?.disconnect();
            this.tutorialObserver = this.tutorialObservedTarget = this.tutorialScrollTarget = null;
            if (this.tutorialTransition) {
                document.removeEventListener('transitionend', this.tutorialTransition, true);
                document.removeEventListener('animationend', this.tutorialTransition, true);
                this.tutorialTransition = null;
            }
            if (this.tutorialKeys) document.removeEventListener('keydown', this.tutorialKeys);
            if (this.tutorialResize) {
                window.removeEventListener('resize', this.tutorialResize);
                window.removeEventListener('orientationchange', this.tutorialResize);
                window.visualViewport?.removeEventListener('resize', this.tutorialResize);
                window.visualViewport?.removeEventListener('scroll', this.tutorialResize);
                window.removeEventListener('scroll', this.tutorialResize, { capture: true });
            }
            document.body.classList.remove('tutorial-active');
            this.tutorialKeys = this.tutorialResize = null;
            const focusTarget = this.tutorialReturnFocus?.isConnected && this.tutorialReturnFocus.getClientRects().length
                ? this.tutorialReturnFocus : document.querySelector('#workspace-tabs [aria-current="page"], #sidebar .nav-item.active');
            focusTarget?.focus({ preventScroll: true });
            this.tutorialReturnFocus = null;
        }

        finishTutorial() {
            this.endTutorialUI();
            AppState.set('settings', { ...AppState.get('settings'), tutorialSeen: true });
            this.syncTutorialUI();
        }

        renderDashboard() {
            this.loadSiteNotice();
            this.renderHomeWidget();
            const courses = AppState.get('courses') || [];
            const calculator = window.GPACalculator;
            if (calculator) {
                const gpa = this.calculateTrackedGPA(courses);
                const weighted = document.getElementById('dash-weighted-gpa');
                const unweighted = document.getElementById('dash-unweighted-gpa');
                if (weighted) weighted.textContent = Number(gpa.weighted).toFixed(2);
                if (unweighted) unweighted.textContent = Number(gpa.unweighted).toFixed(2);
            }
            this.renderDailySchedule(new Date());
            this.renderTodayStudyPlan();
            this.renderFocusSprint();
            this.renderStudyRecommendations('study-priority-list', 5);
            this.renderStudyProgress();
            this.renderDailyStudyHabit();
            this.syncTutorialUI();
        }

        renderStudyRecommendations(id, limit = Infinity) {
            const priorityList = document.getElementById(id);
            if (priorityList) {
                const recommendations = this.getStudyRecommendations().slice(0, limit);
                priorityList.innerHTML = recommendations.length ? recommendations.map((item, index) => {
                    const decks = (item.deckLinks || []).slice(0, 2).map(({ deck }) =>
                        `<button class="secondary-btn" data-action="study-deck" data-id="${this.escapeHTML(deck.id)}"><i class="fas fa-layer-group"></i> ${this.escapeHTML(deck.title)}</button>`).join('');
                    const studied = item.minutesStudied ? `<small class="study-time-logged"><i class="fas fa-clock"></i> ${item.minutesStudied} min studied${item.flashcardMinutes ? ` (${item.flashcardMinutes} with flashcards)` : ''}</small>` : '';
                    const manage = id === 'planner-study-list' ? `<button type="button" class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">Edit quiz / test</button>${this.assignmentStatusControl(item)}` : '';
                    return `<article class="study-priority-item"><span class="priority-rank">${index + 1}</span><div><strong>${this.escapeHTML(item.title)}</strong><span>${this.escapeHTML(item.courseTitle)} · ${this.escapeHTML(item.kind || 'assignment')} · ${item.sessionMinutes} min today (about ${item.remainingStudyMinutes} min remaining)</span>${studied}<small>${this.escapeHTML(item.reason)}</small><p><strong>Study method:</strong> ${this.escapeHTML(item.studyMethod)}</p><div class="study-priority-actions"><button class="secondary-btn" data-action="log-study" data-id="${this.escapeHTML(item.id)}"><i class="fas fa-stopwatch"></i> Log study session</button>${this.assessmentStudyButton(item)}${decks}${manage}</div></div></article>`;
                }).join('') : (id === 'planner-study-list'
                    ? '<p class="empty-state">Add an upcoming quiz or test to get study suggestions.</p>'
                    : '<div class="empty-state empty-state-cta"><p>Add an upcoming quiz or test to get study suggestions.</p><button class="primary-btn" type="button" data-action="add-quiz"><i class="fas fa-plus"></i> Add a quiz or test</button></div>');
            }
        }

        formatStudyDuration(seconds) {
            const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
            const minutes = Math.floor(totalSeconds / 60);
            const remainder = totalSeconds % 60;
            if (!totalSeconds) return '0 min';
            return minutes ? `${minutes} min${remainder ? ` ${remainder} sec` : ''}` : `${remainder} sec`;
        }

        formatLongDuration(seconds) {
            const total = Math.max(0, Math.floor(Number(seconds) || 0));
            if (total < 3600) return this.formatStudyDuration(total);
            const hours = Math.floor(total / 3600);
            const minutes = Math.floor((total % 3600) / 60);
            return `${hours.toLocaleString()} h${minutes ? ` ${minutes} min` : ''}`;
        }

        studyStreakState() {
            const snap = this.studyLeaderboardSnapshot || {};
            const goal = Number(snap.daily_goal_seconds) || 300;
            const dayKey = time => {
                const date = new Date(time);
                return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
            };
            const todayKey = dayKey(Date.now());
            let week = Array.isArray(snap.week) && snap.week.length
                ? snap.week.map(day => ({ date: String(day.date).slice(0, 10), seconds: Number(day.seconds) || 0 }))
                : null;
            if (!week) {
                // Older servers don't send the week, so fall back to sessions logged on this device.
                const byDay = {};
                (AppState.state?.studyHistory || []).forEach(session => {
                    const key = dayKey(session.timestamp);
                    if (key) byDay[key] = (byDay[key] || 0) + (Number(session.durationSec) || 0);
                });
                week = Array.from({ length: 7 }, (_, i) => {
                    const key = dayKey(Date.now() - (6 - i) * 86400000);
                    return { date: key, seconds: byDay[key] || 0 };
                });
            }
            const today = snap.today_seconds != null ? Number(snap.today_seconds) || 0 : (week.find(day => day.date === todayKey)?.seconds || 0);
            week = week.map(day => day.date === todayKey ? { ...day, seconds: Math.max(day.seconds, today) } : day);
            const streak = Number(snap.streak_days) || 0;
            const now = new Date();
            const msLeft = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
            const milestones = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];
            const next = milestones.find(m => m > streak) || (Math.floor(streak / 500) + 1) * 500;
            const prev = [...milestones].reverse().find(m => m <= streak) || 0;
            return {
                goal, today, streak, week, msLeft, next, prev, todayKey,
                best: Math.max(streak, Number(snap.best_streak) || 0),
                done: today >= goal,
                loaded: Boolean(this.studyLeaderboardSnapshot)
            };
        }

        streakStatusText(st) {
            const hours = Math.floor(st.msLeft / 3600000);
            const mins = Math.floor(st.msLeft / 60000) % 60;
            const left = hours ? `${hours}h ${mins}m` : `${mins}m`;
            const need = Math.max(1, Math.ceil((st.goal - st.today) / 60));
            if (!st.loaded) return this.studyLeaderboardError || 'Loading your streak…';
            if (st.done) return st.streak > 1 ? `Goal done! Your ${st.streak}-day streak is safe today.` : 'Goal done! Your streak has started.';
            if (st.streak) return `Study ${need} more min in the next ${left} to keep your streak.`;
            return `Study ${need} min today to start a streak.`;
        }

        streakHeroMarkup(st) {
            const state = st.done ? 'is-safe' : st.streak ? 'is-risk' : 'is-cold';
            const pct = Math.round(Math.min(1, Math.max(0, (st.streak - st.prev) / Math.max(1, st.next - st.prev))) * 100);
            const toGo = st.next - st.streak;
            return `<div class="streak-hero ${state}">
                <div class="streak-flame" aria-hidden="true"><i class="fas fa-fire"></i><b>${st.streak}</b></div>
                <div class="streak-hero-text">
                    <strong>${st.streak} day streak</strong>
                    <span>${this.escapeHTML(this.streakStatusText(st))}</span>
                    <div class="streak-milestone" title="Next milestone: ${st.next} days">
                        <span class="streak-milestone-bar"><i style="width:${pct}%"></i></span>
                        <small>${toGo} day${toGo === 1 ? '' : 's'} to the ${st.next}-day milestone · best ${st.best}</small>
                    </div>
                </div>
            </div>`;
        }

        streakWeekMarkup(st) {
            const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return `<ol class="streak-week" aria-label="Daily goal over the last 7 days">${st.week.map(day => {
                const name = names[new Date(`${day.date}T00:00:00Z`).getUTCDay()] || '';
                const hit = day.seconds >= st.goal;
                const part = !hit && day.seconds > 0;
                const label = `${name}: ${hit ? 'goal met' : part ? `${Math.round(day.seconds / 60)} of ${Math.round(st.goal / 60)} min` : 'no study'}`;
                return `<li class="${hit ? 'hit' : part ? 'part' : 'miss'}${day.date === st.todayKey ? ' today' : ''}" title="${label}" aria-label="${label}"><span>${name.slice(0, 2)}</span><i class="fas ${hit ? 'fa-fire' : part ? 'fa-circle-half-stroke' : 'fa-circle'}" aria-hidden="true"></i></li>`;
            }).join('')}</ol>`;
        }

        homeWidgetPrefs() {
            const defaults = { streak: true, week: true, goal: true, assignments: true, assignmentCount: 3, grades: true, badge: true };
            return { ...defaults, ...(AppState.get('settings')?.homeWidget || {}) };
        }

        saveHomeWidgetPrefs(patch) {
            const settings = AppState.get('settings') || {};
            AppState.set('settings', { ...settings, homeWidget: { ...this.homeWidgetPrefs(), ...patch } });
            this.renderHomeWidget();
        }

        dueLabel(dateKey) {
            if (!dateKey) return { text: 'No due date', tone: '' };
            const today = new Date(`${localDateKey(new Date())}T00:00:00`);
            const due = new Date(`${dateKey}T00:00:00`);
            if (!Number.isFinite(due.getTime())) return { text: dateKey, tone: '' };
            const diff = Math.round((due - today) / 86400000);
            if (diff < 0) return { text: `Overdue ${-diff}d`, tone: 'is-overdue' };
            if (diff === 0) return { text: 'Due today', tone: 'is-soon' };
            if (diff === 1) return { text: 'Due tomorrow', tone: 'is-soon' };
            if (diff < 7) return { text: `Due ${due.toLocaleDateString(undefined, { weekday: 'short' })}`, tone: '' };
            return { text: `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, tone: '' };
        }

        homeWidgetData(st = this.studyStreakState(), prefs = this.homeWidgetPrefs()) {
            const courses = AppState.get('courses') || [];
            const courseTitle = code => courses.find(course => course.code === code)?.title || code || '';
            const open = (AppState.get('assignments') || [])
                .filter(item => item.status !== 'completed' && !this.isGradedItem(item))
                .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
            const assignments = open.slice(0, Math.max(1, Number(prefs.assignmentCount) || 3)).map(item => {
                const due = this.dueLabel(item.dueDate);
                return { id: item.id, title: item.title || 'Untitled', course: courseTitle(item.courseCode), due: due.text, tone: due.tone };
            });
            const grades = courses.map(course => {
                const grade = this.calculateCourseGrade(course);
                return Number.isFinite(grade) ? { code: course.code, title: course.title || course.code, percent: Math.round(grade * 10) / 10, letter: this.gradeForPercentage(grade) } : null;
            }).filter(Boolean);
            const gpa = grades.length ? this.calculateTrackedGPA(courses) : null;
            const status = this.streakStatusText(st);
            const weekText = st.week.map(day => day.seconds >= st.goal ? '🔥' : day.seconds > 0 ? '◐' : '○').join(' ');
            return {
                prefs, st, assignments, openCount: open.length, grades, gpa,
                card: {
                    showStreak: Boolean(prefs.streak), showWeek: Boolean(prefs.week), showGoal: Boolean(prefs.goal),
                    showAssignments: Boolean(prefs.assignments), showGrades: Boolean(prefs.grades && grades.length),
                    streak: st.streak, streakLabel: `${st.streak} day streak · best ${st.best}`, status, weekText,
                    goalText: `${Math.floor(st.today / 60)} of ${Math.round(st.goal / 60)} min studied today`,
                    assignments: assignments.map(item => ({ title: item.title, due: item.due })),
                    gpaText: gpa ? `GPA ${Number(gpa.weighted).toFixed(2)} weighted · ${Number(gpa.unweighted).toFixed(2)} unweighted` : 'No grades yet',
                    grades: grades.slice(0, 4).map(item => ({ title: item.title, grade: `${item.letter} (${item.percent}%)` })),
                    updated: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                }
            };
        }

        renderHomeWidget(st = this.studyStreakState()) {
            const prefs = this.homeWidgetPrefs();
            document.querySelectorAll('[data-home-widget-pref]').forEach(input => {
                const value = prefs[input.dataset.homeWidgetPref];
                if (input.type === 'checkbox') input.checked = Boolean(value);
                else input.value = String(value);
            });
            const data = this.homeWidgetData(st, prefs);
            this.updateAppBadge(prefs.badge && st.loaded ? st.streak : 0);
            const body = document.getElementById('home-widget-body');
            if (!body) return;
            const esc = value => this.escapeHTML(String(value ?? ''));
            const habit = [];
            if (prefs.streak) habit.push(this.streakHeroMarkup(st));
            if (prefs.week) habit.push(this.streakWeekMarkup(st));
            if (prefs.goal) {
                habit.push(`<div class="home-widget-goal"><div class="daily-study-stats"><strong>${this.formatStudyDuration(st.today)}</strong><span>of ${Math.round(st.goal / 60)} min today</span></div>
                    <progress class="daily-study-progress" max="${st.goal}" value="${Math.min(st.today, st.goal)}" aria-label="${Math.floor(st.today / 60)} of ${Math.round(st.goal / 60)} study minutes completed today"></progress></div>`);
            }
            const sections = [];
            if (habit.length) sections.push(`<div class="home-widget-section home-widget-habit">${habit.join('')}</div>`);
            if (prefs.assignments) {
                sections.push(`<div class="home-widget-section">
                    <div class="home-widget-section-head"><h4><i class="fas fa-list-check" aria-hidden="true"></i> Work on next</h4><button type="button" class="link-btn" data-target="planner-view">${data.openCount > data.assignments.length ? `All ${data.openCount}` : 'Planner'}</button></div>
                    ${data.assignments.length ? `<ul class="home-widget-list">${data.assignments.map(item => `<li><div><strong>${esc(item.title)}</strong><small>${esc(item.course)}</small></div><span class="home-widget-due ${item.tone}">${esc(item.due)}</span></li>`).join('')}</ul>`
                        : '<p class="home-widget-empty"><i class="fas fa-circle-check" aria-hidden="true"></i> Nothing to work on. Nice!</p>'}
                </div>`);
            }
            if (prefs.grades) {
                sections.push(`<div class="home-widget-section">
                    <div class="home-widget-section-head"><h4><i class="fas fa-graduation-cap" aria-hidden="true"></i> Grades</h4><button type="button" class="link-btn" data-target="gpa-view">Classes</button></div>
                    ${data.grades.length ? `<div class="home-widget-gpa"><div><b>${Number(data.gpa.weighted).toFixed(2)}</b><small>Weighted GPA</small></div><div><b>${Number(data.gpa.unweighted).toFixed(2)}</b><small>Unweighted</small></div></div>
                        <ul class="home-widget-list home-widget-grades">${data.grades.slice(0, 5).map(item => `<li><a href="#/class/${encodeURIComponent(item.code)}">${esc(item.title)}</a><span class="home-widget-grade grade-${esc(item.letter.charAt(0).toLowerCase())}">${esc(item.letter)} · ${item.percent}%</span></li>`).join('')}</ul>`
                        : '<p class="home-widget-empty">Add graded work to a class to see your grades here.</p>'}
                </div>`);
            }
            body.innerHTML = sections.length
                ? `<div class="home-widget-grid">${sections.join('')}</div>`
                : '<p class="home-widget-empty">Everything is hidden. Tap Customize to choose what this widget shows.</p>';
        }

        updateAppBadge(count) {
            if (!('setAppBadge' in navigator)) return;
            const request = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
            Promise.resolve(request).catch(() => { });
        }

        renderDailyStudyHabit() {
            const st = this.studyStreakState();
            const { today: seconds, goal } = st;
            const note = document.getElementById('daily-study-note');
            const boardTime = document.getElementById('leaderboard-today-time');
            const boardProgress = document.getElementById('leaderboard-study-progress');
            const boardNote = document.getElementById('leaderboard-goal-note');
            const hero = document.getElementById('leaderboard-streak-hero');
            const stats = document.getElementById('leaderboard-streak-stats');
            if (boardTime) boardTime.textContent = this.formatStudyDuration(seconds);
            if (boardProgress) {
                boardProgress.max = goal;
                boardProgress.value = Math.min(seconds, goal);
                boardProgress.setAttribute('aria-label', `${Math.floor(seconds / 60)} of ${Math.round(goal / 60)} study minutes completed today`);
            }
            const goalNote = seconds >= goal
                ? 'Daily goal complete. Come back tomorrow to keep your streak growing.'
                : `${Math.ceil((goal - seconds) / 60)} more minute${Math.ceil((goal - seconds) / 60) === 1 ? '' : 's'} to reach today’s ${Math.round(goal / 60)}-minute goal.`;
            if (note) note.textContent = this.studyLeaderboardError || goalNote;
            if (boardNote) boardNote.textContent = this.studyLeaderboardError || goalNote;
            if (hero) hero.innerHTML = this.streakHeroMarkup(st) + this.streakWeekMarkup(st);
            if (stats) {
                const snap = this.studyLeaderboardSnapshot || {};
                const items = [
                    ['fa-trophy', 'Best streak', `${st.best} day${st.best === 1 ? '' : 's'}`],
                    ['fa-calendar-check', 'Days goal met', snap.active_days != null ? Number(snap.active_days).toLocaleString() : '—'],
                    ['fa-hourglass-half', 'All-time study', snap.total_seconds != null ? this.formatLongDuration(snap.total_seconds) : '—']
                ];
                stats.innerHTML = items.map(([icon, label, value]) => `<div class="streak-stat"><i class="fas ${icon}" aria-hidden="true"></i><b>${this.escapeHTML(value)}</b><small>${label}</small></div>`).join('');
            }
            this.renderHomeWidget(st);
        }

        renderStudyLeaderboard() {
            const list = document.getElementById('study-leaderboard-list');
            if (!list) return;
            const snap = this.studyLeaderboardSnapshot || {};
            const board = snap.leaderboard || [];
            const friends = this.studyLeaderboardScope === 'friends';
            const top = Math.max(1, ...board.map(p => Number(p.seconds) || 0));
            const medal = ['🥇', '🥈', '🥉'];
            const fmt = seconds => this.formatLongDuration(seconds);
            const streakChip = player => Number(player.streak_days) > 0
                ? `<span class="study-leaderboard-streak" title="${Number(player.streak_days)}-day streak"><i class="fas fa-fire" aria-hidden="true"></i>${Number(player.streak_days)}</span>`
                : '';
            const row = player => {
                const rank = Number(player.rank) || 0;
                const name = `${this.escapeHTML(player.username || 'Student')} ${this.accountTagMarkup(player.username, player.tags)}`;
                const pct = Math.max(3, Math.round((Number(player.seconds) || 0) / top * 100));
                return `<li class="study-leaderboard-row${player.is_me ? ' is-self' : ''}${rank >= 1 && rank <= 3 ? ` podium-${rank}` : ''}">
                    <span class="study-leaderboard-rank">${rank >= 1 && rank <= 3 ? medal[rank - 1] : (rank || '—')}</span>
                    ${this.multiplayerAvatarMarkup(this.profileCosmetics(player), false, 'study-leaderboard-avatar')}
                    <div class="study-leaderboard-main"><strong>${player.user_id ? `<button type="button" class="link-btn study-leaderboard-name" data-action="view-profile" data-id="${this.escapeHTML(player.user_id)}">${name}</button>` : name}${player.is_me ? ' <em class="you-badge">you</em>' : ''}${streakChip(player)}</strong><span class="study-leaderboard-bar"><i style="width:${pct}%"></i></span></div>
                    <span class="study-leaderboard-time">${fmt(player.seconds)}</span>${player.user_id && !player.is_me ? `<button type="button" class="secondary-btn study-leaderboard-profile" data-action="view-profile" data-id="${this.escapeHTML(player.user_id)}" aria-label="View ${name}'s profile"><i class="fas fa-user" aria-hidden="true"></i><span> Profile</span></button>` : '<span class="study-leaderboard-profile-spacer"></span>'}</li>`;
            };
            const podium = board.length >= 3 ? `<li class="study-podium">${[1, 0, 2].map(i => {
                const p = board[i];
                const inner = `<span class="podium-medal">${medal[i]}</span>${this.multiplayerAvatarMarkup(this.profileCosmetics(p), false, 'study-leaderboard-avatar')}<b>${this.escapeHTML(p.username || 'Student')}</b>${this.accountTagMarkup(p.username, p.tags)}<small>${fmt(p.seconds)}</small><div class="podium-block"></div>`;
                return p.user_id
                    ? `<button type="button" class="podium-spot podium-spot-${i + 1}" data-action="view-profile" data-id="${this.escapeHTML(p.user_id)}" aria-label="View ${this.escapeHTML(p.username || 'Student')}'s profile">${inner}</button>`
                    : `<div class="podium-spot podium-spot-${i + 1}">${inner}</div>`;
            }).join('')}</li>` : '';
            const empty = friends
                ? '<li class="empty-state">None of your buds have studied in this period yet. Add buds from the Buds page and challenge them!</li>'
                : '<li class="empty-state">No study time logged for this period yet. Start a session to be first on the board.</li>';
            list.innerHTML = board.length ? podium + board.map(row).join('') : empty;

            const me = document.getElementById('study-leaderboard-me');
            if (me) {
                const mine = snap.me || board.find(p => p.is_me) || null;
                const myRank = Number(mine?.rank) || 0;
                const mySeconds = Number(mine?.seconds) || 0;
                const above = myRank > 1 ? board.find(p => Number(p.rank) === myRank - 1) : null;
                const gap = above ? Math.max(60, (Number(above.seconds) || 0) - mySeconds + 60) : 0;
                const participants = Number(snap.participants) || board.length;
                let text;
                if (!this.studyLeaderboardSnapshot) text = '';
                else if (!myRank) text = `You haven't studied in this period yet. Log ${Math.round((Number(snap.daily_goal_seconds) || 300) / 60)} minutes to get on the board.`;
                else if (myRank === 1) text = participants > 1 ? `You're #1 of ${participants}! Keep studying to stay ahead.` : 'You\'re #1. Invite buds to compete!';
                else text = `You're #${myRank} of ${participants} with ${fmt(mySeconds)}.${above ? ` Study about ${Math.ceil(gap / 60)} more min to pass ${above.username || 'the next student'}.` : ''}`;
                me.innerHTML = text ? `<i class="fas fa-location-crosshairs" aria-hidden="true"></i><span>${this.escapeHTML(text)}</span>` : '';
                me.classList.toggle('hidden', !text);
            }

            const label = document.getElementById('study-leaderboard-period-label');
            const periodText = { daily: 'Today', weekly: 'This week', monthly: 'This month', alltime: 'All time' }[this.studyLeaderboardPeriod] || 'Today';
            if (label) label.textContent = `${periodText} · ${friends ? 'You and your buds' : 'All StudBud students'}${this.studyLeaderboardPeriod === 'alltime' ? '' : ' · UTC'}`;
            document.querySelectorAll('[data-study-leaderboard-period]').forEach(button => {
                const selected = button.dataset.studyLeaderboardPeriod === this.studyLeaderboardPeriod;
                button.classList.toggle('selected', selected);
                button.setAttribute('aria-pressed', String(selected));
            });
            document.querySelectorAll('[data-study-leaderboard-scope]').forEach(button => {
                const selected = button.dataset.studyLeaderboardScope === (friends ? 'friends' : 'global');
                button.classList.toggle('selected', selected);
                button.setAttribute('aria-pressed', String(selected));
            });
        }

        async refreshStudyLeaderboard(period = 'daily') {
            if (!window.StudBudCloud?.user && !(window.StudBudCloud?.isGuest?.() && window.navigator?.onLine !== false)) return;
            this.studyLeaderboardPeriod = ['weekly', 'monthly', 'alltime'].includes(period) ? period : 'daily';
            const scope = this.studyLeaderboardScope === 'friends' ? 'friends' : 'global';
            const status = document.getElementById('study-leaderboard-status');
            if (status) status.textContent = 'Loading study progress…';
            const requestId = (this.studyLeaderboardRequest || 0) + 1;
            this.studyLeaderboardRequest = requestId;
            try {
                const snapshot = await window.StudBudCommunityGames.getStudyLeaderboard(this.studyLeaderboardPeriod, scope);
                if (requestId !== this.studyLeaderboardRequest) return;
                this.studyLeaderboardSnapshot = snapshot;
                this.studyLeaderboardError = '';
                if (status) status.textContent = 'Study time is recorded from flashcard reviews, solo study games, focus logs, and manual study logs.';
                this.renderStudyLeaderboard();
                this.renderDailyStudyHabit();
            } catch (error) {
                if (requestId !== this.studyLeaderboardRequest) return;
                console.error('[NexusApp] Study leaderboard could not load:', error);
                this.studyLeaderboardError = `Study progress could not load. ${this.friendlyErrorMessage(error, 'Check your connection and try again.')}`;
                if (status) status.textContent = this.studyLeaderboardError;
                this.renderStudyLeaderboard();
                this.renderDailyStudyHabit();
            }
        }

        async syncStudyTimeEntry(session, refreshBoard = true) {
            if (!session?.leaderboardSyncPending || !window.StudBudCloud?.user) return;
            const seconds = Math.min(21600, Math.max(1, Math.round(Number(session.durationSec) || 0)));
            try {
                await window.StudBudCommunityGames.recordStudyTime(session.id, seconds, session.timestamp);
                const current = AppState.state.studyHistory.find(item => item.id === session.id);
                if (!current) throw new Error('This study session was removed before its time finished syncing.');
                const synced = { ...current, leaderboardSyncPending: false, leaderboardSyncedAt: new Date().toISOString() };
                await NexusDB.put('studyHistory', synced);
                const index = AppState.state.studyHistory.findIndex(item => item.id === session.id);
                if (index >= 0) AppState.state.studyHistory[index] = synced;
                EventBus.emit('state:changed', { key: 'studyHistory', value: AppState.state.studyHistory });
                AppState.setSaveStatus('Study session synced to your daily goal and leaderboard.');
                if (refreshBoard) await this.refreshStudyLeaderboard(this.studyLeaderboardPeriod || 'daily');
            } catch (error) {
                console.error('[NexusApp] Study time could not sync:', error);
                AppState.setSaveStatus(`Your study session is saved on this device, but its leaderboard time could not sync yet. ${this.friendlyErrorMessage(error)}`, 'error');
            }
        }

        async syncPendingStudyTime() {
            if (window.StudBudCloud?.offlineMode || window.navigator?.onLine === false) return;
            if (!window.StudBudCloud?.user || !window.StudBudCommunityGames) return;
            const pending = (await NexusDB.getAll('studyHistory')).filter(session => session.leaderboardSyncPending);
            for (const session of pending) await this.syncStudyTimeEntry(session, false);
            if (pending.length) await this.refreshStudyLeaderboard(this.studyLeaderboardPeriod || 'daily');
        }

        renderFocusSprint() {
            const select = document.getElementById('focus-assignment');
            if (!select) return;
            const recommendations = this.getStudyRecommendations().slice(0, 12);
            const currentId = this.dashboardSprintAssignmentId || select.value;
            select.innerHTML = '<option value="">Choose a quiz or test</option>' + recommendations.map(item =>
                `<option value="${this.escapeHTML(item.id)}">${this.escapeHTML(item.title)} · ${this.escapeHTML(item.courseTitle)}</option>`
            ).join('');
            if (recommendations.some(item => item.id === currentId)) {
                select.value = currentId;
            } else {
                select.value = recommendations[0]?.id || '';
            }
            this.dashboardSprintAssignmentId = select.value;
            select.disabled = Boolean(this.dashboardSprintInterval);
            document.getElementById('focus-duration').disabled = Boolean(this.dashboardSprintInterval);
            const startButton = document.getElementById('focus-sprint-start-btn');
            startButton.innerHTML = this.dashboardSprintInterval ? '<i class="fas fa-pause"></i> Pause' : '<i class="fas fa-play"></i> Start';
            startButton.disabled = !select.value;
            this.updateFocusSprintDisplay();
            const status = document.getElementById('focus-sprint-status');
            if (!recommendations.length) status.innerHTML = 'Add an upcoming quiz or test to start a focused study session. <button class="text-btn" type="button" data-action="add-quiz">Add one now</button>';
            else if (!this.dashboardSprintInterval && status.querySelector('[data-action="add-quiz"]')) status.textContent = 'Pick a task, then press Start.';
        }

        updateFocusSprintDisplay() {
            const duration = Number(document.getElementById('focus-duration')?.value || 25);
            const seconds = this.dashboardSprintSeconds ?? duration * 60;
            const clock = document.getElementById('focus-sprint-clock');
            if (clock) clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        }

        toggleFocusSprint() {
            const status = document.getElementById('focus-sprint-status');
            if (this.dashboardSprintInterval) {
                clearInterval(this.dashboardSprintInterval);
                this.dashboardSprintInterval = null;
                document.getElementById('focus-assignment').disabled = false;
                document.getElementById('focus-duration').disabled = false;
                document.getElementById('focus-sprint-start-btn').innerHTML = '<i class="fas fa-play"></i> Resume';
                status.textContent = 'Paused. Resume when you are ready.';
                return;
            }
            const assignmentId = document.getElementById('focus-assignment').value;
            const assignment = (AppState.get('assignments') || []).find(item => item.id === assignmentId && item.status !== 'completed');
            if (!assignment) throw new Error('Choose an incomplete assignment before starting a focus sprint.');
            this.dashboardSprintAssignmentId = assignmentId;
            if (this.dashboardSprintSeconds === null) {
                this.dashboardSprintSeconds = Number(document.getElementById('focus-duration').value || 25) * 60;
            }
            if (this.dashboardSprintSeconds <= 0) {
                this.dashboardSprintSeconds = Number(document.getElementById('focus-duration').value || 25) * 60;
            }
            status.textContent = `Focused time for “${assignment.title}”. Silence notifications and work on one small step.`;
            document.getElementById('focus-assignment').disabled = true;
            document.getElementById('focus-duration').disabled = true;
            document.getElementById('focus-sprint-start-btn').innerHTML = '<i class="fas fa-pause"></i> Pause';
            this.dashboardSprintInterval = setInterval(() => {
                this.dashboardSprintSeconds = Math.max(0, this.dashboardSprintSeconds - 1);
                this.updateFocusSprintDisplay();
                if (this.dashboardSprintSeconds === 0) this.completeFocusSprint();
            }, 1000);
        }

        completeFocusSprint() {
            if (this.dashboardSprintInterval) clearInterval(this.dashboardSprintInterval);
            this.dashboardSprintInterval = null;
            document.getElementById('focus-assignment').disabled = false;
            document.getElementById('focus-duration').disabled = false;
            document.getElementById('focus-sprint-start-btn').innerHTML = '<i class="fas fa-play"></i> Start';
            const assignmentId = this.dashboardSprintAssignmentId;
            const status = document.getElementById('focus-sprint-status');
            status.textContent = 'Sprint complete. Log your session to update your study plan.';
            try {
                this.openStudyLog(assignmentId);
                document.getElementById('study-log-minutes').value = String(Math.max(1, Math.round(Number(document.getElementById('focus-duration').value || 25))));
                document.getElementById('study-log-notes').value = 'Completed a focused study sprint.';
            } catch (error) {
                console.error('[NexusApp] Could not open the completed focus session:', error);
                window.StudBudDialogs.notify(`Focus sprint finished, but the session could not be logged. ${this.friendlyErrorMessage(error)}`);
            }
        }

        resetFocusSprint() {
            if (this.dashboardSprintInterval) clearInterval(this.dashboardSprintInterval);
            this.dashboardSprintInterval = null;
            this.dashboardSprintSeconds = null;
            document.getElementById('focus-assignment').disabled = false;
            document.getElementById('focus-duration').disabled = false;
            document.getElementById('focus-sprint-start-btn').innerHTML = '<i class="fas fa-play"></i> Start';
            document.getElementById('focus-sprint-status').textContent = 'Timer reset. Choose a task and start when ready.';
            this.updateFocusSprintDisplay();
        }

        renderTodayStudyPlan() {
            const totalElement = document.getElementById('today-study-total');
            const classContainer = document.getElementById('today-study-by-class');
            if (!totalElement || !classContainer) return;
            const recommendations = this.getStudyRecommendations();
            const byClass = new Map();
            recommendations.forEach(item => {
                const current = byClass.get(item.courseCode) || { title: item.courseTitle, minutes: 0, items: 0 };
                current.minutes += item.sessionMinutes;
                current.items += 1;
                byClass.set(item.courseCode, current);
            });
            // Decks tagged for an upcoming quiz/test get practice time under that class.
            const upcomingIds = new Set(this.deckAssessmentOptionsIds());
            const linkedDecks = (AppState.get('flashcards') || []).filter(deck => deck.assessmentId && upcomingIds.has(String(deck.assessmentId)) && (deck.cards || []).length);
            linkedDecks.forEach(deck => {
                const link = this.deckLinkInfo(deck);
                const key = link.courseCode || `deck_${deck.id}`;
                const current = byClass.get(key) || { title: link.course?.title || deck.title, minutes: 0, items: 0 };
                current.minutes += Math.min(30, Math.max(10, Math.ceil((deck.cards || []).length / 10) * 5));
                current.items += 1;
                byClass.set(key, current);
            });
            const totalMinutes = Array.from(byClass.values()).reduce((sum, item) => sum + item.minutes, 0);
            totalElement.textContent = totalMinutes
                ? `Plan for about ${Math.floor(totalMinutes / 60)} hr ${totalMinutes % 60} min today across upcoming quizzes and tests${linkedDecks.length ? `, including ${linkedDecks.length} flashcard deck${linkedDecks.length === 1 ? '' : 's'} to practice` : ''}. Estimates use due dates, task size, and your study logs.`
                : 'Nothing to study today. Add an upcoming quiz or test to get a study time estimate.';
            classContainer.innerHTML = byClass.size ? Array.from(byClass.values()).map(item =>
                `<article class="study-progress-item"><strong>${this.escapeHTML(item.title)}</strong><span>${item.minutes} min · ${item.items} task${item.items === 1 ? '' : 's'}</span></article>`
            ).join('') : '<div class="empty-state empty-state-cta"><p>Add a quiz or test to create a study plan.</p><button class="primary-btn" type="button" data-action="add-quiz"><i class="fas fa-plus"></i> Add a quiz or test</button></div>';
        }

        setCloudChartControls() {
            const select = document.getElementById('analytics-course-select');
            if (!select) return;
            const selected = select.value || 'all';
            const courses = this.schoolSemesterCourses();
            select.innerHTML = '<option value="all">All classes</option>' + courses.map(course =>
                `<option value="${this.escapeHTML(course.code)}">${this.escapeHTML(course.title)}</option>`
            ).join('');
            select.value = selected === 'all' || courses.some(course => course.code === selected) ? selected : 'all';
        }

        renderStudyAnalytics() {
            const summary = document.getElementById('study-analytics-summary');
            const list = document.getElementById('study-analytics-decks');
            if (!summary || !list) return;
            const sessions = (AppState.get('studyHistory') || []).filter(session => Number(session.durationSec) > 0);
            const seconds = sessions.reduce((sum, session) => sum + Number(session.durationSec), 0);
            const answered = sessions.reduce((sum, session) => sum + Number(session.gameSummary?.answered || 0), 0);
            const correct = sessions.reduce((sum, session) => sum + Number(session.gameSummary?.correct || 0), 0);
            summary.innerHTML = `<article><span>Logged study time</span><strong>${this.formatStudyDuration(seconds)}</strong></article><article><span>Saved sessions</span><strong>${sessions.length}</strong></article><article><span>Game answer accuracy</span><strong>${answered ? `${(correct / answered * 100).toFixed(2)}%` : '—'}</strong><small>${answered} answers submitted</small></article>`;
            const decks = AppState.get('flashcards') || [];
            list.innerHTML = decks.length ? decks.map(deck => {
                const cards = deck.cards || [];
                const reviewed = cards.filter(card => card.lastReviewed || Number(card.reps || card.repetitions) > 0).length;
                const lapses = cards.reduce((sum, card) => sum + Number(card.lapses || 0), 0);
                return `<article><strong>${this.escapeHTML(deck.title)}</strong><span>${cards.length} cards · Study anytime</span><small>${reviewed} reviewed · ${lapses} lapses</small></article>`;
            }).join('') : '<p class="empty-state">Create a deck and log some study sessions to see your activity here.</p>';
        }

        renderGradeProgress() {
            this.renderStudyAnalytics();
            const canvas = document.getElementById('grade-progress-chart');
            if (!canvas) return;
            const summary = document.getElementById('analytics-summary');
            const courseControl = document.getElementById('analytics-course-control');
            const emptyMessage = document.getElementById('grade-progress-empty');
            if (!window.Chart) {
                document.getElementById('grade-progress-caption').textContent = 'Charts could not load. Check your internet connection and reload.';
                return;
            }
            const courses = this.schoolSemesterCourses();
            const assignments = this.semesterAssignments(AppState.get('assignments') || [], courses);
            const metric = document.getElementById('analytics-metric-select')?.value || 'class';
            const requestedCode = document.getElementById('analytics-course-select')?.value || 'all';
            const selectedCode = requestedCode === 'all' || courses.some(course => course.code === requestedCode) ? requestedCode : 'all';
            const chartType = document.getElementById('analytics-chart-type')?.value || 'line';
            const theme = window.getComputedStyle(document.body);
            const dark = document.body.classList.contains('dark-theme');
            const textColor = theme.getPropertyValue('--text-secondary').trim();
            const surfaceColor = theme.getPropertyValue('--bg-base').trim();
            const accentColor = theme.getPropertyValue('--accent-primary').trim();
            const gridColor = dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.09)';
            const caption = document.getElementById('grade-progress-caption');
            const title = document.getElementById('grade-progress-title');
            const range = document.getElementById('grade-progress-range');
            if (courseControl) courseControl.classList.toggle('hidden', metric !== 'class');
            const datedAssignments = assignments.filter(item =>
                (this.isGradedItem(item)) && (item.gradedAt || item.dueDate) &&
                (metric !== 'class' || selectedCode === 'all' || item.courseCode === selectedCode)
            );
            const dateFor = item => {
                const value = String(item.gradedAt || item.dueDate);
                return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateKey(new Date(value));
            };
            const labels = Array.from(new Set(datedAssignments.map(dateFor))).sort();
            let datasets;

            if (metric === 'class') {
                const visibleCourses = courses.filter(course => selectedCode === 'all' || course.code === selectedCode);
                datasets = visibleCourses.map(course => ({
                    label: course.title,
                    data: labels.map(date => {
                        const scored = datedAssignments.filter(item => item.courseCode === course.code && dateFor(item) <= date);
                        const grade = this.calculateCourseGrade(course, scored);
                        return Number.isFinite(grade) ? Number(grade.toFixed(2)) : null;
                    }),
                    borderColor: courses.indexOf(course) === 0 ? accentColor : `hsl(${(courses.indexOf(course) * 67 + 145) % 360} 65% ${dark ? 65 : 40}%)`,
                    spanGaps: false
                }));
                const selectedCourse = courses.find(course => course.code === selectedCode);
                title.textContent = selectedCourse ? `${selectedCourse.title} grade history` : 'Class grade history';
                caption.textContent = labels.length
                    ? 'Each point is the class grade after scores recorded by that date. Add more graded work to build the timeline.'
                    : 'Record an assignment score with a due or graded date to start the timeline.';
                const currentCourses = selectedCourse ? [selectedCourse] : courses;
                const currentGrades = currentCourses.map(course => ({
                    course,
                    grade: this.calculateSemesterCourseGrade(course)
                })).filter(item => Number.isFinite(item.grade));
                const scoredCount = assignments.filter(item =>
                    (this.isGradedItem(item)) &&
                    (!selectedCourse || item.courseCode === selectedCourse.code)
                ).length;
                if (summary) summary.innerHTML = `
                    <article><span>${selectedCourse ? 'Current class grade' : 'Classes with grades'}</span><strong>${selectedCourse ? (currentGrades[0] ? `${currentGrades[0].grade.toFixed(2)}%` : '—') : `${currentGrades.length} / ${courses.length}`}</strong></article>
                    <article><span>Scored assignments</span><strong>${scoredCount}</strong></article>
                    <article><span>${selectedCourse ? 'Grade target' : 'GPA goal'}</span><strong>${(() => {
                        if (!selectedCourse) {
                            const goal = Number((AppState.get('profile') || {}).targetGpa);
                            return goal > 0 ? goal.toFixed(2) : 'Not set';
                        }
                        const target = this.effectiveCourseTarget(selectedCourse);
                        return Number.isFinite(target) ? `${target.toFixed(2)}%` : 'Not set';
                    })()}</strong>${selectedCourse && !this.hasCourseTarget(selectedCourse) && Number.isFinite(this.effectiveCourseTarget(selectedCourse)) ? '<small>Needed for your GPA goal</small>' : ''}</article>`;
            } else {
                datasets = [{
                    label: metric === 'weighted' ? 'Weighted GPA' : 'Unweighted GPA',
                    data: labels.map(date => {
                        const coursesAtDate = courses.map(course => {
                            const scored = datedAssignments.filter(item => item.courseCode === course.code && dateFor(item) <= date);
                            const grade = this.calculateCourseGrade(course, scored);
                            return Number.isFinite(grade) ? { ...course, targetGrade: this.gradeForPercentage(grade) } : null;
                        }).filter(Boolean);
                        return Number(this.withPriorGPA(window.GPACalculator.calculateCurrentGPA(coursesAtDate))[metric]);
                    }),
                    borderColor: accentColor
                }];
                const currentGpa = this.calculateSemesterGPA(courses);
                title.textContent = metric === 'weighted' ? 'Weighted GPA history' : 'Unweighted GPA history';
                caption.textContent = labels.length
                    ? 'GPA is recalculated from class grades recorded on or before each date.'
                    : 'Record dated assignment scores to start your GPA timeline.';
                if (summary) summary.innerHTML = `
                    <article><span>Current ${metric} GPA</span><strong>${Number(currentGpa[metric]).toFixed(2)}</strong></article>
                    <article><span>Classes tracked</span><strong>${courses.length}</strong></article>
                    <article><span>Scored assignments</span><strong>${assignments.filter(item => this.isGradedItem(item)).length}</strong></article>`;
            }

            const hasHistory = labels.length > 0 && datasets.some(dataset => dataset.data.some(value => Number.isFinite(value)));
            datasets.forEach(dataset => {
                const color = dataset.borderColor;
                Object.assign(dataset, {
                    backgroundColor: chartType === 'area' ? context => {
                        const { ctx, chartArea } = context.chart;
                        if (!chartArea) return 'transparent';
                        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, `color-mix(in srgb, ${color} 24%, transparent)`);
                        gradient.addColorStop(1, `color-mix(in srgb, ${color} 1%, transparent)`);
                        return gradient;
                    } : color,
                    borderWidth: chartType === 'bar' ? 0 : 2.5,
                    borderRadius: 6,
                    maxBarThickness: 28,
                    tension: .2,
                    cubicInterpolationMode: 'monotone',
                    fill: chartType === 'area',
                    pointRadius: labels.length > 24 ? 0 : 3,
                    pointHoverRadius: 6,
                    pointHitRadius: 12,
                    pointBackgroundColor: surfaceColor,
                    pointBorderColor: color,
                    pointBorderWidth: 2
                });
            });
            if (emptyMessage) emptyMessage.classList.toggle('hidden', hasHistory);
            canvas.parentElement.classList.toggle('hidden', !hasHistory);
            canvas.setAttribute('aria-label', `${title.textContent}. ${caption.textContent}`);
            if (range) range.textContent = labels.length ? `${new Date(`${labels[0]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} – ${new Date(`${labels[labels.length - 1]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : '';
            if (this.gradeProgressChart) this.gradeProgressChart.destroy();
            this.gradeProgressChart = null;
            if (!hasHistory) return;
            // Line/area charts zoom to the range the grades actually cover (e.g. 85-100%) instead of 0-100.
            const plotted = datasets.flatMap(dataset => dataset.data).filter(value => Number.isFinite(value));
            let yMin = metric === 'class' ? 0 : 0;
            let yMax = metric === 'class' ? 100 : 5;
            if (chartType !== 'bar' && plotted.length) {
                const low = Math.min(...plotted);
                const high = Math.max(...plotted);
                const unit = metric === 'class' ? 1 : 0.1;
                const pad = Math.max(metric === 'class' ? 1.5 : 0.08, (high - low) * 0.12);
                yMin = Math.max(0, Math.floor((low - pad) / unit) * unit);
                yMax = Math.ceil((high + pad) / unit) * unit;
                if (metric === 'class' && high <= 100) yMax = Math.min(100, yMax);
                if (yMax - yMin < unit * 4) yMax = yMin + unit * 4;
                yMin = Number(yMin.toFixed(2));
                yMax = Number(yMax.toFixed(2));
                datasets.forEach(dataset => { dataset.clip = 8; });
            }
            const yTick = value => metric === 'class' ? `${Number.isInteger(value) ? value : Number(value).toFixed(1)}%` : Number(value).toFixed(2);
            this.gradeProgressChart = new window.Chart(canvas, {
                type: chartType === 'area' ? 'line' : chartType,
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    color: textColor,
                    animation: { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250 },
                    layout: { padding: { top: 8, right: 8 } },
                    interaction: { intersect: false, mode: 'index' },
                    plugins: {
                        legend: {
                            display: datasets.length > 1,
                            position: 'bottom',
                            align: 'start',
                            labels: { color: textColor, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 18, font: { family: 'system-ui', size: 12 } }
                        },
                        tooltip: {
                            backgroundColor: surfaceColor,
                            titleColor: theme.getPropertyValue('--text-primary').trim(),
                            bodyColor: textColor,
                            borderColor: gridColor,
                            borderWidth: 1,
                            cornerRadius: 10,
                            padding: 12,
                            boxPadding: 5,
                            usePointStyle: true,
                            titleFont: { family: 'system-ui', size: 13, weight: '600' },
                            bodyFont: { family: 'system-ui', size: 12 },
                            callbacks: {
                                title: items => items.length ? new Date(`${items[0].label}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '',
                                label: context => `${context.dataset.label}: ${metric === 'class' ? `${Number(context.parsed.y).toFixed(2)}%` : Number(context.parsed.y).toFixed(2)}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            border: { display: false },
                            grid: { display: false },
                            ticks: {
                                color: textColor, maxTicksLimit: 6, maxRotation: 0, padding: 10, font: { family: 'system-ui', size: 11 },
                                callback: value => new Date(`${labels[value]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                            }
                        },
                        y: {
                            beginAtZero: false,
                            min: yMin,
                            max: yMax,
                            border: { display: false },
                            grid: { color: gridColor, drawTicks: false },
                            title: { display: false },
                            ticks: { color: textColor, maxTicksLimit: 6, padding: 12, font: { family: 'system-ui', size: 11 }, callback: yTick }
                        }
                    }
                }
            });
        }

        isCardDue(card, now = Date.now()) {
            if (!card.nextReviewDate) return true;
            const dueAt = new Date(card.nextReviewDate).getTime();
            return !Number.isFinite(dueAt) || dueAt <= now;
        }

        bindFlashcardInteraction() {
            const card = document.getElementById('current-flashcard');
            if (!card) return;
            card.addEventListener('pointerdown', event => {
                if (event.isPrimary === false) {
                    if (this.flashcardPointer) this.flashcardPointer.moved = true;
                    return;
                }
                this.flashcardPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: event.button !== 0 };
            });
            const track = event => {
                const pointer = this.flashcardPointer;
                if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) pointer.moved = true;
            };
            document.addEventListener('pointermove', track, { passive: true });
            document.addEventListener('pointerup', track, { passive: true });
            document.addEventListener('pointercancel', event => {
                if (this.flashcardPointer?.id === event.pointerId) this.flashcardPointer.moved = true;
            });
        }

        stopSettingsAudioPreview() {
            clearTimeout(this.musicPreviewTimer);
            for (const timer of this.sfxPreviewTimers || []) clearTimeout(timer);
            this.sfxPreviewTimers = [];
            const sfx = window.StudBudSfx;
            if (this.settingsPreviewMusic && sfx?.mus === this.settingsPreviewMusic && !sfx.mus.mode) sfx.stopMusic();
            this.settingsPreviewMusic = null;
        }

        async handleClick(event) {
            if (!event.target.closest('.course-autocomplete')) this.hideCourseSuggestions();
            if (event.target.closest('#current-flashcard')) {
                if (event.detail > 1 || (event.detail !== 0 && this.flashcardPointer?.moved)) return;
                this.revealCard();
                return;
            }
            const target = event.target.closest('button, .nav-item[data-target]');
            if (!target) return;

            if (target.dataset.scoreInput) {
                this.adjustAssignmentScore(document.getElementById(target.dataset.scoreInput), Number(target.dataset.scoreDelta));
                return;
            }
            if (target.matches('[data-scenario-score-preset]')) {
                const form = document.getElementById('grade-scenario-assignment-form');
                const maxPoints = Number(form?.elements.maxPoints.value);
                if (!Number.isFinite(maxPoints) || maxPoints <= 0) return;
                form.elements.pointsEarned.value = (maxPoints * Number(target.dataset.scenarioScorePreset) / 100).toFixed(2).replace(/\.00$/, '');
                this.updateScenarioScorePreview();
                return;
            }

            if (target.matches('[data-target]')) {
                event.preventDefault();
                Router.navigate(target.dataset.target.replace(/-view$/, ''));
                return;
            }

            if (target.id === 'ambience-toggle') {
                const panel = document.getElementById('ambience-panel');
                const open = panel.classList.toggle('hidden') === false;
                target.setAttribute('aria-expanded', String(open));
                return;
            }

            const id = target.id;
            const action = target.dataset.action;
            try {
                if (action === 'open-singleplayer') {
                    Router.navigate('multiplayer');
                    this.setMultiplayerScreen('solo');
                } else if (action === 'recommended-reward') {
                    const input = document.getElementById(target.dataset.id);
                    const slider = document.querySelector(`[data-reward-slider="${target.dataset.id}"]`);
                    const { suggested } = this.questionRewardRecommendation(this.selectedMultiplayerMode || 'skyline');
                    input.value = suggested;
                    slider.value = suggested;
                    delete input.dataset.custom;
                    this.updateQuestionRewardGuidance();
                } else if (target.matches('.multiplayer-mode[data-mode]')) {
                    this.selectedMultiplayerMode = target.dataset.mode;
                    document.getElementById('host-game-mode').value = this.selectedMultiplayerMode;
                    this.livePreviews?.delete(document.getElementById('multiplayer-game-canvas'));
                    this.updateMultiplayerModeSetup(this.selectedMultiplayerMode);
                    document.querySelectorAll('.multiplayer-mode').forEach(button =>
                        button.classList.toggle('selected', button === target)
                    );
                } else if (target.matches('[data-multiplayer-tab]')) {
                    this.setMultiplayerScreen(target.dataset.multiplayerTab);
                } else if (id === 'waiting-practice-btn') {
                    this.startPractice();
                } else if (action === 'toggle-solo-settings') {
                    this.setMultiplayerScreen('solo');
                    document.getElementById('solo-game-settings')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
                } else if (action === 'start-solo-game') {
                    const form = document.getElementById('solo-game-settings');
                    const status = document.getElementById('solo-game-status');
                    const mode = this.selectedMultiplayerMode || 'skyline';
                    try {
                        if (form && !form.reportValidity()) return;
                        const minutes = Number(form?.elements.timeLimit?.value) || 0;
                        const bots = Number(form?.elements.botCount?.value);
                        this.startPractice(mode, {
                            deckId: form?.elements.deckId?.value || undefined,
                            timeLimitSeconds: form?.elements.unlimited?.checked ? 0 : minutes * 60,
                            botCount: Number.isInteger(bots) ? bots : 3,
                            questionReward: mode === 'chess' ? 1 : this.questionRewardValue(form.elements.questionReward.value)
                        });
                        if (status) status.textContent = '';
                    } catch (error) {
                        if (status) status.textContent = `Could not start the game. ${this.friendlyErrorMessage(error)}`;
                        else throw error;
                    }
                } else if (target.matches('[data-study-leaderboard-period]')) {
                    this.studyLeaderboardPeriod = target.dataset.studyLeaderboardPeriod;
                    await this.refreshStudyLeaderboard(this.studyLeaderboardPeriod);
                } else if (target.matches('[data-study-leaderboard-scope]')) {
                    this.studyLeaderboardScope = target.dataset.studyLeaderboardScope === 'friends' ? 'friends' : 'global';
                    await this.refreshStudyLeaderboard(this.studyLeaderboardPeriod);
                } else if (action === 'toggle-home-widget-settings') {
                    const panel = document.getElementById('home-widget-settings');
                    const open = panel?.classList.toggle('hidden') === false;
                    target.setAttribute('aria-expanded', String(open));
                } else if (action === 'dismiss-site-notice') {
                    await this.dismissSiteNotice();
                } else if (action === 'copy-hosted-room-code') {
                    await this.copyHostedRoomCode();
                } else if (action === 'study-leaderboard-retry') {
                    await this.refreshStudyLeaderboard(this.studyLeaderboardPeriod);
                } else if (target.matches('[data-admin-tab]')) {
                    this.adminTab = target.dataset.adminTab;
                    document.querySelectorAll('[data-admin-tab]').forEach(button => button.classList.toggle('selected', button === target));
                    await this.loadAdminList();
                } else if (target.matches('[data-admin-action]')) {
                    await this.runAdminAction(target.dataset.adminAction, target.dataset);
                } else if (action === 'claim-daily-reward') {
                    await this.claimDailyReward();
                } else if (action === 'guest-create-account') {
                    await window.StudBudCloud?.connectOnline?.('signup');
                } else if (action === 'guest-color') {
                    this.setGuestColor(target.dataset.color);
                } else if (action === 'multiplayer-buy' || action === 'multiplayer-equip') {
                    if (action === 'multiplayer-equip' && target.closest('.unbox-overlay')) this.closeUnboxing();
                    await this.updateMultiplayerShop(action, target.dataset.id);
                } else if (action === 'multiplayer-unequip') {
                    await this.updateMultiplayerShop(action, target.dataset.slot);
                } else if (action === 'multiplayer-mystery') {
                    await this.updateMultiplayerShop(action, target.dataset.id || 'basic', target.dataset.seasonMonth);
                } else if (target.matches('[data-shop-tab]')) {
                    this.shopTab = target.dataset.shopTab;
                    if (this.multiplayerProfile) this.renderMultiplayerShop(this.multiplayerProfile);
                } else if (target.matches('[data-inventory-tab]')) {
                    this.inventoryTab = target.dataset.inventoryTab;
                    if (this.multiplayerProfile) this.renderInventory(this.multiplayerProfile);
                } else if (action === 'unbox-shake') {
                    this.shakeUnboxing();
                } else if (action === 'box-contents-close') {
                    const details = target.closest('.box-odds');
                    if (details) {
                        details.open = false;
                        details.querySelector('summary')?.focus();
                    }
                } else if (action === 'unbox-skip') {
                    if (this.unboxState) { this.unboxState.skipped = true; this.unboxState.releaseSeals?.(); clearTimeout(this.unboxState.timer); this.unboxState.resolve?.(); }
                } else if (action === 'unbox-close') {
                    this.closeUnboxing();
                } else if (action === 'hosted-kick-player') {
                    this.hostedGameRoom = await window.StudBudCommunityGames.kickPlayer(
                        this.hostedGameRoom.room_code, target.dataset.id
                    );
                    this.renderHostedGameRoom(this.hostedGameRoom);
                } else if (id === 'waiting-runner-start') {
                    this.startWaitingRunner();
                } else if (action === 'select-course') {
                    this.selectCatalogCourse(target.dataset.id);
                } else if (id === 'focus-sprint-start-btn') {
                    this.toggleFocusSprint();
                } else if (id === 'focus-sprint-reset-btn') {
                    this.resetFocusSprint();
                } else if (id === 'focus-assignment') {
                    this.dashboardSprintAssignmentId = target.value;
                } else if (id === 'sfx-test-btn') {
                    for (const timer of this.sfxPreviewTimers || []) clearTimeout(timer);
                    this.sfxPreviewTimers = ['success', 'jump', 'shoot', 'coin'].map((name, i) => setTimeout(() => window.StudBudSfx.play(name, 'ui', 0), i * 260));
                } else if (id === 'music-preview-btn') {
                    const sfx = window.StudBudSfx;
                    clearTimeout(this.musicPreviewTimer);
                    if (sfx.mus) { sfx.stopMusic(); } else {
                        sfx.startMusic(sfx.settings.musicStyle === 'auto' ? 'summit' : sfx.settings.musicStyle, true);
                        const previewMusic = sfx.mus;
                        this.settingsPreviewMusic = previewMusic;
                        this.musicPreviewTimer = setTimeout(() => {
                            if (sfx.mus === previewMusic && !sfx.mus?.mode) this.stopSettingsAudioPreview();
                        }, 12000);
                    }
                } else if (target.matches('.audio-btn[data-audio]')) {
                    this.toggleSoundscape(target);
                } else if (id === 'sidebar-collapse-btn') {
                    const settings = { ...AppState.get('settings'), sidebarCollapsed: !AppState.get('settings').sidebarCollapsed };
                    AppState.set('settings', settings);
                    this.applyAppearance();
                } else if (id === 'new-grade-scenario-btn') {
                    const nameInput = document.getElementById('grade-scenario-name');
                    this.creatingGradeScenario = true;
                    nameInput.value = '';
                    nameInput.focus();
                } else if (id === 'create-grade-scenario-btn') {
                    const nameInput = document.getElementById('grade-scenario-name');
                    const name = nameInput.value.trim();
                    if (!name) {
                        window.StudBudDialogs.notify('Enter a name for this grade scenario.');
                        nameInput.focus();
                        return;
                    }
                    this.creatingGradeScenario = false;
                    const scenarios = AppState.get('gradeScenarios') || [];
                    const scenario = { id: `scenario_${Date.now()}`, name, items: [] };
                    AppState.state.selectedGradeScenarioId = scenario.id;
                    this.saveGradeScenarioItems([...scenarios, scenario]);
                } else if (id === 'delete-grade-scenario-btn') {
                    const scenarios = AppState.get('gradeScenarios') || [];
                    const selectedId = AppState.get('selectedGradeScenarioId');
                    const remaining = scenarios.filter(item => item.id !== selectedId);
                    AppState.state.selectedGradeScenarioId = remaining[0]?.id || null;
                    this.saveGradeScenarioItems(remaining);
                } else if (action === 'reset-scenario-override') {
                    this.setScenarioOverride(target.dataset.id, '');
                } else if (action === 'remove-scenario-item') {
                    const scenarios = (AppState.get('gradeScenarios') || []).map(item =>
                        item.id === AppState.get('selectedGradeScenarioId')
                            ? { ...item, items: (item.items || []).filter(entry => entry.id !== target.dataset.id) }
                            : item
                    );
                    this.saveGradeScenarioItems(scenarios);
                } else if (id === 'theme-toggle') {
                    const settings = { ...AppState.get('settings'), theme: document.body.classList.contains('dark-theme') ? 'light' : 'dark' };
                    AppState.set('settings', settings);
                    this.applyAppearance();
                } else if (target.matches('.scheme-option[data-color-scheme]')) {
                    const scheme = target.dataset.colorScheme;
                    const shopItem = target.dataset.shopItem;
                    if (shopItem) {
                        if (!await this.updateMultiplayerShop('multiplayer-equip', shopItem)) return;
                    } else if (this.multiplayerProfile?.equipped_palette) {
                        if (!await this.updateMultiplayerShop('multiplayer-unequip', 'palette')) return;
                    }
                    AppState.set('settings', { ...AppState.get('settings'), colorScheme: scheme, schemePicked: true });
                    this.applyAppearance();
                } else if (action === 'add-quiz') {
                    this.openAssignmentForm(null, '', '', '', 'quiz');
                } else if (action === 'friend-accept' || action === 'friend-decline' || action === 'friend-remove') {
                    await this.friendAction(action, target.dataset.id, target.dataset.name);
                } else if (action === 'assignment-status-filter') {
                    const filter = document.getElementById('assignment-status-filter');
                    if (filter) filter.value = filter.value === target.dataset.status ? 'all' : target.dataset.status;
                    this.renderAssignments();
                } else if (action === 'report-content') {
                    this.openReportDialog(target.dataset.reportType, target.dataset.id, target.dataset.name);
                } else if (action === 'view-profile') {
                    await this.openUserProfile(target.dataset.id);
                } else if (action === 'view-my-profile') {
                    Router.navigate('profile');
                } else if (action === 'preview-public-profile') {
                    const myId = window.StudBudCloud?.user?.id;
                    if (myId && !window.StudBudCloud?.isGuest?.()) await this.openUserProfile(myId);
                    else window.StudBudDialogs.notify('Create a free account to get a public profile.');
                } else if (action === 'edit-public-profile' || action === 'open-my-shop') {
                    document.getElementById('user-profile-overlay')?.classList.add('hidden');
                    Router.navigate(action === 'open-my-shop' ? 'shop' : 'profile');
                    if (action === 'edit-public-profile') {
                        setTimeout(() => {
                            const card = document.getElementById('public-profile-card');
                            card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            card?.querySelector('input, textarea, select')?.focus({ preventScroll: true });
                        }, 300);
                    }
                } else if (action === 'friend-join-game') {
                    await this.joinFriendGame(target.dataset.code);
                } else if (action === 'friend-view') {
                    await this.showFriendProfile(target.dataset.id);
                } else if (action === 'friend-profile-close') {
                    const panel = document.getElementById('friend-profile');
                    if (panel) { panel.classList.add('hidden'); panel.innerHTML = ''; }
                } else if (action === 'start-tutorial') {
                    this.startTutorial();
                } else if (action === 'dismiss-tutorial') {
                    this.finishTutorial();
                } else if (action === 'log-study') {
                    this.openStudyLog(target.dataset.id);
                } else if (action === 'publish-community-deck') {
                    await this.publishCommunityDeck(target.dataset.id);
                } else if (action === 'unpublish-community-deck') {
                    await this.unpublishCommunityDeck(target.dataset.id);
                } else if (action === 'import-community-deck') {
                    await this.importCommunityDeck(target.dataset.id);
                } else if (id === 'hosted-start-btn') {
                    this.hostedGameRoom = await window.StudBudCommunityGames.startRoom(this.hostedGameRoom.room_code);
                    this.renderHostedGameRoom(this.hostedGameRoom);
                } else if (id === 'hosted-finish-btn') {
                    this.hostedGameRoom = await window.StudBudCommunityGames.finishRoom(this.hostedGameRoom.room_code);
                    this.renderHostedGameRoom(this.hostedGameRoom);
                } else if (id === 'hosted-leave-btn') {
                    await this.leaveHostedGame();
                } else if (id === 'hosted-room-copy-btn') {
                    await this.copyHostedRoomCode();
                } else if (id === 'quick-add-task-btn') {
                    this.openAssignmentForm();
                } else if (id === 'save-add-another-assignment-btn') {
                    this.saveAssignmentAndContinue();
                } else if (action === 'add-assignment-to-category') {
                    this.openAssignmentForm(null, target.dataset.course, '', target.dataset.category || '');
                } else if (id === 'add-course-btn') {
                    this.openCourseForm();
                } else if (id === 'create-deck-btn') {
                    this.openDeckEditor();
                } else if (id === 'open-target-gpa-btn') {
                    this.openModal('target-gpa-modal');
                    const desired = document.getElementById('desired-gpa');
                    const goal = Number((AppState.get('profile') || {}).targetGpa);
                    if (desired && !desired.value && Number.isFinite(goal) && goal > 0) desired.value = String(goal);
                } else if (id === 'run-gpa-solver-btn') {
                    this.solveTargetGPA();
                } else if (id === 'drawer-toggle-btn' || id === 'mobile-mixer-toggle-btn' || id === 'close-drawer-btn') {
                    const drawer = document.getElementById('sound-drawer');
                    if (drawer) drawer.classList.toggle('collapsed');
                    this.syncMixerDrawer();
                } else if (target.matches('.focus-play-btn')) {
                    this.toggleFocusTimer();
                } else if (id === 'exit-study-btn') {
                    this.closeStudy();
                } else if (id === 'back-to-classes-btn') {
                    Router.navigate('gpa');
                } else if (id === 'class-add-assignment-btn') {
                    this.openAssignmentForm(null, Router.selectedClassCode);
                } else if (id === 'calendar-prev-btn') {
                    this.changeCalendarMonth(-1);
                } else if (id === 'calendar-next-btn') {
                    this.changeCalendarMonth(1);
                } else if (id === 'calendar-today-btn') {
                    this.calendarDate = new Date();
                    this.selectedCalendarDate = localDateKey(new Date());
                    this.renderCalendar();
                } else if (id === 'calendar-add-event-btn') {
                    this.openCalendarEvent();
                } else if (id === 'calendar-add-assignment-btn') {
                    this.openAssignmentForm(null, '', this.selectedCalendarDate);
                } else if (id === 'calendar-add-assessment-btn') {
                    this.openAssignmentForm(null, '', this.selectedCalendarDate, '', 'quiz');
                } else if (action === 'edit-calendar-event') {
                    this.openCalendarEvent(target.dataset.id);
                } else if (id === 'delete-calendar-event-btn') {
                    const eventId = document.getElementById('calendar-event-id').value;
                    const events = AppState.get('calendarEvents') || [];
                    if (!events.some(item => item.id === eventId)) throw new Error('This event no longer exists.');
                    if (await window.StudBudDialogs.confirm('Delete this calendar event?')) {
                        this.saveCalendarEvents(events.filter(item => item.id !== eventId));
                        this.closeModal();
                    }
                } else if (id === 'study-star-btn') {
                    await this.toggleStudyStar();
                } else if (id === 'reveal-card-btn') {
                    this.revealCard();
                } else if (target.matches('.sm2-btn[data-q]')) {
                    await this.rateCurrentCard(Number(target.dataset.q));
                } else if (id === 'save-profile-btn') {
                    await this.saveProfile();
                } else if (id === 'save-grade-scale-btn') {
                    await this.saveOtherGradeScale();
                } else if (target.matches('.open-ic-import-btn')) {
                    this.openInfiniteCampusImport();
                } else if (id === 'ic-open-campus-btn') {
                    this.openInfiniteCampusSite();
                } else if (id === 'ic-copy-script-btn') {
                    await this.copyInfiniteCampusScript();
                } else if (id === 'ic-copy-bookmarklet-btn') {
                    await this.copyInfiniteCampusBookmarklet();
                } else if (id === 'ic-paste-clipboard-btn') {
                    await this.pasteInfiniteCampusFromClipboard();
                } else if (id === 'ic-restart-btn') {
                    this.restartInfiniteCampusImport();
                } else if (id === 'ic-preview-btn') {
                    await this.previewInfiniteCampusFromInput();
                } else if (id === 'ic-apply-import-btn') {
                    this.applyInfiniteCampusImport();
                } else if (id === 'remove-ic-schedule-btn') {
                    this.removeImportedSchedule();
                } else if (id === 'factory-reset-btn') {
                    await this.factoryReset();
                } else if (id === 'change-username-btn') {
                    await this.submitUsernameChange(document.getElementById('settings-username').value, document.getElementById('username-status'));
                } else if (id === 'save-public-profile-btn') {
                    await this.savePublicProfile();
                } else if (id === 'process-import-btn') {
                    this.processFlashcardImport();
                } else if (target.dataset.importerMode) {
                    this.setImporterMode(target.dataset.importerMode);
                } else if (id === 'add-manual-card-btn') {
                    this.addManualCardRow(true);
                } else if (id === 'create-manual-deck-btn') {
                    this.createManualDeck();
                } else if (action === 'remove-manual-card') {
                    target.closest('.manual-card-row')?.remove();
                    if (!document.querySelector('#manual-card-rows .manual-card-row')) this.addManualCardRow(false);
                    this.renumberManualCards();
                } else if (id === 'exit-arcade-btn') {
                    this.closeArcade();
                } else if (target.matches('.play-game-btn')) {
                    this.startArcade(target.dataset.game);
                } else if (action === 'select-calendar-day') {
                    this.selectedCalendarDate = target.dataset.date;
                    this.renderCalendar();
                } else if (action === 'arcade-answer') {
                    await this.answerArcade(Number(target.dataset.index));
                } else if (action === 'arcade-next') {
                    this.renderArcadeQuestion();
                } else if (action === 'arcade-exit') {
                    this.closeArcade();
                } else if (action === 'practice-retry-missed') {
                    this.retryMissedPracticeCards();
                } else if (action === 'arcade-restart') {
                    if (document.getElementById('arcade-game-title').textContent.includes('Memory')) {
                        this.prepareMemoryGame();
                        return;
                    }
                    if (document.getElementById('arcade-game-title').textContent.includes('Practice Test')) {
                        this.showPracticeTestSetup();
                        return;
                    }
                    // Restarting through startArcade also restarts the lightning timer and reshuffles the queue.
                    this.finishArcadeStudySession();
                    this.startArcade(this.arcadeMode);
                } else if (action === 'memory-pick') {
                    this.pickMemoryCard(Number(target.dataset.index));
                } else if (target.matches('.close-modal-btn, .cancel-modal-btn')) {
                    this.closeModal();
                } else if (action) {
                    await this.handleDataAction(action, target.dataset.id);
                }
            } catch (error) {
                console.error('[NexusApp] Button action failed:', error);
                const message = `That action could not be completed. ${this.friendlyErrorMessage(error)}`;
                if (['multiplayer-buy', 'multiplayer-equip', 'multiplayer-unequip', 'multiplayer-mystery'].includes(action)
                    || target.matches('.scheme-option[data-shop-item]')) {
                    const status = document.getElementById('multiplayer-shop-status');
                    if (status) status.textContent = message;
                    this.showLobbyToast(message);
                } else window.StudBudDialogs.notify(message);
            }
        }

        handleKeydown(event) {
            if (document.body.classList.contains('mpg-active')) return;
            if (document.getElementById('arcade-game-content')?.offsetParent) this.handleArcadeKey(event);
            if (event.defaultPrevented) return;
            if (['assignment-points', 'assignment-max-points'].includes(event.target.id) && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault();
                this.adjustAssignmentScore(event.target, event.key === 'ArrowUp' ? 1 : -1);
                return;
            }
            const modalOverlay = document.getElementById('modal-container');
            const modalActive = modalOverlay && !modalOverlay.classList.contains('hidden');
            if (modalActive) {
                const modal = modalOverlay.querySelector('.modal-content:not(.hidden)');
                if (event.key === 'Tab') {
                    const targets = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary')]
                        .filter(element => element.offsetWidth && element.offsetHeight);
                    const index = targets.indexOf(document.activeElement);
                    const next = index < 0 ? event.shiftKey ? targets.length - 1 : 0
                        : (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
                    targets[next]?.focus();
                    event.preventDefault();
                    return;
                }
                if (event.key === 'Escape' && (event.target.id !== 'course-search'
                    || document.getElementById('course-suggestions').classList.contains('hidden'))) {
                    event.preventDefault();
                    this.closeModal();
                    return;
                }
            }
            if (Router.activeRoute === 'multiplayer'
                && !modalActive
                && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
                && !document.getElementById('waiting-arcade-card').classList.contains('hidden')) {
                const moves = { ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], Space: [0, 1] };
                if (moves[event.code] && !(event.target.tagName === 'BUTTON' && event.code === 'Space')) {
                    event.preventDefault();
                    document.getElementById('waiting-runner-canvas')?.focus({ preventScroll: true });
                    this.waitingHop(...moves[event.code]); return;
                }
            }
            if (event.target.id === 'course-search') {
                const list = document.getElementById('course-suggestions');
                const options = Array.from(list.querySelectorAll('[role="option"]'));
                if (event.key === 'ArrowDown' && options.length) {
                    event.preventDefault();
                    this.courseSuggestionIndex = Math.min((this.courseSuggestionIndex ?? -1) + 1, options.length - 1);
                    this.highlightCourseSuggestion(options);
                    return;
                }
                if (event.key === 'ArrowUp' && options.length) {
                    event.preventDefault();
                    this.courseSuggestionIndex = Math.max((this.courseSuggestionIndex ?? options.length) - 1, 0);
                    this.highlightCourseSuggestion(options);
                    return;
                }
                if (event.key === 'Enter' && !list.classList.contains('hidden') && options.length) {
                    event.preventDefault();
                    const index = Math.max(this.courseSuggestionIndex ?? 0, 0);
                    this.selectCatalogCourse(options[index].dataset.id);
                    return;
                }
                if (event.key === 'Escape' && !list.classList.contains('hidden')) {
                    event.preventDefault();
                    this.hideCourseSuggestions();
                    return;
                }
            }
            const navItem = event.target.closest('.nav-item[data-target]');
            const studyArea = document.getElementById('active-study-area');
            const studying = Router.activeRoute === 'flashcard' && !modalActive && studyArea && !studyArea.classList.contains('hidden')
                && !event.target.closest('input, textarea, select, summary, label') && !event.ctrlKey && !event.metaKey && !event.altKey;
            // Space only ever flips the card: never "click" a focused rating/star button, even mid-rating.
            if (studying && (event.key === ' ' || event.code === 'Space')) {
                event.preventDefault();
                if (!event.repeat && !this.studyKeyBusy) this.revealCard();
                return;
            }
            if (studying && !this.studyKeyBusy) {
                const revealed = !document.getElementById('sm2-controls').classList.contains('hidden');
                const onButton = Boolean(event.target.closest('button'));
                if (!onButton && event.key === 'Enter' && !revealed) {
                    event.preventDefault();
                    this.revealCard();
                    return;
                }
                if (event.key === 's' || event.key === 'S') {
                    event.preventDefault();
                    this.toggleStudyStar().catch(error => console.error('[NexusApp] Star failed:', error));
                    return;
                }
                if ((event.key === 't' || event.key === 'T') && !revealed) {
                    const toggle = document.getElementById('study-type-toggle');
                    event.preventDefault();
                    toggle.checked = !toggle.checked;
                    toggle.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                }
                const quality = { 1: 1, 2: 3, 3: 4, 4: 5 }[event.key];
                if (revealed && quality) {
                    event.preventDefault();
                    this.studyKeyBusy = true;
                    this.rateCurrentCard(quality).catch(error => {
                        console.error('[NexusApp] Card rating failed:', error);
                        AppState.setSaveStatus(`Your card rating could not be saved. ${this.friendlyErrorMessage(error)}`, 'error');
                        window.StudBudDialogs.notify('Your rating was not saved. Keep this card open and retry.');
                    }).finally(() => { this.studyKeyBusy = false; });
                    return;
                }
            }
            if (navItem && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                navItem.click();
                return;
            }
            if (event.key === 'Escape') {
                const overlay = document.getElementById('modal-container');
                if (overlay && !overlay.classList.contains('hidden')) this.closeModal();
            }
        }

        async handleSubmit(event) {
            const form = event.target;
            if (form.id === 'admin-notice-form') {
                event.preventDefault();
                await this.runAdminAction('publish-notice', {});
                return;
            }
            if (form.id === 'friend-add-form') {
                event.preventDefault();
                await this.sendFriendRequest(document.getElementById('friend-username'));
                return;
            }
            if (form.id === 'admin-search-form') {
                event.preventDefault();
                await this.loadAdminList();
                return;
            }
            if (form.id === 'study-type-form') {
                event.preventDefault();
                this.checkTypedAnswer();
                return;
            }
            if (form.id === 'deck-quick-add-form') {
                event.preventDefault();
                this.quickAddEditorCard();
                return;
            }
            if (form.id === 'community-deck-search-form') {
                event.preventDefault();
                await this.searchCommunityDecks(document.getElementById('community-deck-query').value);
                return;
            }
            if (form.id === 'solo-game-settings') {
                event.preventDefault();
                form.querySelector('[data-action="start-solo-game"]')?.click();
                return;
            }
            if (form.id === 'practice-multiplayer-form') {
                event.preventDefault();
                const status = document.getElementById('practice-multiplayer-status');
                const submit = form.querySelector('button[type="submit"]');
                if (form.dataset.starting === 'true') return;
                form.dataset.starting = 'true';
                if (submit) submit.disabled = true;
                status.textContent = 'Starting game…';
                try {
                    this.startMultiplayerPractice();
                    status.textContent = 'Singleplayer game started.';
                } catch (error) {
                    console.error('[NexusApp] Singleplayer game could not start:', error);
                    status.textContent = `Could not start the game. ${this.friendlyErrorMessage(error)}`;
                } finally {
                    delete form.dataset.starting;
                    if (submit) submit.disabled = false;
                }
                return;
            }
            if (form.id === 'host-game-form' || form.id === 'join-game-form') {
                event.preventDefault();
                if (form.dataset.connecting === 'true') return;
                form.dataset.connecting = 'true';
                const submit = form.querySelector('button[type="submit"]');
                if (submit) submit.disabled = true;
                const message = document.getElementById('hosted-game-message');
                message.textContent = 'Connecting to the game room…';
                try {
                    if (form.id === 'host-game-form') await this.hostGame(form);
                    else await this.joinGame(form);
                } catch (error) {
                    console.error(`[NexusApp] ${form.id} failed:`, error);
                    const action = form.id === 'host-game-form' ? 'create the room' : 'join the room';
                    message.textContent = `Could not ${action}. ${this.friendlyErrorMessage(error, 'Check your connection and try again.')}`;
                } finally {
                    delete form.dataset.connecting;
                    if (submit) submit.disabled = false;
                }
                return;
            }
            if (form.id === 'practice-test-config-form') {
                event.preventDefault();
                try {
                    this.beginPracticeTest(form);
                } catch (error) {
                    console.error('[NexusApp] Practice test could not start:', error);
                    window.StudBudDialogs.notify(`The practice test could not start. ${this.friendlyErrorMessage(error)}`);
                }
                return;
            }
            if (form.id === 'practice-test-answer-form') {
                event.preventDefault();
                try {
                    await this.submitPracticeTestAnswer(form);
                } catch (error) {
                    console.error('[NexusApp] Practice test answer could not be checked:', error);
                    window.StudBudDialogs.notify(`Your answer could not be checked. ${this.friendlyErrorMessage(error)}`);
                }
                return;
            }
            if (!['course-form', 'assignment-form', 'calendar-event-form', 'card-form', 'deck-editor-form', 'schedule-form', 'study-log-form', 'grade-scenario-assignment-form'].includes(form.id)) return;
            event.preventDefault();
            if (form.dataset.saving === 'true') return;
            form.dataset.saving = 'true';
            const submitButtons = [...document.querySelectorAll(`button[type="submit"][form="${form.id}"], #${form.id} button[type="submit"]`)];
            submitButtons.forEach(button => { button.disabled = true; });
            try {
                if (form.id === 'course-form') await this.saveCourse();
                if (form.id === 'assignment-form') this.saveAssignment();
                if (form.id === 'calendar-event-form') this.saveCalendarEvent();
                if (form.id === 'card-form') await this.saveCard();
                if (form.id === 'deck-editor-form') await this.saveDeckEditor();
                if (form.id === 'schedule-form') this.saveSchedule();
                if (form.id === 'study-log-form') await this.saveStudyLog();
                if (form.id === 'grade-scenario-assignment-form') this.addGradeScenarioAssignment(form);
                this.closeModal();
            } catch (error) {
                console.error(`[NexusApp] ${form.id} submit failed:`, error);
                window.StudBudDialogs.notify(`Could not save your changes. ${this.friendlyErrorMessage(error)}`);
            } finally {
                delete form.dataset.saving;
                submitButtons.forEach(button => { button.disabled = false; });
            }
        }

        handleChange(event) {
            if (event.target.id === 'admin-game-test-energy') {
                const limited = event.target.value === 'limited';
                document.getElementById('admin-game-test-reward-label').classList.toggle('hidden', !limited);
                document.getElementById('admin-game-test-reward').disabled = !limited;
                return;
            }
            if (event.target.id === 'practice-multiplayer-mode') {
                const time = document.getElementById('practice-multiplayer-time');
                const chess = event.target.value === 'chess';
                time.closest('label').classList.toggle('hidden', chess);
                time.disabled = chess;
            }
            if (event.target.id === 'settings-school') {
                // Remember the unsaved pick so profile re-renders don't reset it before Save.
                if (event.target.dataset) event.target.dataset.dirty = '1';
                this.updateCourseSchoolFields();
                this.renderOtherGradeScaleEditor();
                this.updatePublicSchoolOption();
                return;
            }
            if (event.target.id === 'school-semester-select') {
                this.semesterView = event.target.value === 'S2' ? 'S2' : 'S1';
                this.renderUI();
                return;
            }
            const widgetPref = event.target.dataset?.homeWidgetPref;
            if (widgetPref) {
                const value = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value) || 3;
                this.saveHomeWidgetPrefs({ [widgetPref]: value });
                return;
            }
            if (event.target.id === 'import-deck-course' || event.target.id === 'import-deck-assessment') {
                this.syncDeckLinkSelects(document.getElementById('import-deck-course'), document.getElementById('import-deck-assessment'), event.target.id === 'import-deck-assessment');
                return;
            }
            if (event.target.id === 'deck-editor-course' || event.target.id === 'deck-editor-assessment') {
                this.syncDeckLinkSelects(document.getElementById('deck-editor-course'), document.getElementById('deck-editor-assessment'), event.target.id === 'deck-editor-assessment');
                return;
            }
            if (event.target.dataset?.deckLink) {
                this.updateDeckLink(event.target.dataset.id, event.target.dataset.deckLink, event.target.value)
                    .catch(error => {
                        console.error('[NexusApp] Flashcard links could not update:', error);
                        this.renderDecks();
                        window.StudBudDialogs.notify(`Could not update the set's class or test. ${this.friendlyErrorMessage(error)}`);
                    });
                return;
            }
            const audioType = event.target.id?.startsWith('vol-') ? event.target.id.slice(4) : null;
            if (audioType) {
                this.setMixerLevel(event.target, true);
                return;
            }
            if (event.target.id === 'focus-assignment' && !this.dashboardSprintInterval) {
                this.dashboardSprintAssignmentId = event.target.value;
                this.dashboardSprintSeconds = null;
                this.updateFocusSprintDisplay();
            }
            if (event.target.id === 'focus-duration' && !this.dashboardSprintInterval) {
                this.dashboardSprintSeconds = null;
                this.updateFocusSprintDisplay();
            }
            if (['analytics-metric-select', 'analytics-course-select', 'analytics-chart-type'].includes(event.target.id)) {
                this.renderGradeProgress();
            }
            if (event.target.id === 'assignment-course') this.updateAssignmentCategories();
            if (event.target.id === 'assignment-kind' || event.target.name === 'assignment-state') this.syncAssignmentForm();
            if (event.target.id === 'assignment-course-filter' || event.target.id === 'assignment-status-filter') {
                this.renderAssignments();
            } else if (event.target.id === 'grade-scenario-select') {
                this.creatingGradeScenario = false;
                AppState.set('selectedGradeScenarioId', event.target.value || null);
                this.renderGradeScenarios();
            } else if (event.target.id === 'grade-scenario-course') {
                this.selectedScenarioCourseCode = event.target.value;
                this.updateGradeScenarioCategories();
            } else if (event.target.id === 'grade-scenario-name') {
                const name = event.target.value.trim();
                const selectedId = AppState.get('selectedGradeScenarioId');
                if (name && selectedId && !this.creatingGradeScenario) {
                    const scenarios = (AppState.get('gradeScenarios') || []).map(item =>
                        item.id === selectedId ? { ...item, name } : item
                    );
                    this.saveGradeScenarioItems(scenarios);
                }
            }
            if (event.target.dataset && event.target.dataset.scenarioOverride) {
                this.setScenarioOverride(event.target.dataset.scenarioOverride, event.target.value);
                return;
            }
            if (event.target.id === 'ui-theme-select') {
                AppState.set('settings', { ...AppState.get('settings'), theme: event.target.value });
                this.applyAppearance();
            } else if (event.target.id === 'ui-compact-mode') {
                AppState.set('settings', { ...AppState.get('settings'), compactUi: event.target.checked });
                this.applyAppearance();
            } else if (event.target.id === 'sfx-ui' || event.target.id === 'sfx-game') {
                this.updateGameAudio({ [event.target.id === 'sfx-ui' ? 'ui' : 'game']: event.target.checked });
            } else if (event.target.id === 'music-on') {
                this.updateGameAudio({ music: event.target.checked });
                if (!event.target.checked) window.StudBudSfx.stopMusic();
            } else if (event.target.id === 'music-style') {
                this.updateGameAudio({ musicStyle: event.target.value });
            }
            if (event.target.id === 'host-game-goal-type') this.updateMultiplayerGoalInputs();
        }

        setMixerLevel(slider, persist) {
            const channel = slider.id.slice(4);
            if (!['lofi', 'rain', 'white', 'binaural'].includes(channel)) return;
            const level = Math.max(0, Math.min(100, Number(slider.value))) / 100;
            Soundscape.setChannelVolume(channel, level);
            const output = document.getElementById(`${slider.id}-value`);
            if (output) output.value = `${Math.round(level * 100)}%`;
            slider.setAttribute('aria-valuetext', `${Math.round(level * 100)} percent`);
            if (persist) {
                const audioLevels = { ...(AppState.get('settings')?.audioLevels || {}), [channel]: level };
                AppState.set('settings', { ...AppState.get('settings'), audioLevels });
            }
        }

        addGradeScenarioAssignment(form) {
            const data = new FormData(form);
            const title = String(data.get('title') || '').trim();
            const courseCode = String(data.get('courseCode') || '');
            const categoryId = String(data.get('categoryId') || '') || null;
            const pointsEarned = Number(data.get('pointsEarned'));
            const maxPoints = Number(data.get('maxPoints'));
            const selectedId = AppState.get('selectedGradeScenarioId');
            if (!title || !selectedId || !(AppState.get('courses') || []).some(course => course.code === courseCode)
                || !Number.isFinite(pointsEarned) || !Number.isFinite(maxPoints) || maxPoints <= 0
                || pointsEarned < 0 || pointsEarned > maxPoints) {
                throw new Error('Enter an assignment name, valid class, and a score from 0 to the points possible.');
            }
            const scenarios = (AppState.get('gradeScenarios') || []).map(scenario => scenario.id === selectedId
                ? {
                    ...scenario,
                    items: [...(scenario.items || []), {
                        id: `hypothetical_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        title,
                        courseCode,
                        categoryId,
                        pointsEarned,
                        maxPoints
                    }]
                }
                : scenario
            );
            this.saveGradeScenarioItems(scenarios);
            form.reset();
            form.elements.pointsEarned.value = '90';
            form.elements.maxPoints.value = '100';
            form.elements.courseCode.value = this.selectedScenarioCourseCode || courseCode;
            this.updateGradeScenarioCategories();
        }

        toggleSoundscape(button) {
            const preset = button.dataset.audio;
            const nodes = Soundscape.activeNodes;
            const isActive = preset === 'lofi' ? Boolean(nodes.lofi)
                : preset === 'rain' ? Boolean(nodes.rain)
                : preset === 'binaural' ? Boolean(nodes.binauralLeft)
                : Boolean(nodes.noise);
            if (isActive) {
                if (preset === 'lofi') Soundscape.stopLoFi();
                else if (preset === 'rain') Soundscape.stopRain();
                else if (preset === 'binaural') Soundscape.stopBinaural();
                else Soundscape.stopNoise();
                button.classList.remove('active');
                return;
            }

            Soundscape.stopAll();
            document.querySelectorAll('.audio-btn').forEach(item => item.classList.remove('active'));
            if (preset === 'lofi') Soundscape.startLoFi();
            else if (preset === 'rain') Soundscape.startRain();
            else if (preset === 'binaural') Soundscape.startBinaural();
            else if (preset === 'white') Soundscape.startNoise('white');
            button.classList.add('active');
        }

        openCourseForm(course) {
            const form = document.getElementById('course-form');
            form.reset();
            document.getElementById('course-id').value = course ? course.code : '';
            document.getElementById('course-modal-title').textContent = course ? 'Edit Course' : 'Add Course';
            const search = document.getElementById('course-search');
            const selectedCatalogCourse = course && this.isParkwaySchool(course.school || this.currentSchool())
                && this.findCatalogCourse(course.catalogCode || course.code);
            search.value = selectedCatalogCourse ? `${selectedCatalogCourse.title} (${selectedCatalogCourse.code})` : '';
            document.getElementById('course-name').value = selectedCatalogCourse?.code || '';
            document.getElementById('course-selection-hint').textContent = selectedCatalogCourse ? 'Catalog course selected.' : `Choose a ${this.schoolShortName()} course from the matches.`;
            this.hideCourseSuggestions();
            document.getElementById('course-subject-category').value = course ? course.category || 'Electives' : 'Electives';
            document.getElementById('course-term').value = course ? (course.term || 'FY') : 'FY';
            document.getElementById('course-credits').value = course ? Number(Number(course.credits).toFixed(2)) : '0.5';
            document.getElementById('course-manual-title').value = course && !selectedCatalogCourse ? course.title || '' : '';
            const manualCode = document.getElementById('course-manual-code');
            manualCode.value = course && !selectedCatalogCourse && !/^OTHER_\d+$/.test(String(course.code)) ? course.code || '' : '';
            manualCode.disabled = Boolean(course);
            document.getElementById('course-manual-weighted').checked = course ? Boolean(course.isWeighted) : false;
            document.getElementById('course-target-grade').value = course && course.targetPct !== null && course.targetPct !== undefined && Number.isFinite(Number(course.targetPct)) ? Number(Number(course.targetPct).toFixed(2)) : '';
            if (course) this.populateCourseFromCatalog();
            else document.getElementById('course-weight-label').textContent = 'Select a catalog course';
            this.updateCourseSchoolFields(course?.school || this.currentSchool());
            this.openModal('course-modal');
        }

        currentSchool() {
            const select = document.getElementById('settings-school');
            if (select?.dataset?.dirty && this.isKnownSchool(select.value)) return select.value;
            const profile = AppState.get('profile') || {};
            const stored = profile.school || window.StudBudCloud?.user?.user_metadata?.school;
            return this.isKnownSchool(stored) ? stored : 'pchs';
        }

        isKnownSchool(id) {
            return window.STUDBUD_SCHOOLS ? window.STUDBUD_SCHOOLS.isKnown(id) : ['pchs', 'other'].includes(id);
        }

        isParkwaySchool(id = this.currentSchool()) {
            return window.STUDBUD_SCHOOLS ? window.STUDBUD_SCHOOLS.isParkway(id) : id === 'pchs';
        }

        schoolTag(id = this.currentSchool()) {
            return window.STUDBUD_SCHOOLS?.tag(id) || (id === 'pchs' ? 'PCHS' : 'Other');
        }

        schoolShortName(id = this.currentSchool()) {
            return window.STUDBUD_SCHOOLS?.shortName(id) || 'Other';
        }

        schoolCatalog(id = this.currentSchool()) {
            if (window.STUDBUD_SCHOOLS) return window.STUDBUD_SCHOOLS.catalog(id);
            return (window.STUDBUD_COURSE_CATALOG || []).filter(course => !course.legacy);
        }

        // Resolves any saved code (current offerings at every school or retired/legacy codes).
        findCatalogCourse(code) {
            if (!code) return null;
            return (window.STUDBUD_COURSE_CATALOG || window.PCHS_COURSE_CATALOG || []).find(item => item.code === code) || null;
        }

        updatePublicSchoolOption() {
            const checkbox = document.getElementById('public-show-school');
            if (!checkbox) return;
            checkbox.disabled = !this.isParkwaySchool();
            if (checkbox.disabled) checkbox.checked = false;
        }

        updateCourseSchoolFields(school = this.currentSchool()) {
            const other = !this.isParkwaySchool(school);
            document.getElementById('course-catalog-fields')?.classList.toggle('hidden', other);
            document.getElementById('course-manual-fields')?.classList.toggle('hidden', !other);
            document.getElementById('course-manual-title')?.toggleAttribute('required', other);
            const credits = document.getElementById('course-credits');
            if (credits) credits.readOnly = !other;
            const scaleLabel = document.getElementById('course-scale-label');
            if (scaleLabel) scaleLabel.textContent = other ? 'School grade scale' : 'Parkway grade scale';
            const searchLabel = document.getElementById('course-search-label');
            if (searchLabel && !other) searchLabel.textContent = `Search ${this.schoolShortName(school)} courses`;
            const search = document.getElementById('course-search');
            if (search && !other) search.placeholder = `Course name or number at ${window.STUDBUD_SCHOOLS?.name(school) || 'your school'}`;
            const weightLabel = document.getElementById('course-weight-label');
            if (weightLabel && other) weightLabel.textContent = 'Select whether this class is weighted.';
        }

        renderOtherGradeScaleEditor() {
            const editor = document.getElementById('other-grade-scale-editor');
            const panel = document.getElementById('other-grade-scale-panel');
            if (!editor || !panel) return;
            const isOther = this.currentSchool() === 'other';
            panel.classList.toggle('hidden', !isOther);
            if (!isOther) return;
            const profile = AppState.get('profile') || {};
            const scale = Array.isArray(profile.gradeScale) && profile.gradeScale.length
                ? profile.gradeScale : window.STUDBUD_OTHER_GRADE_SCALE;
            editor.innerHTML = `<div class="grade-scale-editor" role="table" aria-label="Custom grade scale">
                <div class="grade-scale-row grade-scale-heading" role="row"><span>Letter</span><span>Minimum %</span><span>Unweighted</span><span>Weighted</span></div>
                ${scale.map((grade, index) => `<div class="grade-scale-row" role="row">
                    <strong>${this.escapeHTML(grade.letter)}</strong>
                    <input type="number" data-grade-scale="${index}" data-grade-field="minPct" min="0" max="100" step="0.01" value="${Number(grade.minPct)}" aria-label="${this.escapeHTML(grade.letter)} minimum percent">
                    <input type="number" data-grade-scale="${index}" data-grade-field="unweighted" min="0" max="5" step="0.01" value="${Number(grade.unweighted)}" aria-label="${this.escapeHTML(grade.letter)} unweighted points">
                    <input type="number" data-grade-scale="${index}" data-grade-field="weighted" min="0" max="5" step="0.01" value="${Number(grade.weighted)}" aria-label="${this.escapeHTML(grade.letter)} weighted points">
                </div>`).join('')}
            </div>`;
        }

        filterCourseCatalog(query) {
            const list = document.getElementById('course-suggestions');
            if (!list) return;
            const normalized = String(query || '').trim();
            if (!normalized) {
                this.hideCourseSuggestions();
                return;
            }
            const matches = window.STUDBUD_SCHOOLS?.search
                ? window.STUDBUD_SCHOOLS.search(this.currentSchool(), normalized, 12)
                : this.schoolCatalog().filter(course => `${course.code} ${course.title}`.toLowerCase().includes(normalized.toLowerCase())).slice(0, 12);
            this.courseSuggestionIndex = -1;
            list.innerHTML = matches.length ? matches.map(course =>
                `<button type="button" id="course-option-${this.escapeHTML(course.code)}" role="option" aria-selected="false" class="course-suggestion" data-action="select-course" data-id="${this.escapeHTML(course.code)}"><strong>${this.escapeHTML(course.title)}${course.isWeighted ? ' <em class="course-weighted-pill">Weighted</em>' : ''}</strong><span>${this.escapeHTML(course.code)} · ${this.escapeHTML(course.category)} · ${Number(course.credits)} cr</span></button>`
            ).join('') : `<p class="course-suggestion-empty">No matching ${this.escapeHTML(this.schoolShortName())} courses.</p>`;
            list.classList.remove('hidden');
            document.getElementById('course-search').setAttribute('aria-expanded', 'true');
            document.getElementById('course-search').removeAttribute('aria-activedescendant');
        }

        highlightCourseSuggestion(options) {
            options.forEach((option, index) => {
                const selected = index === this.courseSuggestionIndex;
                option.setAttribute('aria-selected', String(selected));
                if (selected) {
                    document.getElementById('course-search').setAttribute('aria-activedescendant', option.id);
                    option.scrollIntoView({ block: 'nearest' });
                }
            });
        }

        hideCourseSuggestions() {
            const list = document.getElementById('course-suggestions');
            if (list) list.classList.add('hidden');
            document.getElementById('course-search')?.setAttribute('aria-expanded', 'false');
            document.getElementById('course-search')?.removeAttribute('aria-activedescendant');
            this.courseSuggestionIndex = -1;
        }

        selectCatalogCourse(courseCode) {
            const course = this.schoolCatalog().find(item => item.code === courseCode);
            if (!course) throw new Error(`That course is not offered at ${this.schoolShortName()}.`);
            document.getElementById('course-name').value = course.code;
            document.getElementById('course-search').value = `${course.title} (${course.code})`;
            document.getElementById('course-selection-hint').textContent = 'Catalog course selected.';
            this.hideCourseSuggestions();
            this.populateCourseFromCatalog();
        }

        populateCourseFromCatalog() {
            const courseCode = document.getElementById('course-name').value;
            const catalogCourse = this.findCatalogCourse(courseCode);
            if (!catalogCourse) return;
            const categoryMap = {
                'Visual Arts': 'Fine Arts',
                'Fine Arts': 'Fine Arts',
                Business: 'Practical Arts',
                CS: 'Practical Arts',
                CTE: 'Practical Arts',
                'Practical Arts': 'Practical Arts',
                'World Languages': 'Electives'
            };
            const categorySelect = document.getElementById('course-subject-category');
            const mapped = categoryMap[catalogCourse.category] || catalogCourse.category;
            const category = Array.from(categorySelect.options).some(option => option.value === mapped) ? mapped : 'Electives';
            categorySelect.value = category;
            document.getElementById('course-credits').value = catalogCourse.credits;
            const weightedScale = (window.studbudGradeScale?.() || window.PARKWAY_GRADE_SCALE || []).map(item =>
                `${item.letter} ${catalogCourse.isWeighted ? item.weighted : item.unweighted.toFixed(2)}`
            ).join(' · ');
            document.getElementById('course-weight-label').textContent =
                `${catalogCourse.isWeighted ? 'Weighted' : 'Regular'} · ${weightedScale}`;
        }

        assignmentState(item) {
            if (this.isGradedItem(item)) return 'graded';
            if (item.status === 'completed') return 'awaiting';
            const due = String(item.dueDate || '').slice(0, 10);
            return due && due < localDateKey(new Date()) ? 'overdue' : 'todo';
        }

        assignmentStatusControl(item) {
            const id = this.escapeHTML(item.id);
            const state = this.assignmentState(item);
            const pills = {
                graded: '<span class="status-pill is-graded"><i class="fas fa-circle-check" aria-hidden="true"></i> Graded</span>',
                awaiting: '<span class="status-pill is-awaiting"><i class="fas fa-hourglass-half" aria-hidden="true"></i> Done ? awaiting grade</span>',
                overdue: '<span class="status-pill is-overdue"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Overdue</span>',
                todo: '<span class="status-pill is-todo"><i class="fas fa-clock" aria-hidden="true"></i> To do</span>'
            };
            const name = this.escapeHTML(item.title || 'assignment');
            const buttons = state === 'graded' ? ''
                : state === 'awaiting'
                    ? `<button type="button" class="primary-btn compact-btn" data-action="grade-assignment" data-id="${id}" aria-label="Add grade for ${name}"><i class="fas fa-pen" aria-hidden="true"></i> Add grade</button><button type="button" class="link-btn" data-action="toggle-assignment" data-id="${id}" aria-label="Mark ${name} as not done">Undo</button>`
                    : `<button type="button" class="secondary-btn compact-btn" data-action="toggle-assignment" data-id="${id}" aria-label="Mark ${name} as done"><i class="fas fa-check" aria-hidden="true"></i> Mark done</button>`;
            return `<div class="assignment-status-cell">${pills[state]}${buttons}</div>`;
        }

        isGradedItem(item) {
            if (typeof item.graded === 'boolean') return item.graded;
            return item.status === 'completed' || Number(item.pointsEarned) > 0;
        }

        openAssignmentForm(assignment, courseCode = '', dueDate = '', categoryId = '', kind = '') {
            const form = document.getElementById('assignment-form');
            form.reset();
            const graded = assignment ? this.isGradedItem(assignment) : false;
            document.getElementById('assignment-id').value = assignment ? assignment.id : '';
            const deleteButton = document.getElementById('delete-assignment-editor-btn');
            if (deleteButton) {
                deleteButton.classList.toggle('hidden', !assignment);
                deleteButton.dataset.id = assignment ? assignment.id : '';
            }
            document.getElementById('assignment-modal-title').textContent = assignment ? 'Edit Assignment' : 'Add Assignment';
            document.getElementById('assignment-name').value = assignment ? assignment.title : '';
            const onlyCourse = (AppState.get('courses') || []).length === 1 ? AppState.get('courses')[0].code : '';
            document.getElementById('assignment-course').value = assignment ? assignment.courseCode : (courseCode || onlyCourse);
            document.getElementById('assignment-due-date').value = assignment ? (assignment.dueDate || '').slice(0, 10) : (dueDate || localDateKey(new Date()));
            document.getElementById('assignment-points').value = assignment ? Number(Number(assignment.pointsEarned ?? 0).toFixed(2)) : 0;
            document.getElementById('assignment-max-points').value = assignment ? Number(Number(assignment.maxPoints ?? 100).toFixed(2)) : 100;
            document.getElementById('assignment-kind').value = assignment ? assignment.kind || 'assignment' : (kind || 'assignment');
            document.getElementById('assignment-size').value = assignment ? assignment.estimatedMinutes || 30 : 30;
            document.getElementById('assignment-importance').value = assignment ? assignment.importance || 3 : 3;
            const formState = graded ? 'graded' : assignment?.status === 'completed' ? 'done' : 'todo';
            form.querySelector(`input[name="assignment-state"][value="${formState}"]`).checked = true;
            document.getElementById('assignment-course-group').classList.toggle('hidden', false);
            if (!assignment && !(AppState.get('courses') || []).length && typeof document.getElementById('assignment-course')?.querySelectorAll === 'function') {
                window.StudBudDialogs.notify('Add a class first, then you can add assignments to it.');
                Router.navigate('gpa');
                this.openCourseForm();
                return;
            }
            document.getElementById('save-add-another-assignment-btn').classList.toggle('hidden', Boolean(assignment));
            this.updateAssignmentCategories(assignment ? assignment.categoryId : categoryId);
            this.syncAssignmentForm();
            this.openModal('assignment-modal');
            setTimeout(() => document.getElementById('assignment-name').focus(), 50);
        }

        adjustAssignmentScore(input, delta) {
            const value = input.value === '' ? 0 : input.valueAsNumber;
            if (!Number.isFinite(value)) {
                input.reportValidity();
                return;
            }
            input.value = Math.max(Number(input.min), Math.round((value + delta) * 100) / 100);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        syncAssignmentForm() {
            const graded = document.querySelector('input[name="assignment-state"]:checked')?.value === 'graded';
            const kind = document.getElementById('assignment-kind').value;
            document.getElementById('assignment-todo-fields').classList.toggle('hidden', graded);
            document.getElementById('assignment-graded-fields').classList.toggle('hidden', !graded);
            document.getElementById('assignment-study-options').classList.toggle('hidden', graded || kind === 'assignment');
            document.getElementById('assignment-due-date').required = !graded;
            document.getElementById('assignment-max-points').required = graded;
            document.getElementById('assignment-points').required = graded;
            // The type picker stays useful for graded work, so keep it visible beside the score
            const kindField = document.getElementById('assignment-kind').closest('.half-width');
            const gradedRow = document.getElementById('assignment-graded-fields');
            if (graded && kindField.parentElement !== gradedRow) gradedRow.appendChild(kindField);
            else if (!graded && kindField.parentElement === gradedRow) document.getElementById('assignment-todo-fields').appendChild(kindField);
        }

        updateAssignmentCategories(selectedId = null) {
            const courseCode = document.getElementById('assignment-course').value;
            const course = (AppState.get('courses') || []).find(item => item.code === courseCode);
            const select = document.getElementById('assignment-category');
            if (!select) return;
            const selected = selectedId ?? select.value;
            select.innerHTML = '<option value="">None</option>' +
                (course?.categories || []).map(category => `<option value="${this.escapeHTML(category.id)}">${this.escapeHTML(category.name)} (${this.categoryWeightLabel(course, category)})</option>`).join('');
            if ((course?.categories || []).some(category => category.id === selected)) select.value = selected;
        }

        gradeForPercentage(percentage) {
            const scale = window.studbudGradeScale?.() || window.PARKWAY_GRADE_SCALE || [];
            const grade = scale.slice().sort((a, b) => b.minPct - a.minPct).find(item => percentage >= item.minPct);
            return grade ? grade.letter : (percentage >= 90 ? 'A-' : percentage >= 80 ? 'B-' : percentage >= 70 ? 'C-' : percentage >= 60 ? 'D-' : 'F');
        }

        async saveCourse() {
            const oldCode = document.getElementById('course-id').value;
            const catalogCode = document.getElementById('course-name').value;
            const term = document.getElementById('course-term').value;
            const existingCourse = (AppState.get('courses') || []).find(item => item.code === oldCode);
            const school = existingCourse?.school || this.currentSchool();
            const otherSchool = !this.isParkwaySchool(school);
            const catalogCourse = otherSchool ? null : this.findCatalogCourse(catalogCode);
            if (!otherSchool && !catalogCourse) throw new Error(`Select a course from the ${this.schoolShortName(school)} catalog.`);
            let code, title, credits, isWeighted;
            if (otherSchool) {
                title = document.getElementById('course-manual-title').value.trim();
                const requestedCode = document.getElementById('course-manual-code').value.trim();
                if (!title || title.length > 100) throw new Error('Enter a class name of 1–100 characters.');
                if (requestedCode && !/^[A-Za-z0-9_-]{1,30}$/.test(requestedCode)) throw new Error('Class codes can use up to 30 letters, numbers, underscores, or hyphens.');
                code = oldCode || requestedCode || `OTHER_${Date.now()}`;
                credits = Number(document.getElementById('course-credits').value);
                if (!Number.isFinite(credits) || credits <= 0 || credits > 20) throw new Error('Class credits must be greater than 0 and no more than 20.');
                isWeighted = document.getElementById('course-manual-weighted').checked;
            } else {
                const sameCatalogAlreadyUsed = (AppState.get('courses') || []).some(item =>
                    item.code !== oldCode && (item.catalogCode || item.code) === catalogCode
                );
                code = oldCode || (sameCatalogAlreadyUsed ? `${catalogCode}_${term}_${Date.now()}` : catalogCode);
                title = catalogCourse.title;
                credits = Number(catalogCourse.credits);
                isWeighted = Boolean(catalogCourse.isWeighted);
            }
            if ((AppState.get('courses') || []).some(item => item.code === code && item.code !== oldCode)) {
                throw new Error('That class code is already in use. Choose another code.');
            }
            const targetValue = document.getElementById('course-target-grade').value;
            const course = {
                code,
                school,
                ...(catalogCourse ? { catalogCode } : { catalogCode: '' }),
                title,
                term,
                credits,
                category: document.getElementById('course-subject-category').value,
                isWeighted,
                targetPct: targetValue === '' ? null : Number(targetValue)
            };
            if (existingCourse) {
                course.categories = existingCourse.categories || [];
            }
            if (AppState.get('courses').some(item => item.code === code)) AppState.updateCourse(code, course);
            else AppState.addCourse(course);
        }

        saveAssignment() {
            const id = document.getElementById('assignment-id').value || `asgn_${Date.now()}`;
            const current = (AppState.get('assignments') || []).find(item => item.id === id);
            const formState = document.querySelector('input[name="assignment-state"]:checked')?.value || 'todo';
            const graded = formState === 'graded';
            const kind = document.getElementById('assignment-kind').value;
            const maxPoints = Math.round((Number(document.getElementById('assignment-max-points').value) || 100) * 100) / 100;
            const pointsEarned = graded ? Math.round(Math.max(0, Number(document.getElementById('assignment-points').value) || 0) * 100) / 100 : 0;
            const assignment = {
                id,
                title: document.getElementById('assignment-name').value.trim(),
                courseCode: document.getElementById('assignment-course').value,
                dueDate: graded ? (current?.dueDate || '') : document.getElementById('assignment-due-date').value,
                pointsEarned,
                maxPoints,
                categoryId: document.getElementById('assignment-category').value || null,
                kind,
                estimatedMinutes: Number(document.getElementById('assignment-size').value) || 30,
                importance: Number(document.getElementById('assignment-importance').value) || 3,
                priority: current ? current.priority : 'high',
                graded,
                status: graded || formState === 'done' ? 'completed' : 'pending',
                gradedAt: graded ? (current?.gradedAt || localDateKey(new Date())) : null
            };
            if (current) AppState.updateAssignment(id, assignment);
            else AppState.addAssignment(assignment);
        }

        saveAssignmentAndContinue() {
            const form = document.getElementById('assignment-form');
            if (!form.reportValidity()) return;
            const title = document.getElementById('assignment-name').value.trim();
            this.saveAssignment();
            document.getElementById('assignment-id').value = '';
            document.getElementById('assignment-name').value = '';
            document.getElementById('assignment-points').value = 0;
            document.getElementById('assignment-modal-title').textContent = `Added "${title}" — add another`;
            document.getElementById('assignment-name').focus();
        }

        async saveCard() {
            const deckId = document.getElementById('card-deck-id').value;
            const deck = this.cardEditorReturnToDeck ? this.deckEditorDraft : (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!deck) throw new Error('The selected deck no longer exists.');
            const id = document.getElementById('card-id').value;
            const savedCard = id ? (deck.cards || []).find(card => card.id === id) : null;
            const existing = savedCard ? JSON.parse(JSON.stringify(savedCard)) : null;
            if (id && !existing) throw new Error('The selected card no longer exists.');
            const front = document.getElementById('card-front').value.trim();
            const back = document.getElementById('card-back').value.trim();
            if (!front || !back || front.length > 5000 || back.length > 5000) throw new Error('Enter a front and back of 1 to 5000 characters each.');
            const distractors = (document.getElementById('card-distractors')?.value || '').split('\n').map(text => text.trim()).filter(Boolean);
            if (distractors.length > 3 || distractors.some(text => text.length > 5000)) throw new Error('Add at most 3 wrong options, each up to 5000 characters.');
            const keys = distractors.map(text => this.answerKey(text));
            if (new Set(keys).size !== keys.length || keys.includes(this.answerKey(back))) throw new Error('Wrong options must be distinct from each other and the correct answer.');
            const answerMode = document.getElementById('card-answer-mode')?.value || 'exact';
            if (!['exact', 'vocabulary', 'keywords'].includes(answerMode)) throw new Error('Choose a supported written-answer mode.');
            const acceptedAnswers = (document.getElementById('card-accepted-answers')?.value || '').split('\n').map(text => text.trim()).filter(Boolean);
            if (acceptedAnswers.length > 10 || acceptedAnswers.some(text => text.length > 5000)) throw new Error('Use at most 10 other accepted answers, up to 5000 characters each.');
            const keywords = window.FlashcardTools.keywordGroups(document.getElementById('card-keywords')?.value);
            if (answerMode === 'keywords' && !window.FlashcardTools.matchesKeywords(back, { back, keywords })) throw new Error('Add required keyword groups that all appear in your saved answer.');
            const attachments = document.getElementById('card-remove-attachments')?.checked ? [] : (existing?.attachments || []).map(item => ({ ...item }));
            const files = [...(document.getElementById('card-attachments')?.files || [])];
            if (attachments.length + files.length > 3) throw new Error('A card can have at most 3 attachments. Remove saved attachments before replacing them.');
            const readFile = file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error(`Could not read ${file.name}. Select it again.`));
                reader.readAsDataURL(file);
            });
            for (const file of files) {
                if (file.size > 1000000) throw new Error('Each attachment must be 1 MB or less.');
                const extensionTypes = { pdf: 'application/pdf', txt: 'text/plain', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', webm: 'audio/webm' };
                const type = file.type === 'audio/x-wav' ? 'audio/wav' : file.type || extensionTypes[file.name.split('.').pop().toLowerCase()] || '';
                const data = await readFile(file);
                const attachment = { name: file.name, type, data: data.replace(/^data:[^;,]*;base64,/, `data:${type};base64,`) };
                if (!window.FlashcardTools.attachmentSource(attachment)) throw new Error('Choose a supported PDF, text or audio file with a name of 160 characters or less.');
                attachments.push(attachment);
            }
            if (attachments.reduce((size, item) => size + item.data.length * .75, 0) > 2000000) throw new Error('Combined attachments must be 2 MB or less per card.');
            let answerImage = existing?.answerImage || '';
            if (document.getElementById('card-remove-image')?.checked) answerImage = '';
            const file = document.getElementById('card-answer-image')?.files?.[0];
            if (file) {
                if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 500000) throw new Error('Choose a PNG, JPEG, WebP or GIF image of 500 KB or less.');
                answerImage = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error('Could not read the answer image. Try selecting it again.'));
                    reader.readAsDataURL(file);
                });
                if (!window.FlashcardTools.imageSource(answerImage)) throw new Error('This image could not be loaded safely.');
            }
            // Image reads are asynchronous: do not replace a newer card with the editor's old snapshot.
            const latestDeck = this.cardEditorReturnToDeck ? this.deckEditorDraft : (AppState.get('flashcards') || []).find(item => item.id === deckId);
            const latestCard = id ? latestDeck?.cards?.find(item => item.id === id) : null;
            if (!latestDeck || (id && !latestCard)) throw new Error('This set or card was removed while saving.');
            if (existing && ['front', 'back', 'tags', 'answerImage', 'distractors', 'answerMode', 'acceptedAnswers', 'keywords', 'attachments'].some(field => JSON.stringify(existing[field]) !== JSON.stringify(latestCard[field]))) throw new Error('This card was edited elsewhere. Reopen it before saving.');
            const card = {
                ...(latestCard || { id: `card_${window.crypto.randomUUID()}`, repetitions: 0, interval: 0, easeFactor: 2.5 }),
                front,
                back,
                answerImage,
                distractors,
                answerMode, acceptedAnswers, keywords, attachments,
                tags: document.getElementById('card-tags').value.split(',').map(tag => tag.trim()).filter(Boolean),
            };
            const cards = existing ? latestDeck.cards.map(item => item.id === id ? card : item) : [...(latestDeck.cards || []), card];
            if (this.cardEditorReturnToDeck) this.deckEditorDraft = { ...latestDeck, cards };
            else {
                try {
                    await this.saveEditedDeck({ ...latestDeck, cards });
                } finally {
                    if ((AppState.get('flashcards') || []).find(item => item.id === deckId)?.cards.some(item => item.id === card.id)) {
                        document.getElementById('card-id').value = card.id;
                        for (const inputId of ['card-answer-image', 'card-attachments']) {
                            const input = document.getElementById(inputId);
                            if (input) input.value = '';
                        }
                        for (const inputId of ['card-remove-image', 'card-remove-attachments']) {
                            const input = document.getElementById(inputId);
                            if (input) input.checked = false;
                        }
                    }
                }
            }
        }

        async handleDataAction(action, id) {
            const courses = AppState.get('courses') || [];
            const assignments = AppState.get('assignments') || [];
            if (action === 'open-class') {
                Router.selectedClassCode = id;
                Router.navigate('class');
            }
            if (action === 'edit-course') this.openCourseForm(courses.find(item => item.code === id));
            if (action === 'delete-course' && await window.StudBudDialogs.confirm('Delete this class and its assignments?')) {
                AppState.removeCourse(id);
                this.renderUI();
            }
            if (action === 'edit-assignment') this.openAssignmentForm(assignments.find(item => item.id === id));
            if (action === 'open-study-set') this.openStudySet(id);
            if (action === 'assessment-study-set') {
                const assessment = assignments.find(item => String(item.id) === String(id));
                if (!assessment) throw new Error('This quiz or test no longer exists.');
                const deck = (AppState.get('flashcards') || []).find(item => String(item.assessmentId) === String(id));
                if (deck) this.openStudySet(deck.id);
                else {
                    this.openDeckEditor();
                    document.getElementById('deck-editor-title').value = `${assessment.title} study set`.slice(0, 100);
                    document.getElementById('deck-editor-course').innerHTML = this.deckCourseOptions(assessment.courseCode);
                    document.getElementById('deck-editor-assessment').innerHTML = this.deckAssessmentOptions(assessment.courseCode, String(assessment.id));
                }
            }
            if (action === 'delete-assignment' && await window.StudBudDialogs.confirm('Delete this assignment and its saved grade?')) {
                AppState.deleteAssignment(id);
                if (document.getElementById('assignment-id')?.value === id) this.closeModal();
            }
            if (action === 'grade-assignment') {
                const assignment = assignments.find(item => item.id === id);
                if (assignment) {
                    this.openAssignmentForm(assignment);
                    const graded = document.querySelector('input[name="assignment-state"][value="graded"]');
                    if (graded) graded.checked = true;
                    this.syncAssignmentForm();
                    setTimeout(() => document.getElementById('assignment-points')?.select(), 80);
                }
            }
            if (action === 'toggle-assignment') {
                const assignment = assignments.find(item => item.id === id);
                if (assignment) {
                    const status = assignment.status === 'completed' ? 'pending' : 'completed';
                    AppState.updateAssignment(id, {
                        status,
                        graded: assignment.graded ?? Number(assignment.pointsEarned) > 0
                    });
                }
            }
            if (action === 'add-category') {
                const course = courses.find(item => item.code === Router.selectedClassCode);
                const nameInput = document.getElementById('new-category-name');
                const weightInput = document.getElementById('new-category-weight');
                const name = nameInput.value.trim();
                const weight = Number(weightInput.value);
                if (!course || !name || !Number.isFinite(weight) || weight <= 0 || weight > 100) {
                    window.StudBudDialogs.notify('Enter a category name and a weight from 0.1% to 100%.');
                    return;
                }
                const existingTotal = (course.categories || []).reduce((sum, category) => sum + Number(category.weight || 0), 0);
                if (existingTotal + weight > 100.001) {
                    window.StudBudDialogs.notify(`Category weights cannot exceed 100%. There is ${(100 - existingTotal).toFixed(2)}% available.`);
                    return;
                }
                AppState.updateCourse(course.code, { categories: [...(course.categories || []), { id: `category_${Date.now()}`, name, weight }] });
                this.renderClassDetail();
            }
            if (action === 'remove-category') {
                const course = courses.find(item => item.code === Router.selectedClassCode);
                if (!course) return;
                AppState.updateCourse(course.code, { categories: (course.categories || []).filter(category => category.id !== id) });
                AppState.set('assignments', AppState.get('assignments').map(item =>
                    item.categoryId === id ? { ...item, categoryId: null } : item
                ));
                this.renderUI();
            }
            if (action === 'save-class-target') {
                const course = courses.find(item => item.code === Router.selectedClassCode);
                const input = document.getElementById('class-target-percent');
                if (course && String(input.value).trim() === '') {
                    AppState.updateCourse(course.code, { targetPct: null, targetGrade: null });
                    this.renderClassDetail();
                    return;
                }
                const targetPct = Number(input.value);
                if (!course || !Number.isFinite(targetPct) || targetPct < 0 || targetPct > 100) {
                    window.StudBudDialogs.notify('Enter a target between 0 and 100%.');
                    return;
                }
                AppState.updateCourse(course.code, { targetPct, targetGrade: this.gradeForPercentage(targetPct) });
                this.renderClassDetail();
            }
            if (action === 'toggle-deck-pin') {
                const deck = (AppState.get('flashcards') || []).find(item => item.id === id);
                if (deck) await AppState.patchFlashcardDecks(new Map([[id, { pinned: !deck.pinned }]]));
                document.querySelector(`#deck-grid [data-action="toggle-deck-pin"][data-id="${CSS.escape(id)}"]`)?.focus();
            }
            if (action === 'toggle-deck-reorder') {
                this.deckReorderMode = !this.deckReorderMode;
                if (this.deckReorderMode) localStorage.setItem('studbud-deck-sort', 'custom');
                this.renderDecks();
            }
            if (action === 'deck-move-up' || action === 'deck-move-down') await this.stepDeck(id, action === 'deck-move-up' ? -1 : 1);
            if (action === 'delete-deck' && await window.StudBudDialogs.confirm('Delete this flashcard deck and its cards?')) {
                const deck = (AppState.get('flashcards') || []).find(item => item.id === id);
                if (deck?.communityPublished) await window.StudBudCommunityGames.unpublishDeck(id);
                await AppState.deleteFlashcardDeck(id);
            }
            if (action === 'add-card') {
                this.openCardForm(id);
            }
            if (action === 'edit-deck') this.openDeckEditor(id);
            if (action === 'view-weak-cards') this.openDeckEditor(id, 'weak');
            if (action === 'editor-add-card') this.openCardForm(this.deckEditorDraft?.id, '', true);
            if (action === 'editor-edit-card') this.openCardForm(this.deckEditorDraft?.id, id, true);
            if (action === 'editor-bulk-add') this.addBulkEditorCards();
            if (action === 'editor-copy-card' || action === 'editor-reverse-card') this.copyEditorCard(id, action === 'editor-reverse-card');
            if (action === 'editor-star-card') {
                const card = this.deckEditorDraft?.cards.find(item => item.id === id);
                if (!card) throw new Error('This card is no longer in the editor.');
                card.starred = !card.starred;
                this.renderDeckEditorCards();
            }
            if (action === 'editor-pause-card') {
                const card = this.deckEditorDraft?.cards.find(item => item.id === id);
                if (!card) throw new Error('This card is no longer in the editor.');
                card.suspended = !card.suspended;
                this.renderDeckEditorCards();
            }
            if (action === 'editor-undo-delete') {
                const deleted = this.deckEditorUndo?.pop();
                if (!deleted) throw new Error('There are no deleted cards to restore.');
                this.deckEditorDraft.cards.splice(deleted.index, 0, deleted.card);
                this.renderDeckEditorCards();
            }
            if (action === 'editor-delete-card') {
                if (!this.deckEditorDraft?.cards.some(card => card.id === id)) throw new Error('The selected card no longer exists.');
                if (await window.StudBudDialogs.confirm('Delete this card and its review progress when you save the set?')) {
                    const index = this.deckEditorDraft.cards.findIndex(card => card.id === id);
                    (this.deckEditorUndo ||= []).push({ index, card: this.deckEditorDraft.cards[index] });
                    this.deckEditorDraft.cards = this.deckEditorDraft.cards.filter(card => card.id !== id);
                    this.renderDeckEditorCards();
                }
            }
            if (action === 'study-deck') this.startStudy(id);
            if (action === 'cram-deck') this.startStudy(id, 'cram');
            if (action === 'cram-starred') this.startStudy(id, 'starred');
            if (action === 'study-missed') this.studyMissedCards();
            if (action === 'close-study') this.closeStudy();
        }

        startStudy(deckId, mode = 'scheduled') {
            const deck = (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!deck) throw new Error('The selected deck no longer exists.');
            const active = (deck.cards || []).filter(card => card && !card.suspended);
            const cards = mode === 'starred' ? (deck.cards || []).filter(card => card && card.starred) : mode === 'cram' ? (deck.cards || []).filter(Boolean) : active;
            if (!cards.length) {
                window.StudBudDialogs.notify(mode === 'starred' ? 'Star some cards first (press S while studying, or use the set editor).' : 'This deck has no cards yet.');
                return;
            }
            if (window.SM2Engine?.migrateDeck?.(deck)) AppState.saveFlashcardDeck(deck).catch(error => console.error('[NexusApp] Deck migration could not be saved:', error));
            this.activeDeckId = deckId;
            this.cramMode = mode !== 'scheduled';
            this.studyMode = mode;
            this.studySession = null;
            this.studyCards = [];
            if (this.cramMode) {
                // Cram walks every card once (missed cards come back later) without touching the review schedule.
                this.studyCards = window.FlashcardTools.adaptiveOrder ? window.FlashcardTools.adaptiveOrder([...cards]) : [...cards].sort(() => Math.random() - .5);
            } else {
                if (!window.SM2Engine?.createSession) throw new Error('The spaced-repetition scheduler did not load. Reload before studying.');
                const session = window.SM2Engine.createSession(cards, { deck, includeAll: true });
                if (!session || !session.remaining) throw new Error('No study cards could be loaded. Check this set in the editor.');
                this.studySession = session;
            }
            this.activeCardIndex = 0;
            this.currentStudyCard = null;
            this.activeStudyStartedAt = Date.now();
            this.activeStudyCardsSeen = 0;
            this.studyStats = { total: this.studySession ? this.studySession.remaining : this.studyCards.length, done: 0, ratings: { 1: 0, 3: 0, 4: 0, 5: 0 }, combo: 0, bestCombo: 0, typed: 0, typedRight: 0, missed: new Set() };
            const area = document.getElementById('active-study-area');
            area.classList.remove('hidden');
            area.classList.toggle('is-cram', this.cramMode);
            document.getElementById('study-summary').classList.add('hidden');
            area.classList.remove('show-summary');
            document.body.classList.add('studying');
            const toggle = document.getElementById('study-type-toggle');
            if (toggle) toggle.checked = localStorage.getItem('studbud-type-answer') === '1';
            const direction = document.getElementById('study-direction');
            if (direction) direction.value = this.studyDirection();
            this.renderStudyCard();
        }

        studyDirection() {
            const saved = localStorage.getItem('studbud-study-direction');
            return ['front', 'back', 'mixed'].includes(saved) ? saved : 'front';
        }

        pickStudyReversed() {
            const direction = this.studyDirection();
            return direction === 'back' || (direction === 'mixed' && Math.random() < .5);
        }

        // Card faces for the current direction; reversed cards ask with the definition and reveal the term.
        studyFaces(card, reversed = this.studyReversed) {
            const term = this.escapeHTML(card.front || '');
            if (!reversed) return { question: term, answer: this.cardAnswerMarkup(card) };
            const image = window.FlashcardTools.imageSource(card.answerImage);
            return {
                question: `${this.escapeHTML(card.back || '')}${image ? `<img class="flashcard-answer-image" src="${image}" alt="Definition illustration">` : ''}`,
                answer: `${term}${this.cardAttachmentMarkup(card)}`
            };
        }

        renderStudyFaces(card, delayBack) {
            const faces = this.studyFaces(card);
            document.getElementById('card-front-content').innerHTML = faces.question;
            const backEl = document.getElementById('card-back-content');
            clearTimeout(this.cardBackTimer);
            if (delayBack) this.cardBackTimer = setTimeout(() => { backEl.innerHTML = faces.answer; }, 350);
            else backEl.innerHTML = faces.answer;
        }

        studyDeck() {
            return (AppState.get('flashcards') || []).find(deck => deck.id === this.activeDeckId) || null;
        }

        renderStudyCard() {
            const card = this.studySession ? this.studySession.next() : this.studyCards[this.activeCardIndex];
            this.currentStudyCard = card || null;
            if (!card) return this.showStudySummary();
            const deck = this.studyDeck();
            document.getElementById('study-deck-title').textContent = `${deck?.title || 'Flashcards'}${this.studyMode === 'starred' ? ' · Starred' : this.cramMode ? ' · Cram' : ''}`;
            const progress = document.getElementById('study-progress');
            let remaining;
            if (this.studySession) {
                const n = this.studySession.counts();
                remaining = this.studySession.remaining;
                progress.innerHTML = `<span class="anki-count anki-new" title="Never answered in Study, Cram or practice">${n.new} new</span> <span class="anki-count anki-learn" title="Cards you have started practicing and are still learning">${n.learning} learning</span> <span class="anki-count anki-review" title="Previously learned cards available anytime; numeric recall estimates and answer history choose practice order">${n.review} review</span>`;
            } else {
                remaining = this.studyCards.length - this.activeCardIndex;
                progress.textContent = `${remaining} left`;
            }
            const stats = this.studyStats;
            const fill = document.getElementById('study-progress-fill');
            if (fill && stats) fill.style.transform = `scaleX(${Math.min(1, stats.done / Math.max(1, stats.done + remaining))})`;
            const cardEl = document.getElementById('current-flashcard');
            const wasFlipped = cardEl.classList.contains('is-flipped');
            cardEl.classList.remove('is-flipped');
            this.studyReversed = this.pickStudyReversed();
            // Hold the new back text until the card has flipped away so the answer never flashes
            this.renderStudyFaces(card, wasFlipped);
            document.getElementById('reveal-card-btn').classList.remove('hidden');
            document.getElementById('sm2-controls').classList.add('hidden');
            document.querySelectorAll('#sm2-controls .sm2-btn').forEach(button => button.classList.remove('suggested'));
            this.syncStudyStar(card);
            const typing = document.getElementById('study-type-toggle')?.checked;
            const form = document.getElementById('study-type-form');
            const input = document.getElementById('study-type-input');
            const result = document.getElementById('study-type-result');
            form.classList.toggle('hidden', !typing);
            result.classList.add('hidden');
            result.className = 'study-type-result hidden';
            input.value = '';
            input.disabled = false;
            if (typing) input.focus({ preventScroll: true });
        }

        syncStudyStar(card = this.currentStudyCard) {
            const button = document.getElementById('study-star-btn');
            if (!button) return;
            const on = Boolean(card?.starred);
            button.setAttribute('aria-pressed', String(on));
            button.classList.toggle('is-on', on);
            button.innerHTML = `<i class="${on ? 'fas' : 'far'} fa-star"></i> <span>${on ? 'Starred' : 'Star'}</span>`;
        }

        async toggleStudyStar() {
            const deck = this.studyDeck();
            const card = this.currentStudyCard;
            if (!deck || !card) return;
            const saved = (deck.cards || []).find(item => item.id === card.id) || card;
            saved.starred = !saved.starred;
            card.starred = saved.starred;
            this.syncStudyStar(card);
            await AppState.saveFlashcardDeck(deck);
        }

        checkTypedAnswer() {
            const card = this.currentStudyCard;
            const input = document.getElementById('study-type-input');
            if (!card || input.disabled) return;
            const given = input.value.trim();
            const right = Boolean(given) && (this.studyReversed
                ? window.FlashcardTools.gradeAnswer(given, card.front || '', false)
                : window.FlashcardTools.gradeCard(given, card, false));
            input.disabled = true;
            this.studyStats.typed += 1;
            if (right) this.studyStats.typedRight += 1;
            const result = document.getElementById('study-type-result');
            result.className = `study-type-result ${right ? 'is-right' : 'is-wrong'}`;
            result.innerHTML = right ? '<i class="fas fa-circle-check"></i> Nailed it!'
                : `<i class="fas fa-circle-xmark"></i> ${given ? `You wrote “${this.escapeHTML(given)}”.` : 'Skipped.'} Compare with the answer.`;
            this.revealCard();
            const suggested = document.querySelector(`#sm2-controls .sm2-btn[data-q="${right ? 4 : 1}"]`);
            if (suggested) { suggested.classList.add('suggested'); suggested.focus({ preventScroll: true }); }
        }

        formatReviewInterval(card, quality) {
            if (this.cramMode) return quality < 3 ? 'again soon' : 'got it';
            return window.SM2Engine.getIntervalLabel(card, quality);
        }
        revealCard() {
            const card = this.currentStudyCard;
            if (!card) return;
            const cardEl = document.getElementById('current-flashcard');
            // After the first reveal the rating buttons stay visible and the card can be flipped back and forth
            if (!document.getElementById('sm2-controls').classList.contains('hidden')) {
                cardEl.classList.toggle('is-flipped');
                return;
            }
            clearTimeout(this.cardBackTimer);
            document.getElementById('card-back-content').innerHTML = this.studyFaces(card).answer;
            cardEl.classList.add('is-flipped');
            document.getElementById('reveal-card-btn').classList.add('hidden');
            document.getElementById('study-type-form').classList.add('hidden');
            document.getElementById('sm2-controls').classList.remove('hidden');
            if (card && window.SM2Engine) {
                document.querySelectorAll('#sm2-controls .sm2-btn').forEach(button => {
                    const label = button.querySelector('small');
                    if (label) label.textContent = this.formatReviewInterval(card, Number(button.dataset.q));
                });
            }
        }

        async rateCurrentCard(quality) {
            if (this.studyRatingPending) return;
            const deck = this.studyDeck();
            if (!deck) throw new Error('The selected deck no longer exists.');
            const card = this.currentStudyCard;
            if (!card) return;
            if (!window.SM2Engine) throw new Error('The spaced-repetition scheduler did not load.');
            const saved = (deck.cards || []).find(item => item.id === card.id);
            if (!saved) throw new Error('This card was removed. Reopen the set before continuing.');
            const session = this.studySession;
            this.studyRatingPending = true;
            try {
                const now = Date.now();
                const scheduled = this.studySession ? window.SM2Engine.schedule(saved, quality, { ...this.studySession.options, now, deck: undefined }) : null;
                const next = { ...saved, ...(scheduled?.fields || {}) };
                window.FlashcardTools.recordAnswer(next, quality >= 3, 'recall');
                const updated = { ...deck, cards: deck.cards.map(item => item.id === card.id ? next : item),
                    studiedAt: deck.studiedAt || new Date(now).toISOString(), studiedCount: Number(deck.studiedCount || 0) + 1 };
                if (this.studySession) updated.ankiToday = { day: this.studySession.today,
                    newDone: this.studySession.newDone + (scheduled.previousState === 'new' ? 1 : 0),
                    reviewsDone: this.studySession.reviewsDone + (scheduled.previousState === 'review' ? 1 : 0) };
                await AppState.saveFlashcardDeck(updated);
                if (this.activeDeckId !== deck.id || this.currentStudyCard !== card || this.studySession !== session) return;
                if (this.studySession) {
                    Object.assign(card, saved);
                    this.studySession.deck = updated;
                    const result = this.studySession.answer(card, quality, now);
                    Object.assign(card, next);
                    if (result.leechTriggered) AppState.setSaveStatus('Leech: this card keeps slipping — consider rewording or splitting it.', 'error');
                } else if (quality < 3) {
                    this.studyCards.push(next);
                }
                const stats = this.studyStats;
                if (stats) {
                    stats.done += 1;
                    stats.ratings[quality] = (stats.ratings[quality] || 0) + 1;
                    stats.combo = quality >= 3 ? stats.combo + 1 : 0;
                    stats.bestCombo = Math.max(stats.bestCombo, stats.combo);
                    if (quality < 3) stats.missed.add(card.id);
                    const combo = document.getElementById('study-combo');
                    if (combo) {
                        combo.classList.toggle('hidden', stats.combo < 3);
                        combo.innerHTML = `<i class="fas fa-fire"></i> ${stats.combo} in a row`;
                    }
                }
                if (!this.studySession) this.activeCardIndex += 1;
                this.renderStudyCard();
                if (deck.communitySourceId && window.StudBudCommunityGames?.hasAccount?.() && deck.communitySourceOwnerId !== window.StudBudCloud.user.id && !deck.communityStudyRecorded) {
                    try {
                        await window.StudBudCommunityGames.recordDeckStudy(deck.communitySourceId);
                        await this.updateSavedDeck(deck.id, { communityStudyRecorded: true });
                    } catch (error) {
                        console.error('[NexusApp] Community study count could not sync:', error);
                        AppState.setSaveStatus(`Card progress saved, but the community study count could not sync. ${this.friendlyErrorMessage(error)}`, 'error');
                    }
                }
            } finally {
                this.studyRatingPending = false;
            }
        }

        showStudySummary() {
            const stats = this.studyStats;
            const area = document.getElementById('active-study-area');
            const summary = document.getElementById('study-summary');
            if (!stats || !stats.done || !summary) return this.closeStudy();
            area.classList.add('show-summary');
            const seconds = Math.max(1, Math.round((Date.now() - (this.activeStudyStartedAt || Date.now())) / 1000));
            const good = stats.ratings[3] + stats.ratings[4] + stats.ratings[5];
            const accuracy = Math.round(good / Math.max(1, stats.done) * 100);
            const cheer = accuracy >= 90 ? 'Outstanding!' : accuracy >= 70 ? 'Great session!' : accuracy >= 50 ? 'Nice work, keep going!' : 'Every rep counts!';
            const deck = this.studyDeck();
            const starred = (deck?.cards || []).filter(card => card.starred).length;
            summary.innerHTML = `
                <div class="study-summary-burst" aria-hidden="true"><i class="fas fa-trophy"></i></div>
                <h3>${cheer}</h3>
                <p>${this.cramMode ? 'Cram round complete' : 'Study round complete'} · ${this.escapeHTML(deck?.title || 'Flashcards')}</p>
                <div class="study-summary-stats">
                    <div><strong>${stats.done}</strong><span>cards</span></div>
                    <div><strong>${accuracy}%</strong><span>recalled</span></div>
                    <div><strong>${stats.bestCombo}</strong><span>best streak</span></div>
                    <div><strong>${this.formatStudyDuration(seconds)}</strong><span>time</span></div>
                </div>
                <div class="study-summary-bars" aria-label="Rating breakdown">
                    ${[[1, 'Again'], [3, 'Hard'], [4, 'Good'], [5, 'Easy']].map(([q, label]) => `<div class="ssb ssb-q${q}"><span>${label}</span><i style="--w:${Math.round((stats.ratings[q] || 0) / stats.done * 100)}%"></i><b>${stats.ratings[q] || 0}</b></div>`).join('')}
                </div>
                ${stats.typed ? `<p class="settings-hint">Typed answers: ${stats.typedRight} of ${stats.typed} right.</p>` : ''}
                <div class="actions">
                    ${stats.missed.size ? '<button type="button" class="secondary-btn" data-action="study-missed"><i class="fas fa-rotate-right"></i> Review missed cards</button>' : ''}
                    <button type="button" class="secondary-btn" data-action="cram-deck" data-id="${this.escapeHTML(this.activeDeckId || '')}"><i class="fas fa-bolt"></i> Cram whole set</button>
                    ${starred ? `<button type="button" class="secondary-btn" data-action="cram-starred" data-id="${this.escapeHTML(this.activeDeckId || '')}"><i class="fas fa-star"></i> Starred (${starred})</button>` : ''}
                    <button type="button" class="primary-btn" data-action="close-study"><i class="fas fa-check"></i> Done</button>
                </div>`;
            summary.classList.remove('hidden');
            document.getElementById('study-combo')?.classList.add('hidden');
            const fill = document.getElementById('study-progress-fill');
            if (fill) fill.style.transform = 'scaleX(1)';
            summary.querySelector('.primary-btn')?.focus({ preventScroll: true });
        }

        studyMissedCards() {
            const deck = this.studyDeck();
            const missed = this.studyStats?.missed;
            if (!deck || !missed?.size) return;
            const ids = new Set(missed);
            this.recordFlashcardTime();
            this.studyMode = 'cram';
            this.cramMode = true;
            this.studySession = null;
            this.studyCards = (deck.cards || []).filter(card => ids.has(card.id)).sort(() => Math.random() - .5);
            this.activeCardIndex = 0;
            this.activeStudyStartedAt = Date.now();
            this.studyStats = { total: this.studyCards.length, done: 0, ratings: { 1: 0, 3: 0, 4: 0, 5: 0 }, combo: 0, bestCombo: 0, typed: 0, typedRight: 0, missed: new Set() };
            const area = document.getElementById('active-study-area');
            area.classList.add('is-cram');
            document.getElementById('study-summary').classList.add('hidden');
            area.classList.remove('show-summary');
            this.renderStudyCard();
        }

        recordFlashcardTime() {
            const startedAt = this.activeStudyStartedAt;
            this.activeStudyStartedAt = null;
            if (!startedAt) return;
            const durationSec = Math.min(21600, Math.floor((Date.now() - startedAt) / 1000));
            if (durationSec <= 0) return;
            const studiedDeck = this.studyDeck();
            const link = studiedDeck ? this.deckLinkInfo(studiedDeck) : {};
            const target = link.assessment && link.assessment.status !== 'completed' ? link.assessment : null;
            AppState.recordStudySession({
                id: `flashcards_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                title: target ? `Flashcards: ${studiedDeck.title} → ${target.title}` : `Flashcards: ${studiedDeck?.title || 'study'}`,
                assignmentId: target ? target.id : undefined,
                courseCode: target?.courseCode || link.courseCode || undefined,
                durationSec,
                method: 'flashcards',
                methodLabel: 'Flashcards / spaced review',
                source: 'flashcards'
            }).catch(error => {
                console.error('[NexusApp] Flashcard study time could not be saved:', error);
                AppState.setSaveStatus(`Flashcard progress is saved, but study time could not be recorded. ${this.friendlyErrorMessage(error)}`, 'error');
            });
        }

        closeStudy() {
            this.stopFocusTimer();
            document.getElementById('active-study-area').classList.add('hidden');
            document.getElementById('study-summary')?.classList.add('hidden');
            document.getElementById('study-combo')?.classList.add('hidden');
            document.body.classList.remove('studying');
            this.recordFlashcardTime();
            this.activeDeckId = null;
            this.studyCards = [];
            this.studySession = null;
            this.currentStudyCard = null;
            this.studyStats = null;
            this.cramMode = false;
            this.renderDashboard();
            this.renderDecks();
        }

        solveTargetGPA() {
            const target = Number(document.getElementById('desired-gpa').value);
            const mode = document.getElementById('gpa-solver-mode').value;
            if (!Number.isFinite(target) || target < 0 || target > 5) {
                window.StudBudDialogs.notify('Enter a target GPA between 0 and 5.');
                return;
            }
            const courses = AppState.get('courses') || [];
            const output = document.getElementById('solver-output-percentage');
            const results = document.getElementById('solver-results');
            let detail = document.getElementById('solver-course-breakdown');
            if (!detail) {
                detail = document.createElement('ul');
                detail.id = 'solver-course-breakdown';
                detail.className = 'solver-course-breakdown';
                results.append(detail);
            }
            results.classList.remove('hidden');
            if (!courses.length) {
                output.textContent = 'Add classes first';
                detail.innerHTML = '';
                return;
            }
            const tracked = this.calculateTrackedGPA(courses);
            const current = Number(mode === 'weighted' ? tracked.weighted : tracked.unweighted);
            const plan = this.gpaTargetPlan(target, mode, courses);
            const reachable = plan.reachable;
            const rows = courses.map(course => {
                const needed = plan.byCode.get(course.code);
                const grade = this.calculateCourseGrade(course);
                const gradeText = grade === null ? 'no grades yet' : `now ${grade.toFixed(2)}%`;
                const status = !needed ? 'no target' : grade === null ? `aim for ${needed.minPct}%+ (${needed.letter})`
                    : grade >= needed.minPct ? `on track (${needed.letter} needs ${needed.minPct}%+)` : `need ${needed.minPct}%+ (${needed.letter}), ${(needed.minPct - grade).toFixed(2)} pts to go`;
                return `<li><strong>${this.escapeHTML(course.title || course.code)}</strong><span>${this.escapeHTML(gradeText)} · ${this.escapeHTML(status)}</span></li>`;
            });
            const currentText = Number(tracked.totalCredits) > 0 ? `Current ${mode} GPA ${current.toFixed(2)}` : 'No graded classes yet';
            output.textContent = reachable ? `${currentText} → target ${target.toFixed(2)}` : `${target.toFixed(2)} is above the best possible ${mode} GPA (${plan.gpa.toFixed(2)}) for these classes`;
            detail.innerHTML = rows.join('');
            // Keep the profile target in sync so study priorities use it
            const profile = AppState.get('profile') || {};
            if (Number(profile.targetGpa) !== target) AppState.set('profile', { ...profile, targetGpa: target });
        }

        async saveProfile() {
            const targetGpa = Number(document.getElementById('settings-target-gpa').value);
            const graduationYear = Number(document.getElementById('settings-grad-year').value);
            const school = document.getElementById('settings-school').value;
            if (!Number.isFinite(targetGpa) || targetGpa < 0 || targetGpa > 5) {
                throw new Error('Target GPA must be between 0 and 5.');
            }
            if (!Number.isInteger(graduationYear) || graduationYear < 2026 || graduationYear > 2030) {
                throw new Error('Graduation year must be between 2026 and 2030.');
            }
            if (!this.isKnownSchool(school)) throw new Error('Choose your school from the list.');
            const priorValue = id => {
                const raw = document.getElementById(id)?.value?.trim() || '';
                return raw === '' ? null : Number(raw);
            };
            const priorCredits = priorValue('settings-prior-credits');
            let priorWeightedGpa = priorValue('settings-prior-weighted');
            let priorUnweightedGpa = priorValue('settings-prior-unweighted');
            if (priorCredits !== null && (!Number.isFinite(priorCredits) || priorCredits < 0 || priorCredits > 100)) {
                throw new Error('Past credits must be between 0 and 100.');
            }
            for (const value of [priorWeightedGpa, priorUnweightedGpa]) {
                if (value !== null && (!Number.isFinite(value) || value < 0 || value > 5)) throw new Error('Past GPA must be between 0 and 5.');
            }
            if (priorCredits > 0) {
                if (priorWeightedGpa === null && priorUnweightedGpa === null) throw new Error('Enter your past GPA to go with your past credits.');
                if (priorWeightedGpa === null) priorWeightedGpa = priorUnweightedGpa;
                if (priorUnweightedGpa === null) priorUnweightedGpa = priorWeightedGpa;
            }
            const profile = {
                ...AppState.get('profile'),
                school,
                firstName: document.getElementById('settings-first-name').value.trim(),
                lastName: document.getElementById('settings-last-name').value.trim(),
                graduationYear,
                targetGpa,
                priorCredits: priorCredits > 0 ? priorCredits : 0,
                priorWeightedGpa: priorCredits > 0 ? priorWeightedGpa : null,
                priorUnweightedGpa: priorCredits > 0 ? priorUnweightedGpa : null,
                currentTerm: document.getElementById('settings-current-term').value
            };
            this.semesterView = null;
            AppState.set('profile', profile);
            const savedSchoolSelect = document.getElementById('settings-school');
            if (savedSchoolSelect?.dataset) delete savedSchoolSelect.dataset.dirty;
            const schoolStatus = document.getElementById('school-profile-status');
            if (window.StudBudCommunityGames?.hasAccount?.()) {
                if (schoolStatus) schoolStatus.textContent = 'Saving school…';
                try {
                    await window.StudBudCommunityGames.friendCall('studbud_set_school', { p_school: school });
                    if (schoolStatus) schoolStatus.textContent = 'School saved. Your school tag remains private unless you enable it on your public profile.';
                } catch (error) {
                    if (schoolStatus) schoolStatus.textContent = `Your school was saved on this device, but not to your account. ${this.friendlyErrorMessage(error, 'Re-run supabase-setup.sql and try again.')}`;
                    throw error;
                }
            } else if (schoolStatus) {
                schoolStatus.textContent = 'Saved on this device.';
            }
            this.updateCourseSchoolFields();
            this.renderOtherGradeScaleEditor();
            this.updatePublicSchoolOption();
            this.classrooms?.refreshNav();
            this.renderUI();
            window.StudBudDialogs.notify('Profile saved.');
        }

        async saveOtherGradeScale() {
            if (this.currentSchool() !== 'other') throw new Error('Custom grading scales are available for Other schools.');
            if ((AppState.get('profile') || {}).school !== 'other') {
                throw new Error('Save Other as your school before saving its grading scale.');
            }
            const fields = [...document.querySelectorAll('#other-grade-scale-editor [data-grade-scale]')];
            const original = (AppState.get('profile') || {}).gradeScale || window.STUDBUD_OTHER_GRADE_SCALE;
            const scale = original.map((grade, index) => {
                const read = field => {
                    const input = fields.find(item => Number(item.dataset.gradeScale) === index && item.dataset.gradeField === field);
                    return input && input.value !== '' ? Number(input.value) : Number.NaN;
                };
                return { ...grade, minPct: read('minPct'), unweighted: read('unweighted'), weighted: read('weighted') };
            });
            if (scale.length !== 13 || scale[scale.length - 1].minPct !== 0) throw new Error('Keep all letter grades and set F minimum to 0%.');
            for (let i = 0; i < scale.length; i++) {
                const grade = scale[i];
                if (![grade.minPct, grade.unweighted, grade.weighted].every(Number.isFinite)
                    || grade.minPct < 0 || grade.minPct > 100
                    || grade.unweighted < 0 || grade.unweighted > 5
                    || grade.weighted < grade.unweighted || grade.weighted > 5) {
                    throw new Error(`Check the percentage and point values for ${grade.letter}.`);
                }
                if (i && (scale[i - 1].minPct <= grade.minPct
                    || scale[i - 1].unweighted < grade.unweighted
                    || scale[i - 1].weighted < grade.weighted)) {
                    throw new Error('Grade cutoffs and grade points must descend from A+ through F.');
                }
            }
            scale.forEach((grade, index) => {
                grade.maxPct = index === 0 ? 120 : Math.round((scale[index - 1].minPct - 0.01) * 100) / 100;
            });
            AppState.set('profile', { ...(AppState.get('profile') || {}), gradeScale: scale });
            this.renderOtherGradeScaleEditor();
            this.renderUI();
            document.getElementById('school-profile-status').textContent = 'Custom grading scale saved.';
        }

        async factoryReset() {
            if (!await window.StudBudDialogs.confirm('Permanently delete all locally stored StudBud data?')) return;
            await Promise.all(['flashcards', 'studyHistory', 'gameMetrics'].map(store => NexusDB.clear(store)));
            localStorage.removeItem(AppState.STORAGE_KEY);
            window.location.reload();
        }

        setImporterMode(mode) {
            const manual = mode === 'manual';
            document.querySelectorAll('.importer-mode-btn').forEach(button => {
                const active = button.dataset.importerMode === mode;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', String(active));
            });
            document.getElementById('importer-import-panel').classList.toggle('hidden', manual);
            document.getElementById('importer-manual-panel').classList.toggle('hidden', !manual);
            document.getElementById('importer-mode-hint').textContent = manual
                ? 'Type each term and definition yourself. Add as many cards as you need.'
                : 'Paste tabular flashcard text below. Terms and definitions should be separated by your chosen delimiter, with one card per line.';
            if (manual && !document.querySelector('#manual-card-rows .manual-card-row')) {
                for (let i = 0; i < 3; i++) this.addManualCardRow(false);
            }
        }

        addManualCardRow(focus, front = '', back = '') {
            const list = document.getElementById('manual-card-rows');
            const row = document.createElement('div');
            row.className = 'manual-card-row';
            row.innerHTML = `<span class="manual-card-number"></span>
                <textarea class="manual-card-front" rows="2" placeholder="Term / front" maxlength="500" aria-label="Card front"></textarea>
                <textarea class="manual-card-back" rows="2" placeholder="Definition / back" maxlength="1000" aria-label="Card back"></textarea>
                <button type="button" class="icon-btn" data-action="remove-manual-card" aria-label="Remove card" title="Remove"><i class="fas fa-xmark"></i></button>`;
            const frontEl = row.querySelector('.manual-card-front'), backEl = row.querySelector('.manual-card-back');
            frontEl.value = front; backEl.value = back;
            row.addEventListener('input', () => { row.classList.remove('incomplete'); this.renumberManualCards(); });
            // Enter moves to the next field (Shift+Enter adds a line); Enter or Tab in the last back field starts a new card
            frontEl.addEventListener('keydown', event => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); backEl.focus(); }
            });
            backEl.addEventListener('keydown', event => {
                const last = row === list.lastElementChild;
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (last) this.addManualCardRow(true); else row.nextElementSibling.querySelector('.manual-card-front').focus();
                } else if (event.key === 'Tab' && !event.shiftKey && last && backEl.value.trim()) {
                    event.preventDefault(); this.addManualCardRow(true);
                }
            });
            // Pasting tab-separated lines (e.g. from a spreadsheet) fills one card per line
            frontEl.addEventListener('paste', event => {
                const text = event.clipboardData?.getData('text') || '';
                if (!text.includes('\t') && !text.includes('\n')) return;
                const lines = text.split(/\r?\n/).filter(line => line.trim());
                const parsed = lines.map(line => { const at = line.indexOf('\t'); return at < 0 ? null : [line.slice(0, at).trim(), line.slice(at + 1).trim()]; });
                if (!parsed.length || parsed.some(item => !item)) return;
                event.preventDefault();
                const empty = !frontEl.value.trim() && !backEl.value.trim();
                parsed.forEach(([f, b], index) => {
                    if (index === 0 && empty) { frontEl.value = f; backEl.value = b; } else this.addManualCardRow(false, f, b);
                });
                this.renumberManualCards();
            });
            list.appendChild(row);
            this.renumberManualCards();
            if (focus) { frontEl.focus(); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        }

        renumberManualCards() {
            document.querySelectorAll('#manual-card-rows .manual-card-number').forEach((el, index) => { el.textContent = index + 1; });
            const count = document.getElementById('manual-card-count');
            if (count) {
                const total = Array.from(document.querySelectorAll('#manual-card-rows .manual-card-row')).filter(row => row.querySelector('.manual-card-front').value.trim() && row.querySelector('.manual-card-back').value.trim()).length;
                count.textContent = `${total} complete card${total === 1 ? '' : 's'}`;
            }
        }

        createManualDeck() {
            const nameInput = document.getElementById('import-deck-name');
            const title = nameInput.value.trim();
            const rows = Array.from(document.querySelectorAll('#manual-card-rows .manual-card-row'));
            rows.forEach(row => row.classList.remove('incomplete'));
            const cards = [];
            let partial = 0;
            rows.forEach(row => {
                const front = row.querySelector('.manual-card-front').value.trim();
                const back = row.querySelector('.manual-card-back').value.trim();
                if (front && back) cards.push({ id: `card_${Date.now()}_${Math.random().toString(36).slice(2)}`, front, back, repetitions: 0, interval: 0, easeFactor: 2.5 });
                else if (front || back) { partial++; row.classList.add('incomplete'); }
            });
            if (!title) { window.StudBudDialogs.notify('Enter a deck name first.'); nameInput.focus(); return; }
            if (partial) { window.StudBudDialogs.notify(`${partial} card${partial === 1 ? ' is' : 's are'} missing a front or back (highlighted). Fill ${partial === 1 ? 'it' : 'them'} in or remove ${partial === 1 ? 'it' : 'them'}.`); return; }
            if (!cards.length) { window.StudBudDialogs.notify('Add at least one card with both a front and a back.'); return; }
            AppState.saveFlashcardDeck({ id: `deck_${Date.now()}`, title, cards, ...this.importerDeckLink() }).then(() => {
                nameInput.value = '';
                this.resetImporterDeckLink();
                document.getElementById('manual-card-rows').innerHTML = '';
                for (let i = 0; i < 3; i++) this.addManualCardRow(false);
                Router.navigate('flashcard');
            }).catch(error => {
                console.error('[NexusApp] Manual deck creation failed:', error);
                window.StudBudDialogs.notify(`The deck could not be created. ${this.friendlyErrorMessage(error)}`);
            });
        }

        processFlashcardImport() {
            const title = document.getElementById('import-deck-name').value.trim();
            const rawDelimiter = document.getElementById('import-delimiter').value;
            const delimiter = rawDelimiter === '\\t' ? '\t' : rawDelimiter;
            const rows = document.getElementById('flashcard-import-data').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            const cards = rows.map(line => {
                const splitAt = line.indexOf(delimiter);
                if (splitAt < 0) return null;
                return { id: `card_${Date.now()}_${Math.random().toString(36).slice(2)}`, front: line.slice(0, splitAt).trim(), back: line.slice(splitAt + delimiter.length).trim(), repetitions: 0, interval: 0, easeFactor: 2.5 };
            }).filter(card => card && card.front && card.back);
            if (!title || !cards.length) {
                window.StudBudDialogs.notify('Enter a deck name and at least one valid term/definition row.');
                return;
            }
            AppState.saveFlashcardDeck({ id: `deck_${Date.now()}`, title, cards, ...this.importerDeckLink() }).then(() => {
                Router.navigate('flashcard');
                document.getElementById('import-deck-name').value = '';
                document.getElementById('flashcard-import-data').value = '';
                this.resetImporterDeckLink();
            }).catch(error => {
                console.error('[NexusApp] Flashcard import failed:', error);
                window.StudBudDialogs.notify(`The flashcards could not be imported. ${this.friendlyErrorMessage(error)}`);
            });
        }

        toggleFocusTimer() {
            if (this.timerInterval) {
                this.stopFocusTimer();
                return;
            }
            this.timerInterval = setInterval(() => {
                this.timerSeconds -= 1;
                this.updateFocusTimerDisplay();
                if (this.timerSeconds <= 0) {
                    this.stopFocusTimer(true);
                    window.StudBudDialogs.notify('Focus session complete.');
                }
            }, 1000);
            document.querySelectorAll('.focus-play-btn').forEach(item => {
                item.innerHTML = '<i class="fas fa-pause"></i>';
                item.setAttribute('aria-label', 'Pause focus timer');
            });
        }

        updateFocusTimerDisplay() {
            const time = `${String(Math.floor(this.timerSeconds / 60)).padStart(2, '0')}:${String(this.timerSeconds % 60).padStart(2, '0')}`;
            document.querySelectorAll('.focus-time-display').forEach(display => display.textContent = time);
        }

        stopFocusTimer(reset = false) {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            if (reset) this.timerSeconds = 25 * 60;
            this.updateFocusTimerDisplay();
            document.querySelectorAll('.focus-play-btn').forEach(button => {
                button.innerHTML = '<i class="fas fa-play"></i>';
                button.setAttribute('aria-label', 'Start focus timer');
            });
        }

        startArcade(game) {
            const title = {
                match: 'Memory Match Tower',
                lightning: 'Lightning Round',
                streak: 'Streak Builder',
                survival: 'Survival Mode',
                truefalse: 'True or False',
                test: 'Practice Test'
            }[game];
            if (!title) throw new Error('Unknown game.');
            if (game === 'test') {
                this.showPracticeTestSetup();
                return;
            }
            this.arcadeCardDeck = new Map();
            (AppState.get('flashcards') || []).forEach(deck => (deck.cards || []).forEach(card => this.arcadeCardDeck.set(card, deck)));
            const now = Date.now();
            // Spaced-repetition ordering: cards ready for review and struggling cards first, well-known cards last
            const priority = card => (this.isCardDue(card, now) ? 0 : 10) - Math.min(5, Number(card.lapses || 0)) - (card.lastReviewed ? 0 : 1);
            this.arcadeCards = Array.from(this.arcadeCardDeck.keys())
                .filter(card => card.front && card.back)
                .map(card => ({ card, key: priority(card) + Math.random() * 2 }))
                .sort((a, b) => a.key - b.key)
                .map(item => item.card);
            if (this.arcadeCards.length > 40) this.arcadeCards = this.arcadeCards.slice(0, 40);
            if (this.arcadeCards.length < 2) {
                window.StudBudDialogs.notify('Create a flashcard deck with at least two complete cards to play.');
                return;
            }
            this.arcadeStudyStartedAt = Date.now();
            this.arcadeStudyRecorded = false;
            this.arcadeQuestionIndex = 0;
            this.arcadeScore = 0;
            this.arcadeStreak = 0;
            this.arcadeBestStreak = 0;
            this.arcadePoints = 0;
            this.arcadeAnswered = 0;
            this.arcadeMode = game;
            this.arcadeLives = 3;
            this.arcadeTimeLeft = 60;
            if (this.arcadeTimer) clearInterval(this.arcadeTimer);
            const menu = document.querySelector('.arcade-menu');
            const container = document.getElementById('arcade-canvas-container');
            if (menu) menu.classList.add('hidden');
            if (container) container.classList.remove('hidden');
            document.getElementById('arcade-game-title').textContent = title;
            const canvas = document.getElementById('game-canvas');
            canvas.classList.add('hidden');
            let content = document.getElementById('arcade-game-content');
            if (!content) {
                content = document.createElement('div');
                content.id = 'arcade-game-content';
                content.className = 'arcade-game-content';
                canvas.insertAdjacentElement('afterend', content);
            }
            if (game === 'match') {
                this.prepareMemoryGame();
                return;
            }
            this.renderArcadeQuestion();
            if (game === 'lightning') {
                this.arcadeTimer = setInterval(() => {
                    this.arcadeTimeLeft -= 1;
                    const timer = document.getElementById('arcade-time-left');
                    if (timer) timer.textContent = `${this.arcadeTimeLeft}s`;
                    const fill = document.getElementById('arcade-time-fill');
                    if (fill) fill.style.width = `${Math.max(0, this.arcadeTimeLeft / 60 * 100)}%`;
                    if (this.arcadeTimeLeft <= 10) document.getElementById('arcade-time-chip')?.classList.add('low');
                    if (this.arcadeTimeLeft <= 0) {
                        clearInterval(this.arcadeTimer);
                        this.arcadeTimer = null;
                        this.arcadeQuestionIndex = this.arcadeCards.length;
                        this.renderArcadeQuestion();
                    }
                }, 1000);
            }
        }

        showPracticeTestSetup() {
            if (this.arcadeTimer) {
                clearInterval(this.arcadeTimer);
                this.arcadeTimer = null;
            }
            const decks = AppState.get('flashcards') || [];
            const menu = document.querySelector('.arcade-menu');
            const container = document.getElementById('arcade-canvas-container');
            menu.classList.add('hidden');
            container.classList.remove('hidden');
            document.getElementById('arcade-game-title').textContent = 'Set Up Practice Test';
            document.getElementById('game-canvas').classList.add('hidden');
            let content = document.getElementById('arcade-game-content');
            if (!content) {
                content = document.createElement('div');
                content.id = 'arcade-game-content';
                content.className = 'arcade-game-content';
                document.getElementById('game-canvas').insertAdjacentElement('afterend', content);
            }
            const usableDecks = decks.filter(deck => (deck.cards || []).filter(card => card.front && card.back).length > 0);
            if (!usableDecks.length) {
                content.innerHTML = '<p class="empty-state">Create or import a flashcard deck with terms and definitions before building a test.</p>';
                return;
            }
            content.innerHTML = `
                <form id="practice-test-config-form" class="practice-test-setup">
                    <p>Choose a deck, then how many questions of each type you want. Use 0 to skip a type.</p>
                    <p class="settings-hint">Each matching group counts as one question. Larger tests may repeat cards. Adaptive practice favors lower-accuracy cards without excluding other cards.</p>
                    <label>Flashcard deck
                        <select name="deckId" required>${usableDecks.map(deck =>
                            `<option value="${this.escapeHTML(deck.id)}">${this.escapeHTML(deck.title)} · ${(deck.cards || []).filter(card => card.front && card.back).length} cards</option>`
                        ).join('')}</select>
                    </label>
                    <fieldset class="practice-spread">
                        <legend>Question spread</legend>
                        <label>Multiple choice <input type="number" name="mcCount" min="0" max="50" value="5"></label>
                        <label>Matching (up to 4 pairs each) <input type="number" name="matchCount" min="0" max="50" value="2"></label>
                        <label>Typing <input type="number" name="typeCount" min="0" max="50" value="3"></label>
                    </fieldset>
                    <label>Feedback<select name="feedback"><option value="study">Study: feedback after each answer</option><option value="exam">Exam: answers only at the end</option></select></label>
                    <label>Default for cards without answer rules<select name="grading"><option value="strict">Exact wording (ignore case and spacing)</option><option value="lenient">Vocabulary: allow accents and one small typo</option></select></label>
                    <p class="settings-hint">A card’s saved answer rules take priority. Use keywords for definitions; vocabulary mode is for fixed translations. Numerical values and mathematical signs are never guessed.</p>
                    <label class="settings-check"><input type="checkbox" name="adaptive" checked> Focus on weaker cards using your accuracy</label>
                    <button class="primary-btn" type="submit"><i class="fas fa-play"></i> Start practice test</button>
                </form>`;
        }

        beginPracticeTest(form) {
            const data = new FormData(form);
            const deck = (AppState.get('flashcards') || []).find(item => item.id === data.get('deckId'));
            if (!deck) throw new Error('Choose an available flashcard deck.');
            const availableCards = (deck.cards || []).filter(card => card.front && card.back);
            if (!availableCards.length) throw new Error('Choose a deck with at least one complete card.');
            const count = name => Math.max(0, Math.min(50, Math.floor(Number(data.get(name)) || 0)));
            const counts = { 'multiple-choice': count('mcCount'), matching: count('matchCount'), written: count('typeCount') };
            if (!counts['multiple-choice'] && !counts.matching && !counts.written) throw new Error('Enter how many questions of at least one type you want.');
            const shuffle = list => this.shuffleCards(list);
            this.practiceTestOptions = { strict: data.get('grading') !== 'lenient', exam: data.get('feedback') === 'exam', adaptive: data.get('adaptive') !== null };
            const orderCards = () => this.practiceTestOptions.adaptive ? window.FlashcardTools.adaptiveOrder(availableCards) : shuffle(availableCards);
            let pool = orderCards();
            const draw = () => { if (!pool.length) pool = orderCards(); return pool.shift(); };
            const items = [];
            for (let i = 0; i < counts['multiple-choice']; i++) items.push({ type: 'multiple-choice', cards: [draw()] });
            for (let i = 0; i < counts.written; i++) items.push({ type: 'written', cards: [draw()] });
            for (let i = 0; i < counts.matching; i++) {
                const backs = new Set();
                const group = shuffle(availableCards).filter(card => {
                    const key = this.answerKey(card.back);
                    if (backs.has(key)) return false;
                    backs.add(key);
                    return true;
                }).slice(0, Math.min(4, availableCards.length));
                if (group.length >= 2) items.push({ type: 'matching', cards: group });
            }
            const ordered = items;
            if (!ordered.length) throw new Error('This deck needs cards with different answers for matching questions.');
            this.practiceTestCards = ordered.map(item => item.cards[0]);
            this.practiceTestDeckCards = availableCards;
            this.practiceTestGroups = ordered.map(item => item.cards);
            this.practiceTestQuestionTypes = ordered.map(item => item.type);
            this.practiceTestAnswers = [];
            this.practiceTestDeckId = deck.id;
            this.arcadeCardDeck = new Map(availableCards.map(card => [card, deck]));
            this.arcadeMode = 'test';
            this.arcadeQuestionIndex = 0;
            this.arcadeScore = 0;
            this.arcadeStudyStartedAt = Date.now();
            this.arcadeStudyRecorded = false;
            document.getElementById('arcade-game-title').textContent = `${deck.title} · Practice Test`;
            this.renderPracticeTestQuestion();
        }

        renderPracticeTestQuestion() {
            const content = document.getElementById('arcade-game-content');
            if (!content) return;
            const index = this.arcadeQuestionIndex;
            if (index >= this.practiceTestCards.length) {
                this.renderPracticeTestResults();
                return;
            }
            const card = this.practiceTestCards[index];
            const questionType = this.practiceTestQuestionTypes[index];
            content.innerHTML = '';
            const progress = document.createElement('p');
            progress.className = 'practice-test-progress';
            progress.textContent = `Question ${index + 1} of ${this.practiceTestCards.length}${this.practiceTestOptions?.exam ? ' · Exam mode' : ` · ${this.arcadeScore} correct`}`;
            const question = document.createElement('h4');
            question.textContent = card.front;
            const form = document.createElement('form');
            form.id = 'practice-test-answer-form';
            form.dataset.questionType = questionType;
            if (questionType === 'multiple-choice') {
                const choices = this.shuffleCards([card, ...this.pickDistractorCards(card, this.practiceTestDeckCards || this.practiceTestCards, 3)]);
                if (choices.length < 2) {
                    this.practiceTestQuestionTypes[index] = 'written';
                    this.renderPracticeTestQuestion();
                    return;
                }
                const options = document.createElement('div');
                options.className = 'arcade-answer-options';
                choices.forEach((option, choiceIndex) => {
                    const label = document.createElement('label');
                    label.className = 'practice-test-choice';
                    label.innerHTML = `<input type="radio" name="answer" value="${choiceIndex}" required><span></span>`;
                    label.querySelector('span').textContent = option.back;
                    options.append(label);
                });
                this.practiceTestCorrectChoice = choices.findIndex(option => option === card);
                form.append(options);
            } else if (questionType === 'matching') {
                const group = this.practiceTestGroups[index];
                const definitions = this.shuffleCards(group);
                question.textContent = 'Match each term with its definition';
                const rows = document.createElement('div');
                rows.className = 'practice-matching';
                group.forEach((item, rowIndex) => {
                    const row = document.createElement('label');
                    row.className = 'practice-matching-row';
                    const term = document.createElement('strong');
                    term.textContent = item.front;
                    const select = document.createElement('select');
                    select.name = `match${rowIndex}`;
                    select.required = true;
                    select.innerHTML = '<option value="">Choose a definition…</option>';
                    definitions.forEach((def, defIndex) => {
                        const option = document.createElement('option');
                        option.value = String(defIndex);
                        option.textContent = def.back;
                        select.append(option);
                    });
                    row.append(term, select);
                    rows.append(row);
                });
                form.dataset.defOrder = JSON.stringify(definitions.map(def => group.indexOf(def)));
                form.append(rows);
            } else {
                const label = document.createElement('label');
                label.className = 'practice-test-written';
                label.htmlFor = 'practice-test-written-answer';
                label.textContent = card.answerMode === 'keywords' ? 'Explain in your own words (all saved keyword groups required)'
                    : (card.answerMode === 'vocabulary' || (!card.answerMode && this.practiceTestOptions?.strict === false)) ? 'Type the translation or vocabulary answer (minor spelling tolerance)'
                        : 'Your answer (saved wording or an accepted alternative; case and spacing ignored)';
                const answer = document.createElement('textarea');
                answer.id = 'practice-test-written-answer';
                answer.name = 'answer';
                answer.rows = 3;
                answer.required = true;
                answer.autocomplete = 'off';
                label.append(answer);
                form.append(label);
            }
            const submit = document.createElement('button');
            submit.className = 'primary-btn';
            submit.type = 'submit';
            submit.textContent = this.practiceTestOptions?.exam ? 'Submit answer' : 'Check answer';
            form.append(submit);
            content.append(progress, question, form);
            if (questionType === 'written') document.getElementById('practice-test-written-answer').focus();
        }

        async submitPracticeTestAnswer(form) {
            if (form.dataset.submitted === 'true') return;
            const card = this.practiceTestCards[this.arcadeQuestionIndex];
            if (!card) return;
            const data = new FormData(form);
            let correct;
            let givenAnswer;
            let recorded = card;
            let outcomes = [];
            if (form.dataset.questionType === 'matching') {
                const group = this.practiceTestGroups[this.arcadeQuestionIndex];
                const order = JSON.parse(form.dataset.defOrder || '[]');
                const picks = group.map((_, i) => {
                    const value = data.get(`match${i}`);
                    return value === null || value === '' ? undefined : order[Number(value)];
                });
                if (picks.some(pick => pick === undefined)) throw new Error('Pick a definition for every term.');
                correct = picks.every((pick, i) => pick === i);
                outcomes = group.map((item, i) => ({ card: item, correct: picks[i] === i }));
                givenAnswer = group.map((item, i) => `${item.front} → ${group[picks[i]].back}`).join('; ');
                recorded = { front: `Matching: ${group.map(item => item.front).join(', ')}`, back: group.map(item => `${item.front} → ${item.back}`).join('; ') };
            } else if (form.dataset.questionType === 'multiple-choice') {
                const selected = data.get('answer');
                if (selected === null) throw new Error('Choose an answer first.');
                correct = Number(selected) === this.practiceTestCorrectChoice;
                givenAnswer = form.querySelector(`input[value="${CSS.escape(selected)}"]`)?.closest('label').querySelector('span')?.textContent || '';
            } else {
                givenAnswer = String(data.get('answer') || '').trim();
                if (!givenAnswer) throw new Error('Enter a written answer first.');
                correct = window.FlashcardTools.gradeCard(givenAnswer, card, this.practiceTestOptions?.strict !== false);
            }
            form.dataset.submitted = 'true';
            if (!outcomes.length) outcomes = [{ card, correct }];
            outcomes = outcomes.map(outcome => ({ ...outcome, kind: form.dataset.questionType === 'written' || !['matching', 'multiple-choice'].includes(form.dataset.questionType) ? 'recall' : 'recognition' }));
            try {
                await this.updateCardSchedules(outcomes);
            } catch (error) {
                delete form.dataset.submitted;
                throw error;
            }
            if (correct) this.arcadeScore += 1;
            this.practiceTestAnswers.push({ card: recorded, givenAnswer, correct, outcomes });

            const feedback = document.createElement('p');
            feedback.className = `practice-test-feedback${this.practiceTestOptions?.exam ? '' : correct ? ' is-correct' : ' is-incorrect'}`;
            if (this.practiceTestOptions?.exam) feedback.textContent = 'Answer recorded.';
            else feedback.innerHTML = `${correct ? 'Correct!' : 'Not quite.'} <div>${this.cardAnswerMarkup(recorded)}</div>`;
            const next = document.createElement('button');
            next.className = 'primary-btn';
            next.textContent = this.arcadeQuestionIndex + 1 === this.practiceTestCards.length ? 'See results' : 'Next question';
            next.addEventListener('click', () => {
                this.arcadeQuestionIndex += 1;
                if (this.practiceTestOptions?.adaptive) {
                    const remaining = this.practiceTestCards.slice(this.arcadeQuestionIndex).map((item, i) => ({
                        card: item, group: this.practiceTestGroups[this.arcadeQuestionIndex + i], type: this.practiceTestQuestionTypes[this.arcadeQuestionIndex + i]
                    }));
                    const ordered = window.FlashcardTools.adaptiveOrder(remaining.map(item => ({ ...item.card, entry: item })));
                    ordered.forEach((item, i) => {
                        const at = this.arcadeQuestionIndex + i;
                        this.practiceTestCards[at] = item.entry.card;
                        this.practiceTestGroups[at] = item.entry.group;
                        this.practiceTestQuestionTypes[at] = item.entry.type;
                    });
                }
                this.renderPracticeTestQuestion();
            });
            form.replaceWith(feedback, next);
            next.focus();
        }

        renderPracticeTestResults() {
            this.finishArcadeStudySession();
            const content = document.getElementById('arcade-game-content');
            const total = this.practiceTestCards.length;
            const percent = total ? Math.round(this.arcadeScore / total * 100) : 0;
            content.innerHTML = `<section class="practice-test-results">
                <h4>Test complete</h4>
                <p class="practice-test-score">${this.arcadeScore} / ${total} correct · ${percent}%</p>
                <div class="practice-test-review"></div>
                ${this.studySetMarkup({ deckId: this.practiceTestDeckId })}
                ${this.practiceTestAnswers.some(answer => !answer.correct) ? '<button class="secondary-btn" data-action="practice-retry-missed">Retry missed cards</button>' : ''}
                <button class="primary-btn" data-action="arcade-restart">Try another test</button>
            </section>`;
            const review = content.querySelector('.practice-test-review');
            this.practiceTestAnswers.forEach((answer, index) => {
                const row = document.createElement('article');
                row.className = `practice-test-review-item ${answer.correct ? 'is-correct' : 'is-incorrect'}`;
                const heading = document.createElement('strong');
                heading.textContent = `${index + 1}. ${answer.card.front}`;
                const response = document.createElement('span');
                response.textContent = `Your answer: ${answer.givenAnswer}`;
                const expected = document.createElement('span');
                expected.textContent = `Correct answer: ${answer.card.back}`;
                row.append(heading, response, expected);
                const illustration = document.createElement('div');
                illustration.innerHTML = this.cardAnswerMarkup({ ...answer.card, back: '' });
                row.append(illustration);
                review.append(row);
            });
        }

        retryMissedPracticeCards() {
            const missed = [...new Set(this.practiceTestAnswers.flatMap(answer => (answer.outcomes || []).filter(outcome => !outcome.correct).map(outcome => outcome.card)))];
            if (!missed.length) throw new Error('There are no missed cards to retry.');
            this.practiceTestCards = window.FlashcardTools.adaptiveOrder(missed);
            this.practiceTestGroups = this.practiceTestCards.map(card => [card]);
            this.practiceTestQuestionTypes = this.practiceTestCards.map(() => 'written');
            this.practiceTestAnswers = [];
            this.arcadeQuestionIndex = 0;
            this.arcadeScore = 0;
            this.arcadeStudyStartedAt = Date.now();
            this.arcadeStudyRecorded = false;
            this.renderPracticeTestQuestion();
        }

        prepareMemoryGame() {
            if (this.memoryMismatchTimeout) clearTimeout(this.memoryMismatchTimeout);
            const labels = new Set();
            const selectedCards = this.arcadeCards.filter(card => {
                const front = this.answerKey(card.front);
                const back = this.answerKey(card.back);
                if (front === back || labels.has(front) || labels.has(back)) return false;
                labels.add(front);
                labels.add(back);
                return true;
            }).slice(0, 8);
            this.memoryCards = this.shuffleCards(selectedCards.flatMap((card, index) => [
                { pair: index, label: card.front },
                { pair: index, label: card.back }
            ]));
            this.memoryRevealed = [];
            this.memoryMatched = new Set();
            this.memoryLock = false;
            this.arcadeScore = 0;
            this.memoryMoves = 0;
            this.memoryStartedAt = Date.now();
            this.renderMemoryGame();
        }

        renderMemoryGame() {
            const content = document.getElementById('arcade-game-content');
            if (!content) return;
            if (this.memoryMatched.size === this.memoryCards.length / 2) {
                this.finishArcadeStudySession();
                const pairs = this.memoryCards.length / 2;
                const seconds = Math.max(1, Math.round((Date.now() - (this.memoryStartedAt || Date.now())) / 1000));
                // Accuracy here is efficiency: a perfect memory needs one move per pair.
                content.innerHTML = this.arcadeResultsMarkup({ heading: 'Tower cleared!', correct: pairs, total: Math.max(pairs, this.memoryMoves || pairs),
                    extra: [[`${seconds}s`, 'Time']] }).replace('<span>Correct</span>', '<span>Pairs / moves</span>').replace('<span>Accuracy</span>', '<span>Efficiency</span>');
                window.StudBudSfx?.play?.('win');
                return;
            }
            content.innerHTML = '';
            const progress = document.createElement('div');
            progress.className = 'arcade-hud';
            progress.innerHTML = `<span class="arcade-count">${this.arcadeScore} / ${this.memoryCards.length / 2} pairs</span><span class="arcade-chip"><i class="fas fa-shoe-prints" aria-hidden="true"></i> ${this.memoryMoves || 0} moves</span>`;
            const grid = document.createElement('div');
            grid.className = 'memory-card-grid';
            this.memoryCards.forEach((card, index) => {
                const button = document.createElement('button');
                button.className = 'memory-card';
                button.dataset.action = 'memory-pick';
                button.dataset.index = String(index);
                const isVisible = this.memoryRevealed.includes(index) || this.memoryMatched.has(card.pair);
                button.textContent = isVisible ? card.label : '?';
                button.classList.toggle('revealed', isVisible);
                button.classList.toggle('matched', this.memoryMatched.has(card.pair));
                button.disabled = this.memoryLock || this.memoryMatched.has(card.pair) || isVisible;
                grid.append(button);
            });
            content.append(progress, grid);
        }

        pickMemoryCard(index) {
            if (this.memoryLock || this.memoryRevealed.includes(index)) return;
            const card = this.memoryCards[index];
            if (!card || this.memoryMatched.has(card.pair)) return;
            this.memoryRevealed.push(index);
            if (this.memoryRevealed.length < 2) {
                this.renderMemoryGame();
                return;
            }

            const [firstIndex, secondIndex] = this.memoryRevealed;
            this.memoryMoves = (this.memoryMoves || 0) + 1;
            if (this.memoryCards[firstIndex].pair === this.memoryCards[secondIndex].pair) {
                window.StudBudSfx?.play?.('correct');
                this.memoryMatched.add(card.pair);
                this.arcadeScore = this.memoryMatched.size;
                this.memoryRevealed = [];
                this.renderMemoryGame();
                return;
            }

            this.memoryLock = true;
            this.renderMemoryGame();
            this.memoryMismatchTimeout = setTimeout(() => {
                this.memoryRevealed = [];
                this.memoryLock = false;
                this.memoryMismatchTimeout = null;
                this.renderMemoryGame();
            }, 700);
        }

        arcadeResultsMarkup({ heading, correct, total, extra = [] }) {
            const pct = total ? Math.round(correct / total * 100) : 0;
            const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
            const line = stars === 3 ? 'Flawless. You know this cold.' : stars === 2 ? 'Great run! A little more and it is locked in.' : stars === 1 ? 'Nice start. Run it back to level up.' : 'Every miss is a card you will remember next time.';
            const stats = [[`${correct}/${total}`, 'Correct'], [`${pct}%`, 'Accuracy'], ...extra];
            return `<div class="arcade-results">
                <div class="arcade-stars" aria-label="${stars} of 3 stars">${[1, 2, 3].map(n => `<i class="fas fa-star${n <= stars ? ' earned' : ''}" style="--i:${n}" aria-hidden="true"></i>`).join('')}</div>
                <h4>${this.escapeHTML(heading)}</h4>
                <p class="arcade-results-line">${line}</p>
                <div class="arcade-results-stats">${stats.map(([value, label]) => `<div><strong>${this.escapeHTML(String(value))}</strong><span>${this.escapeHTML(label)}</span></div>`).join('')}</div>
                <div class="arcade-results-actions"><button type="button" class="primary-btn" data-action="arcade-restart"><i class="fas fa-rotate-right" aria-hidden="true"></i> Play again</button><button type="button" class="secondary-btn" data-action="arcade-exit"><i class="fas fa-grip" aria-hidden="true"></i> All games</button></div>
            </div>`;
        }

        arcadeHudMarkup(afterAnswer = false) {
            const total = this.arcadeCards.length;
            const done = Math.min(this.arcadeQuestionIndex, total);
            const chips = [`<span class="arcade-chip"><i class="fas fa-bolt" aria-hidden="true"></i> <b id="arcade-points">${this.arcadePoints || 0}</b></span>`];
            if (this.arcadeStreak >= 2) chips.push(`<span class="arcade-chip streak${this.arcadeStreak >= 5 ? ' hot' : ''}"><i class="fas fa-fire" aria-hidden="true"></i> ${this.arcadeStreak}</span>`);
            if (this.arcadeMode === 'survival') chips.push(`<span class="arcade-chip lives" aria-label="${this.arcadeLives} lives left">${[0, 1, 2].map(n => `<i class="fas fa-heart${n < this.arcadeLives ? '' : ' lost'}" aria-hidden="true"></i>`).join('')}</span>`);
            if (this.arcadeMode === 'lightning') chips.push(`<span class="arcade-chip timer${this.arcadeTimeLeft <= 10 ? ' low' : ''}" id="arcade-time-chip"><i class="fas fa-stopwatch" aria-hidden="true"></i> <b id="arcade-time-left">${this.arcadeTimeLeft}s</b></span>`);
            const bar = this.arcadeMode === 'lightning'
                ? `<div class="arcade-track lightning"><span id="arcade-time-fill" style="width:${Math.max(0, this.arcadeTimeLeft / 60 * 100)}%"></span></div>`
                : `<div class="arcade-track"><span style="width:${total ? done / total * 100 : 0}%"></span></div>`;
            return `<div class="arcade-hud"><span class="arcade-count">${this.arcadeMode === 'lightning' ? `${this.arcadeScore} correct` : `${Math.min(afterAnswer ? done : done + 1, total)} / ${total}`}</span>${chips.join('')}</div>${bar}`;
        }

        renderArcadeQuestion() {
            const content = document.getElementById('arcade-game-content');
            if (!content) return;
            clearTimeout(this.arcadeAdvanceTimer);
            if (this.arcadeQuestionIndex >= this.arcadeCards.length || (this.arcadeMode === 'survival' && this.arcadeLives <= 0)) {
                this.finishArcadeStudySession();
                if (this.arcadeTimer) { clearInterval(this.arcadeTimer); this.arcadeTimer = null; }
                const answered = this.arcadeMode === 'lightning' ? Math.max(this.arcadeAnswered || 0, 1) : this.arcadeCards.length;
                const heading = this.arcadeMode === 'survival' && this.arcadeLives <= 0 ? 'Out of lives!'
                    : this.arcadeMode === 'lightning' ? (this.arcadeTimeLeft <= 0 ? 'Time!' : 'Deck cleared!') : 'Round complete!';
                content.innerHTML = this.arcadeResultsMarkup({ heading, correct: this.arcadeScore, total: this.arcadeMode === 'survival' ? (this.arcadeAnswered || 0) : answered,
                    extra: [[this.arcadePoints || 0, 'Points'], [this.arcadeBestStreak || 0, 'Best streak']] });
                window.StudBudSfx?.play?.(this.arcadeScore >= answered * .7 ? 'win' : 'success');
                content.querySelector('[data-action="arcade-restart"]')?.focus();
                return;
            }

            const card = this.arcadeCards[this.arcadeQuestionIndex];
            let options;
            let statement = '';
            if (this.arcadeMode === 'truefalse') {
                const distractor = this.pickDistractorCards(card, this.arcadeCards, 1)[0];
                // Without a different answer to show, the statement can only be the real one
                const showTrue = Math.random() < 0.5 || !distractor;
                this.arcadeCurrentIsTrue = showTrue;
                this.arcadeOptions = [true, false];
                statement = `<p class="true-false-statement">${this.escapeHTML(showTrue ? card.back : distractor.back)}</p>`;
                options = [['T', '<i class="fas fa-check" aria-hidden="true"></i> True', 'tf-true'], ['F', '<i class="fas fa-xmark" aria-hidden="true"></i> False', 'tf-false']];
            } else {
                this.arcadeOptions = this.shuffleCards([card, ...this.pickDistractorCards(card, this.arcadeCards, 3)]);
                options = this.arcadeOptions.map((option, index) => [String(index + 1), this.escapeHTML(option.back), `opt-${index}`]);
            }
            const image = window.FlashcardTools.imageSource(card.questionImage || card.image);
            content.innerHTML = `<div class="arcade-play arcade-mode-${this.arcadeMode}">
                ${this.arcadeHudMarkup()}
                <div class="arcade-question-card">
                    <span class="arcade-question-label">${this.arcadeMode === 'truefalse' ? 'Does this match?' : 'Pick the answer'}</span>
                    <h4>${this.escapeHTML(card.front)}</h4>${image ? `<img class="flashcard-answer-image" src="${image}" alt="">` : ''}
                    ${statement}
                </div>
                <div class="arcade-answer-options${this.arcadeMode === 'truefalse' ? ' tf' : ''}">${options.map(([key, label, cls], index) =>
                    `<button type="button" class="arcade-option ${cls}" data-action="arcade-answer" data-index="${index}"><kbd>${key}</kbd><span>${label}</span></button>`).join('')}</div>
                <div id="arcade-feedback" class="arcade-feedback" aria-live="polite"></div>
            </div>`;
        }

        shuffleCards(cards) {
            const shuffled = [...cards];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }

        answerKey(text) {
            return window.FlashcardTools.answerKey(text);
        }

        pickDistractorCards(card, pool, count) {
            return window.FlashcardTools.distractors(card, pool, count, { vary: true });
        }

        cardAnswerMarkup(card) {
            const image = window.FlashcardTools.imageSource(card.answerImage);
            return `${this.escapeHTML(card.back || '')}${image ? `<img class="flashcard-answer-image" src="${image}" alt="Answer illustration">` : ''}${this.cardAttachmentMarkup(card)}`;
        }

        cardAttachmentMarkup(card) {
            return (card.attachments || []).map(attachment => {
                const data = window.FlashcardTools.attachmentSource(attachment);
                if (!data) return '';
                const name = this.escapeHTML(attachment.name);
                return `<div class="card-attachment">${attachment.type.startsWith('audio/') ? `<audio controls preload="none" src="${data}" aria-label="${name}"></audio>` : ''}<a href="${data}" download="${name}">${name} <span>(download)</span></a></div>`;
            }).join('');
        }

        async updateCardSchedule(card, correct) {
            return this.updateCardSchedules([{ card, correct }]);
        }

        async updateCardSchedules(outcomes) {
            const groups = new Map();
            for (const outcome of outcomes) {
                const deck = this.arcadeCardDeck?.get(outcome.card);
                if (!deck) continue;
                if (!groups.has(deck.id)) groups.set(deck.id, []);
                groups.get(deck.id).push(outcome);
            }
            for (const [deckId, answers] of groups) {
                const current = (AppState.get('flashcards') || []).find(item => item.id === deckId);
                if (!current || answers.some(answer => !current.cards.some(card => card.id === answer.card.id))) throw new Error('This card was removed. Reopen practice before continuing.');
                const cards = current.cards.map(saved => {
                    const answer = answers.find(item => item.card.id === saved.id);
                    if (!answer) return saved;
                    const next = { ...saved };
                    window.FlashcardTools.recordAnswer(next, answer.correct, answer.kind || 'recognition');
                    return next;
                });
                await AppState.saveFlashcardDeck({ ...current, cards });
                answers.forEach(answer => Object.assign(answer.card, cards.find(card => card.id === answer.card.id)));
            }
        }

        async answerArcade(index) {
            if (this.arcadeAnswerPending || !this.arcadeOptions || index < 0 || index >= this.arcadeOptions.length) return;
            const content = document.getElementById('arcade-game-content');
            if (content?.querySelector('[data-action="arcade-answer"]:disabled')) return;
            const correctCard = this.arcadeCards[this.arcadeQuestionIndex];
            const correct = this.arcadeMode === 'truefalse'
                ? this.arcadeOptions[index] === this.arcadeCurrentIsTrue
                : this.arcadeOptions[index] === correctCard;
            this.arcadeAnswerPending = true;
            try { await this.updateCardSchedule(correctCard, correct); }
            finally { this.arcadeAnswerPending = false; }
            this.arcadeAnswered = (this.arcadeAnswered || 0) + 1;
            if (correct) this.arcadeScore += 1;
            this.arcadeStreak = correct ? this.arcadeStreak + 1 : 0;
            this.arcadeBestStreak = Math.max(this.arcadeBestStreak || 0, this.arcadeStreak);
            const gained = correct ? 100 + Math.min(this.arcadeStreak - 1, 10) * 20 + (this.arcadeMode === 'lightning' ? 30 : 0) : 0;
            this.arcadePoints = (this.arcadePoints || 0) + gained;
            if (this.arcadeMode === 'survival' && !correct) this.arcadeLives -= 1;
            document.querySelectorAll('#arcade-game-content [data-action="arcade-answer"]').forEach(button => {
                button.disabled = true;
                const value = this.arcadeOptions[Number(button.dataset.index)];
                const isRight = this.arcadeMode === 'truefalse' ? value === this.arcadeCurrentIsTrue : value === correctCard;
                if (isRight) button.classList.add('correct');
                else if (Number(button.dataset.index) === index) button.classList.add('wrong');
            });
            window.StudBudSfx?.play?.(correct ? 'correct' : 'wrong');
            const play = content?.querySelector('.arcade-play');
            const hud = play?.querySelector('.arcade-hud');
            const last = this.arcadeQuestionIndex + 1 === this.arcadeCards.length || (this.arcadeMode === 'survival' && this.arcadeLives <= 0);
            this.arcadeQuestionIndex += 1;
            if (hud) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = this.arcadeHudMarkup(true);
                hud.nextElementSibling?.remove();
                hud.replaceWith(...wrapper.children);
            }
            const praise = ['Correct!', 'Nice!', 'Nailed it!', 'Boom!', 'On fire!'];
            const feedback = document.getElementById('arcade-feedback');
            if (feedback) {
                feedback.className = `arcade-feedback ${correct ? 'good' : 'bad'}`;
                feedback.innerHTML = `<div class="arcade-feedback-head"><strong>${correct ? praise[Math.min(this.arcadeStreak - 1, praise.length - 1)] : 'Not quite'}</strong>${gained ? `<span class="arcade-gain">+${gained}</span>` : ''}</div>
                    ${correct && this.arcadeMode !== 'truefalse' ? '' : `<div class="arcade-feedback-answer"><span>${this.escapeHTML(correctCard.front)}</span> <i class="fas fa-arrow-right" aria-hidden="true"></i> ${this.cardAnswerMarkup(correctCard)}</div>`}
                    <button type="button" class="primary-btn" data-action="arcade-next">${last ? 'See results' : 'Next'} <kbd>Enter</kbd></button>`;
                const next = feedback.querySelector('[data-action="arcade-next"]');
                next?.focus({ preventScroll: true });
            }
            // Lightning keeps momentum: correct answers move on by themselves.
            if (this.arcadeMode === 'lightning' && correct && !last) this.arcadeAdvanceTimer = setTimeout(() => this.renderArcadeQuestion(), 650);
        }

        handleArcadeKey(event) {
            const content = document.getElementById('arcade-game-content');
            const container = document.getElementById('arcade-canvas-container');
            if (!content || !container || container.classList.contains('hidden') || !content.querySelector('.arcade-play, .arcade-results')) return;
            if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, textarea, select')) return;
            const key = event.key.toLowerCase();
            const options = [...content.querySelectorAll('[data-action="arcade-answer"]:not(:disabled)')];
            let index = -1;
            if (options.length && this.arcadeMode === 'truefalse') index = key === 't' ? 0 : key === 'f' ? 1 : ['1', '2'].includes(key) ? Number(key) - 1 : -1;
            else if (options.length && /^[1-4]$/.test(key)) index = Number(key) - 1;
            if (index >= 0) {
                event.preventDefault();
                this.answerArcade(index);
                return;
            }
            if (key === 'enter' && event.target.tagName !== 'BUTTON') {
                const next = content.querySelector('[data-action="arcade-next"], [data-action="arcade-restart"]');
                if (next) { event.preventDefault(); next.click(); }
            }
        }

        async awardSoloCoins() {
            if (window.StudBudCloud?.offlineMode || window.navigator?.onLine === false) return;
            const mode = this.arcadeMode;
            const correct = Number(this.arcadeScore) || 0;
            const total = mode === 'test' ? (this.practiceTestAnswers || []).length
                : mode === 'match' ? Math.floor((this.memoryCards || []).length / 2)
                    : Number(this.arcadeQuestionIndex) || 0;
            if (!total || !correct || !window.StudBudCloud?.user || !window.StudBudCommunityGames) return;
            try {
                const profile = await window.StudBudCommunityGames.awardSoloCoins(Math.min(correct, total), total);
                this.multiplayerProfile = profile;
                this.renderMultiplayerProfile(true);
                const earned = Number(profile.coins_awarded || 0);
                AppState.setSaveStatus(earned ? `You earned ${earned} coins!` : 'Daily game coin limit reached. Come back tomorrow!', 'saved');
            } catch (error) {
                console.error('[NexusApp] Coins could not be awarded:', error);
            }
        }

        async finishArcadeStudySession() {
            if (!this.arcadeStudyStartedAt || this.arcadeStudyRecorded) return;
            this.arcadeStudyRecorded = true;
            this.awardSoloCoins();
            const durationSec = Math.min(21600, Math.floor((Date.now() - this.arcadeStudyStartedAt) / 1000));
            this.arcadeStudyStartedAt = null;
            if (!durationSec) return;
            try {
                await AppState.recordStudySession({
                    id: `arcade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    title: `Study game: ${document.getElementById('arcade-game-title')?.textContent || 'Practice'}`,
                    durationSec,
                    method: 'practice',
                    methodLabel: 'Practice problems / timed questions',
                    source: 'arcade'
                });
            } catch (error) {
                console.error('[NexusApp] Arcade study time could not be saved:', error);
                AppState.setSaveStatus(`Your game progress is complete, but study time could not be recorded. ${this.friendlyErrorMessage(error)}`, 'error');
            }
        }

        closeArcade() {
            this.finishArcadeStudySession();
            clearTimeout(this.arcadeAdvanceTimer);
            if (this.arcadeTimer) {
                clearInterval(this.arcadeTimer);
                this.arcadeTimer = null;
            }
            if (this.memoryMismatchTimeout) {
                clearTimeout(this.memoryMismatchTimeout);
                this.memoryMismatchTimeout = null;
            }
            document.querySelector('.arcade-menu').classList.remove('hidden');
            document.getElementById('arcade-canvas-container').classList.add('hidden');
            document.getElementById('game-canvas').classList.remove('hidden');
        }
    }

    window.NexusApp = new AppOrchestrator();
    window.StudBudClassrooms?.attach(window.NexusApp);

    const start = () => window.StudBudCloud.bootstrap().catch(error => {
        console.error('[NexusApp] Startup failed:', error);
        const status = document.getElementById('auth-status');
        if (status) {
            status.textContent = `StudBud could not start. ${window.NexusApp.friendlyErrorMessage(error, 'Reload the page and try again.')}`;
            status.classList.add('error');
        }
        document.getElementById('auth-screen')?.classList.remove('hidden');
        document.getElementById('app-container')?.classList.add('hidden');
    });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

})(window);
