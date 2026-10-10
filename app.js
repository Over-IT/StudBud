/**
 * NEXUS STUDENT HUB - PCHS EDITION
 * FILE: app.js
 * DESCRIPTION: Core application orchestrator, reactive state engine, dual-persistence 
 * storage manager (LocalStorage + IndexedDB), single-page router engine, and a 100% 
 * procedural Web Audio API soundscape synthesizer.
 */

(function (window) {
    'use strict';

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
                gradeScenarios: [],
                selectedGradeScenarioId: null,
                flashcards: [],
                studyHistory: [],
                gameMetrics: { level: 1, xp: 0, streakDays: 0, lastStudyDate: null },
                settings: {
                    theme: "dark",
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
                        gradeScenarios: Array.isArray(parsed.gradeScenarios) ? parsed.gradeScenarios : this.state.gradeScenarios,
                        selectedGradeScenarioId: parsed.selectedGradeScenarioId || this.state.selectedGradeScenarioId,
                        schedule: parsed.schedule && typeof parsed.schedule === 'object'
                            ? { all: {}, odd: {}, even: {}, ...parsed.schedule }
                            : this.state.schedule
                    };
                } else {
                    this.saveToLocalStorage();
                }
                if (this.state.profile) delete this.state.profile.lastName;

                const flashcards = await NexusDB.getAll('flashcards');
                const studyHistory = await NexusDB.getAll('studyHistory');
                const metrics = await NexusDB.get('gameMetrics', 'user_metrics');

                this.state.flashcards = flashcards;
                this.state.studyHistory = studyHistory;
                if (metrics) this.state.gameMetrics = metrics;
                else await NexusDB.put('gameMetrics', { id: 'user_metrics', ...this.state.gameMetrics });
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
                this.setSaveStatus('Could not save on this device. Export a backup before leaving.', 'error');
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
            await NexusDB.put('flashcards', deck);
            this.setSaveStatus('Flashcard deck saved on this device.');
            
            const index = this.state.flashcards.findIndex(d => d.id === deck.id);
            if (index !== -1) this.state.flashcards[index] = deck;
            else this.state.flashcards.push(deck);

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

        async exportAppState() {
            const allFlashcards = await NexusDB.getAll('flashcards');
            const allHistory = await NexusDB.getAll('studyHistory');

            const fullBackup = {
                version: "1.0.0",
                exportedAt: new Date().toISOString(),
                state: {
                    profile: this.state.profile,
                    courses: this.state.courses,
                    assignments: this.state.assignments,
                    gradeScenarios: this.state.gradeScenarios,
                    selectedGradeScenarioId: this.state.selectedGradeScenarioId,
                    gameMetrics: this.state.gameMetrics,
                    settings: this.state.settings,
                    schedule: this.state.schedule
                },
                flashcards: allFlashcards,
                studyHistory: allHistory
            };

            return JSON.stringify(fullBackup, null, 2);
        }

        async importAppState(jsonData) {
            try {
                const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

                if (!parsed.state || !parsed.version) {
                    throw new Error("Invalid backup format.");
                }

                await NexusDB.clear('flashcards');
                await NexusDB.clear('studyHistory');
                await NexusDB.clear('gameMetrics');

                if (Array.isArray(parsed.flashcards)) {
                    for (const deck of parsed.flashcards) await NexusDB.put('flashcards', deck);
                }

                if (Array.isArray(parsed.studyHistory)) {
                    for (const session of parsed.studyHistory) await NexusDB.put('studyHistory', session);
                }

                await NexusDB.put('gameMetrics', { id: 'user_metrics', ...(parsed.state.gameMetrics || this.state.gameMetrics) });

                this.state.profile = parsed.state.profile || this.state.profile;
                this.state.courses = parsed.state.courses || [];
                this.state.assignments = parsed.state.assignments || [];
                this.state.gradeScenarios = Array.isArray(parsed.state.gradeScenarios) ? parsed.state.gradeScenarios : [];
                this.state.selectedGradeScenarioId = parsed.state.selectedGradeScenarioId || null;
                this.state.gameMetrics = parsed.state.gameMetrics || this.state.gameMetrics;
                this.state.settings = parsed.state.settings || this.state.settings;
                this.state.schedule = parsed.state.schedule || { all: {}, odd: {}, even: {} };
                this.state.flashcards = parsed.flashcards || [];
                this.state.studyHistory = parsed.studyHistory || [];

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
    class RouterEngine {
        constructor() {
            this.routes = [
                "dashboard", "gpa", "grade-scenarios", "planner", "calendar", "schedule", "flashcard",
                "analytics", "leaderboard", "exam-arcade", "multiplayer", "shop", "importer", "settings", "appearance", "sound", "admin", "about", "friends"
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
            if (route === 'admin' && !window.NexusApp?.isAdmin) route = "dashboard";

            this.activeRoute = route;
            AppState.set('currentView', route);

            if (updateHash) {
                window.location.hash = route === 'class'
                    ? `/class/${encodeURIComponent(this.selectedClassCode || '')}`
                    : `/${route}`;
            }

            const viewId = route === 'class' ? 'class-detail-view' : `${route}-view`;
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
            const title = activeItem && activeItem.querySelector('span');
            const titleElement = document.getElementById('active-view-title');
            if (title && titleElement) titleElement.textContent = title.textContent.trim();
            else if (route === 'class' && titleElement) {
                const course = (AppState.get('courses') || []).find(item => item.code === this.selectedClassCode);
                titleElement.textContent = course ? course.title : 'Class';
            }

            const studyRoute = viewId === 'flashcard-view' || viewId === 'exam-arcade-view';
            document.getElementById('study-ambience')?.classList.toggle('hidden', !studyRoute);
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
            this.waitingRunner = { running: false, started: false, x: 90, y: 245, vx: 0, vy: 0, camera: 0, score: 0, best: 0, aiming: false, aimPoint: null, platforms: [], timer: null, saving: false };
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
            this.bindUI();
            this.updateMultiplayerModeSetup(this.selectedMultiplayerMode);
            this.renderUI();
            Router.init();
            await this.renderMultiplayerProfile();
            this.syncPendingStudyTime().catch(error => {
                console.error('[NexusApp] Pending study time could not be loaded:', error);
                AppState.setSaveStatus(`Saved study time could not be synced. ${this.friendlyErrorMessage(error)}`, 'error');
            });
            this.refreshStudyLeaderboard('daily');

            const unlockAudio = () => {
                Soundscape.initAudioContext();
                window.removeEventListener('click', unlockAudio);
                window.removeEventListener('keydown', unlockAudio);
            };
            window.addEventListener('click', unlockAudio);
            window.addEventListener('keydown', unlockAudio);

            EventBus.emit('app:ready', null);
        }

        async restoreCloudSnapshot(snapshot) {
            await AppState.importAppState(snapshot);
            this.renderUI();
            this.setCloudChartControls();
            this.renderGradeProgress();
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

        friendlyErrorMessage(error, fallback = 'Something went wrong. Please try again in a moment.') {
            const message = String(error?.message || error || '').trim();
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
                return 'Your device is out of storage space. Free some space or export a backup, then try again.';
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
            // Quiet by default: only a few controls (shop and rewards) make UI sounds, called where they happen
            document.addEventListener('click', event => this.handleClick(event));
            document.addEventListener('keydown', event => this.handleKeydown(event));
            document.addEventListener('submit', event => this.handleSubmit(event));
            document.addEventListener('change', event => this.handleChange(event));
            window.addEventListener('online', () => {
                this.syncPendingStudyTime().catch(error => {
                    console.error('[NexusApp] Pending study time could not be synced:', error);
                    AppState.setSaveStatus(`Saved study time could not be synced. ${this.friendlyErrorMessage(error)}`, 'error');
                });
            });
            const waitingCanvas = document.getElementById('waiting-runner-canvas');
            waitingCanvas.addEventListener('pointerdown', event => this.beginWaitingAim(event));
            waitingCanvas.addEventListener('pointermove', event => this.updateWaitingAim(event));
            waitingCanvas.addEventListener('pointerup', event => this.releaseWaitingAim(event));
            waitingCanvas.addEventListener('pointercancel', event => this.releaseWaitingAim(event));
            document.addEventListener('input', event => {
                if (event.target.matches('#assignment-search')) this.renderAssignments();
                if (event.target.matches('#course-search')) {
                    document.getElementById('course-name').value = '';
                    document.getElementById('course-selection-hint').textContent = 'Choose a PCHS course from the matches.';
                    this.filterCourseCatalog(event.target.value);
                }
                if (event.target.matches('#join-game-code')) {
                    event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);
                }
                if (event.target.id === 'host-game-time') this.updateMultiplayerGoalInputs();
                if (event.target.matches('input[type="range"][id^="vol-"]')) this.setMixerLevel(event.target, false);
                if (event.target.id === 'sfx-volume') {
                    const volume = Number(event.target.value) / 100;
                    window.StudBudSfx.update({ volume });
                    document.getElementById('sfx-volume-value').value = `${event.target.value}%`;
                }
                if (event.target.id === 'music-volume') {
                    window.StudBudSfx.update({ musicVolume: Number(event.target.value) / 100 });
                    document.getElementById('music-volume-value').value = `${event.target.value}%`;
                }
            });
            window.addEventListener('resize', () => this.updateSidebarToggle());
            document.getElementById('modal-container').addEventListener('click', event => {
                if (event.target.id === 'modal-container') this.closeModal();
            });

            this.EventBus.on('courses:updated', () => this.renderUI());
            this.EventBus.on('assignments:updated', () => this.renderUI());
            this.EventBus.on('flashcards:updated', () => {
                this.renderDecks();
                this.renderHostedGameDecks();
                this.renderDashboard();
            });
            this.EventBus.on('study:recorded', () => {
                this.renderDashboard();
                this.refreshStudyLeaderboard(this.studyLeaderboardPeriod || 'daily');
            });
            this.EventBus.on('state:restored', () => this.renderUI());
            this.EventBus.on('router:navigated', route => {
                if (route === 'class') this.renderClassDetail();
                if (route === 'calendar') this.renderCalendar();
                if (route === 'schedule') this.renderSchedulePage();
                if (route === 'grade-scenarios') this.renderGradeScenarios();
                if (route === 'analytics') this.renderGradeProgress();
                if (route === 'leaderboard') this.refreshStudyLeaderboard(this.studyLeaderboardPeriod || 'daily');
                if (route === 'shop') this.renderMultiplayerProfile(true);
                if (route === 'friends') this.loadFriends();
                if (route === 'admin') this.loadAdminList();
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
            document.querySelectorAll('#modal-container .modal-content').forEach(modal => {
                modal.classList.toggle('hidden', modal.id !== modalId);
            });
            if (overlay) overlay.classList.remove('hidden');
        }

        closeModal() {
            const overlay = document.getElementById('modal-container');
            if (overlay) overlay.classList.add('hidden');
            document.querySelectorAll('#modal-container .modal-content').forEach(modal => {
                modal.classList.add('hidden');
            });
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
            const courses = AppState.get('courses') || [];
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

            const scenarioItems = Array.isArray(selectedScenario.items) ? selectedScenario.items : [];
            const overrides = selectedScenario.overrides || {};
            const realAssignments = AppState.get('assignments') || [];
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
            const currentGpa = this.calculateTrackedGPA();
            const projectedCourses = courses.map(course => {
                const grade = this.calculateScenarioCourseGrade(course, assignments, hypotheticalAssignments);
                return Number.isFinite(grade) ? { ...course, targetGrade: this.gradeForPercentage(grade) } : null;
            }).filter(Boolean);
            const projectedGpa = window.GPACalculator
                ? window.GPACalculator.calculateCurrentGPA(projectedCourses)
                : currentGpa;
            summary.innerHTML = `
                <article class="glass-card"><span class="gpa-summary-label">Current weighted GPA</span><strong>${currentGpa.weighted}</strong><small>Before hypothetical grades</small></article>
                <article class="glass-card"><span class="gpa-summary-label">Projected weighted GPA</span><strong>${projectedGpa.weighted}</strong><small>${this.formatGpaChange(currentGpa.weighted, projectedGpa.weighted)}</small></article>
                <article class="glass-card"><span class="gpa-summary-label">Current unweighted GPA</span><strong>${currentGpa.unweighted}</strong><small>Before hypothetical grades</small></article>
                <article class="glass-card"><span class="gpa-summary-label">Projected unweighted GPA</span><strong>${projectedGpa.unweighted}</strong><small>${this.formatGpaChange(currentGpa.unweighted, projectedGpa.unweighted)}</small></article>
            `;

            itemsContainer.innerHTML = scenarioItems.length ? scenarioItems.map(item => {
                const course = courses.find(entry => entry.code === item.courseCode);
                const category = (course && course.categories || []).find(entry => entry.id === item.categoryId);
                return `<article class="scenario-item">
                    <div><strong>${this.escapeHTML(item.title)}</strong><span>${this.escapeHTML(course ? course.title : 'Class removed')} · ${this.escapeHTML(category ? category.name : 'Uncategorized')}</span></div>
                    <strong>${Number(item.pointsEarned)} / ${Number(item.maxPoints)} (${(Number(item.pointsEarned) / Number(item.maxPoints) * 100).toFixed(2)}%)</strong>
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
            return `${change > 0.0005 ? '+' : ''}${change.toFixed(3)} GPA points`;
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
                `<option value="${this.escapeHTML(category.id)}">${this.escapeHTML(category.name)} (${Number(category.weight || 0).toFixed(1)}%)</option>`
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
                        <div><strong>${this.escapeHTML(item.title)}</strong><small>${actual === null ? 'Not graded yet' : `Actual: ${actual} / ${max}`}</small></div>
                        <label class="scenario-existing-input"><span class="sr-only">What-if score for ${this.escapeHTML(item.title)}</span>
                            <input type="number" min="0" step="0.01" data-scenario-override="${this.escapeHTML(item.id)}" value="${overridden ? Number(overrides[item.id]) : ''}" placeholder="${actual === null ? 'Score' : actual}"> / ${max}</label>
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
            const clear = text === '' || !Number.isFinite(value) || value < 0;
            const scenarios = (AppState.get('gradeScenarios') || []).map(scenario => {
                if (scenario.id !== selectedId) return scenario;
                const overrides = { ...(scenario.overrides || {}) };
                if (clear) delete overrides[assignmentId];
                else overrides[assignmentId] = value;
                return { ...scenario, overrides };
            });
            this.saveGradeScenarioItems(scenarios);
        }

        saveGradeScenarioItems(scenarios) {
            AppState.set('gradeScenarios', scenarios);
            this.renderGradeScenarios();
        }

        renderCourses() {
            const courses = AppState.get('courses') || [];
            const catalog = window.PCHS_COURSE_CATALOG || [];
            const body = document.getElementById('transcript-body');
            const cards = document.getElementById('class-card-grid');
            const summary = document.getElementById('cumulative-gpa-summary');
            const currentGpa = this.calculateTrackedGPA(courses);
            if (summary) {
                summary.innerHTML = `
                    <article class="glass-card"><span class="gpa-summary-label">Cumulative weighted GPA</span><strong>${currentGpa.weighted}</strong><small>Across ${currentGpa.totalCredits.toFixed(1)} tracked credits</small></article>
                    <article class="glass-card"><span class="gpa-summary-label">Cumulative unweighted GPA</span><strong>${currentGpa.unweighted}</strong><small>Across ${currentGpa.totalCredits.toFixed(1)} tracked credits</small></article>
                `;
            }
            if (body) {
                const assignments = AppState.get('assignments') || [];
                body.innerHTML = courses.length ? courses.map(course => {
                    const classAssignments = assignments.filter(item => item.courseCode === course.code);
                    const categories = course.categories || [];
                    const currentGrade = this.calculateCourseGrade(course);
                    const gradeLetter = currentGrade === null ? '—' : this.gradeForPercentage(currentGrade);
                    const categoryGroups = categories.map(category => ({
                        id: category.id,
                        name: category.name,
                        weight: Number(category.weight) || 0,
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
                            return `<article class="transcript-assignment ${item.status === 'completed' ? 'is-complete' : ''}">
                                <span class="assignment-status-dot" aria-hidden="true"></span>
                                <div class="transcript-assignment-main">
                                    <strong>${this.escapeHTML(item.title)}</strong>
                                    <span>${this.escapeHTML(item.kind || 'Assignment')}${hasScore ? '' : ` · Due ${this.escapeHTML(item.dueDate || 'No due date')}`}</span>
                                </div>
                                <strong class="transcript-assignment-score">${hasScore ? `${Number(item.pointsEarned || 0)} / ${Number(item.maxPoints || 0)}` : 'Not graded'}</strong>
                                <div class="transcript-assignment-actions">
                                    ${hasScore ? '' : `<button class="secondary-btn" data-action="toggle-assignment" data-id="${this.escapeHTML(item.id)}">${item.status === 'completed' ? 'Reopen' : 'Done'}</button>`}
                                    <button class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}" aria-label="Edit ${this.escapeHTML(item.title)}">Edit</button>
                                    <button class="danger-btn" data-action="delete-assignment" data-id="${this.escapeHTML(item.id)}" aria-label="Delete ${this.escapeHTML(item.title)}">Delete</button>
                                </div>
                            </article>`;
                        }).join('') : '<p class="transcript-empty">No assignments in this category yet.</p>';
                        return `<details class="transcript-category" data-transcript-category="${this.escapeHTML(group.id)}">
                            <summary>
                                <span class="transcript-chevron" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
                                <span class="transcript-category-name">${this.escapeHTML(group.name)}</span>
                                <span class="transcript-category-meta">${group.weight === null ? 'Unweighted' : `${group.weight.toFixed(1)}% of grade`}</span>
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
                                <span class="transcript-class-name"><strong>${this.escapeHTML(course.title)}</strong><small>${this.escapeHTML(this.termLabel(course.term))} · ${course.isWeighted ? 'Weighted' : 'Regular'} · ${Number(course.credits || 0).toFixed(1)} credits</small></span>
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
                }).join('') : '<p class="empty-state">No classes added yet.</p>';
            }
            if (cards) {
                cards.innerHTML = courses.length ? courses.map(course => {
                    const grade = this.calculateCourseGrade(course);
                    const target = course.targetPct === null || course.targetPct === undefined ? NaN : Number(course.targetPct);
                    return `<article class="glass-card class-card">
                        <div><h3>${this.escapeHTML(course.title)}</h3><span class="class-term">${this.escapeHTML(this.termLabel(course.term))}</span></div>
                        <p>Current grade <strong>${grade === null ? 'Not graded' : `${grade.toFixed(2)}%`}</strong> · Goal <strong>${Number.isFinite(target) ? `${target.toFixed(2)}%` : 'Not set'}</strong></p>
                        <div class="class-grade-track"><span style="width:${Math.max(0, Math.min(100, grade || 0))}%"></span></div>
                        <button class="primary-btn" data-action="open-class" data-id="${this.escapeHTML(course.code)}">Open class</button>
                    </article>`;
                }).join('') : '<p class="empty-state glass-card">No classes yet. Add your first class to start tracking grades.</p>';
            }

            const options = document.getElementById('assignment-course');
            if (options) {
                const selected = options.value;
                options.innerHTML = '<option value="">Select a Course...</option>' + courses.map(course =>
                    `<option value="${this.escapeHTML(course.code)}">${this.escapeHTML(course.title)}</option>`
                ).join('');
                if (courses.some(course => course.code === selected)) options.value = selected;
            }
            if (!catalog.length) console.error('[StudBud] PCHS course catalog did not load.');
        }

        termLabel(term) {
            return ({ S1: 'Semester 1', S2: 'Semester 2', FY: 'Full Year' })[term] || 'Full Year';
        }

        calculateTrackedGPA(courses = AppState.get('courses') || []) {
            const calculator = window.GPACalculator;
            if (!calculator) return { weighted: '0.000', unweighted: '0.000', totalCredits: 0 };
            const currentCourses = courses.map(course => {
                const grade = this.calculateCourseGrade(course);
                return Number.isFinite(grade) ? { ...course, targetGrade: this.gradeForPercentage(grade) } : null;
            }).filter(Boolean);
            return calculator.calculateCurrentGPA(currentCourses);
        }

        calculateCourseGrade(course, assignments = AppState.get('assignments') || []) {
            const courseAssignments = assignments.filter(item =>
                item.courseCode === course.code &&
                (this.isGradedItem(item))
            );
            if (!courseAssignments.length) return null;

            const categories = course.categories || [];
            if (categories.length) {
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
            const course = (AppState.get('courses') || []).find(item => item.code === Router.selectedClassCode);
            if (!course) {
                container.innerHTML = '<div class="glass-card empty-state">That class could not be found.</div>';
                return;
            }
            const categories = course.categories || [];
            const assignments = (AppState.get('assignments') || []).filter(item => item.courseCode === course.code);
            const grade = this.calculateCourseGrade(course);
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
                    <strong>${Number(category.weight || 0).toFixed(1)}%</strong>
                    <button class="secondary-btn" data-action="add-assignment-to-category" data-course="${this.escapeHTML(course.code)}" data-category="${this.escapeHTML(category.id)}" aria-label="Add assignment to ${this.escapeHTML(category.name)}"><i class="fas fa-plus"></i> Add</button>
                    <button class="danger-btn" data-action="remove-category" data-id="${this.escapeHTML(category.id)}" aria-label="Remove ${this.escapeHTML(category.name)}">Remove</button>
                </div>`;
            }).join('');
            const workRows = assignments.length ? assignments.map(item => `
                <tr>
                    <td>${this.isGradedItem(item) ? 'Graded' : `<button class="secondary-btn" data-action="toggle-assignment" data-id="${this.escapeHTML(item.id)}">${item.status === 'completed' ? 'Done' : 'Open'}</button>`}</td>
                    <td>${this.escapeHTML(item.title)}</td>
                    <td>${this.escapeHTML((categories.find(category => category.id === item.categoryId) || {}).name || 'Uncategorized')}</td>
                    <td>${this.escapeHTML(item.kind || 'assignment')}</td>
                    <td>${this.isGradedItem(item) ? '—' : this.escapeHTML(item.dueDate || 'No date')}</td>
                    <td>${this.isGradedItem(item) ? `${item.pointsEarned ?? 0} / ${item.maxPoints ?? 100}` : 'Not graded'}</td>
                    <td class="actions">
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
                        <div class="inline-form"><input id="class-target-percent" type="number" min="0" max="100" step="0.1" value="${target}"><button class="primary-btn" data-action="save-class-target">Save target</button></div>
                        <p>${grade >= target ? 'You are currently meeting this class target.' : `You are ${(target - grade).toFixed(2)} points below your target.`}</p>
                    </section>
                    <section class="glass-card">
                        <h3>Optional grade categories</h3>
                        <p>Weights are percentages. Category averages use earned points / possible points; categories without scores are left out until work is graded.</p>
                        <div class="category-list">${categoryRows || '<p class="empty-state">No categories. Your graded assignments will use a points-based average.</p>'}</div>
                        <p class="${Math.abs(sumWeights - 100) < 0.01 ? 'weight-valid' : 'weight-note'}">Category weights total ${sumWeights.toFixed(1)}%${categories.length && Math.abs(sumWeights - 100) >= 0.01 ? ' (recommended total: 100%)' : ''}</p>
                        <div class="category-add-form">
                            <input id="new-category-name" type="text" placeholder="Category name (e.g. Tests)">
                            <input id="new-category-weight" type="number" min="0" max="100" step="0.1" placeholder="Weight %">
                            <button class="secondary-btn" data-action="add-category">Add category</button>
                        </div>
                    </section>
                </div>
                <section class="glass-card full-width class-work-section">
                    <h3>Assignments, quizzes & tests</h3>
                    <div class="table-responsive"><table><thead><tr><th>Status</th><th>Item</th><th>Category</th><th>Type</th><th>Due</th><th>Score</th><th>Actions</th></tr></thead><tbody>${workRows}</tbody></table></div>
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
            AppState.set('schedule', { all, odd: {}, even: {} });
            this.renderDashboard();
            this.renderCalendar();
            window.alert('Class schedule saved.');
        }

        getScheduleEntries(date) {
            const pchsSchedule = this.getSchoolSchedule(date);
            const pattern = this.getSchedulePattern(pchsSchedule);
            const periodMap = this.getPeriodMap();
            const courses = AppState.get('courses') || [];
            const entries = (pchsSchedule?.classes || []).map(slot => {
                const match = String(slot.period).match(/^\s*(\d+)/);
                const period = match ? Number(match[1]) : null;
                const courseCode = period ? periodMap[String(period)] : null;
                const course = courses.find(item => item.code === courseCode);
                return { ...slot, periodNumber: period, course };
            });
            return { pchsSchedule, pattern, entries };
        }

        renderDailySchedule(date) {
            const list = document.getElementById('daily-schedule-list');
            const type = document.getElementById('daily-schedule-type');
            if (!list || !type) return;
            const { pchsSchedule, pattern, entries } = this.getScheduleEntries(date);
            type.textContent = pchsSchedule ? `${pchsSchedule.title} · ${date.toLocaleDateString(undefined, { weekday: 'long' })}` : 'PCHS schedule unavailable';
            if (!pattern) {
                list.innerHTML = '<li class="empty-state">No classes are scheduled on this day.</li>';
                return;
            }
            const configured = entries.filter(entry => entry.periodNumber && entry.course);
            if (!configured.length) {
                list.innerHTML = '<li class="empty-state">Set your class periods to see today’s classes here.</li>';
                return;
            }
            list.innerHTML = entries.map(entry => entry.periodNumber
                ? `<li class="daily-period-row"><span>${this.escapeHTML(entry.period)}<small>${this.escapeHTML(entry.time || '')}</small></span><strong>${this.escapeHTML(entry.course?.title || 'No class assigned')}</strong></li>`
                : `<li class="daily-period-row"><span>PCHS block</span><strong>${this.escapeHTML(entry.period)}</strong></li>`
            ).join('');
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
                const count = assignments.filter(item => item.dueDate === dateKey).length;
                const { pattern, entries } = this.getScheduleEntries(new Date(year, month, day));
                const classCount = pattern ? entries.filter(entry => entry.periodNumber && entry.course).length : 0;
                const classes = ['calendar-day'];
                if (dateKey === todayKey) classes.push('today');
                if (dateKey === this.selectedCalendarDate) classes.push('selected');
                const indicators = [
                    classCount ? `<small>${classCount} ${classCount === 1 ? 'class' : 'classes'}</small>` : '',
                    count ? `<small>${count} due</small>` : ''
                ].join('');
                cells += `<button class="${classes.join(' ')}" data-action="select-calendar-day" data-date="${dateKey}" aria-label="${dateKey}, ${classCount} classes, ${count} due items"><span>${day}</span>${indicators}</button>`;
            }
            daysElement.innerHTML = cells;
            const selected = new Date(`${this.selectedCalendarDate}T00:00:00`);
            document.getElementById('calendar-selected-label').textContent =
                selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            const agenda = document.getElementById('calendar-agenda-list');
            const events = assignments.filter(item => item.dueDate === this.selectedCalendarDate);
            const scheduleInfo = this.getScheduleEntries(selected);
            const scheduleItems = scheduleInfo.pattern
                ? `<section class="calendar-schedule"><h4>${this.escapeHTML(scheduleInfo.pchsSchedule.title)} · Classes</h4>${scheduleInfo.entries.filter(entry => entry.periodNumber).map(entry => `<p><strong>${this.escapeHTML(entry.period)}:</strong> ${this.escapeHTML(entry.course?.title || 'No class assigned')} <small>${this.escapeHTML(entry.time || '')}</small></p>`).join('') || '<p>No class periods listed.</p>'}</section>`
                : `<section class="calendar-schedule"><h4>${this.escapeHTML(scheduleInfo.pchsSchedule?.title || 'Schedule')}</h4><p>No classes are scheduled.</p></section>`;
            const eventItems = events.length ? events.map(item => {
                const course = (AppState.get('courses') || []).find(entry => entry.code === item.courseCode);
                const recommendation = this.getStudyRecommendations().find(entry => entry.id === item.id);
                const studyNote = recommendation ? `<small>Study today: ${recommendation.sessionMinutes} min · ${this.escapeHTML(recommendation.studyMethod)}</small>` : '';
                return `<article class="calendar-event"><div><strong>${this.escapeHTML(item.title)}</strong><span>${this.escapeHTML(course ? course.title : 'No class')} · ${this.escapeHTML(item.kind || 'assignment')}</span>${studyNote}</div><button class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">Edit</button></article>`;
            }).join('') : '<p class="empty-state">Nothing due this day. Add homework, a quiz, or a test.</p>';
            agenda.innerHTML = `${scheduleItems}<h4>Due this day</h4>${eventItems}`;
        }

        getStudyRecommendations() {
            const courses = AppState.get('courses') || [];
            const assignments = AppState.get('assignments') || [];
            const profile = AppState.get('profile') || {};
            const targetGpa = Number(profile.targetGpa || 0);
            const currentWeightedGpa = Number(this.calculateTrackedGPA(courses).weighted);
            const gpaGap = Math.max(0, targetGpa - currentWeightedGpa);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const history = AppState.get('studyHistory') || [];
            // Only quizzes and tests need studying; homework is just done and turned in
            const recommended = assignments.filter(item => item.status !== 'completed' && ['quiz', 'test'].includes(String(item.kind || 'assignment').toLowerCase())).map(item => {
                const course = courses.find(entry => entry.code === item.courseCode);
                const grade = course ? this.calculateCourseGrade(course) : 0;
                const target = course ? Number(course.targetPct) : NaN;
                const gradeGap = Number.isFinite(grade) && Number.isFinite(target) ? Math.max(0, target - grade) : 0;
                const due = item.dueDate ? new Date(`${item.dueDate}T00:00:00`) : null;
                const daysUntilDue = due && Number.isFinite(due.getTime()) ? Math.ceil((due - today) / 86400000) : 7;
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
                const minutesStudied = taskSessions.reduce((sum, session) =>
                    sum + Math.max(0, Math.round(Number(session.durationSec || 0) / 60)), 0);
                const recentRatings = taskSessions.slice(0, 3).map(session => Number(session.effectiveness)).filter(Number.isFinite);
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
                if (gradeGap > 0) reason += ` ${gradeGap.toFixed(2)} points below your ${target.toFixed(2)}% class target.`;
                if (gpaGap > 0) reason += ` Your current weighted GPA (${currentWeightedGpa.toFixed(2)}) is below your ${targetGpa.toFixed(2)} target.`;
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
                    averageEffectiveness
                };
            }).sort((a, b) => b.score - a.score);
            return recommended;
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
            else if (lastSession?.method && Number(lastSession.effectiveness) <= 2) {
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
            const minutes = thisWeek.reduce((sum, session) => sum + Math.round(Number(session.durationSec || 0) / 60), 0);
            const rated = thisWeek.map(session => Number(session.effectiveness)).filter(rating => Number.isFinite(rating) && rating > 0);
            const average = rated.length ? (rated.reduce((sum, rating) => sum + rating, 0) / rated.length).toFixed(1) : '—';
            const plan = this.getStudyRecommendations().slice(0, 5);
            const plannedMinutes = plan.reduce((sum, item) => sum + item.sessionMinutes, 0);
            weekSummary.textContent = `This week: ${thisWeek.length} session${thisWeek.length === 1 ? '' : 's'} · ${minutes} min logged · average effectiveness ${average}/5.`;
            summary.innerHTML = `<div><strong>${minutes}</strong><span>minutes studied this week</span></div><div><strong>${plannedMinutes}</strong><span>minutes in your next study plan</span></div><div><strong>${average}</strong><span>average effectiveness</span></div>`;
            list.innerHTML = sessions.length ? `<h4>Recent logged sessions</h4>${sessions.slice(0, 4).map(session => `<article class="study-history-item"><div><strong>${this.escapeHTML(session.title || 'Study session')}</strong><span>${Number(session.durationSec || 0) / 60} min · ${this.escapeHTML(session.methodLabel || this.studyMethodLabel(session.method || 'retrieval'))}</span><small>${new Date(session.timestamp).toLocaleDateString()} · effectiveness ${Number(session.effectiveness || 0)}/5${session.notes ? ` · ${this.escapeHTML(session.notes)}` : ''}</small></div></article>`).join('')}` : '<p class="empty-state">Log a study session from a recommendation to help tune your future plan.</p>';
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
                const completed = item.status === 'completed';
                const overdue = !completed && item.dueDate && item.dueDate < today;
                const matchesStatus = selectedStatus === 'all'
                    || (selectedStatus === 'open' && !completed)
                    || (selectedStatus === 'completed' && completed)
                    || (selectedStatus === 'overdue' && overdue);
                return matchesSearch && matchesCourse && matchesStatus;
            }).sort((left, right) =>
                (left.dueDate || '9999-12-31').localeCompare(right.dueDate || '9999-12-31')
            );
            if (body) {
                body.innerHTML = visibleAssignments.length ? visibleAssignments.map(item => {
                    const course = courses.find(entry => entry.code === item.courseCode);
                    const status = item.status || 'pending';
                    const graded = this.isGradedItem(item);
                    return `<tr>
                        <td>${graded ? 'Graded' : `<button class="secondary-btn" data-action="toggle-assignment" data-id="${this.escapeHTML(item.id)}">${status === 'completed' ? 'Done' : 'Pending'}</button>`}</td>
                        <td>${this.escapeHTML(item.title)}</td>
                        <td>${this.escapeHTML(course ? course.title : item.courseCode || 'Unassigned')}</td>
                        <td>${graded ? `${Number(item.pointsEarned || 0)} / ${Number(item.maxPoints || 0)}` : this.escapeHTML(item.dueDate || 'No due date')}</td>
                        <td>${this.escapeHTML(item.priority || 'Normal')}</td>
                        <td class="actions">
                            <button class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">Edit</button>
                            <button class="danger-btn" data-action="delete-assignment" data-id="${this.escapeHTML(item.id)}">Delete</button>
                        </td>
                    </tr>`;
                }).join('') : `<tr><td colspan="6" class="empty-state">${assignments.length ? 'No assignments match these filters.' : 'No assignments found.'}</td></tr>`;
            }
            if (resultCount) resultCount.textContent = `${visibleAssignments.length} of ${assignments.length} assignment${assignments.length === 1 ? '' : 's'}`;

            const priorityList = document.getElementById('priority-task-list');
            if (priorityList) {
                const upcoming = assignments.filter(item => item.status !== 'completed')
                    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
                    .slice(0, 3);
                priorityList.classList.toggle('empty-list', upcoming.length === 0);
                priorityList.innerHTML = upcoming.length ? upcoming.map(item =>
                    `<li>${this.escapeHTML(item.title)} <small>${this.escapeHTML(item.dueDate || '')}</small></li>`
                ).join('') : '<li class="empty-state">No upcoming tasks.</li>';
            }

            const matrixGroups = [
                ['quad-1-list', 'high'],
                ['quad-2-list', 'medium'],
                ['quad-3-list', 'low'],
                ['quad-4-list', 'none']
            ];
            matrixGroups.forEach(([id, priority]) => {
                const list = document.getElementById(id);
                if (!list) return;
                const matches = assignments.filter(item => item.status !== 'completed' && (item.priority || 'high') === priority);
                list.innerHTML = matches.map(item => `<li>${this.escapeHTML(item.title)}</li>`).join('') || '<li class="empty-state">No tasks.</li>';
            });
        }

        renderDecks() {
            const grid = document.getElementById('deck-grid');
            if (!grid) return;
            const decks = AppState.get('flashcards') || [];
            grid.innerHTML = decks.length ? decks.map(deck => `
                <article class="glass-card">
                    <h3>${this.escapeHTML(deck.title)}</h3>
                    <p>${(deck.cards || []).length} cards · ${(deck.cards || []).filter(card => this.isCardDue(card)).length} to review</p>
                    <div class="actions">
                        <button class="primary-btn" data-action="study-deck" data-id="${this.escapeHTML(deck.id)}">Study</button>
                        <button class="secondary-btn" data-action="add-card" data-id="${this.escapeHTML(deck.id)}">Add Card</button>
                        ${deck.communityPublished ? `<button class="secondary-btn" data-action="unpublish-community-deck" data-id="${this.escapeHTML(deck.id)}">Stop sharing</button>` :
                            Number(deck.studiedCount || 0) > 0 ? `<button class="secondary-btn" data-action="publish-community-deck" data-id="${this.escapeHTML(deck.id)}"><i class="fas fa-users"></i> Share with community</button>` :
                                '<small class="deck-sharing-hint">Study a card to make this deck eligible to share.</small>'}
                        <button class="danger-btn" data-action="delete-deck" data-id="${this.escapeHTML(deck.id)}">Delete</button>
                    </div>
                </article>
            `).join('') : '<div class="empty-state glass-card full-width">No decks available. Create one or import flashcards.</div>';
        }

        renderHostedGameDecks() {
            const select = document.getElementById('host-game-deck');
            if (!select) return;
            const previous = select.value;
            const decks = (AppState.get('flashcards') || []).map(deck => ({
                ...deck,
                completeCards: (deck.cards || []).filter(card =>
                    String(card.front || '').trim() && String(card.back || '').trim()
                )
            })).filter(deck => deck.completeCards.length >= 1);
            select.innerHTML = decks.length
                ? decks.map(deck => `<option value="${this.escapeHTML(deck.id)}">${this.escapeHTML(deck.title)} · ${deck.completeCards.length} cards</option>`).join('')
                : '<option value="">Add a set with at least 1 complete card</option>';
            if (decks.some(deck => deck.id === previous)) select.value = previous;
            const nickname = this.multiplayerDisplayName().replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 20);
            ['host-game-nickname', 'join-game-nickname'].forEach(id => {
                const input = document.getElementById(id);
                if (input && !input.value) input.value = nickname.length >= 2 ? nickname : 'Student';
            });
        }

        multiplayerDisplayName() {
            const user = window.StudBudCloud?.user;
            const profile = AppState.get('profile') || {};
            const fullName = profile.firstName && profile.lastName
                ? `${profile.firstName} ${profile.lastName}`.trim()
                : '';
            return fullName || user?.user_metadata?.username || 'Student';
        }

        profileCosmetics(profile) {
            return {
                skin: profile?.equipped_skin || profile?.skin || '',
                hat: profile?.equipped_hat || profile?.hat || '',
                acc: profile?.equipped_accessory || profile?.accessory || ''
            };
        }

        // Draws the same animated-game character to a cached image so lobby avatars match in-game characters.
        multiplayerAvatarMarkup(cos = {}, large = false, extraClass = '') {
            const util = window.StudBudArcade?.util;
            const key = [cos.skin, cos.hat, cos.acc, cos.color].join('|');
            this.characterCache = this.characterCache || new Map();
            let url = this.characterCache.get(key);
            if (!url && util) {
                const canvas = document.createElement('canvas');
                canvas.width = 240;
                canvas.height = 240;
                const ctx = canvas.getContext('2d');
                ctx.scale(3, 3);
                ctx.imageSmoothingQuality = 'high';
                util.drawFigureSide(ctx, { color: cos.color || '#34d399', cos }, 27, 25, 26, 42, 1, 0, false);
                url = canvas.toDataURL('image/png');
                this.characterCache.set(key, url);
            }
            return `<span class="player-avatar char-avatar${large ? ' player-avatar-large' : ''}${extraClass ? ` ${this.escapeHTML(extraClass)}` : ''}">${url ? `<img src="${url}" alt="" draggable="false">` : '<i class="fas fa-user" aria-hidden="true"></i>'}</span>`;
        }

        renderMultiplayerShop(profile) {
            const games = window.StudBudCommunityGames;
            const owned = profile.owned_items || [];
            const tab = this.shopTab || 'boxes';
            const catalog = games.catalog.filter(item => !item.legacy && item.type !== 'pet');
            const equippedBy = { skin: profile.equipped_skin, hat: profile.equipped_hat, accessory: profile.equipped_accessory, palette: profile.equipped_palette };
            const tabs = [['boxes', 'Mystery boxes'], ['skin', 'Characters'], ['hat', 'Hats'], ['accessory', 'Accessories'], ['palette', 'Colors']];
            const slotKey = { skin: 'skin', hat: 'hat', accessory: 'acc' };
            const itemCard = item => {
                const has = owned.includes(item.id);
                const equipped = equippedBy[item.type] === item.id;
                let preview;
                if (item.type === 'palette') preview = `<span class="shop-palette ${this.escapeHTML(item.color)}"></span>`;
                else preview = this.multiplayerAvatarMarkup({ skin: '', hat: '', acc: '', [slotKey[item.type]]: item.id });
                const price = item.price == null ? '' : ` · ${item.price} <i class="fas fa-coins"></i>`;
                let button;
                if (has && equipped && equippedBy[item.type] !== undefined) button = `<button type="button" class="ghost-btn" data-action="multiplayer-unequip" data-slot="${item.type}">Unequip</button>`;
                else if (has) button = `<button type="button" class="secondary-btn" data-action="multiplayer-equip" data-id="${this.escapeHTML(item.id)}">Equip</button>`;
                else if (item.price == null) button = '<button type="button" class="secondary-btn" disabled>Box only</button>';
                else button = `<button type="button" class="secondary-btn" data-action="multiplayer-buy" data-id="${this.escapeHTML(item.id)}" ${profile.coins < item.price ? 'disabled' : ''}>Buy${price}</button>`;
                const name = item.name;
                return `<article class="multiplayer-shop-item rarity-${item.rarity}${equipped ? ' equipped' : ''}">${preview}<div><strong>${this.escapeHTML(name)}</strong><small class="rarity-label">${item.rarity}</small></div>${button}</article>`;
            };
            let body;
            if (tab === 'boxes') {
                const drop = this.lastDrop;
                const dropItem = drop && games.catalog.find(entry => entry.id === drop.unlocked_item && entry.type !== 'pet');
                body = `${dropItem ? `<div class="box-reveal rarity-${this.escapeHTML(drop.rarity)}">${this.multiplayerAvatarMarkup({ skin: '', hat: '', acc: '', [slotKey[dropItem.type]]: dropItem.id }, true)}<div><small>${this.escapeHTML(drop.rarity)}</small><strong>${this.escapeHTML(dropItem.name)}</strong><span>${drop.duplicate ? `Duplicate! Refunded ${Number(drop.refund)} coins.` : 'New item added to your collection!'}</span></div></div>` : ''}
                    ${games.constructor.boxes.map(box => `<article class="multiplayer-shop-item box-card box-${box.id}"><span class="mystery-capsule"><i class="fas ${box.icon}"></i></span><div><strong>${box.name}</strong><small>${box.odds}</small></div><button type="button" class="secondary-btn" data-action="multiplayer-mystery" data-id="${box.id}" ${profile.coins < box.price ? 'disabled' : ''}>Open · ${box.price} <i class="fas fa-coins"></i></button></article>`).join('')}
                    <p class="settings-hint">Boxes can contain characters, hats, accessories,                     colors. Duplicates refund coins.</p>`;
                                } else {
                                    const items = catalog.filter(item => item.type === tab);
                                    const count = items.filter(item => owned.includes(item.id)).length;
                                    const remove = slotKey[tab] ? `<button type="button" class="ghost-btn shop-unequip" data-action="multiplayer-unequip" data-slot="${tab === 'accessory' ? 'accessory' : tab}">Remove</button>` : '';
                                    body = `<h4 class="shop-category-title">${count} / ${items.length} collected ${remove}</h4>${items.map(itemCard).join('')}`;
                                }
            document.getElementById('multiplayer-shop-items').innerHTML = `
                <div class="shop-tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" class="shop-tab${tab === id ? ' selected' : ''}" role="tab" aria-selected="${tab === id}" data-shop-tab="${id}">${label}</button>`).join('')}</div>
                <div class="shop-grid">${body}</div>`;
        }

        async renderMultiplayerProfile(force = false) {
            if (this.multiplayerProfilePromise) return this.multiplayerProfilePromise;
            if (this.multiplayerProfile && !force) return;
            this.multiplayerProfilePromise = this.loadMultiplayerProfile();
            try {
                await this.multiplayerProfilePromise;
            } finally {
                this.multiplayerProfilePromise = null;
            }
        }

        async loadMultiplayerProfile() {
            const name = this.multiplayerDisplayName();
            const nameNodes = ['multiplayer-header-name', 'multiplayer-player-name', 'multiplayer-identity-badge'];
            nameNodes.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = name;
            });
            const defaultAvatar = document.getElementById('multiplayer-header-avatar');
            if (defaultAvatar) defaultAvatar.innerHTML = this.multiplayerAvatarMarkup({});
            const shopStatus = document.getElementById('multiplayer-shop-status');
            if (!shopStatus) return;
            shopStatus.textContent = 'Loading your multiplayer profile…';
            try {
                const profile = await window.StudBudCommunityGames.getPlayerProfile();
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
                shopStatus.textContent = 'Earn coins from practice games, multiplayer matches and your daily reward.';
                this.renderDailyReward(profile);
                const best = document.getElementById('waiting-runner-best');
                if (best) {
                    this.waitingRunner.best = Number(profile.best_wait_score || 0);
                    best.textContent = String(this.waitingRunner.best);
                }
                this.renderAppearanceShopSchemes();
            } catch (error) {
                console.error('[NexusApp] Multiplayer profile could not load:', error);
                shopStatus.textContent = `Your multiplayer profile could not load. ${this.friendlyErrorMessage(error, 'Please refresh the page and try again.')}`;
            }
        }

        renderDailyReward(profile) {
            const button = document.getElementById('daily-reward-btn');
            const text = document.getElementById('daily-reward-text');
            if (!button || !text) return;
            const claimed = Boolean(profile?.daily_claimed);
            const streak = Number(profile?.daily_streak || 0);
            button.disabled = claimed;
            button.textContent = claimed ? 'Claimed today' : 'Claim reward';
            text.textContent = claimed
                ? `Come back tomorrow to keep your ${streak}-day streak going. Practice games earn coins too.`
                : `Claim free coins once a day. Keep a streak going for bigger rewards (up to 85 coins). Practice games earn coins too.`;
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
                await window.StudBudCommunityGames.changeUsername(username);
                const cloud = window.StudBudCloud;
                const { data } = await cloud.client.auth.refreshSession();
                if (data?.user) cloud.user = data.user;
                const accountName = document.getElementById('account-name');
                if (accountName) accountName.textContent = username;
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
            this.isAdmin = ['overit', 'andy'].includes(name);
            try { if (await window.StudBudCommunityGames.isAdmin()) this.isAdmin = true; } catch (error) { /* keep the name check */ }
            window.NexusApp.isAdmin = this.isAdmin;
            document.getElementById('admin-nav-item')?.classList.toggle('hidden', !this.isAdmin);
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
                document.getElementById('public-show-stats').checked = p.show_stats !== false;
            } catch (error) {
                const status = document.getElementById('public-profile-status');
                if (status) status.textContent = 'Profile sharing is unavailable right now. Re-run supabase-setup.sql in Supabase.';
            }
        }

        async savePublicProfile() {
            const status = document.getElementById('public-profile-status');
            status.textContent = 'Saving…';
            try {
                await window.StudBudCommunityGames.friendCall('studbud_set_public_profile', {
                    p_bio: document.getElementById('public-bio').value,
                    p_favorite_subject: document.getElementById('public-subject').value,
                    p_grade_level: document.getElementById('public-grade').value,
                    p_study_goal: document.getElementById('public-goal').value,
                    p_show_stats: document.getElementById('public-show-stats').checked
                });
                status.textContent = 'Saved. Your friends will see this on your profile.';
            } catch (error) {
                status.textContent = this.friendlyErrorMessage(error, 'Could not save your profile.');
            }
        }

        async loadAdminList() {
            const list = document.getElementById('admin-list');
            const status = document.getElementById('admin-status');
            if (!list || !this.isAdmin) return;
            const tab = this.adminTab || 'decks';
            const query = document.getElementById('admin-search')?.value.trim() || '';
            status.textContent = 'Loading…';
            try {
                const games = window.StudBudCommunityGames;
                const rows = await games.adminCall(tab === 'users' ? 'studbud_admin_list_users' : 'studbud_admin_list_decks', { p_query: query });
                status.textContent = rows.length ? `${rows.length} shown` : 'Nothing found.';
                const esc = value => this.escapeHTML(String(value ?? ''));
                list.innerHTML = tab === 'users'
                    ? rows.map(user => `<article class="admin-row">
                        <div><strong>${esc(user.username)}</strong>${user.banned ? ' <span class="admin-badge">banned</span>' : ''}${user.force_change ? ' <span class="admin-badge">rename required</span>' : ''}
                        <small>${Number(user.coins)} coins · ${Number(user.wins)} wins · ${Number(user.decks)} public decks · joined ${esc(new Date(user.created_at).toLocaleDateString())}</small></div>
                        <div class="admin-actions">
                            <button type="button" class="secondary-btn" data-admin-action="coins" data-id="${esc(user.id)}" data-name="${esc(user.username)}">Coins</button>
                            <button type="button" class="secondary-btn" data-admin-action="remove-decks" data-id="${esc(user.id)}" data-name="${esc(user.username)}">Remove decks</button>
                            <button type="button" class="secondary-btn" data-admin-action="${user.force_change ? 'cancel-rename' : 'force-rename'}" data-id="${esc(user.id)}" data-name="${esc(user.username)}">${user.force_change ? 'Cancel rename' : 'Force rename'}</button>
                            <button type="button" class="${user.banned ? 'secondary-btn' : 'danger-btn'}" data-admin-action="${user.banned ? 'unban' : 'ban'}" data-id="${esc(user.id)}" data-name="${esc(user.username)}">${user.banned ? 'Unban' : 'Ban'}</button>
                        </div></article>`).join('')
                    : rows.map(deck => `<article class="admin-row">
                        <div><strong>${esc(deck.title)}</strong> <small>by ${esc(deck.owner)} · ${Number(deck.card_count)} cards · ${Number(deck.study_count)} studies</small>
                        ${deck.description ? `<small>${esc(deck.description)}</small>` : ''}
                        <small class="admin-preview">${(deck.preview || []).map(card => `${esc(card.front)} → ${esc(card.back)}`).join(' · ')}</small></div>
                        <div class="admin-actions"><button type="button" class="danger-btn" data-admin-action="delete-deck" data-id="${esc(deck.id)}" data-name="${esc(deck.title)}">Delete</button></div></article>`).join('');
            } catch (error) {
                status.textContent = this.friendlyErrorMessage(error, 'Could not load admin data.');
                list.innerHTML = '';
            }
        }

        async runAdminAction(action, data) {
            const games = window.StudBudCommunityGames;
            const status = document.getElementById('admin-status');
            try {
                if (action === 'delete-deck') {
                    if (!confirm(`Delete the public deck "${data.name}"?`)) return;
                    await games.adminCall('studbud_admin_delete_deck', { p_deck_id: data.id });
                } else if (action === 'remove-decks') {
                    if (!confirm(`Remove all public decks from ${data.name}?`)) return;
                    await games.adminCall('studbud_admin_remove_user_decks', { p_user_id: data.id });
                } else if (action === 'ban') {
                    const reason = prompt(`Ban ${data.name}? They will lose their public decks and can't publish new ones. Reason (optional):`);
                    if (reason === null) return;
                    await games.adminCall('studbud_admin_set_ban', { p_user_id: data.id, p_banned: true, p_reason: reason });
                } else if (action === 'force-rename') {
                    if (!confirm(`Force ${data.name} to choose a new username? They'll be blocked from the app until they do.`)) return;
                    await games.adminCall('studbud_admin_force_username', { p_user_id: data.id, p_force: true });
                } else if (action === 'cancel-rename') {
                    await games.adminCall('studbud_admin_force_username', { p_user_id: data.id, p_force: false });
                } else if (action === 'unban') {
                    await games.adminCall('studbud_admin_set_ban', { p_user_id: data.id, p_banned: false });
                } else if (action === 'coins') {
                    const amount = Number(prompt(`Add or remove coins for ${data.name} (use a negative number to remove):`, '100'));
                    if (!Number.isInteger(amount) || amount === 0) return;
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

        async updateMultiplayerShop(action, itemId) {
            const profile = action === 'multiplayer-buy'
                ? await window.StudBudCommunityGames.purchaseItem(itemId)
                : action === 'multiplayer-mystery'
                    ? await window.StudBudCommunityGames.buyMysteryItem(itemId || 'basic')
                    : action === 'multiplayer-unequip'
                        ? await window.StudBudCommunityGames.unequipSlot(itemId)
                        : await window.StudBudCommunityGames.equipItem(itemId);
            const unlockedItem = profile.unlocked_item;
            window.StudBudSfx?.play(action === 'multiplayer-mystery' ? 'open' : action === 'multiplayer-buy' ? 'buy' : 'success', 'ui');
            this.multiplayerProfile = profile;
            if (action === 'multiplayer-mystery') this.lastDrop = { unlocked_item: unlockedItem, rarity: profile.rarity, duplicate: profile.duplicate, refund: profile.refund };
            await this.renderMultiplayerProfile(true);
            if (action === 'multiplayer-mystery') {
                const item = window.StudBudCommunityGames.catalog.find(entry => entry.id === unlockedItem);
                document.getElementById('multiplayer-shop-status').textContent = `${profile.duplicate ? 'Duplicate' : 'New'} ${profile.rarity} drop: ${item?.name || 'cosmetic'}!`;
                window.StudBudSfx?.play(profile.rarity === 'epic' || profile.rarity === 'legendary' ? 'win' : 'success', 'ui', 0);
            }
            if (action === 'multiplayer-equip' && itemId.startsWith('palette_')) {
                const colorScheme = itemId.slice('palette_'.length);
                AppState.set('settings', { ...AppState.get('settings'), colorScheme });
                this.applyAppearance();
            }
        }

        renderAppearanceShopSchemes() {
            const owned = this.multiplayerProfile?.owned_items || [];
            document.querySelectorAll('.scheme-option[data-shop-item]').forEach(button => {
                const unlocked = owned.includes(button.dataset.shopItem);
                button.disabled = !unlocked;
                button.classList.toggle('scheme-locked', !unlocked);
                const note = button.querySelector('.scheme-lock-note');
                if (note) note.textContent = unlocked ? 'Unlocked · select to apply' : 'Unlock in multiplayer shop';
                button.setAttribute('aria-label', `${button.dataset.colorScheme} color scheme${unlocked ? ', unlocked' : ', locked; unlock in multiplayer shop'}`);
            });
            const current = AppState.get('settings')?.colorScheme;
            const activePremiumScheme = Array.from(document.querySelectorAll('.scheme-option[data-shop-item]'))
                .find(button => button.dataset.colorScheme === current);
            if (activePremiumScheme && !owned.includes(activePremiumScheme.dataset.shopItem)) {
                AppState.set('settings', { ...AppState.get('settings'), colorScheme: 'forest' });
                this.applyAppearance();
            }
            const selectedScheme = activePremiumScheme && !owned.includes(activePremiumScheme.dataset.shopItem) ? 'forest' : current;
            document.querySelectorAll('.scheme-option').forEach(button =>
                button.classList.toggle('selected', button.dataset.colorScheme === selectedScheme)
            );
        }

        updateMultiplayerGoalInputs() {
            const minutes = Number(document.getElementById('host-game-time')?.value || 5);
            const label = document.getElementById('host-game-time-value');
            if (label) label.textContent = minutes >= 60 ? '1 hour' : `${minutes} min`;
        }

        updateMultiplayerModeSetup(mode) {
            const labels = {
                skyline: ['City Escape', 'Climb a rooftop obstacle course before the tide.'],
                river: ['River Fishing', 'Steer a boat, dodge obstacles and catch fish.'],
                market: ['Package Delivery', 'Deliver packages across town and dodge cars.'],
                miner: ['Crystal Mining', 'Dig crystals, bank them at base, avoid lava.'],
                duel: ['King of the Hill', 'King of the Hill: hold the glowing zone to score and knock rivals off.'],
                crypto: ['Crypto Trading', 'Trade six assets and answer questions for cash.'],
                shooter: ['Arena Shooter', 'Twin-stick arena: aim with the mouse, dash, blast drone waves and rival pilots.'],
                sports: ['Soccer', 'Blue vs red: players are split into two teams. Dribble the ball, spend energy on power kicks and score in the rival goal.']
            };
            const [title, description] = labels[mode] || labels.skyline;
            document.getElementById('multiplayer-preview-title').textContent = title;
            document.getElementById('multiplayer-preview-description').textContent = description;
        }

        setMultiplayerScreen(screen) {
            this.multiplayerScreen = screen === 'join' ? 'join' : 'host';
            const hosting = this.multiplayerScreen === 'host';
            document.getElementById('multiplayer-host-flow').classList.toggle('hidden', !hosting);
            document.getElementById('multiplayer-join-flow').classList.toggle('hidden', hosting);
            document.getElementById('multiplayer-host-tab').classList.toggle('selected', hosting);
            document.getElementById('multiplayer-join-tab').classList.toggle('selected', !hosting);
            document.getElementById('multiplayer-host-tab').setAttribute('aria-selected', String(hosting));
            document.getElementById('multiplayer-join-tab').setAttribute('aria-selected', String(!hosting));
        }

        stopWaitingRunner() {
            this.waitingRunner.running = false;
            this.waitingRunner.started = false;
            this.waitingRunner.aiming = false;
        }

        startWaitingRunner(reset = true) {
            const runner = this.waitingRunner;
            if (reset) {
                runner.score = 0;
                runner.x = 90;
                runner.y = 251;
                runner.vx = 0;
                runner.vy = 0;
                runner.grounded = true;
                runner.camera = 0;
                runner.aiming = false;
                runner.aimStart = null;
                runner.aimPoint = null;
                runner.platforms = [{ x: 28, y: 278, width: 175 }];
                let center = 115;
                for (let index = 1; index < 60; index++) {
                    const width = 92 - Math.min(30, index) * 0.8;
                    center = Math.max(width / 2 + 12, Math.min(508 - width / 2, center + (Math.random() * 2 - 1) * 150));
                    runner.platforms.push({ x: center - width / 2, y: 278 - index * 58, width });
                }
                document.getElementById('waiting-runner-score').textContent = '0';
            }
            runner.running = true;
            runner.started = true;
            document.getElementById('waiting-runner-start').textContent = 'Restart climb';
        }

        pointOnCanvas(canvas, event) {
            const bounds = canvas.getBoundingClientRect();
            return {
                x: (event.clientX - bounds.left) * canvas.width / bounds.width,
                y: (event.clientY - bounds.top) * canvas.height / bounds.height
            };
        }

        // Pull-back launch: the drag vector (start point minus current point) sets the launch velocity.
        waitingLaunchVelocity(runner, point) {
            const dx = Math.max(-100, Math.min(100, runner.aimStart.x - point.x));
            const dy = Math.max(0, Math.min(110, point.y - runner.aimStart.y));
            if (Math.hypot(dx, dy) < 14) return null;
            return { vx: dx * 0.065, vy: -(5.6 + dy * 0.05) };
        }

        // Advances one 1/60s tick of the warm-up physics; returns the platform landed on, if any.
        waitingPhysics(state, platforms) {
            const previousFoot = state.y + 27;
            state.x += state.vx;
            state.y += state.vy;
            state.vy += 0.27;
            if (state.x < 15) { state.x = 15; state.vx = Math.abs(state.vx) * 0.6; }
            if (state.x > 505) { state.x = 505; state.vx = -Math.abs(state.vx) * 0.6; }
            if (state.vy <= 0) return null;
            return platforms.find(item =>
                previousFoot <= item.y && state.y + 27 >= item.y
                && state.x + 13 >= item.x && state.x - 13 <= item.x + item.width
            ) || null;
        }

        beginWaitingAim(event) {
            if (!this.waitingRunner.running) { this.startWaitingRunner(); event.preventDefault(); return; }
            const runner = this.waitingRunner;
            if (!runner.grounded) return;
            const point = this.pointOnCanvas(event.currentTarget, event);
            runner.aiming = true;
            runner.aimStart = point;
            runner.aimPoint = point;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        }

        updateWaitingAim(event) {
            if (!this.waitingRunner.aiming) return;
            this.waitingRunner.aimPoint = this.pointOnCanvas(event.currentTarget, event);
            event.preventDefault();
        }

        releaseWaitingAim(event) {
            const runner = this.waitingRunner;
            if (!runner.aiming || !runner.aimPoint) return;
            const launch = event.type === 'pointercancel' ? null : this.waitingLaunchVelocity(runner, this.pointOnCanvas(event.currentTarget, event));
            runner.aiming = false;
            runner.aimPoint = null;
            if (!launch) return;
            runner.vx = launch.vx;
            runner.vy = launch.vy;
            runner.grounded = false;
            window.StudBudSfx?.play?.('jump');
            event.preventDefault();
        }

        stepWaitingRunner(delta) {
            const runner = this.waitingRunner;
            if (!runner.running || runner.grounded) return;
            runner.tickBank = (runner.tickBank || 0) + delta;
            while (runner.tickBank >= 1) {
                runner.tickBank -= 1;
                const platform = this.waitingPhysics(runner, runner.platforms);
                if (!platform) continue;
                runner.y = platform.y - 27;
                runner.vy = 0;
                runner.vx = 0;
                runner.grounded = true;
                const altitude = Math.max(0, Math.floor((251 - runner.y) / 8));
                if (altitude > runner.score) {
                    runner.score = altitude;
                    document.getElementById('waiting-runner-score').textContent = String(altitude);
                    if (altitude > runner.best) {
                        runner.best = altitude;
                        document.getElementById('waiting-runner-best').textContent = String(altitude);
                    }
                }
                break;
            }
            if (runner.y - runner.camera > 390) {
                runner.running = false;
                runner.aiming = false;
                document.getElementById('waiting-runner-start').textContent = 'Climb again';
                this.saveWaitingRunnerBest();
                return;
            }
            if (runner.y - runner.camera < 205) runner.camera = runner.y - 205;
        }

        async saveWaitingRunnerBest() {
            const runner = this.waitingRunner;
            if (runner.saving || runner.score <= 0 || runner.score <= Number(this.multiplayerProfile?.best_wait_score || 0)) return;
            runner.saving = true;
            try {
                this.multiplayerProfile = await window.StudBudCommunityGames.recordWaitingGameBest(runner.score);
                runner.best = Number(this.multiplayerProfile.best_wait_score || runner.score);
                document.getElementById('waiting-runner-best').textContent = String(runner.best);
            } catch (error) {
                console.error('[NexusApp] Warm-up personal best could not sync:', error);
                document.getElementById('hosted-game-message').textContent = `Run complete. Your personal best could not sync. ${this.friendlyErrorMessage(error)}`;
            } finally {
                runner.saving = false;
            }
        }

        startMultiplayerAnimation() {
            if (this.multiplayerFrame) return;
            this.multiplayerFrameTime = performance.now();
            const animate = now => {
                const delta = Math.min(2.5, Math.max(0.25, (now - this.multiplayerFrameTime) / 16.67));
                this.multiplayerFrameTime = now;
                if (Router.activeRoute === 'multiplayer') {
                    const roomActive = this.hostedGameRoom && this.hostedGameRoom.status !== 'waiting' && !document.getElementById('hosted-game-room').classList.contains('hidden');
                    const previewActive = !document.getElementById('multiplayer-host-flow').classList.contains('hidden');
                    if (previewActive && !this.drawLivePreview(document.getElementById('multiplayer-game-canvas'), this.selectedMultiplayerMode, now)) this.drawMultiplayerScene(
                        document.getElementById('multiplayer-game-canvas'),
                        this.selectedMultiplayerMode,
                        [{ nickname: this.multiplayerDisplayName(), score: 280, skin: this.multiplayerProfile?.equipped_skin, hat: this.multiplayerProfile?.equipped_hat, accessory: this.multiplayerProfile?.equipped_accessory, streak: 2 }, { nickname: 'Rival', score: 140, skin: 'skin_robot', streak: 1 }],
                        now / 1000,
                        true
                    );
                    if (roomActive) this.drawMultiplayerScene(
                        document.getElementById('multiplayer-room-canvas'),
                        this.hostedGameRoom.mode,
                        this.hostedGameRoom.state?.players || [],
                        now / 1000,
                        false
                    );
                    const waiting = document.getElementById('waiting-arcade-card');
                    if (waiting && !waiting.classList.contains('hidden')) {
                        this.stepWaitingRunner(delta);
                        this.drawPotClimb(document.getElementById('waiting-runner-canvas'), now / 1000);
                    }
                }
                this.multiplayerFrame = requestAnimationFrame(animate);
            };
            this.multiplayerFrame = requestAnimationFrame(animate);
        }

        stopMultiplayerAnimation() {
            if (this.multiplayerFrame) cancelAnimationFrame(this.multiplayerFrame);
            this.multiplayerFrame = null;
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
            const bots = [['b1', 'Nova', '#f472b6'], ['b2', 'Kite', '#facc15'], ['b3', 'Rook', '#4ade80']].map(([id, name, color], i) => ({
                id, name, color, cos: {}, i, x: 0, y: 0, vx: 0, vy: 0, f: 0, a: 0, hp: 100, ex: {}, score: 0, tx: 0, ty: 0, respawn: 0, invuln: 0, stun: 0, cd: Math.random(), seen: performance.now()
            }));
            if (mode === 'duel') {
                const sp = [[480, 440], [1080, 440], [790, 200]];
                bots.forEach((b, i) => Object.assign(b, { w: 34, h: 56, sp: sp[i], x: sp[i][0], y: sp[i][1] - 60, dmg: 0, airJumps: 1, swingT: 0, swingCd: 0.5 + i * 0.4, f: 1 }));
                demo.onEmit = ev => { if (ev.k === 'sw') this.duelSwing(demo, ev); };
            } else if (mode === 'shooter') {
                bots.forEach(b => { b.r = 16; b.strafe = 1; this.placeShooterBot(game, b); });
            } else if (mode === 'sports') {
                bots.forEach(b => {
                    b.team = game.teamOf(b.id); b.dir = b.team === 0 ? 1 : -1; b.r = 15; b.kickCd = 0; b.turbo = 0; b.stun = 0;
                    const mates = game.teamIds.filter(id => game.teamOf(id) === b.team);
                    b.lane = game.H * (Math.max(0, mates.indexOf(b.id)) + 1) / (mates.length + 1);
                    b.home = [game.W * (b.dir > 0 ? 0.3 : 0.7), b.lane];
                    b.x = b.home[0] + (Math.random() - 0.5) * 200; b.y = b.lane;
                });
            }
            return bots;
        }

        duelSwing(demo, ev) {
            const U = window.StudBudArcade.util, game = demo.game;
            const dx = Math.cos(ev.a), dy = Math.sin(ev.a);
            const box = { x: ev.x + dx * 70 - 65, y: ev.y + dy * 70 - 58, w: 130, h: 116 };
            for (const t of demo.bots) {
                if (t.id === ev.by || t.respawn > 0 || t.invuln > 0 || !U.overlap(box, t)) continue;
                t.dmg += 9;
                const force = 280 + t.dmg * 9;
                t.vx = dx * force; t.vy = dy * force * 0.5 - (100 + t.dmg * 2); t.onGround = false;
                t.stun = U.clamp(0.2 + t.dmg / 400, 0.2, 0.55); t.lastHit = ev.by;
                game.particles.burst(t.x + 17, t.y + 28, '#fca5a5', 14, 260, 0.4, 5);
                if (ev.by === demo.meId) game.shake = Math.max(game.shake, 0.12);
            }
        }

        stepDuelBots(demo, dt) {
            const U = window.StudBudArcade.util, game = demo.game, me = game.me, now = performance.now();
            const meAlive = game.respawn <= 0;
            for (const b of demo.bots) {
                if (b.respawn > 0) {
                    b.respawn -= dt; b.a = 5;
                    if (b.respawn <= 0) { b.x = b.sp[0]; b.y = b.sp[1] - 60; b.vx = b.vy = 0; b.dmg = 0; b.invuln = 2; b.a = 0; }
                    b.seen = now; continue;
                }
                b.stun = Math.max(0, b.stun - dt); b.invuln = Math.max(0, b.invuln - dt); b.swingT = Math.max(0, b.swingT - dt); b.swingCd -= dt;
                let tgt = null, bd = 1e9;
                const foes = demo.bots.filter(o => o !== b && o.respawn <= 0);
                if (meAlive) foes.push({ x: me.x, y: me.y, id: demo.meId });
                for (const o of foes) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < bd) { bd = d; tgt = o; } }
                const off = b.y + 56 > 525 && (b.x + 17 < 300 || b.x + 17 > 1300);
                let want = 0;
                if (off) want = Math.sign(800 - b.x);
                else if (tgt && Math.abs(tgt.x - b.x) > 60) want = Math.sign(tgt.x - b.x);
                if (b.stun <= 0) {
                    const acc = (b.onGround ? 3000 : 1500) * dt;
                    b.vx += U.clamp(want * 300 - b.vx, -acc, acc);
                    if (tgt) b.f = tgt.x >= b.x ? 1 : -1;
                }
                b.vy = Math.min(1200, b.vy + 2400 * dt);
                if (b.onGround) b.airJumps = 1;
                if (b.stun <= 0) {
                    if (off) { if (!b.onGround && b.vy > 0 && b.airJumps > 0) { b.vy = -820; b.airJumps--; } }
                    else if (tgt && b.onGround && ((tgt.y < b.y - 50 && Math.abs(tgt.x - b.x) < 320) || (b.wall && want))) b.vy = -900;
                    else if (tgt && !b.onGround && b.vy > 0 && b.airJumps > 0 && tgt.y < b.y - 40) { b.vy = -820; b.airJumps--; }
                }
                U.moveBody(b, game.solids, dt);
                if (tgt && b.swingCd <= 0 && b.stun <= 0 && bd < 115) {
                    const ang = Math.atan2(tgt.y - b.y, tgt.x - b.x);
                    b.swingT = 0.22; b.swingCd = 0.6 + Math.random() * 0.5; b.swing = now; b.swingAim = ang;
                    const ev = { k: 'sw', x: b.x + 17, y: b.y + 28, d: b.f, a: ang, p: 1, by: b.id, c: b.dmg };
                    game.onEvent(ev, b); this.duelSwing(demo, ev);
                }
                if (b.x < -150 || b.x > 1750 || b.y > 950 || b.y < -500) {
                    b.respawn = 1.4; game.particles.burst(b.x, Math.min(b.y, 880), b.color, 30, 500, 0.8, 6);
                    if (b.lastHit === demo.meId) game.onEvent({ k: 'ko', by: demo.meId }, b);
                    b.lastHit = null;
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
            if (me.y + 56 > 525 && (cx < 300 || cx > 1300)) {
                hold.add(cx < 800 ? 'KeyD' : 'KeyA');
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

        placeShooterBot(game, b) {
            const U = window.StudBudArcade.util, me = game.me;
            for (let i = 0; i < 20; i++) {
                const a = Math.random() * U.TAU, d = 380 + Math.random() * 350;
                const x = U.clamp(me.x + Math.cos(a) * d, 120, game.W - 120), y = U.clamp(me.y + Math.sin(a) * d, 120, game.H - 120);
                if (game.walls.some(w => U.overlap({ x: x - 22, y: y - 22, w: 44, h: 44 }, w))) continue;
                b.x = x; b.y = y; return;
            }
            b.x = game.W / 2; b.y = game.H / 2;
        }

        stepShooterBots(demo, dt) {
            const U = window.StudBudArcade.util, game = demo.game, me = game.me, now = performance.now();
            for (const b of demo.bots) {
                b.seen = now;
                if (b.respawn > 0) {
                    b.respawn -= dt; b.a = 1;
                    if (b.respawn <= 0) { this.placeShooterBot(game, b); b.hp = 100; b.a = 0; b.invuln = 1.5; }
                    continue;
                }
                b.cd -= dt; b.invuln = Math.max(0, b.invuln - dt); b.sfT = (b.sfT || 0) - dt;
                if (b.sfT <= 0) { b.strafe = -b.strafe; b.sfT = 1.2 + Math.random() * 1.8; }
                let tgt = null, bd = 1e9;
                const foes = demo.bots.filter(o => o !== b && o.respawn <= 0);
                if (game.dead <= 0) foes.push(me);
                for (const o of foes) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < bd) { bd = d; tgt = o; } }
                let mx = 0, my = 0;
                if (tgt) {
                    const ang = Math.atan2(tgt.y - b.y, tgt.x - b.x), dir = bd > 420 ? 1 : bd < 260 ? -1 : 0;
                    mx = Math.cos(ang) * dir + Math.cos(ang + Math.PI / 2) * b.strafe * 0.8;
                    my = Math.sin(ang) * dir + Math.sin(ang + Math.PI / 2) * b.strafe * 0.8;
                    b.aim = ang + (Math.random() - 0.5) * 0.12;
                    if (b.cd <= 0 && bd < 780) {
                        b.cd = 0.3 + Math.random() * 0.3;
                        game.onEvent({ k: 'sh', x: b.x + Math.cos(b.aim) * 24, y: b.y + Math.sin(b.aim) * 24, a: b.aim, by: b.id }, b);
                    }
                }
                const k = Math.min(1, dt * 6);
                b.vx = U.lerp(b.vx, mx * 230, k); b.vy = U.lerp(b.vy, my * 230, k);
                b.x += b.vx * dt; b.y += b.vy * dt;
                for (const w of game.walls) U.pushCircleOutOfRect(b, w);
                b.x = U.clamp(b.x, 30, game.W - 30); b.y = U.clamp(b.y, 30, game.H - 30);
                b.f = b.aim || 0; b.a = 0; b.ex = { o: 0 }; b.tx = b.x; b.ty = b.y;
            }
            for (const bl of game.bullets) {
                if (bl.life <= 0) continue;
                const atk = bl.own ? demo.meId : bl.by;
                if (!atk) continue;
                for (const b of demo.bots) {
                    if (b.respawn > 0 || b.id === atk || b.invuln > 0 || Math.hypot(bl.x - b.x, bl.y - b.y) > b.r + 4) continue;
                    bl.life = 0; b.hp -= bl.dmg;
                    game.particles.burst(bl.x, bl.y, '#fde68a', 5, 120, 0.25, 3);
                    if (atk === demo.meId) game.onEvent({ k: 'hit', by: demo.meId }, b);
                    if (b.hp <= 0) {
                        b.respawn = 2; game.particles.burst(b.x, b.y, b.color, 30, 380, 0.8, 6);
                        if (atk === demo.meId) game.onEvent({ k: 'ko', by: demo.meId }, b);
                    }
                    break;
                }
            }
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
            if (Math.floor(c / 4) !== demo.lastDash) { demo.lastDash = Math.floor(c / 4); tap.add('Space'); }
            if (game.drones.filter(o => Math.hypot(o.x - me.x, o.y - me.y) < 250).length >= 3) tap.add('KeyE');
        }

        // Soccer preview: bots chase the ball with their team's closest player, dribble it toward the rival goal and shoot when close.
        stepSportsBots(demo, dt) {
            const U = window.StudBudArcade.util, game = demo.game, me = game.me, ball = game.ball, now = performance.now();
            const mates = demo.bots.map(b => ({ x: b.x, y: b.y, team: b.team, id: b.id }));
            mates.push({ x: me.x, y: me.y, team: game.myTeam, id: demo.meId });
            for (const b of demo.bots) {
                b.seen = now; b.ex = { t: 0 };
                b.kickCd -= dt;
                const own = mates.filter(o => o.team === b.team);
                const closest = own.reduce((best, o) => Math.hypot(o.x - ball.x, o.y - ball.y) < Math.hypot(best.x - ball.x, best.y - ball.y) ? o : best, own[0]);
                const chaser = closest.id === b.id || Math.hypot(b.x - ball.x, b.y - ball.y) < 260;
                const goalX = b.dir > 0 ? game.W : 0, goalY = game.H / 2;
                let tx, ty, speed = 255 * 1.1;
                if (game.freeze > 0) { tx = b.home[0]; ty = b.lane; }
                else if (chaser) {
                    const ax = goalX - ball.x, ay = goalY - ball.y, al = Math.hypot(ax, ay) || 1;
                    tx = ball.x - (ax / al) * 34; ty = ball.y - (ay / al) * 34; speed = 255 * 1.3;
                } else {
                    tx = U.clamp(ball.x - b.dir * 380, 200, game.W - 200); ty = U.clamp(b.lane + (ball.y - game.H / 2) * 0.3, 120, game.H - 120);
                }
                const dx = tx - b.x, dy = ty - b.y, dl = Math.hypot(dx, dy) || 1, k = dl > 14 ? 1 : dl / 14;
                const acc = 3000 * dt;
                b.vx += U.clamp(dx / dl * speed * k - b.vx, -acc, acc); b.vy += U.clamp(dy / dl * speed * k - b.vy, -acc, acc);
                b.x = U.clamp(b.x + b.vx * dt, b.r, game.W - b.r); b.y = U.clamp(b.y + b.vy * dt, b.r, game.H - b.r);
                b.f = Math.atan2(b.vy, b.vx); b.a = 1; b.tx = b.x; b.ty = b.y;
                if (game.freeze > 0) continue;
                const bx = ball.x - b.x, by = ball.y - b.y, bd = Math.hypot(bx, by), min = b.r + ball.r;
                if (bd < min) {
                    const nx = bx / (bd || 1), ny = by / (bd || 1);
                    ball.x = b.x + nx * min; ball.y = b.y + ny * min;
                    const ga = Math.atan2(goalY + (Math.random() - 0.5) * 180 - ball.y, goalX - ball.x);
                    const shoot = b.kickCd <= 0 && Math.abs(goalX - ball.x) < 700;
                    const sp = shoot ? 900 : 330;
                    ball.vx = Math.cos(ga) * sp; ball.vy = Math.sin(ga) * sp;
                    if (shoot) b.kickCd = 1.2;
                    game.lastTouch = b.id;
                }
            }
            // a goal the demo player didn't score is credited to the bot that touched the ball last
            if (game.unclaimed !== null && game.unclaimed !== undefined) {
                const scorer = demo.bots.find(b => b.id === game.lastTouch) || demo.bots[0];
                game.onEvent({ k: 'gl', team: game.unclaimed }, scorer);
            }
        }

        driveSports(demo, hold, tap) {
            const game = demo.game, me = game.me, ball = game.ball, dir = game.dir;
            const goalX = dir > 0 ? game.W : 0, goalY = game.H / 2;
            hold.add('ShiftLeft');
            const ax = goalX - ball.x, ay = goalY - ball.y, al = Math.hypot(ax, ay) || 1;
            const dBall = Math.hypot(ball.x - me.x, ball.y - me.y);
            // line up behind the ball so walking into it pushes it toward the goal
            let tx = ball.x - (ax / al) * 36, ty = ball.y - (ay / al) * 36;
            if (dBall < 120 && (ball.x - me.x) * dir > 0) { tx = ball.x; ty = ball.y; }
            if (game.freeze > 0) { tx = game.W * (dir > 0 ? 0.3 : 0.7); ty = game.spawnY(); }
            const dx = tx - me.x, dy = ty - me.y;
            if (Math.abs(dx) > 8) hold.add(dx > 0 ? 'KeyD' : 'KeyA');
            if (Math.abs(dy) > 8) hold.add(dy > 0 ? 'KeyS' : 'KeyW');
            if (dBall < 52 && Math.abs(goalX - ball.x) < 760 && Math.abs(ball.y - goalY) < 260 && (ball.x - me.x) * dir > 0) tap.add('Space');
        }

        // ---- City Escape autoplay ----
        // The course is generated from a fixed seed, so it never changes. The bot follows one fixed route through it: walk to the platform's edge, hop to the next platform on a set arc, repeat.
        // Movement is scripted rather than physics-driven, so it clears every checkpoint every time.
        skyRoute(game) {
            if (game.botRoute) return game.botRoute;
            const cps = game.checkpoints;
            const list = [{ x: cps[0].x - 80, y: cps[0].y, w: 200, h: 14 }];
            const flags = new Map(), cpNode = [0];
            flags.set(0, cps[0].x + 20);
            let last = list[0];
            for (const p of game.solids) {
                if (p.wall || p.wallJ || p.ground || p.slope || p.prop || p.w < 50 || p.y > last.y + 8) continue;
                list.push(p); last = p;
                cps.forEach((c, k) => {
                    if (k > 0 && cpNode[k] === undefined && Math.abs(p.y - c.y) < 1 && c.x + 20 >= p.x && c.x + 20 <= p.x + p.w) { cpNode[k] = list.length - 1; flags.set(list.length - 1, c.x + 20); }
                });
            }
            if (last !== game.summit) list.push(game.summit);
            cps.forEach((c, k) => {
                if (cpNode[k] !== undefined) return;
                let best = 1, d = 1e9;
                list.forEach((p, i) => { const dd = Math.abs(p.y - c.y) * 3 + Math.abs(p.x + p.w / 2 - c.x - 20); if (i > 0 && dd < d) { d = dd; best = i; } });
                cpNode[k] = best; flags.set(best, c.x + 20);
            });
            return game.botRoute = { list, flags, cpNode, props: game.solids.filter(p => p.prop) };
        }

        // Advances a scripted runner (body = {x, y, w, h}) one frame along the route.
        skyStep(game, b, st, dt, speed) {
            const U = window.StudBudArcade.util, R = this.skyRoute(game), n = R.list[st.i], nx = R.list[st.i + 1];
            const bw = b.w || 26, bh = b.h || 44;
            st.air = false; st.moving = false;
            if (st.wait > 0) { st.wait -= dt; b.y = n.y - bh; return; }
            if (st.hop) {
                const h = st.hop;
                h.t += dt / h.dur;
                const s = Math.min(1, h.t);
                b.x = U.lerp(h.x0, nx.x + h.rel - bw / 2, s);
                b.y = U.lerp(h.y0, nx.y - bh, s) - 4 * h.lift * s * (1 - s);
                st.air = true;
                if (s >= 1) { st.hop = null; st.i++; st.flagDone = false; st.wait = 0.05; }
                return;
            }
            const cx = b.x + bw / 2, fx = R.flags.get(st.i);
            let tx;
            if (fx !== undefined && !st.flagDone) tx = fx;
            else if (!nx) tx = n.x + n.w / 2;
            else tx = U.clamp(nx.x + nx.w / 2, n.x + 14, n.x + n.w - 14);
            const dx = tx - cx;
            if (Math.abs(dx) > 3) {
                const step = Math.min(Math.abs(dx), 320 * speed * dt);
                b.x += Math.sign(dx) * step; b.face = Math.sign(dx); st.moving = true;
            } else if (fx !== undefined && !st.flagDone) { st.flagDone = true; st.wait = 0.25; }
            else if (nx) {
                const rel = U.clamp(cx - nx.x, 16, nx.w - 16), rise = n.y - nx.y, run = Math.abs(nx.x + rel - cx);
                st.hop = { t: 0, x0: b.x, y0: b.y, rel, dur: U.clamp(0.4 + run / 1100 + Math.max(0, rise) / 1600, 0.4, 1) / speed, lift: 60 + Math.max(0, rise) * 0.25 + run * 0.06 };
                b.face = nx.x + rel >= cx ? 1 : -1;
            }
            b.x = U.clamp(b.x, n.x + 12 - bw / 2, n.x + n.w - 12 - bw / 2);
            // Hop over rooftop props instead of walking through them
            const c2 = b.x + bw / 2;
            let lift = 0;
            for (const p of R.props) {
                if (Math.abs(p.y + p.h - n.y) > 2) continue;
                const out = Math.max(p.x - c2, c2 - (p.x + p.w), 0);
                lift = Math.max(lift, (n.y - p.y) * U.clamp((46 - out) / 46, 0, 1));
            }
            b.y = n.y - bh - lift;
            if (lift > 2) st.air = true;
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
            if (game.finished) return;
            if (game.cp.id > S.start) {
                S.reachT = S.reachT ?? c;
                if (c - S.reachT > 0.9) { this.skylineCut(demo, game, c); return; }
            }
            this.skyDrive(game, S, R, c, hold, tap);
        }

        skyPlace(game, S, node, c) {
            const me = game.me;
            me.x = node.x + node.w / 2 - me.w / 2; me.y = node.y - me.h; me.vx = 0; me.vy = 0;
            Object.assign(game, { dash: 0, kick: 0, snapCam: true, stuckX: undefined });
            S.jump = null; S.lastProg = c;
        }

        // Presses the same keys a player would; the real game physics does the movement. Gets teleported forward only if it ever stalls.
        skyDrive(game, S, R, c, hold, tap) {
            const me = game.me, list = R.list, cx = me.x + me.w / 2, feet = me.y + me.h;
            const gi = list.indexOf(me.ground);
            if (me.onGround && gi >= 0 && gi !== S.cur) {
                if (gi > S.cur) S.lastProg = c;
                S.cur = gi; S.flagDone = !R.flags.has(gi); S.jump = null; S.fail = 0; S.runBack = false;
            }
            const nx = list[S.cur + 1];
            if (!nx) return;
            if (feet > list[S.cur].y + 520) { this.skyPlace(game, S, list[S.cur], c); return; }
            if (c - S.lastProg > 3) { S.cur = Math.min(list.length - 1, S.cur + 1); S.flagDone = true; this.skyPlace(game, S, list[S.cur], c); return; }
            const ncx = nx.x + nx.w / 2;
            if (me.onGround) {
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
                    if (Math.abs(cx - gx) > 18) { hold.add(gx > cx ? 'KeyD' : 'KeyA'); return; }
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
            const pool = cps.map((cp, k) => k).filter(k => k !== S.start);
            const k = pool[Math.floor(Math.random() * pool.length)];
            const n = R.list[R.cpNode[k]];
            S.start = k; S.reachT = undefined; S.cur = R.cpNode[k]; S.flagDone = true;
            this.skyPlace(game, S, n, c);
            me.x = cps[k].x + 20 - me.w / 2; me.face = 1;
            Object.assign(game, { cp: cps[k], dead: 0, tideY: cps[k].y + 1000 });
            game.maxH = Math.max(game.maxH, -cps[k].y);
            demo.trail = [];
        }

        // Runs the real game class with scripted bot input, so the lobby preview always matches the actual game.
        drawLivePreview(canvas, mode, now) {
            const A = window.StudBudArcade;
            if (!canvas || !A?.games?.[mode]) return false;
            try {
                let demo = this.livePreview;
                if (!demo || demo.mode !== mode || demo.failed) {
                    const hold = new Set(), tap = new Set();
                    const base = {
                        seed: 4242, local: { id: 'demo', color: '#38bdf8', nickname: 'You', cos: {} }, user: { id: 'demo' }, t: 0, startedAt: Date.now(), done: false, finishMs: 0, over: false, paused: false, question: null, score: 0,
                        vw: canvas.width, vh: canvas.height, canvas: { style: {} }, overlay: null, roster: new Map(), keys: hold, mouse: { x: 0, y: 0, down: false, pressed: false, touchAt: 0 },
                        down: (...c) => c.some(k => hold.has(k)), pressed: (...c) => c.some(k => tap.has(k)),
                        axis: () => ({ x: (hold.has('KeyD') ? 1 : 0) - (hold.has('KeyA') ? 1 : 0), y: (hold.has('KeyS') ? 1 : 0) - (hold.has('KeyW') ? 1 : 0) }),
                        spend: () => true, refill() { }, sfx() { }, toast() { }, ask() { return false; }, remoteList: () => [], emit: ev => this.livePreview?.onEmit?.(ev), send() { }, setGoal() { }, addScore() { }
                    };
                    const session = new Proxy(base, { get: (target, key) => key in target ? target[key] : (() => undefined) });
                    base.roster.set('demo', base.local);
                    [['b1', 'Nova', '#f472b6'], ['b2', 'Kite', '#facc15'], ['b3', 'Rook', '#4ade80']].forEach(([id, nickname, color]) => base.roster.set(id, { id, nickname, color, cos: {} }));
                    const game = new A.games[mode](session);
                    session.game = game;
                    demo = this.livePreview = { mode, session, game, hold, tap, last: now, clock: 0, meId: 'demo' };
                    demo.bots = this.initPreviewBots(demo, mode, game);
                }
                const { session, game, hold, tap } = demo;
                const dt = Math.min(0.05, Math.max(0.001, (now - demo.last) / 1000));
                demo.last = now; demo.clock += dt; session.t += dt;
                const c = demo.clock;
                hold.clear(); tap.clear();
                const me = game.me;
                const bots = demo.bots;
                session.remoteList = () => bots;
                session.vw = canvas.width; session.vh = canvas.height;
                const dir = Math.sin(c * 0.7) > 0 ? 'KeyD' : 'KeyA';
                session.mouse.x = canvas.width / 2 + Math.cos(c * 1.3) * 260; session.mouse.y = canvas.height / 2 + Math.sin(c * 1.7) * 120;
                session.mouse.down = Math.sin(c * 2) > 0.2;
                session.mouse.pressed = false;
                if (mode === 'skyline') {
                    demo.trail = demo.trail || [];
                    demo.trail.push({ t: c, x: me.x, y: me.y, f: me.face || 1 });
                    while (demo.trail.length > 400) demo.trail.shift();
                    bots.forEach((b, i) => {
                        const pt = demo.trail.find(p => p.t >= c - 1.4 * (i + 1)) || demo.trail[0];
                        b.x = pt.x + (i - 1) * 34; b.y = pt.y; b.f = pt.f; b.a = 1; b.tx = b.x; b.ty = b.y; b.ex = {}; b.seen = performance.now();
                    });
                    this.skylineBot(demo, game, c, dt, hold, tap);
                } else if (mode === 'duel') {
                    this.stepDuelBots(demo, dt);
                    this.driveDuel(demo, hold, tap, session);
                } else if (mode === 'shooter') {
                    this.stepShooterBots(demo, dt);
                    this.driveShooter(demo, hold, tap, session, c);
                } else if (mode === 'sports') {
                    this.stepSportsBots(demo, dt);
                    this.driveSports(demo, hold, tap);
                } else {
                    bots.forEach((b, i) => {
                        const ph = c * (0.6 + i * 0.17) + i * 2.1;
                        b.x = me.x + Math.cos(ph) * (180 + i * 90); b.y = me.y + Math.sin(ph * 1.3) * (130 + i * 50);
                        b.f = Math.atan2(me.y - b.y, me.x - b.x); b.a = 1; b.hp = 100; b.tx = b.x; b.ty = b.y; b.ex = {}; b.seen = performance.now();
                    });
                    hold.add(dir);
                    if (Math.floor(c * 1.6) !== demo.lastJump) { demo.lastJump = Math.floor(c * 1.6); tap.add('Space'); }
                    if (Math.sin(c * 0.5) > 0.3) hold.add('Space');
                }
                if (game.res && game.res.value < 40) game.res.value = 100;
                if (mode === 'skyline' && game.finished && !demo.endAt) demo.endAt = c;
                if (mode === 'skyline' && demo.endAt && c - demo.endAt > 1.5) this.livePreview = null;
                game.update(dt);
                const context = canvas.getContext('2d');
                context.setTransform(1, 0, 0, 1, 0, 0);
                game.draw(context, canvas.width, canvas.height);
                context.fillStyle = 'rgba(8,12,28,.7)'; context.fillRect(10, 10, 150, 26);
                context.fillStyle = '#fff'; context.font = 'bold 13px system-ui'; context.textAlign = 'left';
                context.fillText('LIVE GAME PREVIEW', 20, 28);
                return true;
            } catch (error) {
                if (this.livePreview) this.livePreview.failed = true;
                console.warn('[NexusApp] Live preview unavailable, using the static scene:', error);
                return false;
            }
        }

        drawMultiplayerScene(canvas, mode, players, time, preview) {
            if (!canvas) return;
            const context = canvas.getContext('2d');
            if (!context) return;
            const width = canvas.width, height = canvas.height;
            const phase = time * 0.8;
            const ranked = players.length ? players : [{ score: 300 }, { score: 150 }];
            const palette = this.multiplayerProfile?.equipped_palette || 'palette_default';
            const accent = palette.includes('ocean') ? '#39d2f2'
                : palette.includes('sunset') || palette.includes('coral') ? '#ff835f'
                    : palette.includes('violet') || palette.includes('aurora') ? '#bd8cff'
                        : palette.includes('midnight') ? '#91a5ff' : '#68e0ac';
            const sky = context.createLinearGradient(0, 0, 0, height);
            sky.addColorStop(0, mode === 'miner' ? '#2e2542' : mode === 'river' ? '#4baad0' : mode === 'market' ? '#ffb66e' : mode === 'duel' ? '#34294e' : '#5094cf');
            sky.addColorStop(1, mode === 'miner' ? '#100f1c' : mode === 'river' ? '#164c75' : mode === 'market' ? '#9c4869' : mode === 'duel' ? '#121629' : '#1a355e');
            context.fillStyle = sky; context.fillRect(0, 0, width, height);
            for (let index = 0; index < 11; index++) {
                const x = (index * 112 + Math.sin(phase + index) * 28 - phase * (8 + index % 3) + width * 3) % (width + 90) - 40;
                if (mode === 'miner') {
                    context.fillStyle = index % 2 ? '#54446f' : '#382d50';
                    context.beginPath(); context.moveTo(x - 38, 225); context.lineTo(x, 45 + (index * 27 % 110)); context.lineTo(x + 44, 225); context.fill();
                    context.fillStyle = index % 2 ? '#7fe6ee' : '#f7c75f';
                    context.globalAlpha = 0.75;
                    context.beginPath(); context.moveTo(x, 110 + index % 50); context.lineTo(x - 10, 132 + index % 35); context.lineTo(x + 9, 131 + index % 35); context.fill();
                    context.globalAlpha = 1;
                } else if (mode === 'river') {
                    context.fillStyle = '#b6e9ff'; context.globalAlpha = 0.22;
                    context.beginPath(); context.ellipse(x, 225 + index % 75, 38, 4, 0, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1;
                    if (index % 3 === 0) {
                        context.fillStyle = '#fff0a2'; context.beginPath(); context.arc(x, 245 + index % 60, 6, 0, Math.PI * 2); context.fill();
                        context.fillStyle = '#ff9b61'; context.beginPath(); context.moveTo(x - 6, 245 + index % 60); context.lineTo(x - 14, 240 + index % 60); context.lineTo(x - 14, 250 + index % 60); context.fill();
                    }
                } else {
                    const buildingHeight = 90 + (index * 41 % 150);
                    context.fillStyle = mode === 'market' ? (index % 2 ? '#9f5368' : '#ba685d') : '#294668';
                    context.fillRect(x, 218 - buildingHeight, 72, buildingHeight);
                    context.fillStyle = '#ffd785';
                    for (let window = 0; window < 6; window++) {
                        context.globalAlpha = 0.4 + ((index + window) % 3) * 0.2;
                        context.fillRect(x + 10 + (window % 2) * 30, 235 - buildingHeight + Math.floor(window / 2) * 31, 9, 12);
                    }
                    context.globalAlpha = 1;
                }
            }
            context.globalAlpha = 0.18;
            context.fillStyle = '#fff';
            for (let spark = 0; spark < 34; spark++) {
                const x = (spark * 83 + Math.sin(phase * (spark % 3 + 1) + spark) * 17) % width;
                const y = (spark * 47 + phase * (9 + spark % 5)) % 220;
                context.beginPath(); context.arc(x, y, 1 + spark % 3, 0, Math.PI * 2); context.fill();
            }
            context.globalAlpha = 1;

            if (mode === 'river') {
                for (let layer = 0; layer < 3; layer++) {
                    const y = 240 + layer * 43;
                    context.fillStyle = ['#267ca2', '#1d698e', '#175478'][layer];
                    context.beginPath(); context.moveTo(0, y);
                    for (let x = 0; x <= width; x += 22) context.lineTo(x, y + Math.sin(x * 0.025 + phase * (1 + layer * 0.15)) * 8);
                    context.lineTo(width, height); context.lineTo(0, height); context.fill();
                    context.strokeStyle = '#9de7f6'; context.globalAlpha = 0.35;
                    context.lineWidth = 2; context.beginPath();
                    for (let x = 0; x <= width; x += 20) context.lineTo(x, y + Math.sin(x * 0.025 + phase * (1 + layer * 0.15)) * 8);
                    context.stroke(); context.globalAlpha = 1;
                }
                for (let index = 0; index < 3; index++) {
                    const x = ((index * 300 + phase * 50) % (width + 160)) - 80;
                    context.fillStyle = '#e59c61'; context.beginPath(); context.moveTo(x - 49, 272); context.lineTo(x + 50, 272); context.lineTo(x + 35, 291); context.lineTo(x - 31, 291); context.fill();
                    context.fillStyle = '#f5d8a7'; context.fillRect(x - 24, 243, 47, 28);
                    const player = players[index % Math.max(players.length, 1)] || {};
                    this.drawCharacter(context, x + ((index % Math.max(players.length, 1)) * 16), 237, index === 0 ? accent : '#f69074', 0.75, time, true, player.accessory, 'rod');
                }
            } else if (mode === 'market') {
                for (let stall = 0; stall < 5; stall++) {
                    const x = stall * 190 - 15;
                    context.fillStyle = '#75465a'; context.fillRect(x, 224, 154, 106);
                    context.fillStyle = stall % 2 ? '#ffd166' : '#ff7e67';
                    context.beginPath(); context.moveTo(x - 6, 224); context.lineTo(x + 14, 182); context.lineTo(x + 141, 182); context.lineTo(x + 160, 224); context.fill();
                    for (let stripe = 0; stripe < 5; stripe++) {
                        context.fillStyle = stripe % 2 ? '#fff0cb' : 'rgba(255,255,255,.18)';
                        context.fillRect(x + 13 + stripe * 27, 190, 12, 34);
                    }
                    context.fillStyle = '#f6c76a';
                    for (let item = 0; item < 4; item++) { context.beginPath(); context.arc(x + 24 + item * 34, 252, 8 + item % 2 * 3, 0, Math.PI * 2); context.fill(); }
                }
                for (let index = 0; index < 3; index++) this.drawCharacter(context, 100 + index * 285 + Math.sin(phase + index) * 26, 296, index ? '#ff9c69' : accent, 0.78, time + index, false, players[index]?.accessory);
            } else if (mode === 'miner') {
                context.fillStyle = '#372b4c'; context.beginPath(); context.moveTo(0, 290);
                for (let x = 0; x <= width; x += 35) context.lineTo(x, 260 + Math.sin(x * 0.016 + phase) * 28);
                context.lineTo(width, height); context.lineTo(0, height); context.fill();
                for (let index = 0; index < 24; index++) {
                    const x = index * 43 + 8;
                    const y = 273 + Math.sin(index * 7) * 35;
                    context.fillStyle = index % 2 ? '#58dbe4' : '#eabe61';
                    context.beginPath(); context.moveTo(x, y - 12); context.lineTo(x + 8, y); context.lineTo(x, y + 17); context.lineTo(x - 8, y); context.fill();
                    context.globalAlpha = 0.14 + (Math.sin(time * 3 + index) + 1) * 0.13;
                    context.beginPath(); context.arc(x, y, 19, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1;
                }
                context.fillStyle = '#4b4d58'; context.fillRect(0, 316, width, 44);
                context.strokeStyle = '#d5a876'; context.lineWidth = 5;
                for (let rail = 0; rail < 2; rail++) { context.beginPath(); context.moveTo(0, 321 + rail * 23); context.lineTo(width, 321 + rail * 23); context.stroke(); }
                context.fillStyle = '#485262'; context.fillRect(60, 280, 85, 37);
                for (let wheel = 0; wheel < 2; wheel++) { context.fillStyle = '#18202e'; context.beginPath(); context.arc(78 + wheel * 54, 319, 11, 0, Math.PI * 2); context.fill(); }
                this.drawCharacter(context, 100, 272, accent, 0.8, time, true, players[0]?.accessory, 'pickaxe');
            } else if (mode === 'duel') {
                context.fillStyle = 'rgba(31,25,55,.68)';
                context.fillRect(0, 0, width / 2 - 3, height);
                context.fillStyle = 'rgba(24,35,63,.75)';
                context.fillRect(width / 2 + 3, 0, width / 2 - 3, height);
                context.fillStyle = '#755077';
                for (let index = 0; index < 5; index++) {
                    const base = 280 - index * 50;
                    context.fillRect(index % 2 ? 0 : 105, base, 125 + (index % 2) * 80, 17);
                    context.fillStyle = '#b7849f'; context.fillRect(index % 2 ? 0 : 105, base, 125 + (index % 2) * 80, 4);
                    context.fillStyle = '#755077';
                }
                context.fillStyle = '#7183a2';
                for (let index = 0; index < 5; index++) {
                    const base = 280 - index * 50;
                    context.fillRect(index % 2 ? width - 205 : width - 125, base, 125 + (index % 2) * 80, 17);
                    context.fillStyle = '#b7c6df'; context.fillRect(index % 2 ? width - 205 : width - 125, base, 125 + (index % 2) * 80, 4);
                    context.fillStyle = '#7183a2';
                }
                const clash = Math.sin(time * 3) * 18;
                const challenger = players[0] || { distance: 0 };
                const rival = players[1] || { distance: 0 };
                const challengerY = Math.max(72, 285 - Number(challenger.distance || 0) * 13);
                const rivalY = Math.max(72, 285 - Number(rival.distance || 0) * 13);
                this.drawCharacter(context, 320 + clash, challengerY, accent, 1.12, time, true, challenger.accessory, 'hammer');
                this.drawCharacter(context, 575 - clash, rivalY, '#ff8178', 1.12, time + 0.8, true, rival.accessory, 'hammer');
                context.strokeStyle = '#f9dc89'; context.lineWidth = 4;
                context.globalAlpha = 0.35 + (Math.sin(time * 8) + 1) * 0.25;
                context.beginPath(); context.arc(width / 2, 236, 30 + Math.sin(time * 7) * 8, -0.9, 1.3); context.stroke();
                context.globalAlpha = 1;
                context.fillStyle = '#f4e2b5'; context.font = 'bold 17px system-ui'; context.textAlign = 'center';
                context.fillText('HAMMERHEART ARENA', width / 2, 38); context.textAlign = 'left';
            } else if (mode === 'crypto') {
                context.fillStyle = '#101a2c';
                for (let row = 0; row < 7; row++) {
                    context.strokeStyle = 'rgba(99,220,187,.12)'; context.lineWidth = 1;
                    context.beginPath(); context.moveTo(0, 72 + row * 38); context.lineTo(width, 72 + row * 38); context.stroke();
                }
                context.beginPath();
                for (let point = 0; point < 35; point++) {
                    const x = point * (width / 34);
                    const y = 188 + Math.sin(point * 1.9 + phase) * 62 + Math.sin(point * 0.41 + phase * 0.45) * 32;
                    if (point === 0) context.moveTo(x, y); else context.lineTo(x, y);
                }
                context.strokeStyle = '#71f0b5'; context.lineWidth = 5; context.shadowColor = '#63edb4'; context.shadowBlur = 12; context.stroke(); context.shadowBlur = 0;
                for (let index = 0; index < 7; index++) {
                    const x = 72 + index * 122;
                    context.fillStyle = index % 2 ? '#ff7085' : '#67e8b3';
                    const height = 24 + (index * 19 % 54);
                    context.fillRect(x, 272 - height, 14, height);
                    context.fillRect(x - 4, 257 - height, 22, 4);
                }
                context.fillStyle = '#def8ef'; context.font = 'bold 19px system-ui'; context.fillText('MARKET VOLATILITY', 24, 58);
                const position = players[0]?.last_action || 'choose a position';
                context.fillStyle = '#9db6c8'; context.font = '14px system-ui'; context.fillText(`Latest move: ${position.toUpperCase()}`, 24, 83);
                this.drawCharacter(context, 120 + Math.sin(phase * 2) * 18, 302, accent, 0.86, time, false, players[0]?.accessory);
            } else if (mode === 'shooter') {
                context.fillStyle = '#0b1528';
                for (let star = 0; star < 60; star++) {
                    const x = (star * 79 - phase * (14 + star % 4) + width * 4) % width;
                    const y = (star * 47) % 278;
                    context.fillStyle = star % 5 === 0 ? '#fbd77a' : '#a9d9ff';
                    context.globalAlpha = 0.35 + (star % 4) * 0.15;
                    context.fillRect(x, y, star % 7 === 0 ? 3 : 1.5, star % 7 === 0 ? 3 : 1.5);
                }
                context.globalAlpha = 1;
                for (let wave = 0; wave < 3; wave++) {
                    for (let drone = 0; drone < 5; drone++) {
                        const x = 170 + drone * 125 + Math.sin(phase * 2 + drone + wave) * 22;
                        const y = 95 + wave * 52 + Math.cos(phase * 2.7 + drone) * 13;
                        context.fillStyle = wave === 2 ? '#ff7e8f' : '#62dff0';
                        context.beginPath(); context.moveTo(x, y - 13); context.lineTo(x + 15, y); context.lineTo(x, y + 12); context.lineTo(x - 15, y); context.closePath(); context.fill();
                        context.fillStyle = '#e7fbff'; context.beginPath(); context.arc(x, y, 3, 0, Math.PI * 2); context.fill();
                    }
                }
                context.fillStyle = '#263d5b'; context.beginPath(); context.moveTo(370, 302); context.lineTo(430, 242); context.lineTo(490, 302); context.closePath(); context.fill();
                context.fillStyle = '#63d8ff'; context.fillRect(421, 278, 18, 27);
                context.fillStyle = '#b9eaff'; context.font = 'bold 17px system-ui'; context.fillText(`WAVE ${Number(players[0]?.wave || 1)}`, 28, 58);
                context.strokeStyle = '#75e7ff'; context.lineWidth = 4; context.beginPath(); context.moveTo(450, 274); context.lineTo(490 + Math.sin(phase * 4) * 45, 138 + Math.cos(phase * 3) * 24); context.stroke();
                this.drawCharacter(context, 450, 297, accent, 0.82, time, true, players[0]?.accessory, 'blaster');
            } else if (mode === 'sports') {
                context.fillStyle = '#246b4d'; context.fillRect(0, 0, width, height);
                for (let stripe = 0; stripe < 9; stripe++) {
                    context.fillStyle = stripe % 2 ? 'rgba(255,255,255,.025)' : 'rgba(5,28,22,.09)';
                    context.fillRect(stripe * 112, 66, 112, 294);
                }
                context.strokeStyle = 'rgba(246,255,241,.65)'; context.lineWidth = 3;
                context.beginPath(); context.moveTo(width / 2, 70); context.lineTo(width / 2, 352); context.stroke();
                context.beginPath(); context.arc(width / 2, 211, 44, 0, Math.PI * 2); context.stroke();
                context.strokeRect(12, 120, 70, 182); context.strokeRect(width - 82, 120, 70, 182);
                context.fillStyle = '#f4f8e8'; context.fillRect(8, 150, 6, 122); context.fillRect(width - 14, 150, 6, 122);
                context.fillStyle = '#fff3c1'; context.font = 'bold 19px system-ui'; context.textAlign = 'center'; context.fillText('SOCCER', width / 2, 43); context.textAlign = 'left';
                const goals = Number(players[0]?.touchdowns || 0);
                const ballX = width / 2 + Math.sin(phase * 1.6) * 150;
                this.drawCharacter(context, ballX - 40, 222, accent, 0.93, time, true, players[0]?.accessory);
                this.drawCharacter(context, ballX + 70, 225, '#f78278', 0.88, time + 1, true, players[1]?.accessory);
                context.fillStyle = '#fff'; context.beginPath(); context.arc(ballX, 238, 9, 0, Math.PI * 2); context.fill();
                context.fillStyle = '#1e293b'; context.beginPath(); context.arc(ballX, 238, 3.5, 0, Math.PI * 2); context.fill();
                context.fillStyle = '#f4f8e8'; context.font = 'bold 15px system-ui'; context.fillText(`${goals} GOAL${goals === 1 ? '' : 'S'}`, 25, height - 18);
            } else {
                const runner = players[0] || { score: 280, distance: 5 };
                const mapLength = 36;
                const routeNodes = Math.max(Number(runner.distance || 0), Math.floor(Number(runner.score || 0) / 50));
                const segment = Math.min(mapLength - 1, Math.floor(routeNodes));
                const camera = Math.max(0, segment * 176 - 285);
                const biome = Math.floor(segment / 6) % 4;
                const skies = ['#528fc0', '#e59370', '#483e80', '#9aafc3'];
                const deep = ['#233b5c', '#65435e', '#252545', '#465266'];
                const bg = context.createLinearGradient(0, 0, 0, height);
                bg.addColorStop(0, skies[biome]); bg.addColorStop(1, deep[biome]);
                context.fillStyle = bg; context.fillRect(0, 0, width, height);
                for (let far = 0; far < 12; far++) {
                    const x = (far * 126 - camera * 0.28 + width * 4) % (width + 140) - 70;
                    context.fillStyle = biome === 2 ? 'rgba(25,21,54,.72)' : 'rgba(28,45,69,.5)';
                    context.beginPath(); context.moveTo(x, 250); context.lineTo(x + 18, 95 + far % 5 * 18); context.lineTo(x + 94, 225); context.lineTo(x + 108, 250); context.fill();
                }
                const heights = [278, 250, 226, 260, 211, 232, 190, 246, 216, 184, 229, 198];
                const routeEnd = mapLength;
                for (let index = Math.max(0, segment - 2); index < routeEnd; index++) {
                    const x = index * 176 - camera + 285;
                    const y = heights[index % heights.length];
                    const widthHere = index % 4 === 2 ? 92 : 135;
                    const color = index % 6 === 5 ? '#d2bc86' : biome === 2 ? '#9682ce' : '#a47b60';
                    context.fillStyle = '#26354a'; context.fillRect(x, y + 9, widthHere, 18);
                    context.fillStyle = color; context.fillRect(x, y, widthHere, 12);
                    context.fillStyle = '#f3d18b'; context.fillRect(x + 4, y + 2, widthHere - 8, 3);
                    if (index % 3 === 1) {
                        context.fillStyle = '#ff8a76';
                        context.beginPath(); context.moveTo(x + 46, y); context.lineTo(x + 53, y - 19); context.lineTo(x + 60, y); context.lineTo(x + 68, y - 23); context.lineTo(x + 77, y); context.fill();
                    } else if (index % 3 === 2) {
                        const beamX = x + 20 + ((Math.sin(time * 2 + index) + 1) * 0.5) * 44;
                        context.strokeStyle = '#71e8ec'; context.lineWidth = 5; context.shadowColor = '#65f4ed'; context.shadowBlur = 8;
                        context.beginPath(); context.moveTo(beamX, y - 22); context.lineTo(beamX + 47, y - 22); context.stroke(); context.shadowBlur = 0;
                    }
                    if (index % 5 === 0 && index > 0) {
                        context.fillStyle = '#ffe07a'; context.fillRect(x + widthHere / 2 - 3, y - 60, 6, 59);
                        context.fillStyle = '#fff0ad'; context.font = 'bold 12px system-ui'; context.fillText(`CHECKPOINT ${Math.floor(index / 5)}`, x - 3, y - 66);
                    }
                    if (index % 4 === 0) {
                        context.fillStyle = '#8be8ca'; context.beginPath(); context.arc(x + widthHere * 0.75, y - 28 - Math.sin(time * 3 + index) * 5, 7, 0, Math.PI * 2); context.fill();
                        context.fillStyle = 'rgba(119,244,196,.23)'; context.beginPath(); context.arc(x + widthHere * 0.75, y - 28, 15, 0, Math.PI * 2); context.fill();
                    }
                }
                const finishX = (mapLength - 1) * 176 - camera + 285;
                if (finishX > -50 && finishX < width + 50) {
                    context.fillStyle = '#f8e6ae'; context.fillRect(finishX, 92, 8, 190);
                    context.fillRect(finishX + 78, 92, 8, 190);
                    context.fillRect(finishX, 92, 86, 10);
                    for (let tile = 0; tile < 6; tile++) {
                        context.fillStyle = tile % 2 ? '#1a2436' : '#fff';
                        context.fillRect(finishX + (tile % 2) * 14, 103 + Math.floor(tile / 2) * 14, 14, 14);
                    }
                    context.fillStyle = '#fff3c4'; context.font = 'bold 13px system-ui'; context.fillText('FINISH', finishX - 5, 80);
                }
                const currentIndex = Math.min(segment, routeEnd - 1);
                const currentY = heights[currentIndex % heights.length];
                const playerX = currentIndex * 176 - camera + 340 + Math.sin(phase * 2) * 4;
                this.drawCharacter(context, playerX, currentY - 29, accent, 1, time, true, players[0]?.accessory);
                ranked.forEach((player, index) => {
                    if (index === 0) return;
                    const distance = Math.max(Number(player.distance || 0), Math.floor(Number(player.score || 0) / 50));
                    const rivalSegment = Math.floor(distance);
                    const rivalX = rivalSegment * 176 - camera + 340;
                    const rivalY = heights[Math.max(0, rivalSegment) % heights.length];
                    this.drawCharacter(context, rivalX, rivalY - 27, ['#ff9d69', '#a8a0ff', '#f185aa'][index % 3], 0.78, time + index, true, player.accessory);
                });
                context.fillStyle = '#fff4cc'; context.font = 'bold 17px system-ui'; context.fillText(`ROOFTOP DISTRICT ${Math.floor(segment / 6) + 1} · CHECKPOINT ${Math.min(7, Math.floor(segment / 5))}/7`, 22, 42);
                context.fillStyle = 'rgba(9,19,37,.65)'; context.fillRect(width - 226, 14, 205, 15);
                context.fillStyle = '#ffe07a'; context.fillRect(width - 226, 14, 205 * Math.min(1, segment / (mapLength - 1)), 15);
                context.fillStyle = '#fff'; context.font = '11px system-ui'; context.fillText('36-SECTION ROUTE', width - 221, 42);
            }
            if (['classic', 'rush', 'survival'].includes(mode)) {
                ranked.slice(1).forEach((player, index) => {
                    const x = 660 + index * 90 + Math.sin(time * 2 + index) * 8;
                    this.drawCharacter(context, x, 293 - index * 28, index % 2 ? '#f6a75f' : '#a99be9', 0.8, time + index, false);
                });
            }
            context.fillStyle = '#fff';
            context.font = '600 15px system-ui';
            context.shadowColor = 'rgba(8,15,30,.65)'; context.shadowBlur = 5;
            const sceneLabel = {
                skyline: 'ROOFTOP DISTRICT', river: 'RIVER HAUL', market: 'BAZAAR RUN',
                miner: 'CRYSTAL CAVERN', duel: 'RIVAL CLIMB', crypto: 'LIVE MARKET',
                shooter: 'DRONE ASSAULT', sports: 'SOCCER'
            };
            context.fillText(preview ? 'LIVE GAME PREVIEW' : (sceneLabel[mode] || 'LIVE MATCH'), 18, 28);
            context.shadowBlur = 0;
        }

        drawPotClimb(canvas, time) {
            if (!canvas) return;
            const context = canvas.getContext('2d');
            if (!context) return;
            const runner = this.waitingRunner;
            const width = canvas.width, height = canvas.height;
            const sky = context.createLinearGradient(0, 0, 0, height);
            sky.addColorStop(0, '#437ec4'); sky.addColorStop(0.58, '#c87c93'); sky.addColorStop(1, '#352948');
            context.fillStyle = sky; context.fillRect(0, 0, width, height);
            for (let index = 0; index < 8; index++) {
                const x = (index * 89 + Math.sin(time * 0.35 + index) * 13) % width;
                const y = 56 + (index * 59 % 190);
                context.fillStyle = 'rgba(255,231,185,.56)';
                context.beginPath(); context.arc(x, y, 1 + index % 2, 0, Math.PI * 2); context.fill();
            }
            const camera = runner.camera;
            runner.platforms.forEach((platform, index) => {
                const y = platform.y - camera;
                if (y < -30 || y > height + 20) return;
                context.fillStyle = index % 3 === 0 ? '#d9b27a' : '#b88c67';
                context.beginPath(); context.roundRect(platform.x, y, platform.width, 12, 5); context.fill();
                context.fillStyle = '#f1d49a';
                context.beginPath(); context.roundRect(platform.x + 5, y + 1, platform.width - 10, 3, 2); context.fill();
                context.fillStyle = index % 2 ? '#76d9d3' : '#ffd46e';
                context.beginPath(); context.arc(platform.x + platform.width * 0.7, y - 5, 4, 0, Math.PI * 2); context.fill();
            });
            const screenY = runner.y - camera;
            const x = runner.x;
            if (runner.aiming && runner.aimPoint) {
                const launch = this.waitingLaunchVelocity(runner, runner.aimPoint);
                if (launch) {
                    const sim = { x: runner.x, y: runner.y, vx: launch.vx, vy: launch.vy };
                    context.fillStyle = '#ffed9d';
                    for (let step = 0; step < 90; step++) {
                        const landed = this.waitingPhysics(sim, runner.platforms);
                        if (step % 4 === 3) { context.globalAlpha = 1 - step / 100; context.beginPath(); context.arc(sim.x, sim.y - camera - 18, 3, 0, Math.PI * 2); context.fill(); }
                        if (landed) break;
                    }
                    context.globalAlpha = 1;
                }
                context.fillStyle = '#fff1a8';
                context.font = '600 13px system-ui';
                context.fillText(launch ? 'RELEASE TO LAUNCH' : 'PULL BACK FURTHER', 15, 24);
            } else if (!runner.running) {
                context.fillStyle = '#fff4df'; context.font = '600 13px system-ui';
                context.fillText(runner.score ? 'MISSED THE LEDGE · CLIMB AGAIN' : 'CLICK TO START, THEN DRAG BACK AND RELEASE', 15, 24);
            } else if (runner.grounded && runner.score === 0) {
                context.fillStyle = '#fff4df'; context.font = '600 13px system-ui';
                context.fillText('DRAG DOWN AND BACK, THEN RELEASE TO JUMP', 15, 24);
            }
            this.drawCharacter(context, x, screenY - 18, '#e9a86d', 0.94, time, runner.aiming || Math.abs(runner.vy) > 0.2);
            context.fillStyle = '#33415a';
            context.beginPath(); context.moveTo(x - 24, screenY + 8); context.lineTo(x + 22, screenY + 8);
            context.lineTo(x + 17, screenY + 37); context.quadraticCurveTo(x, screenY + 48, x - 19, screenY + 36); context.fill();
            context.fillStyle = '#c27960';
            context.beginPath(); context.moveTo(x - 23, screenY + 8); context.lineTo(x + 21, screenY + 8);
            context.lineTo(x + 15, screenY + 20); context.lineTo(x - 17, screenY + 20); context.fill();
            context.fillStyle = 'rgba(255,255,255,.9)';
            context.font = 'bold 15px system-ui';
            context.fillText(`${runner.score} m`, width - 84, 25);
        }

        async searchCommunityDecks(query) {
            const status = document.getElementById('community-deck-status');
            const results = document.getElementById('community-deck-results');
            if (!status || !results) return;
            status.textContent = 'Searching shared decks…';
            try {
                const decks = await window.StudBudCommunityGames.searchDecks(query);
                results.dataset.loaded = 'true';
                results.innerHTML = decks.length ? decks.map(deck => `
                    <article class="community-deck-card">
                        <div><strong>${this.escapeHTML(deck.title)}</strong><p>${this.escapeHTML(deck.description || 'A student-shared study set.')}</p>
                            <small>${Number(deck.card_count)} cards · studied by ${Number(deck.study_count)} ${Number(deck.study_count) === 1 ? 'student' : 'students'}</small></div>
                        <button class="secondary-btn" type="button" data-action="import-community-deck" data-id="${this.escapeHTML(deck.id)}"><i class="fas fa-download"></i> Add to my decks</button>
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
            if (!deck || Number(deck.studiedCount || 0) < 1) throw new Error('Study at least one card before sharing this deck.');
            const published = await window.StudBudCommunityGames.publishDeck(deck);
            await AppState.saveFlashcardDeck({ ...deck, communityPublished: true, communityDeckId: published.id });
            window.alert('Deck shared. Its title, card terms and definitions, and any source attribution are visible to signed-in StudBud users. You can stop sharing it at any time.');
        }

        async unpublishCommunityDeck(deckId) {
            const deck = (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!deck) throw new Error('This deck is no longer available.');
            await window.StudBudCommunityGames.unpublishDeck(deckId);
            await AppState.saveFlashcardDeck({ ...deck, communityPublished: false, communityDeckId: null });
        }

        async importCommunityDeck(deckId) {
            const shared = await window.StudBudCommunityGames.importDeck(deckId);
            const existingDeck = (AppState.get('flashcards') || []).find(deck =>
                deck.communitySourceId === shared.id
            );
            if (existingDeck) {
                document.getElementById('community-deck-status').textContent = `“${shared.title}” is already in your decks.`;
                return;
            }
            const localDeck = {
                id: `community_${window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
                title: shared.title,
                cards: shared.cards.map(card => ({
                    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    front: String(card.front || ''),
                    back: String(card.back || ''),
                    repetitions: 0,
                    interval: 0,
                    easeFactor: 2.5
                })),
                communitySourceId: shared.id,
                communitySourceOwnerId: shared.owner_id,
                communitySourceTitle: shared.title,
                studiedCount: 0
            };
            await AppState.saveFlashcardDeck(localDeck);
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
            const nickname = form.elements.nickname.value.trim();
            const deck = (AppState.get('flashcards') || []).find(item => item.id === form.elements.deckId.value);
            if (!deck) throw new Error('Add a flashcard set before hosting a game.');
            const cards = (deck.cards || []).filter(card => String(card.front || '').trim() && String(card.back || '').trim());
            if (cards.length < 1) throw new Error('Hosted games need a set with at least one complete card.');
            if (cards.some(card => String(card.front).trim().length > 1000 || String(card.back).trim().length > 1000)) {
                throw new Error('Hosted game terms and definitions must be 1000 characters or fewer.');
            }
            const options = {
                goal_type: 'time',
                point_limit: 1000,
                time_limit_seconds: Math.min(60, Math.max(1, Number(form.elements.timeLimit.value) || 5)) * 60,
                question_reward: Number(form.elements.questionReward.value)
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
        }

        async joinGame(form) {
            const nickname = form.elements.nickname.value.trim();
            const roomCode = form.elements.roomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const room = await window.StudBudCommunityGames.joinRoom(roomCode, nickname);
            this.openHostedGame(room);
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
                window.prompt('Copy this room code and share it with your players:', code);
            }
        }

        openHostedGame(room) {
            this.hostedGameRoom = room;
            this.arcadeLeft = false;
            this.hostedGamePollError = '';
            document.getElementById('hosted-game-room').classList.remove('hidden');
            document.getElementById('hosted-game-message').textContent = '';
            this.renderHostedGameRoom(room);
            if (this.hostedGameInterval) clearInterval(this.hostedGameInterval);
            this.hostedGameInterval = setInterval(() => this.refreshHostedGame(), 1200);
        }

        async refreshHostedGame() {
            if (!this.hostedGameRoom || this.hostedGameBusy) return;
            this.hostedGameBusy = true;
            try {
                const room = await window.StudBudCommunityGames.getRoom(this.hostedGameRoom.room_code);
                this.hostedGamePollError = '';
                this.hostedGameRoom = room;
                this.renderHostedGameRoom(room);
            } catch (error) {
                console.error('[NexusApp] Hosted game refresh failed:', error);
                if (error.message.includes('not in this game')) {
                    if (this.hostedGameInterval) clearInterval(this.hostedGameInterval);
                    this.hostedGameInterval = null;
                    this.hostedGameRoom = null;
                    document.getElementById('hosted-game-room').classList.add('hidden');
                    document.getElementById('hosted-game-message').textContent = 'You left the room or were removed by the host.';
                    this.hostedGamePollError = error.message;
                    return;
                }
                const message = `Connection problem. ${this.friendlyErrorMessage(error, 'The game could not refresh. Please try again shortly.')}`;
                if (this.hostedGamePollError !== message) {
                    document.getElementById('hosted-room-status').textContent = message;
                    this.hostedGamePollError = message;
                }
            } finally {
                this.hostedGameBusy = false;
            }
        }

        renderHostedGameRoom(room) {
            const panel = document.getElementById('hosted-game-room');
            if (!panel || !room) return;
            const isHost = room.host_id === window.StudBudCloud.user.id;
            const state = room.state || {};
            const players = Array.isArray(state.players) ? state.players : [];
            const me = players.find(player => player.id === window.StudBudCloud.user.id);
            const modeNames = {
                classic: 'Classic', rush: 'Rush', survival: 'Survival',
                skyline: 'City Escape', river: 'River Fishing', market: 'Package Delivery',
                miner: 'Crystal Mining', duel: 'King of the Hill',
                crypto: 'Crypto Trading', shooter: 'Arena Shooter', sports: 'Soccer'            };
            document.getElementById('hosted-room-title').textContent = `${room.deck_title} · ${modeNames[room.mode] || room.mode}`;
            const playerLimit = room.mode === 'duel' ? 8 : 16;
            const remainingSeconds = room.goal_type === 'time' && room.started_at
                ? Math.max(0, Math.ceil((new Date(room.started_at).getTime() + Number(room.time_limit_seconds) * 1000 - Date.now()) / 1000))
                : null;
            const goalLabel = room.goal_type === 'time'
                ? remainingSeconds === null
                    ? `${Math.round(Number(room.time_limit_seconds) / 60)} minute limit`
                    : `Time left · ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`
                : room.mode === 'skyline' ? '36-section rooftop route'
                    : room.mode === 'sports' ? `${room.point_limit} goal${Number(room.point_limit) === 1 ? '' : 's'}`
                    : room.mode === 'shooter' ? `${room.point_limit} drone targets`
                        : `${Number(room.point_limit).toLocaleString()} point goal`;
            document.getElementById('hosted-room-meta').textContent = `${goalLabel} · ${players.length} / ${playerLimit} players`;
            document.getElementById('hosted-room-code').textContent = room.room_code;
            const rankedPlayers = players.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
            const avatarFor = player => this.multiplayerAvatarMarkup({ skin: player.skin, hat: player.hat, acc: player.accessory });
            document.getElementById('hosted-leaderboard-count').textContent = `${players.length} player${players.length === 1 ? '' : 's'}`;
            document.getElementById('hosted-leaderboard-title').textContent = room.status === 'waiting' ? 'Lobby' : 'Leaderboard';
            document.getElementById('hosted-room-players').innerHTML = rankedPlayers
                .map((player, index) => {
                    const isSelf = player.id === window.StudBudCloud.user.id;
                    const kick = isHost && player.id !== room.host_id && room.status !== 'finished' ? `<button class="host-kick-btn" type="button" data-action="hosted-kick-player" data-id="${this.escapeHTML(player.id)}" aria-label="Remove ${this.escapeHTML(player.nickname)}">Remove</button>` : '';
                    if (room.status === 'waiting') {
                        return `<li class="leaderboard-player lobby-player${isSelf ? ' is-self' : ''}">${avatarFor(player)}<span class="leaderboard-name">${this.escapeHTML(player.nickname)}${isSelf ? ' · you' : ''}</span><span class="lobby-tag${player.id === room.host_id ? ' is-host' : ''}">${player.id === room.host_id ? '<i class="fas fa-crown"></i> Host' : 'Ready'}</span>${kick}</li>`;
                    }
                    const progress = room.mode === 'sports' ? `${Number(player.touchdowns || 0)} goals`
                        : room.mode === 'shooter' ? `${Number(player.targets || 0)} targets · wave ${Number(player.wave || 1)}`
                            : room.mode === 'skyline' ? `${Number(player.distance || 0)} / 36 nodes · checkpoint ${Number(player.checkpoint || 0)}`
                                : room.mode === 'river' ? `${Number(player.loot || 0)} haul · ${player.last_action === 'deep_cast' ? 'deep cast' : 'shore'}`
                                    : room.mode === 'market' ? `${Number(player.deliveries || 0)} deliveries · ${Number(player.streak || 0)} streak`
                                        : room.mode === 'miner' ? `${Number(player.depth || 0)} depth · ${Number(player.loot || 0)} ore`
                                            : room.mode === 'crypto' ? `${Number(player.loot || 0)} chips · ${player.last_action || 'ready'}`
                                                : room.mode === 'duel' ? `${Number(player.score || 0)} pts`
                                                    : `${Number(player.score || 0)} points · ${Number(player.streak || 0)} streak`;
                    return `<li class="leaderboard-player${isSelf ? ' is-self' : ''}">${avatarFor(player)}<span class="leaderboard-name">${index + 1}. ${this.escapeHTML(player.nickname)}${isSelf ? ' · you' : ''}</span><span class="leaderboard-stat"><strong>${Number(player.score || 0).toLocaleString()} score</strong><small>${this.escapeHTML(progress)}</small></span>${kick}</li>`;
                }).join('');
            const sceneNames = {
                skyline: 'City Escape', river: 'River Fishing', market: 'Package Delivery',
                miner: 'Crystal Mining', duel: 'King of the Hill',
                crypto: 'Crypto Trading', shooter: 'Arena Shooter', sports: 'Soccer',
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
                    skyline: ['Climb to the summit past moving platforms, spikes, saws and wind. A rising tide chases you.', 'A/D run · Space jump (twice) · Shift dash'],
                    river: ['Steer a boat, dodge obstacles and catch fish.', 'WASD steer · click cast · Q recharge'],
                    market: ['Deliver packages across town and dodge cars.', 'WASD move · Shift sprint · Q recharge'],
                    miner: ['Dig through the cavern, haul ore back to base and avoid lava.', 'WASD move · hold click dig · Q recharge'],
                    duel: ['Hold the glowing hill alone to score. Knock rivals off the stage.', 'A/D move · Space jump · click swing · Shift guard'],
                    crypto: ['Trade six assets, react to market news and build mining rigs.', '1-6 pick · B buy · S sell'],
                    shooter: ['Blast drones and other players in an arena.', 'WASD move · mouse aim · click fire · Q reload'],
                    sports: ['Dribble the ball into the rival goal. Players are split into blue and red teams; sprinting and power kicks use energy.', 'WASD run · walk into the ball to dribble · Shift sprint · Space power kick · Q recharge']
                }[room.mode] || ['Answer flashcard questions faster than everyone else.', 'Answer correctly to score points.'];
                lobbyInfo.innerHTML = `<div class="lobby-mode"><strong>${this.escapeHTML(modeNames[room.mode] || 'Live game')}</strong><span>${this.escapeHTML(goalLabel)} · ${Number(room.state?.question_reward) || 20} coins per correct answer</span></div>
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
            this.syncArcadeSession(room, isHost);
            const waitingCard = document.getElementById('waiting-arcade-card');
            const guestWaiting = room.status === 'waiting';
            waitingCard.classList.toggle('hidden', !guestWaiting);
            if (guestWaiting && !this.waitingRunner.started) this.startWaitingRunner();
            if (!guestWaiting) this.stopWaitingRunner();
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
                document.getElementById('hosted-room-status').textContent = 'Game over · final scores and multiplayer coin rewards are shown below.';
                const rewards = state.coin_rewards || {};
                document.getElementById('hosted-podium').classList.remove('hidden');
                document.getElementById('hosted-podium').innerHTML = rankedPlayers.slice(0, 3).map((player, index) =>
                    `<div class="podium-place place-${index + 1}"><span class="podium-rank">0${index + 1}</span><strong>${avatarFor(player)} ${this.escapeHTML(player.nickname)}</strong><small>${Number(player.score || 0).toLocaleString()} points · +${Number(rewards[player.id] || 0)} coins</small></div>`
                ).join('');
            } else {
                document.getElementById('hosted-podium').classList.add('hidden');
                document.getElementById('hosted-room-status').textContent = me?.eliminated
                    ? 'You are out of this round. Watch the scores until the game ends.'
                    : 'The match is live in full screen. If you left it, rejoin by reopening the room.';
            }

            if (room.status !== 'finished') document.getElementById('hosted-podium').classList.add('hidden');
            if (this.multiplayerProfile && room.status === 'finished') this.renderMultiplayerProfile(true);
            if (room.status === 'finished' && this.hostedGameInterval && (!this.arcadeSession || this.arcadeSession.rewards || this.arcadeSession.practice)) {
                clearInterval(this.hostedGameInterval);
                this.hostedGameInterval = null;
            }
        }

        syncArcadeSession(room, isHost) {
            const arcade = window.StudBudArcade;
            const api = window.StudBudCommunityGames;
            if (room.status === 'playing' && arcade && !this.arcadeLeft) {
                if (!this.arcadeSession || this.arcadeSession.destroyed) {
                    this.closePractice();
                    const deck = (AppState.get('flashcards') || []).find(item => item.id === room.deck_id || item.title === room.deck_title);
                    this.arcadeSession = new arcade.Session({
                        room, user: window.StudBudCloud.user, api, isHost,
                        fallbackCards: (deck?.cards || []).filter(card => card.front && card.back),
                        finishRoom: () => api.finishRoom(room.room_code),
                        onLeave: () => this.leaveHostedGame().catch(error => console.error(error))
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

        destroyArcadeSession() {
            if (this.arcadeSession) this.arcadeSession.destroy();
            this.arcadeSession = null;
            document.body.classList.remove('mpg-active');
        }

        closePractice() {
            if (this.practiceSession) this.practiceSession.destroy();
            this.practiceSession = null;
            if (!this.arcadeSession) document.body.classList.remove('mpg-active');
        }

        startPractice() {
            const room = this.hostedGameRoom;
            const arcade = window.StudBudArcade;
            if (!room || !arcade || this.practiceSession) return;
            const user = window.StudBudCloud.user;
            const me = (room.state?.players || []).find(player => player.id === user.id) || { id: user.id, nickname: 'You' };
            const deck = (AppState.get('flashcards') || []).find(item => item.id === room.deck_id || item.title === room.deck_title);
            const botDefs = [['b1', 'Nova', '#f472b6'], ['b2', 'Kite', '#facc15'], ['b3', 'Rook', '#4ade80']];
            const fake = {
                mode: room.mode, room_code: 'PRACTICE', goal_type: 'points', point_limit: 99999, host_id: user.id,
                started_at: new Date().toISOString(),
                state: { players: [me, ...botDefs.map(([id, nickname, color]) => ({ id, nickname, color }))] }
            };
            const s = this.practiceSession = new arcade.Session({
                room: fake, user, api: window.StudBudCommunityGames, isHost: false, practice: true,
                fallbackCards: (deck?.cards || []).filter(card => card.front && card.back),
                onLeave: () => this.closePractice()
            });
            document.body.classList.add('mpg-active');
            try {
                const demo = { mode: room.mode, session: s, game: s.game, meId: user.id, clock: 0 };
                demo.bots = this.initPreviewBots(demo, room.mode, s.game);
                demo.bots.forEach(b => {
                    const info = s.roster.get(b.id);
                    if (info) { b.name = info.nickname; b.color = info.color; b.cos = info.cos; }
                    s.remotes.set(b.id, b);
                    b.st = { i: 0, flagDone: true, hop: null, wait: 1 + b.i * 0.8, air: false, moving: false };
                });
                const baseEmit = s.emit.bind(s);
                s.emit = ev => { baseEmit(ev); demo.onEmit?.(ev); };
                s.onTick = dt => {
                    if (s.over || s.paused || s.countdown > 0) return;
                    try { this.tickPracticeBots(demo, dt); } catch (error) { s.onTick = null; console.warn('[Practice] bots disabled:', error); }
                };
            } catch (error) {
                console.warn('[Practice] Could not add bots:', error);
            }
        }

        tickPracticeBots(demo, dt) {
            const { mode, game, bots } = demo, me = game.me, now = performance.now();
            demo.clock += dt;
            const c = demo.clock;
            if (mode === 'duel') this.stepDuelBots(demo, dt);
            else if (mode === 'shooter') this.stepShooterBots(demo, dt);
            else if (mode === 'sports') this.stepSportsBots(demo, dt);
            else if (mode === 'skyline') {
                const R = this.skyRoute(game);
                bots.forEach((b, i) => {
                    if (game.cp && b.st.i === 0 && !b.placed) { b.placed = true; b.x = R.list[0].x + 60 + i * 20; b.y = R.list[0].y - 44; }
                    b.w = 26; b.h = 44;
                    if (!R.list[b.st.i + 1]) { b.st.i = 0; b.st.hop = null; b.st.flagDone = true; b.x = R.list[0].x + 60; b.y = R.list[0].y - 44; }
                    this.skyStep(game, b, b.st, dt, 0.8 + i * 0.07);
                    b.f = b.face || 1; b.a = b.st.air ? 2 : b.st.moving ? 1 : 0; b.tx = b.x; b.ty = b.y; b.ex = {}; b.seen = now;
                });
            } else {
                bots.forEach((b, i) => {
                    const ph = c * (0.5 + i * 0.13) + i * 2.1;
                    b.x = me.x + Math.cos(ph) * (200 + i * 90); b.y = me.y + Math.sin(ph * 1.3) * (140 + i * 50);
                    b.f = Math.atan2(me.y - b.y, me.x - b.x); b.a = 1; b.hp = 100; b.tx = b.x; b.ty = b.y; b.ex = {}; b.seen = now;
                });
            }
        }

        async leaveHostedGame() {
            if (!this.hostedGameRoom) return;
            const code = this.hostedGameRoom.room_code;
            this.arcadeLeft = true;
            this.destroyArcadeSession();
            this.closePractice();
            await window.StudBudCommunityGames.leaveRoom(code);
            await this.renderMultiplayerProfile(true);
            if (this.hostedGameInterval) clearInterval(this.hostedGameInterval);
            this.hostedGameInterval = null;
            this.hostedGameRoom = null;
            document.getElementById('hosted-game-room').classList.add('hidden');
            document.getElementById('hosted-game-message').textContent = 'You left the room.';
            document.querySelector('.multiplayer-tabs').classList.remove('hidden');
            document.getElementById('hosted-start-btn').classList.add('hidden');
            document.getElementById('hosted-finish-btn').classList.add('hidden');
            this.setMultiplayerScreen(this.multiplayerScreen);
        }


        renderProfile() {
            const profile = AppState.get('profile') || {};
            const year = document.getElementById('settings-grad-year');
            if (year && profile.graduationYear) year.value = String(profile.graduationYear);
            const targetGpa = document.getElementById('settings-target-gpa');
            if (targetGpa) targetGpa.value = String(profile.targetGpa || 3.8);
            const currentTermSetting = document.getElementById('settings-current-term');
            if (currentTermSetting) currentTermSetting.value = profile.currentTerm || 'auto';

            const classYear = profile.graduationYear || 2026;
            const displayName = this.multiplayerDisplayName();
            const headerName = document.getElementById('multiplayer-header-name');
            if (headerName) headerName.textContent = displayName;
            const grade = document.getElementById('header-grade-level');
            if (grade) grade.textContent = `Class of ${classYear}`;
            const selectedTerm = profile.currentTerm === 'S1' || profile.currentTerm === 'S2'
                ? profile.currentTerm
                : (new Date().getMonth() >= 7 ? 'S1' : 'S2');
            const termDisplay = document.getElementById('current-term-display');
            if (termDisplay) termDisplay.textContent = this.termLabel(selectedTerm);
            const saveStatus = document.getElementById('data-save-status');
            if (saveStatus && !saveStatus.textContent.trim()) saveStatus.textContent = 'Your classes, assignments, profile, and settings sync automatically to your account.';
            this.applyAppearance();
        }

        applyAppearance() {
            const settings = AppState.get('settings') || {};
            const theme = settings.theme === 'light' ? 'light' : 'dark';
            const colorScheme = ['forest', 'ocean', 'violet', 'sunset', 'monochrome', 'aurora', 'coral', 'midnight'].includes(settings.colorScheme) ? settings.colorScheme : 'forest';
            document.body.classList.toggle('dark-theme', theme === 'dark');
            document.body.classList.toggle('light-theme', theme === 'light');
            document.body.classList.toggle('compact-ui', Boolean(settings.compactUi));
            document.body.classList.toggle('sidebar-collapsed', Boolean(settings.sidebarCollapsed));
            document.body.dataset.colorScheme = colorScheme;
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

        async loadFriends() {
            const games = window.StudBudCommunityGames;
            const lists = { friends: document.getElementById('friend-list'), incoming: document.getElementById('friend-incoming'), outgoing: document.getElementById('friend-outgoing') };
            if (!lists.friends || !games) return;
            try {
                const data = await games.friendCall('studbud_friend_overview');
                this.friendOverview = data;
                const person = (row, buttons) => `<li class="friend-row"><span class="friend-initial" aria-hidden="true">${this.escapeHTML((row.username || 'S').charAt(0).toUpperCase())}</span><strong>${this.escapeHTML(row.username)}</strong><span class="friend-actions">${buttons}</span></li>`;
                const attrs = row => `data-id="${this.escapeHTML(row.friendship_id)}" data-name="${this.escapeHTML(row.username)}"`;
                lists.friends.innerHTML = data.friends.length
                    ? data.friends.map(row => person(row, `<button type="button" class="secondary-btn" data-action="friend-view" data-id="${this.escapeHTML(row.user_id)}">Profile</button><button type="button" class="ghost-btn" data-action="friend-remove" ${attrs(row)}>Remove</button>`)).join('')
                    : '<li class="empty-state">No friends yet. Send a request using a username above.</li>';
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
                this.setFriendStatus(this.friendlyErrorMessage(error, 'Could not load your friends.'), true);
            }
        }

        async sendFriendRequest(input) {
            const name = input?.value.trim();
            if (!name) return;
            try {
                const result = await window.StudBudCommunityGames.friendCall('studbud_friend_request', { p_username: name });
                input.value = '';
                this.setFriendStatus(result?.status === 'accepted' ? `You and ${name} are now friends!` : `Friend request sent to ${name}.`);
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
                this.setFriendStatus(action === 'friend-accept' ? `You are now friends with ${name}.` : '');
                const panel = document.getElementById('friend-profile');
                if (panel && action === 'friend-remove') { panel.classList.add('hidden'); panel.innerHTML = ''; }
                await this.loadFriends();
            } catch (error) {
                this.setFriendStatus(error.message || 'That did not work.', true);
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
                panel.innerHTML = `<div class="friend-profile-head">${avatar}<div><h3>${this.escapeHTML(p.username)}</h3><small>Friend</small></div><button type="button" class="ghost-btn" data-action="friend-profile-close" aria-label="Close profile"><i class="fas fa-xmark"></i></button></div>
                    ${p.bio ? `<p class="friend-bio">${this.escapeHTML(p.bio)}</p>` : ''}${facts ? `<div class="friend-chips">${facts}</div>` : ''}
                    <div class="friend-stats">${p.show_stats === false ? stat('Match wins', Number(p.wins) || 0) : `${stat('Studied today', this.formatStudyDuration(p.today_seconds))}${stat('This week', this.formatStudyDuration(p.week_seconds))}${stat('All time', this.formatStudyDuration(p.total_seconds))}${stat('Day streak', `${Number(p.streak_days) || 0} 🔥`)}${stat('Match wins', Number(p.wins) || 0)}`}</div>`;
                panel.classList.remove('hidden');
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (error) {
                this.setFriendStatus(error.message || 'Could not open that profile.', true);
            }
        }

        tutorialSteps() {
            const nav = view => `.nav-item[data-target="${view}-view"]`;
            return [
                { title: 'Welcome to StudBud', text: 'StudBud keeps your classes, grades, study plans, flashcards and games in one place. This quick tour shows what each part does. You can leave at any time.' },
                { route: 'dashboard', sel: '#sidebar', title: 'Your menu', text: 'Everything lives in this menu. On a phone it sits along the top: swipe it sideways to see every page.' },
                { route: 'dashboard', sel: '.priority-widget', title: 'Dashboard: what is due', text: 'See your most urgent assignments here, and use Add Assignment to put new work on your list.' },
                { route: 'dashboard', sel: '.daily-study-card', title: 'Study streak', text: 'Study at least 15 minutes a day to keep your streak going. Your time shows up on the leaderboards.' },
                { route: 'dashboard', sel: '#study-priority-list', title: 'Quizzes & tests', text: 'Add an upcoming quiz or test with the "Add quiz or test" button and StudBud suggests what to study today, how long, and the best way to do it.' },
                { route: 'dashboard', sel: '.focus-sprint-widget', title: 'Focus sprint', text: 'Pick a quiz or test, choose anywhere from 5 to 90 minutes, and start a timer. Finished sprints are logged as study time.' },
                { route: 'gpa', sel: '#add-course-btn', title: 'Classes & grades', text: 'Add your classes, set up grade categories and log assignment scores (decimals like 23.21/25 work). Your GPA updates automatically.' },
                { route: 'grade-scenarios', sel: nav('grade-scenarios'), title: 'What-If Grades', text: 'Try out possible scores, or change an existing grade, to see how your class grade and GPA would change. Nothing here touches your real transcript.' },
                { route: 'planner', sel: nav('planner'), title: 'Planner', text: 'Turns your due dates and study logs into a day-by-day plan.' },
                { route: 'calendar', sel: nav('calendar'), title: 'Calendar', text: 'A month view of everything due. Click a day to add an event.' },
                { route: 'schedule', sel: nav('schedule'), title: 'Class schedule', text: 'Set your daily bell schedule so the dashboard always shows today\'s classes.' },
                { route: 'flashcard', sel: nav('flashcard'), title: 'Flashcards', text: 'Study decks with spaced repetition. Tap a card to flip it as many times as you like, then rate how well you knew it.' },
                { route: 'importer', sel: nav('importer'), title: 'Import or create cards', text: 'Paste a list to import cards in bulk, or switch to manual mode to type them one at a time.' },
                { route: 'analytics', sel: nav('analytics'), title: 'Analytics', text: 'Charts of your grades, study time and habits so you can spot what is working.' },
                { route: 'leaderboard', sel: nav('leaderboard'), title: 'Leaderboards', text: 'Compare daily and weekly study time with other students. Banned accounts and accounts waiting on a username change are hidden.' },
                { route: 'friends', sel: nav('friends'), title: 'Friends', text: 'Send a friend request by username, accept requests from others, and open a friend\'s profile to see their study time, streak and match wins.' },
                { route: 'exam-arcade', sel: nav('exam-arcade'), title: 'Practice & Arcade', text: 'Practice exams and quick arcade games that use your own flashcards.' },
                { route: 'multiplayer', sel: nav('multiplayer'), title: 'Multiplayer', text: 'Host or join a room and play City Escape, Soccer, King of the Hill and more. Every game has its own touch controls on phones, and a live leaderboard that ranks by what wins that game.' },
                { route: 'shop', sel: nav('shop'), title: 'Shop & your character', text: 'Earn coins from games and open mystery boxes for characters, hats, accessories and colors. Equip items to wear them, and press Unequip on a worn item to take it off again.' },
                { route: 'shop', sel: '#multiplayer-profile-button', title: 'Your profile button', text: 'This button in the top bar shows your character and name. Tap it any time to jump to your shop and character.' },
                { route: 'about', sel: nav('about'), title: 'About', text: 'What StudBud is for, how to use it, and who to email with questions or suggestions.' },
                { route: 'settings', sel: '#public-profile-card', title: 'Public profile', text: 'Write a short bio, favorite subject, grade and study goal for your friends to see, and choose whether to share your study stats.' },
                { route: 'settings', sel: nav('settings'), title: 'Settings', text: 'Set your graduation year and target GPA, change your username (once a week), back up or restore your data, and replay this tutorial any time.' },
                { route: 'appearance', sel: '#appearance-view .settings-tabs', title: 'Appearance', text: 'Switch between light and dark, pick a color theme you have unlocked, and turn on compact mode. The sun/moon button in the top bar toggles light and dark quickly.' },
                { route: 'sound', sel: '#sound-view .settings-tabs', title: 'Sound & music', text: 'Adjust the volume of interface sounds, game effects and music separately, or mute everything.' },
                { route: 'dashboard', title: 'You are all set!', text: 'Start by adding a class, then an assignment or quiz. Have fun and happy studying!' }
            ];
        }

        startTutorial() {
            this.endTutorialUI();
            this.tutorialStep = 0;
            const root = document.createElement('div');
            root.id = 'tutorial-root';
            root.innerHTML = '<div class="tutorial-spot" hidden></div><div class="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title"><div class="tutorial-progress"><span class="tutorial-progress-bar"></span></div><small class="tutorial-count"></small><h3 id="tutorial-title"></h3><p class="tutorial-text"></p><div class="tutorial-buttons"><button type="button" class="text-btn" data-tour="skip">Skip</button><span class="tutorial-spacer"></span><button type="button" class="secondary-btn" data-tour="back">Back</button><button type="button" class="primary-btn" data-tour="next">Next</button></div></div>';
            document.body.appendChild(root);
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
            this.tutorialKeys = event => { if (event.key === 'Escape') this.finishTutorial(); };
            this.tutorialResize = () => this.positionTutorialSpot();
            document.addEventListener('keydown', this.tutorialKeys);
            window.addEventListener('resize', this.tutorialResize);
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
            root.querySelector('[data-tour="back"]').hidden = this.tutorialStep === 0;
            root.querySelector('[data-tour="next"]').textContent = this.tutorialStep === steps.length - 1 ? 'Finish' : 'Next';
            root.querySelector('[data-tour="skip"]').hidden = this.tutorialStep === steps.length - 1;
            this.tutorialSel = step.sel || '';
            setTimeout(() => {
                const el = this.tutorialSel && document.querySelector(this.tutorialSel);
                if (el && el.getBoundingClientRect().width) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
                this.positionTutorialSpot();
                setTimeout(() => this.positionTutorialSpot(), 350);
            }, 80);
            root.querySelector('[data-tour="next"]').focus({ preventScroll: true });
        }

        positionTutorialSpot() {
            const spot = document.querySelector('#tutorial-root .tutorial-spot');
            if (!spot) return;
            const el = this.tutorialSel && document.querySelector(this.tutorialSel);
            const rect = el?.getBoundingClientRect();
            if (!rect || !rect.width || !rect.height) { spot.hidden = true; return; }
            spot.hidden = false;
            const pad = 6;
            Object.assign(spot.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
        }

        endTutorialUI() {
            document.getElementById('tutorial-root')?.remove();
            if (this.tutorialKeys) document.removeEventListener('keydown', this.tutorialKeys);
            if (this.tutorialResize) window.removeEventListener('resize', this.tutorialResize);
            this.tutorialKeys = this.tutorialResize = null;
        }

        finishTutorial() {
            this.endTutorialUI();
            AppState.set('settings', { ...AppState.get('settings'), tutorialSeen: true });
            this.syncTutorialUI();
        }

        renderDashboard() {
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
            const priorityList = document.getElementById('study-priority-list');
            this.renderTodayStudyPlan();
            this.renderFocusSprint();
            if (priorityList) {
                const recommendations = this.getStudyRecommendations().slice(0, 5);
                priorityList.innerHTML = recommendations.length ? recommendations.map((item, index) =>
                    `<article class="study-priority-item"><span class="priority-rank">${index + 1}</span><div><strong>${this.escapeHTML(item.title)}</strong><span>${this.escapeHTML(item.courseTitle)} · ${this.escapeHTML(item.kind || 'assignment')} · ${item.sessionMinutes} min today (about ${item.remainingStudyMinutes} min remaining)</span><small>${this.escapeHTML(item.reason)}</small><p><strong>Study method:</strong> ${this.escapeHTML(item.studyMethod)}</p><button class="secondary-btn" data-action="log-study" data-id="${this.escapeHTML(item.id)}"><i class="fas fa-stopwatch"></i> Log study session</button></div></article>`
                ).join('') : '<div class="empty-state empty-state-cta"><p>Add an upcoming quiz or test to get study suggestions.</p><button class="primary-btn" type="button" data-action="add-quiz"><i class="fas fa-plus"></i> Add a quiz or test</button></div>';
            }
            this.renderStudyProgress();
            this.renderDailyStudyHabit();
            this.syncTutorialUI();
        }

        formatStudyDuration(seconds) {
            const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
            const minutes = Math.floor(totalSeconds / 60);
            const remainder = totalSeconds % 60;
            if (!totalSeconds) return '0 min';
            return minutes ? `${minutes} min${remainder ? ` ${remainder} sec` : ''}` : `${remainder} sec`;
        }

        renderDailyStudyHabit() {
            const snapshot = this.studyLeaderboardSnapshot;
            const seconds = Number(snapshot?.today_seconds || 0);
            const goal = Number(snapshot?.daily_goal_seconds || 900);
            const streak = Number(snapshot?.streak_days || 0);
            const time = document.getElementById('daily-study-time');
            const streakNode = document.getElementById('daily-study-streak');
            const progress = document.getElementById('daily-study-progress');
            const note = document.getElementById('daily-study-note');
            const boardTime = document.getElementById('leaderboard-today-time');
            const boardStreak = document.getElementById('leaderboard-streak-display');
            const boardProgress = document.getElementById('leaderboard-study-progress');
            const boardNote = document.getElementById('leaderboard-goal-note');
            if (time) time.textContent = this.formatStudyDuration(seconds);
            if (streakNode) streakNode.textContent = `${streak} day${streak === 1 ? '' : 's'}`;
            if (boardTime) boardTime.textContent = this.formatStudyDuration(seconds);
            if (boardStreak) boardStreak.textContent = `${streak} day streak`;
            if (progress) {
                progress.max = goal;
                progress.value = Math.min(seconds, goal);
                progress.setAttribute('aria-label', `${Math.floor(seconds / 60)} of 15 study minutes completed today`);
            }
            if (boardProgress) {
                boardProgress.max = goal;
                boardProgress.value = Math.min(seconds, goal);
                boardProgress.setAttribute('aria-label', `${Math.floor(seconds / 60)} of 15 study minutes completed today`);
            }
            const goalNote = seconds >= goal
                ? 'Daily goal complete. Come back tomorrow to keep your streak growing.'
                : `${Math.ceil((goal - seconds) / 60)} more minute${Math.ceil((goal - seconds) / 60) === 1 ? '' : 's'} to reach today’s 15-minute goal.`;
            if (note) note.textContent = this.studyLeaderboardError || goalNote;
            if (boardNote) boardNote.textContent = this.studyLeaderboardError || goalNote;
        }

        renderStudyLeaderboard() {
            const list = document.getElementById('study-leaderboard-list');
            if (!list) return;
            const board = this.studyLeaderboardSnapshot?.leaderboard || [];
            const top = Math.max(1, ...board.map(p => Number(p.seconds) || 0));
            const medal = ['🥇', '🥈', '🥉'];
            const row = player => {
                const rank = Number(player.rank) || 0;
                const name = this.escapeHTML(player.username || 'Student');
                const pct = Math.max(3, Math.round((Number(player.seconds) || 0) / top * 100));
                return `<li class="study-leaderboard-row${player.is_me ? ' is-self' : ''}${rank >= 1 && rank <= 3 ? ` podium-${rank}` : ''}">
                    <span class="study-leaderboard-rank">${rank >= 1 && rank <= 3 ? medal[rank - 1] : (rank || '—')}</span>
                    ${this.multiplayerAvatarMarkup(this.profileCosmetics(player), false, 'study-leaderboard-avatar')}
                    <div class="study-leaderboard-main"><strong>${name}${player.is_me ? ' <em class="you-badge">you</em>' : ''}</strong><span class="study-leaderboard-bar"><i style="width:${pct}%"></i></span></div>
                    <span class="study-leaderboard-time">${this.formatStudyDuration(player.seconds)}</span></li>`;
            };
            const podium = board.length >= 3 ? `<li class="study-podium" aria-hidden="true">${[1, 0, 2].map(i => {
                const p = board[i];
                return `<div class="podium-spot podium-spot-${i + 1}"><span class="podium-medal">${medal[i]}</span>${this.multiplayerAvatarMarkup(this.profileCosmetics(p), false, 'study-leaderboard-avatar')}<b>${this.escapeHTML(p.username || 'Student')}</b><small>${this.formatStudyDuration(p.seconds)}</small><div class="podium-block"></div></div>`;
            }).join('')}</li>` : '';
            list.innerHTML = board.length ? podium + board.map(row).join('') : '<li class="empty-state">No study time logged for this period yet. Start a session to be first on the board.</li>';
            const label = document.getElementById('study-leaderboard-period-label');
            if (label) label.textContent = this.studyLeaderboardPeriod === 'weekly' ? 'This week · UTC' : 'Today · UTC';
            document.querySelectorAll('[data-study-leaderboard-period]').forEach(button => {
                const selected = button.dataset.studyLeaderboardPeriod === this.studyLeaderboardPeriod;
                button.classList.toggle('selected', selected);
                button.setAttribute('aria-pressed', String(selected));
            });
        }

        async refreshStudyLeaderboard(period = 'daily') {
            if (!window.StudBudCloud?.user) return;
            this.studyLeaderboardPeriod = period === 'weekly' ? 'weekly' : 'daily';
            const status = document.getElementById('study-leaderboard-status');
            if (status) status.textContent = 'Loading study progress…';
            try {
                this.studyLeaderboardSnapshot = await window.StudBudCommunityGames.getStudyLeaderboard(this.studyLeaderboardPeriod);
                this.studyLeaderboardError = '';
                if (status) status.textContent = 'Study time is recorded from flashcard reviews, solo study games, focus logs, and manual study logs.';
                this.renderStudyLeaderboard();
                this.renderDailyStudyHabit();
            } catch (error) {
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
                session.leaderboardSyncPending = false;
                session.leaderboardSyncedAt = new Date().toISOString();
                await NexusDB.put('studyHistory', session);
                const index = AppState.state.studyHistory.findIndex(item => item.id === session.id);
                if (index >= 0) AppState.state.studyHistory[index] = session;
                AppState.setSaveStatus('Study session synced to your daily goal and leaderboard.');
                if (refreshBoard) await this.refreshStudyLeaderboard(this.studyLeaderboardPeriod || 'daily');
            } catch (error) {
                console.error('[NexusApp] Study time could not sync:', error);
                AppState.setSaveStatus(`Your study session is saved on this device, but its leaderboard time could not sync yet. ${this.friendlyErrorMessage(error)}`, 'error');
            }
        }

        async syncPendingStudyTime() {
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
                window.alert(`Focus sprint finished, but the session could not be logged. ${this.friendlyErrorMessage(error)}`);
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
            const dueCards = (AppState.get('flashcards') || []).flatMap(deck => {
                const count = (deck.cards || []).filter(card => this.isCardDue(card)).length;
                return count ? [{ courseCode: deck.courseCode, title: deck.title, count }] : [];
            });
            dueCards.forEach(deck => {
                const key = deck.courseCode || `review_${deck.title}`;
                const course = (AppState.get('courses') || []).find(item => item.code === deck.courseCode);
                const current = byClass.get(key) || { title: course?.title || `${deck.title} review`, minutes: 0, items: 0 };
                current.minutes += Math.ceil(deck.count / 5) * 5;
                current.items += 1;
                byClass.set(key, current);
            });
            const totalMinutes = Array.from(byClass.values()).reduce((sum, item) => sum + item.minutes, 0);
            const dueCardCount = dueCards.reduce((sum, deck) => sum + deck.count, 0);
            totalElement.textContent = totalMinutes
                ? `Plan for about ${Math.floor(totalMinutes / 60)} hr ${totalMinutes % 60} min today across upcoming quizzes and tests${dueCardCount ? ` and ${dueCardCount} flashcard review${dueCardCount === 1 ? '' : 's'}` : ''}. Estimates use due dates, task size, and your study logs.`
                : 'Nothing to study today. Add an upcoming quiz or test, or some flashcards, to get a study time estimate.';
            classContainer.innerHTML = byClass.size ? Array.from(byClass.values()).map(item =>
                `<article class="study-progress-item"><strong>${this.escapeHTML(item.title)}</strong><span>${item.minutes} min · ${item.items} task${item.items === 1 ? '' : 's'}</span></article>`
            ).join('') : '<div class="empty-state empty-state-cta"><p>Add a quiz or test to create a study plan.</p><button class="primary-btn" type="button" data-action="add-quiz"><i class="fas fa-plus"></i> Add a quiz or test</button></div>';
        }

        setCloudChartControls() {
            const select = document.getElementById('analytics-course-select');
            if (!select) return;
            const selected = select.value || 'all';
            select.innerHTML = '<option value="all">All classes</option>' + (AppState.get('courses') || []).map(course =>
                `<option value="${this.escapeHTML(course.code)}">${this.escapeHTML(course.title)}</option>`
            ).join('');
            if (selected === 'all' || (AppState.get('courses') || []).some(course => course.code === selected)) select.value = selected;
        }

        renderGradeProgress() {
            const canvas = document.getElementById('grade-progress-chart');
            if (!canvas) return;
            const summary = document.getElementById('analytics-summary');
            const courseControl = document.getElementById('analytics-course-control');
            const emptyMessage = document.getElementById('grade-progress-empty');
            if (!window.Chart) {
                document.getElementById('grade-progress-caption').textContent = 'Charts could not load. Check your internet connection and reload.';
                return;
            }
            const courses = AppState.get('courses') || [];
            const assignments = AppState.get('assignments') || [];
            const metric = document.getElementById('analytics-metric-select')?.value || 'class';
            const selectedCode = document.getElementById('analytics-course-select')?.value || 'all';
            const chartType = document.getElementById('analytics-chart-type')?.value || 'line';
            const caption = document.getElementById('grade-progress-caption');
            const title = document.getElementById('grade-progress-title');
            const range = document.getElementById('grade-progress-range');
            if (courseControl) courseControl.classList.toggle('hidden', metric !== 'class');
            const datedAssignments = assignments.filter(item =>
                (this.isGradedItem(item)) && (item.gradedAt || item.dueDate)
            );
            const dateFor = item => {
                const value = String(item.gradedAt || item.dueDate);
                return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateKey(new Date(value));
            };
            const labels = Array.from(new Set(datedAssignments.map(dateFor))).sort();
            let datasets;

            if (metric === 'class') {
                const visibleCourses = courses.filter(course => selectedCode === 'all' || course.code === selectedCode);
                datasets = visibleCourses.map((course, index) => ({
                    label: course.title,
                    data: labels.map(date => {
                        const scored = datedAssignments.filter(item => item.courseCode === course.code && dateFor(item) <= date);
                        const grade = this.calculateCourseGrade(course, scored);
                        return Number.isFinite(grade) ? Number(grade.toFixed(2)) : null;
                    }),
                    borderColor: `hsl(${(index * 67 + 145) % 360} 62% 55%)`,
                    backgroundColor: `hsla(${(index * 67 + 145) % 360} 62% 55% / 0.18)`,
                    tension: 0.25,
                    fill: chartType === 'area',
                    pointRadius: 3,
                    pointHoverRadius: 5,
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
                    grade: this.calculateCourseGrade(course)
                })).filter(item => Number.isFinite(item.grade));
                const scoredCount = assignments.filter(item =>
                    (this.isGradedItem(item)) &&
                    (!selectedCourse || item.courseCode === selectedCourse.code)
                ).length;
                if (summary) summary.innerHTML = `
                    <article><span>${selectedCourse ? 'Current class grade' : 'Classes with grades'}</span><strong>${selectedCourse ? (currentGrades[0] ? `${currentGrades[0].grade.toFixed(2)}%` : '—') : `${currentGrades.length} / ${courses.length}`}</strong></article>
                    <article><span>Scored assignments</span><strong>${scoredCount}</strong></article>
                    <article><span>Grade target</span><strong>${selectedCourse?.targetPct ? `${Number(selectedCourse.targetPct).toFixed(2)}%` : 'Optional'}</strong></article>`;
            } else {
                datasets = [{
                    label: metric === 'weighted' ? 'Weighted GPA' : 'Unweighted GPA',
                    data: labels.map(date => {
                        const coursesAtDate = courses.map(course => {
                            const scored = datedAssignments.filter(item => item.courseCode === course.code && dateFor(item) <= date);
                            const grade = this.calculateCourseGrade(course, scored);
                            return Number.isFinite(grade) ? { ...course, targetGrade: this.gradeForPercentage(grade) } : null;
                        }).filter(Boolean);
                        return Number(window.GPACalculator.calculateCurrentGPA(coursesAtDate)[metric]);
                    }),
                    borderColor: '#55c995',
                    backgroundColor: 'rgba(85, 201, 149, 0.2)',
                    tension: 0.25,
                    fill: chartType === 'area',
                    pointRadius: 3,
                    pointHoverRadius: 5
                }];
                const currentGpa = this.calculateTrackedGPA(courses);
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
            if (emptyMessage) emptyMessage.classList.toggle('hidden', hasHistory);
            if (range) range.textContent = labels.length ? `${new Date(`${labels[0]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} – ${new Date(`${labels[labels.length - 1]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : '';
            if (this.gradeProgressChart) this.gradeProgressChart.destroy();
            this.gradeProgressChart = new window.Chart(canvas, {
                type: chartType === 'area' ? 'line' : chartType,
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { intersect: false, mode: 'index' },
                    plugins: {
                        legend: { display: metric !== 'class' || selectedCode === 'all' && datasets.length > 1, position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: context => `${context.dataset.label}: ${metric === 'class' ? `${Number(context.parsed.y).toFixed(2)}%` : Number(context.parsed.y).toFixed(2)}`
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { maxTicksLimit: 8, maxRotation: 0 } },
                        y: {
                            beginAtZero: false,
                            min: metric === 'class' ? 0 : 0,
                            max: metric === 'class' ? 100 : 5,
                            title: { display: true, text: metric === 'class' ? 'Grade (%)' : 'GPA (0–5)' },
                            ticks: { callback: value => metric === 'class' ? `${value}%` : Number(value).toFixed(1) }
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

        async handleClick(event) {
            if (!event.target.closest('#course-modal')) this.hideCourseSuggestions();
            if (event.target.closest('#current-flashcard')) {
                this.revealCard();
                return;
            }
            const target = event.target.closest('button, .nav-item[data-target]');
            if (!target) return;

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
                if (target.matches('.multiplayer-mode[data-mode]')) {
                    this.selectedMultiplayerMode = target.dataset.mode;
                    document.getElementById('host-game-mode').value = this.selectedMultiplayerMode;
                    this.updateMultiplayerModeSetup(this.selectedMultiplayerMode);
                    document.querySelectorAll('.multiplayer-mode').forEach(button =>
                        button.classList.toggle('selected', button === target)
                    );
                } else if (target.matches('[data-multiplayer-tab]')) {
                    this.setMultiplayerScreen(target.dataset.multiplayerTab);
                } else if (id === 'waiting-practice-btn') {
                    this.startPractice();
                } else if (target.matches('[data-study-leaderboard-period]')) {
                    this.studyLeaderboardPeriod = target.dataset.studyLeaderboardPeriod;
                    await this.refreshStudyLeaderboard(this.studyLeaderboardPeriod);
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
                } else if (action === 'multiplayer-buy' || action === 'multiplayer-equip') {
                    await this.updateMultiplayerShop(action, target.dataset.id);
                } else if (action === 'multiplayer-unequip') {
                    await this.updateMultiplayerShop(action, target.dataset.slot);
                } else if (action === 'multiplayer-mystery') {
                    await this.updateMultiplayerShop(action, target.dataset.id || 'basic');
                } else if (target.matches('[data-shop-tab]')) {
                    this.shopTab = target.dataset.shopTab;
                    if (this.multiplayerProfile) this.renderMultiplayerShop(this.multiplayerProfile);
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
                    ['success', 'jump', 'shoot', 'coin'].forEach((name, i) => setTimeout(() => window.StudBudSfx.play(name, 'ui', 0), i * 260));
                } else if (id === 'music-preview-btn') {
                    const sfx = window.StudBudSfx;
                    clearTimeout(this.musicPreviewTimer);
                    if (sfx.mus) { sfx.stopMusic(); } else {
                        sfx.startMusic(sfx.settings.musicStyle === 'auto' ? 'summit' : sfx.settings.musicStyle, true);
                        this.musicPreviewTimer = setTimeout(() => sfx.stopMusic(), 12000);
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
                        window.alert('Enter a name for this grade scenario.');
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
                        await this.updateMultiplayerShop('multiplayer-equip', shopItem);
                    }
                    AppState.set('settings', { ...AppState.get('settings'), colorScheme: scheme });
                    this.applyAppearance();
                } else if (action === 'add-quiz') {
                    this.openAssignmentForm(null, '', '', '', 'quiz');
                } else if (action === 'friend-accept' || action === 'friend-decline' || action === 'friend-remove') {
                    await this.friendAction(action, target.dataset.id, target.dataset.name);
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
                    const title = window.prompt('Name your new flashcard deck:');
                    if (title && title.trim()) await AppState.saveFlashcardDeck({ id: `deck_${Date.now()}`, title: title.trim(), cards: [] });
                } else if (id === 'open-target-gpa-btn') {
                    this.openModal('target-gpa-modal');
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
                    this.openAssignmentForm(null, '', this.selectedCalendarDate);
                } else if (id === 'reveal-card-btn') {
                    this.revealCard();
                } else if (target.matches('.sm2-btn[data-q]')) {
                    await this.rateCurrentCard(Number(target.dataset.q));
                } else if (id === 'save-profile-btn') {
                    this.saveProfile();
                } else if (id === 'open-backup-modal-btn') {
                    this.openModal('backup-modal');
                } else if (id === 'export-json-btn') {
                    await this.exportBackup();
                } else if (id === 'import-json-btn') {
                    await this.importBackup();
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
                    this.answerArcade(Number(target.dataset.index));
                } else if (action === 'arcade-next') {
                    this.renderArcadeQuestion();
                } else if (action === 'arcade-restart') {
                    if (document.getElementById('arcade-game-title').textContent.includes('Memory')) {
                        this.prepareMemoryGame();
                        return;
                    }
                    if (document.getElementById('arcade-game-title').textContent.includes('Practice Test')) {
                        this.showPracticeTestSetup();
                        return;
                    }
                    this.arcadeQuestionIndex = 0;
                    this.arcadeScore = 0;
                    this.arcadeStreak = 0;
                    this.arcadeTimeLeft = 60;
                    this.arcadeLives = 3;
                    this.renderArcadeQuestion();
                } else if (action === 'memory-pick') {
                    this.pickMemoryCard(Number(target.dataset.index));
                } else if (target.matches('.close-modal-btn, .cancel-modal-btn')) {
                    this.closeModal();
                } else if (action) {
                    await this.handleDataAction(action, target.dataset.id);
                }
            } catch (error) {
                console.error('[NexusApp] Button action failed:', error);
                window.alert(`That action could not be completed. ${this.friendlyErrorMessage(error)}`);
            }
        }

        handleKeydown(event) {
            if (Router.activeRoute === 'multiplayer' && event.code === 'Space'
                && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)
                && !document.getElementById('waiting-arcade-card').classList.contains('hidden')) {
                event.preventDefault();
                if (!this.waitingRunner.running) this.startWaitingRunner();
                return;
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
            if (studyArea && !studyArea.classList.contains('hidden') && !event.target.closest('input, textarea, select, button') && !this.studyKeyBusy) {
                const revealed = !document.getElementById('sm2-controls').classList.contains('hidden');
                if (event.key === ' ' || (event.key === 'Enter' && !revealed)) {
                    event.preventDefault();
                    this.revealCard();
                    return;
                }
                const quality = { 1: 1, 2: 3, 3: 4, 4: 5 }[event.key];
                if (revealed && quality) {
                    event.preventDefault();
                    this.studyKeyBusy = true;
                    this.rateCurrentCard(quality).catch(error => console.error('[NexusApp] Card rating failed:', error)).finally(() => { this.studyKeyBusy = false; });
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
            if (form.id === 'community-deck-search-form') {
                event.preventDefault();
                await this.searchCommunityDecks(document.getElementById('community-deck-query').value);
                return;
            }
            if (form.id === 'host-game-form' || form.id === 'join-game-form') {
                event.preventDefault();
                const message = document.getElementById('hosted-game-message');
                message.textContent = 'Connecting to the game room…';
                try {
                    if (form.id === 'host-game-form') await this.hostGame(form);
                    else await this.joinGame(form);
                } catch (error) {
                    console.error(`[NexusApp] ${form.id} failed:`, error);
                    const action = form.id === 'host-game-form' ? 'create the room' : 'join the room';
                    message.textContent = `Could not ${action}. ${this.friendlyErrorMessage(error, 'Check your connection and try again.')}`;
                }
                return;
            }
            if (form.id === 'practice-test-config-form') {
                event.preventDefault();
                try {
                    this.beginPracticeTest(form);
                } catch (error) {
                    console.error('[NexusApp] Practice test could not start:', error);
                    window.alert(`The practice test could not start. ${this.friendlyErrorMessage(error)}`);
                }
                return;
            }
            if (form.id === 'practice-test-answer-form') {
                event.preventDefault();
                try {
                    this.submitPracticeTestAnswer(form);
                } catch (error) {
                    console.error('[NexusApp] Practice test answer could not be checked:', error);
                    window.alert(`Your answer could not be checked. ${this.friendlyErrorMessage(error)}`);
                }
                return;
            }
            if (!['course-form', 'assignment-form', 'card-form', 'schedule-form', 'study-log-form', 'grade-scenario-assignment-form'].includes(form.id)) return;
            event.preventDefault();
            try {
                if (form.id === 'course-form') await this.saveCourse();
                if (form.id === 'assignment-form') this.saveAssignment();
                if (form.id === 'card-form') await this.saveCard();
                if (form.id === 'schedule-form') this.saveSchedule();
                if (form.id === 'study-log-form') await this.saveStudyLog();
                if (form.id === 'grade-scenario-assignment-form') this.addGradeScenarioAssignment(form);
                this.closeModal();
            } catch (error) {
                console.error(`[NexusApp] ${form.id} submit failed:`, error);
                window.alert(`Could not save your changes. ${this.friendlyErrorMessage(error)}`);
            }
        }

        handleChange(event) {
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
                window.StudBudSfx.update({ [event.target.id === 'sfx-ui' ? 'ui' : 'game']: event.target.checked });
            } else if (event.target.id === 'music-on') {
                window.StudBudSfx.update({ music: event.target.checked });
                if (!event.target.checked) window.StudBudSfx.stopMusic();
            } else if (event.target.id === 'music-style') {
                window.StudBudSfx.update({ musicStyle: event.target.value });
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
            const selectedCatalogCourse = course && (window.PCHS_COURSE_CATALOG || []).find(item => item.code === (course.catalogCode || course.code));
            search.value = selectedCatalogCourse ? `${selectedCatalogCourse.title} (${selectedCatalogCourse.code})` : '';
            document.getElementById('course-name').value = selectedCatalogCourse?.code || '';
            document.getElementById('course-selection-hint').textContent = selectedCatalogCourse ? 'PCHS catalog course selected.' : 'Choose a PCHS course from the matches.';
            this.hideCourseSuggestions();
            document.getElementById('course-subject-category').value = course ? course.category || 'Electives' : 'Electives';
            document.getElementById('course-term').value = course ? (course.term || 'FY') : 'FY';
            document.getElementById('course-credits').value = course ? course.credits : '0.5';
            document.getElementById('course-target-grade').value = course && course.targetPct !== null && course.targetPct !== undefined && Number.isFinite(Number(course.targetPct)) ? course.targetPct : '';
            if (course) this.populateCourseFromCatalog();
            else document.getElementById('course-weight-label').textContent = 'Select a catalog course';
            this.openModal('course-modal');
        }

        filterCourseCatalog(query) {
            const list = document.getElementById('course-suggestions');
            if (!list) return;
            const normalized = String(query || '').trim().toLowerCase();
            const catalog = window.PCHS_COURSE_CATALOG || [];
            if (!normalized) {
                this.hideCourseSuggestions();
                return;
            }
            const matches = catalog.filter(course => !course.legacy &&
                `${course.code} ${course.title} ${course.category}`.toLowerCase().includes(normalized)
            ).slice(0, 12);
            this.courseSuggestionIndex = -1;
            list.innerHTML = matches.length ? matches.map(course =>
                `<button type="button" id="course-option-${this.escapeHTML(course.code)}" role="option" aria-selected="false" class="course-suggestion" data-action="select-course" data-id="${this.escapeHTML(course.code)}"><strong>${this.escapeHTML(course.title)}</strong><span>${this.escapeHTML(course.code)} · ${this.escapeHTML(course.category)}</span></button>`
            ).join('') : '<p class="course-suggestion-empty">No matching PCHS courses.</p>';
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
            const course = (window.PCHS_COURSE_CATALOG || []).find(item => item.code === courseCode);
            if (!course) throw new Error('That course is not in the PCHS catalog.');
            document.getElementById('course-name').value = course.code;
            document.getElementById('course-search').value = `${course.title} (${course.code})`;
            document.getElementById('course-selection-hint').textContent = 'PCHS catalog course selected.';
            this.hideCourseSuggestions();
            this.populateCourseFromCatalog();
        }

        populateCourseFromCatalog() {
            const courseCode = document.getElementById('course-name').value;
            const catalogCourse = (window.PCHS_COURSE_CATALOG || []).find(course => course.code === courseCode);
            if (!catalogCourse) return;
            const categoryMap = {
                'Visual Arts': 'Fine Arts',
                'Fine Arts': 'Fine Arts',
                Business: 'Practical Arts',
                CS: 'Practical Arts',
                CTE: 'Practical Arts',
                'Practical Arts': 'Practical Arts'
            };
            const category = categoryMap[catalogCourse.category] || catalogCourse.category;
            const categorySelect = document.getElementById('course-subject-category');
            if (Array.from(categorySelect.options).some(option => option.value === category)) categorySelect.value = category;
            document.getElementById('course-credits').value = catalogCourse.credits;
            const weightedScale = (window.PCHS_GRADE_SCALE || []).map(item =>
                `${item.letter} ${catalogCourse.isWeighted ? item.weighted : item.unweighted.toFixed(1)}`
            ).join(' · ');
            document.getElementById('course-weight-label').textContent =
                `${catalogCourse.isWeighted ? 'Weighted' : 'Regular'} · ${weightedScale}`;
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
            document.getElementById('assignment-modal-title').textContent = assignment ? 'Edit Assignment' : 'Add Assignment';
            document.getElementById('assignment-name').value = assignment ? assignment.title : '';
            document.getElementById('assignment-course').value = assignment ? assignment.courseCode : courseCode;
            document.getElementById('assignment-due-date').value = assignment ? assignment.dueDate || '' : (dueDate || '');
            document.getElementById('assignment-points').value = assignment ? assignment.pointsEarned ?? 0 : 0;
            document.getElementById('assignment-max-points').value = assignment ? assignment.maxPoints ?? 100 : 100;
            document.getElementById('assignment-kind').value = assignment ? assignment.kind || 'assignment' : (kind || 'assignment');
            document.getElementById('assignment-size').value = assignment ? assignment.estimatedMinutes || 30 : 30;
            document.getElementById('assignment-importance').value = assignment ? assignment.importance || 3 : 3;
            form.querySelector(`input[name="assignment-state"][value="${graded ? 'graded' : 'todo'}"]`).checked = true;
            // A class chosen from a category button is already known, so hide the picker
            document.getElementById('assignment-course-group').classList.toggle('hidden', !assignment && Boolean(courseCode));
            document.getElementById('save-add-another-assignment-btn').classList.toggle('hidden', Boolean(assignment));
            this.updateAssignmentCategories(assignment ? assignment.categoryId : categoryId);
            this.syncAssignmentForm();
            this.openModal('assignment-modal');
            setTimeout(() => document.getElementById('assignment-name').focus(), 50);
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
                (course?.categories || []).map(category => `<option value="${this.escapeHTML(category.id)}">${this.escapeHTML(category.name)} (${Number(category.weight || 0)}%)</option>`).join('');
            if ((course?.categories || []).some(category => category.id === selected)) select.value = selected;
        }

        gradeForPercentage(percentage) {
            const scale = window.PCHS_GRADE_SCALE || [];
            const grade = scale.find(item => percentage >= item.minPct && percentage <= item.maxPct);
            return grade ? grade.letter : (percentage >= 90 ? 'A-' : percentage >= 80 ? 'B-' : percentage >= 70 ? 'C-' : percentage >= 60 ? 'D-' : 'F');
        }

        async saveCourse() {
            const oldCode = document.getElementById('course-id').value;
            const catalogCode = document.getElementById('course-name').value;
            const catalogCourse = (window.PCHS_COURSE_CATALOG || []).find(item => item.code === catalogCode);
            if (!catalogCourse) throw new Error('Select a course from the PCHS catalog.');
            const term = document.getElementById('course-term').value;
            const existingCourse = (AppState.get('courses') || []).find(item => item.code === oldCode);
            const sameCatalogAlreadyUsed = (AppState.get('courses') || []).some(item =>
                item.code !== oldCode && (item.catalogCode || item.code) === catalogCode
            );
            const code = oldCode || (sameCatalogAlreadyUsed ? `${catalogCode}_${term}_${Date.now()}` : catalogCode);
            const targetValue = document.getElementById('course-target-grade').value;
            const course = {
                code,
                catalogCode,
                title: catalogCourse.title,
                term,
                credits: Number(catalogCourse.credits),
                category: document.getElementById('course-subject-category').value,
                isWeighted: Boolean(catalogCourse.isWeighted),
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
            const graded = document.querySelector('input[name="assignment-state"]:checked')?.value === 'graded';
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
                status: graded ? 'completed' : (current?.status === 'completed' && !this.isGradedItem(current) ? 'completed' : 'pending'),
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
            const deck = (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!deck) throw new Error('The selected deck no longer exists.');
            deck.cards = deck.cards || [];
            deck.cards.push({
                id: `card_${Date.now()}`,
                front: document.getElementById('card-front').value.trim(),
                back: document.getElementById('card-back').value.trim(),
                tags: document.getElementById('card-tags').value.split(',').map(tag => tag.trim()).filter(Boolean),
                repetitions: 0,
                interval: 0,
                easeFactor: 2.5
            });
            await AppState.saveFlashcardDeck(deck);
        }

        async handleDataAction(action, id) {
            const courses = AppState.get('courses') || [];
            const assignments = AppState.get('assignments') || [];
            if (action === 'open-class') {
                Router.selectedClassCode = id;
                Router.navigate('class');
            }
            if (action === 'edit-course') this.openCourseForm(courses.find(item => item.code === id));
            if (action === 'delete-course' && window.confirm('Delete this class and its assignments?')) {
                AppState.removeCourse(id);
                this.renderUI();
            }
            if (action === 'edit-assignment') this.openAssignmentForm(assignments.find(item => item.id === id));
            if (action === 'delete-assignment') AppState.deleteAssignment(id);
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
                    window.alert('Enter a category name and a weight from 0.1% to 100%.');
                    return;
                }
                const existingTotal = (course.categories || []).reduce((sum, category) => sum + Number(category.weight || 0), 0);
                if (existingTotal + weight > 100.001) {
                    window.alert(`Category weights cannot exceed 100%. There is ${(100 - existingTotal).toFixed(1)}% available.`);
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
                const targetPct = Number(input.value);
                if (!course || !Number.isFinite(targetPct) || targetPct < 0 || targetPct > 100) {
                    window.alert('Enter a target between 0 and 100%.');
                    return;
                }
                AppState.updateCourse(course.code, { targetPct, targetGrade: this.gradeForPercentage(targetPct) });
                this.renderClassDetail();
            }
            if (action === 'delete-deck' && window.confirm('Delete this flashcard deck and its cards?')) {
                const deck = (AppState.get('flashcards') || []).find(item => item.id === id);
                if (deck?.communityPublished) await window.StudBudCommunityGames.unpublishDeck(id);
                await AppState.deleteFlashcardDeck(id);
            }
            if (action === 'add-card') {
                document.getElementById('card-form').reset();
                document.getElementById('card-deck-id').value = id;
                document.getElementById('card-id').value = '';
                this.openModal('card-studio-modal');
            }
            if (action === 'study-deck') this.startStudy(id, false);
        }

        startStudy(deckId, dueOnly) {
            const deck = (AppState.get('flashcards') || []).find(item => item.id === deckId);
            if (!deck) throw new Error('The selected deck no longer exists.');
            this.activeDeckId = deckId;
            const now = Date.now();
            const cards = deck.cards || [];
            let due = cards.filter(card => this.isCardDue(card, now));
            this.cramMode = false;
            if (!due.length) {
                if (!cards.length) {
                    window.alert('This deck has no cards yet.');
                    return;
                }
                if (dueOnly || !window.confirm('Nothing is due in this deck. Cram all cards anyway? (This will not change your review schedule.)')) return;
                due = cards.slice();
                this.cramMode = true;
            }
            // Learning/relearning cards first, then the oldest due cards, then new cards, capped like Anki's daily limit
            const rank = card => !card.lastReviewed ? 2 : Number(card.interval || 0) === 0 ? 0 : 1;
            this.studyCards = due.sort((a, b) => rank(a) - rank(b) || (new Date(a.nextReviewDate || 0) - new Date(b.nextReviewDate || 0)) || Math.random() - 0.5);
            if (!this.cramMode) this.studyCards = this.studyCards.slice(0, 100);
            this.studyTotal = this.studyCards.length;
            this.activeCardIndex = 0;
            this.activeStudyStartedAt = Date.now();
            document.getElementById('active-study-area').classList.remove('hidden');
            this.renderStudyCard();
        }

        renderStudyCard() {
            const card = this.studyCards[this.activeCardIndex];
            if (!card) return this.closeStudy();
            document.getElementById('study-deck-title').textContent =
                (AppState.get('flashcards') || []).find(deck => deck.id === this.activeDeckId)?.title || 'Flashcards';
            const remaining = this.studyCards.length - this.activeCardIndex;
            document.getElementById('study-progress').textContent = `${remaining} left${this.cramMode ? ' · cram mode' : ''}`;
            const cardEl = document.getElementById('current-flashcard');
            const backEl = document.getElementById('card-back-content');
            document.getElementById('card-front-content').textContent = card.front || '';
            const wasFlipped = cardEl.classList.contains('is-flipped');
            cardEl.classList.remove('is-flipped');
            // Hold the new back text until the card has flipped away so the answer never flashes
            clearTimeout(this.cardBackTimer);
            if (wasFlipped) this.cardBackTimer = setTimeout(() => { backEl.textContent = card.back || ''; }, 350);
            else backEl.textContent = card.back || '';
            document.getElementById('reveal-card-btn').classList.remove('hidden');
            document.getElementById('sm2-controls').classList.add('hidden');
        }

        formatReviewInterval(card, quality) {
            const result = window.SM2Engine.evaluate(card, quality, { fuzz: false });
            const ms = new Date(result.nextReviewDate).getTime() - Date.now();
            if (ms < 3600000) return `${Math.max(1, Math.round(ms / 60000))} min`;
            if (ms < 86400000) return `${Math.round(ms / 3600000)} hr`;
            const d = Math.round(ms / 86400000);
            return d === 1 ? '1 day' : d < 30 ? `${d} days` : d < 365 ? `${Math.round(d / 30)} mo` : `${(d / 365).toFixed(1)} yr`;
        }

        revealCard() {
            const card = this.studyCards[this.activeCardIndex];
            if (!card) return;
            const cardEl = document.getElementById('current-flashcard');
            // After the first reveal the rating buttons stay visible and the card can be flipped back and forth
            if (!document.getElementById('sm2-controls').classList.contains('hidden')) {
                cardEl.classList.toggle('is-flipped');
                return;
            }
            clearTimeout(this.cardBackTimer);
            document.getElementById('card-back-content').textContent = card.back || '';
            cardEl.classList.add('is-flipped');
            document.getElementById('reveal-card-btn').classList.add('hidden');
            document.getElementById('sm2-controls').classList.remove('hidden');
            if (card && window.SM2Engine) {
                document.querySelectorAll('#sm2-controls .sm2-btn').forEach(button => {
                    const label = button.querySelector('small');
                    if (label) label.textContent = this.formatReviewInterval(card, Number(button.dataset.q));
                });
            }
        }

        async rateCurrentCard(quality) {
            const deck = (AppState.get('flashcards') || []).find(item => item.id === this.activeDeckId);
            if (!deck) throw new Error('The selected deck no longer exists.');
            const card = this.studyCards[this.activeCardIndex];
            if (!window.SM2Engine) throw new Error('The spaced-repetition scheduler did not load.');
            if (!this.cramMode) Object.assign(card, window.SM2Engine.evaluate(card, quality));
            // Cards still in a learning step (due within minutes) come back before the session ends
            const soon = !this.cramMode && new Date(card.nextReviewDate).getTime() - Date.now() < 3600000;
            if (this.cramMode ? quality < 3 : soon) this.studyCards.push(card);
            deck.studiedAt = deck.studiedAt || new Date().toISOString();
            deck.studiedCount = Number(deck.studiedCount || 0) + 1;
            await AppState.saveFlashcardDeck(deck);
            if (deck.communitySourceId && deck.communitySourceOwnerId !== window.StudBudCloud.user.id && !deck.communityStudyRecorded) {
                try {
                    await window.StudBudCommunityGames.recordDeckStudy(deck.communitySourceId);
                    deck.communityStudyRecorded = true;
                    await AppState.saveFlashcardDeck(deck);
                } catch (error) {
                    console.error('[NexusApp] Community study count could not sync:', error);
                    AppState.setSaveStatus(`Card progress saved, but the community study count could not sync. ${this.friendlyErrorMessage(error)}`, 'error');
                }
            }
            this.activeCardIndex += 1;
            if (this.activeCardIndex < this.studyCards.length) this.renderStudyCard();
            else this.closeStudy();
        }

        closeStudy() {
            this.stopFocusTimer();
            document.getElementById('active-study-area').classList.add('hidden');
            const startedAt = this.activeStudyStartedAt;
            this.activeStudyStartedAt = null;
            if (startedAt) {
                const durationSec = Math.min(21600, Math.floor((Date.now() - startedAt) / 1000));
                if (durationSec > 0) {
                    AppState.recordStudySession({
                        id: `flashcards_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        title: 'Flashcard study',
                        durationSec,
                        method: 'flashcards',
                        methodLabel: 'Flashcards / spaced review',
                        source: 'flashcards'
                    }).catch(error => {
                        console.error('[NexusApp] Flashcard study time could not be saved:', error);
                        AppState.setSaveStatus(`Flashcard progress is saved, but study time could not be recorded. ${this.friendlyErrorMessage(error)}`, 'error');
                    });
                }
            }
            this.activeDeckId = null;
            this.studyCards = [];
            this.renderDashboard();
        }

        solveTargetGPA() {
            const target = Number(document.getElementById('desired-gpa').value);
            const mode = document.getElementById('gpa-solver-mode').value;
            if (!Number.isFinite(target) || target < 0 || target > 5) {
                window.alert('Enter a target GPA between 0 and 5.');
                return;
            }
            const gpa = window.GPACalculator.calculateCurrentGPA(AppState.get('courses') || []);
            const credits = Number(gpa.totalCredits);
            if (credits <= 0) {
                document.getElementById('solver-output-percentage').textContent = 'Add courses first';
                document.getElementById('solver-results').classList.remove('hidden');
                return;
            }
            const currentGpa = Number(mode === 'weighted' ? gpa.weighted : gpa.unweighted);
            const required = window.GPACalculator.solveTargetGPA(target, currentGpa, 14, credits);
            const requiredGpa = required ? Number(required.requiredGpa) : target;
            document.getElementById('solver-output-percentage').textContent =
                requiredGpa > 5 ? `${requiredGpa.toFixed(2)} GPA needed (not possible)` : `${requiredGpa.toFixed(2)} GPA needed`;
            document.getElementById('solver-results').classList.remove('hidden');
        }

        saveProfile() {
            const targetGpa = Number(document.getElementById('settings-target-gpa').value);
            const graduationYear = Number(document.getElementById('settings-grad-year').value);
            if (!Number.isFinite(targetGpa) || targetGpa < 0 || targetGpa > 5) {
                throw new Error('Target GPA must be between 0 and 5.');
            }
            if (!Number.isInteger(graduationYear) || graduationYear < 2026 || graduationYear > 2030) {
                throw new Error('Graduation year must be between 2026 and 2030.');
            }
            const profile = {
                ...AppState.get('profile'),
                graduationYear,
                targetGpa,
                currentTerm: document.getElementById('settings-current-term').value
            };
            AppState.set('profile', profile);
            this.renderProfile();
            window.alert('Profile saved.');
        }

        async exportBackup() {
            const content = await AppState.exportAppState();
            const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'studbud-backup.json';
            link.click();
            URL.revokeObjectURL(url);
        }

        async importBackup() {
            const content = document.getElementById('import-json-textarea').value.trim();
            if (!content) {
                window.alert('Paste a backup JSON file before restoring.');
                return;
            }
            if (!window.confirm('This replaces the current app data. Continue?')) return;
            await AppState.importAppState(content);
            this.closeModal();
            window.alert('Backup restored.');
        }

        async factoryReset() {
            if (!window.confirm('Permanently delete all locally stored StudBud data?')) return;
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
            if (!title) { window.alert('Enter a deck name first.'); nameInput.focus(); return; }
            if (partial) { window.alert(`${partial} card${partial === 1 ? ' is' : 's are'} missing a front or back (highlighted). Fill ${partial === 1 ? 'it' : 'them'} in or remove ${partial === 1 ? 'it' : 'them'}.`); return; }
            if (!cards.length) { window.alert('Add at least one card with both a front and a back.'); return; }
            AppState.saveFlashcardDeck({ id: `deck_${Date.now()}`, title, cards }).then(() => {
                nameInput.value = '';
                document.getElementById('manual-card-rows').innerHTML = '';
                for (let i = 0; i < 3; i++) this.addManualCardRow(false);
                Router.navigate('flashcard');
            }).catch(error => {
                console.error('[NexusApp] Manual deck creation failed:', error);
                window.alert(`The deck could not be created. ${this.friendlyErrorMessage(error)}`);
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
                window.alert('Enter a deck name and at least one valid term/definition row.');
                return;
            }
            AppState.saveFlashcardDeck({ id: `deck_${Date.now()}`, title, cards }).then(() => {
                Router.navigate('flashcard');
                document.getElementById('import-deck-name').value = '';
                document.getElementById('flashcard-import-data').value = '';
            }).catch(error => {
                console.error('[NexusApp] Flashcard import failed:', error);
                window.alert(`The flashcards could not be imported. ${this.friendlyErrorMessage(error)}`);
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
                    window.alert('Focus session complete.');
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
            // Spaced-repetition ordering: due and struggling cards come first, mastered cards last
            const priority = card => (this.isCardDue(card, now) ? 0 : 10) + Math.min(5, Number(card.lapses || 0)) - (card.lastReviewed ? 0 : 1);
            this.arcadeCards = Array.from(this.arcadeCardDeck.keys())
                .filter(card => card.front && card.back)
                .map(card => ({ card, key: priority(card) + Math.random() * 2 }))
                .sort((a, b) => a.key - b.key)
                .map(item => item.card);
            if (this.arcadeCards.length > 40) this.arcadeCards = this.arcadeCards.slice(0, 40);
            if (this.arcadeCards.length < 2) {
                window.alert('Create a flashcard deck with at least two complete cards to play.');
                return;
            }
            this.arcadeStudyStartedAt = Date.now();
            this.arcadeStudyRecorded = false;
            this.arcadeQuestionIndex = 0;
            this.arcadeScore = 0;
            this.arcadeStreak = 0;
            this.arcadeMode = game;
            this.arcadeLives = 3;
            this.arcadeTimeLeft = 60;
            if (this.arcadeTimer) clearInterval(this.arcadeTimer);
            const menu = document.querySelector('.arcade-menu');
            const container = document.getElementById('arcade-canvas-container');
            if (menu) menu.classList.add('hidden');
            if (container) container.classList.remove('hidden');
            document.getElementById('arcade-game-title').textContent = `${title} - Practice Round`;
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
                    <button class="primary-btn" type="submit"><i class="fas fa-play"></i> Start practice test</button>
                </form>`;
        }

        beginPracticeTest(form) {
            const data = new FormData(form);
            const deck = (AppState.get('flashcards') || []).find(item => item.id === data.get('deckId'));
            if (!deck) throw new Error('Choose an available flashcard deck.');
            const availableCards = (deck.cards || []).filter(card => card.front && card.back);
            if (availableCards.length < 2) throw new Error('Choose a deck with at least two complete cards.');
            const count = name => Math.max(0, Math.min(50, Math.floor(Number(data.get(name)) || 0)));
            const counts = { 'multiple-choice': count('mcCount'), matching: count('matchCount'), written: count('typeCount') };
            if (!counts['multiple-choice'] && !counts.matching && !counts.written) throw new Error('Enter how many questions of at least one type you want.');
            const shuffle = list => [...list].sort(() => Math.random() - 0.5);
            let pool = shuffle(availableCards);
            const draw = () => { if (!pool.length) pool = shuffle(availableCards); return pool.pop(); };
            const items = [];
            for (let i = 0; i < counts['multiple-choice']; i++) items.push({ type: 'multiple-choice', cards: [draw()] });
            for (let i = 0; i < counts.written; i++) items.push({ type: 'written', cards: [draw()] });
            for (let i = 0; i < counts.matching; i++) {
                const group = shuffle(availableCards).slice(0, Math.min(4, availableCards.length));
                items.push({ type: 'matching', cards: group });
            }
            const ordered = shuffle(items);
            this.practiceTestCards = ordered.map(item => item.cards[0]);
            this.practiceTestGroups = ordered.map(item => item.cards);
            this.practiceTestQuestionTypes = ordered.map(item => item.type);
            this.practiceTestAnswers = [];
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
            progress.textContent = `Question ${index + 1} of ${this.practiceTestCards.length} · ${this.arcadeScore} correct`;
            const question = document.createElement('h4');
            question.textContent = card.front;
            const form = document.createElement('form');
            form.id = 'practice-test-answer-form';
            form.dataset.questionType = questionType;
            if (questionType === 'multiple-choice') {
                const choices = [card, ...this.practiceTestCards.filter(item => item !== card)
                    .sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
                const options = document.createElement('div');
                options.className = 'arcade-answer-options';
                choices.forEach((option, choiceIndex) => {
                    const label = document.createElement('label');
                    label.className = 'practice-test-choice';
                    label.innerHTML = `<input type="radio" name="answer" value="${choiceIndex}" required><span></span>`;
                    label.querySelector('span').textContent = option.back;
                    label.dataset.correct = String(option === card);
                    options.append(label);
                });
                form.dataset.correctAnswer = String(choices.findIndex(option => option === card));
                form.append(options);
            } else if (questionType === 'matching') {
                const group = this.practiceTestGroups[index];
                const definitions = [...group].sort(() => Math.random() - 0.5);
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
                label.htmlFor = 'practice-test-written-answer';
                label.textContent = 'Your answer';
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
            submit.textContent = 'Check answer';
            form.append(submit);
            content.append(progress, question, form);
            if (questionType === 'written') document.getElementById('practice-test-written-answer').focus();
        }

        submitPracticeTestAnswer(form) {
            const card = this.practiceTestCards[this.arcadeQuestionIndex];
            if (!card) return;
            const data = new FormData(form);
            let correct;
            let givenAnswer;
            let recorded = card;
            if (form.dataset.questionType === 'matching') {
                const group = this.practiceTestGroups[this.arcadeQuestionIndex];
                const order = JSON.parse(form.dataset.defOrder || '[]');
                const picks = group.map((_, i) => order[Number(data.get(`match${i}`))]);
                if (picks.some(pick => pick === undefined)) throw new Error('Pick a definition for every term.');
                correct = picks.every((pick, i) => pick === i);
                givenAnswer = group.map((item, i) => `${item.front} → ${group[picks[i]].back}`).join('; ');
                recorded = { front: `Matching: ${group.map(item => item.front).join(', ')}`, back: group.map(item => `${item.front} → ${item.back}`).join('; ') };
            } else if (form.dataset.questionType === 'multiple-choice') {
                const selected = data.get('answer');
                if (selected === null) throw new Error('Choose an answer first.');
                correct = selected === form.dataset.correctAnswer;
                givenAnswer = form.querySelector(`input[value="${CSS.escape(selected)}"]`)?.closest('label').querySelector('span')?.textContent || '';
            } else {
                givenAnswer = String(data.get('answer') || '').trim();
                if (!givenAnswer) throw new Error('Enter a written answer first.');
                const normalize = value => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
                correct = normalize(givenAnswer) === normalize(card.back);
            }
            if (correct) this.arcadeScore += 1;
            this.practiceTestAnswers.push({ card: recorded, givenAnswer, correct });

            const feedback = document.createElement('p');
            feedback.className = `practice-test-feedback ${correct ? 'is-correct' : 'is-incorrect'}`;
            feedback.textContent = correct ? 'Correct!' : `Not quite. Correct answer: ${recorded.back}`;
            const next = document.createElement('button');
            next.className = 'primary-btn';
            next.textContent = this.arcadeQuestionIndex + 1 === this.practiceTestCards.length ? 'See results' : 'Next question';
            next.addEventListener('click', () => {
                this.arcadeQuestionIndex += 1;
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
                review.append(row);
            });
        }

        prepareMemoryGame() {
            if (this.memoryMismatchTimeout) clearTimeout(this.memoryMismatchTimeout);
            const selectedCards = this.arcadeCards.slice(0, 8);
            this.memoryCards = selectedCards.flatMap((card, index) => [
                { pair: index, label: card.front },
                { pair: index, label: card.back }
            ]).sort(() => Math.random() - 0.5);
            this.memoryRevealed = [];
            this.memoryMatched = new Set();
            this.memoryLock = false;
            this.arcadeScore = 0;
            this.renderMemoryGame();
        }

        renderMemoryGame() {
            const content = document.getElementById('arcade-game-content');
            if (!content) return;
            if (this.memoryMatched.size === this.memoryCards.length / 2) {
                this.finishArcadeStudySession();
                content.innerHTML = '';
                const result = document.createElement('p');
                result.textContent = `Tower cleared! You matched all ${this.arcadeScore} pairs.`;
                const replay = document.createElement('button');
                replay.className = 'primary-btn';
                replay.dataset.action = 'arcade-restart';
                replay.textContent = 'Play Again';
                content.append(result, replay);
                return;
            }
            content.innerHTML = '';
            const progress = document.createElement('p');
            progress.textContent = `Matched ${this.arcadeScore} of ${this.memoryCards.length / 2} pairs`;
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
            if (this.memoryCards[firstIndex].pair === this.memoryCards[secondIndex].pair) {
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

        renderArcadeQuestion() {
            const content = document.getElementById('arcade-game-content');
            if (!content) return;
            if (this.arcadeQuestionIndex >= this.arcadeCards.length || (this.arcadeMode === 'survival' && this.arcadeLives <= 0)) {
                this.finishArcadeStudySession();
                content.innerHTML = '';
                const result = document.createElement('p');
                result.textContent = this.arcadeMode === 'survival' && this.arcadeLives <= 0
                    ? `Game over! You got ${this.arcadeScore} of ${this.arcadeCards.length} correct.`
                    : `Round complete: ${this.arcadeScore} of ${this.arcadeCards.length} correct.`;
                const replay = document.createElement('button');
                replay.className = 'primary-btn';
                replay.dataset.action = 'arcade-restart';
                replay.textContent = 'Play Again';
                content.append(result, replay);
                return;
            }

            const card = this.arcadeCards[this.arcadeQuestionIndex];
            content.innerHTML = '';

            const progress = document.createElement('p');
            const mode = document.getElementById('arcade-game-title').textContent;
            progress.textContent = `Question ${this.arcadeQuestionIndex + 1} of ${this.arcadeCards.length} · Score: ${this.arcadeScore}${this.arcadeMode === 'streak' ? ` · Streak: ${this.arcadeStreak}` : ''}${this.arcadeMode === 'survival' ? ` · Lives: ${'♥'.repeat(this.arcadeLives)}${'♡'.repeat(3 - this.arcadeLives)}` : ''}`;
            if (mode.includes('Lightning')) {
                const timerLabel = document.createElement('span');
                timerLabel.id = 'arcade-time-left';
                timerLabel.textContent = ` · ${this.arcadeTimeLeft}s`;
                progress.append(timerLabel);
            }
            const question = document.createElement('h4');
            question.textContent = card.front;
            const choicesContainer = document.createElement('div');
            choicesContainer.className = 'arcade-answer-options';
            if (this.arcadeMode === 'truefalse') {
                const isTrue = Math.random() < 0.5;
                const distractor = this.arcadeCards.find(item => item !== card);
                this.arcadeCurrentIsTrue = isTrue;
                this.arcadeOptions = [true, false];
                const statement = document.createElement('p');
                statement.className = 'true-false-statement';
                statement.textContent = isTrue ? card.back : distractor.back;
                this.arcadeOptions.forEach((value, index) => {
                    const button = document.createElement('button');
                    button.className = 'secondary-btn';
                    button.dataset.action = 'arcade-answer';
                    button.dataset.index = String(index);
                    button.textContent = value ? 'True' : 'False';
                    choicesContainer.append(button);
                });
                const feedback = document.createElement('p');
                feedback.id = 'arcade-feedback';
                content.append(progress, question, statement, choicesContainer, feedback);
                return;
            }
            const choices = [card];
            const distractors = this.arcadeCards.filter(item => item !== card)
                .sort(() => Math.random() - 0.5)
                .slice(0, 3);
            this.arcadeOptions = [...choices, ...distractors].sort(() => Math.random() - 0.5);
            this.arcadeOptions.forEach((option, index) => {
                const button = document.createElement('button');
                button.className = 'secondary-btn';
                button.dataset.action = 'arcade-answer';
                button.dataset.index = String(index);
                button.textContent = option.back;
                choicesContainer.append(button);
            });
            const feedback = document.createElement('p');
            feedback.id = 'arcade-feedback';
            content.append(progress, question, choicesContainer, feedback);
        }

        updateCardSchedule(card, correct) {
            const deck = this.arcadeCardDeck && this.arcadeCardDeck.get(card);
            if (!deck || !window.SM2Engine || !card) return;
            // Multiple choice is easier than free recall: only due cards earn credit, a miss always counts
            if (correct && !this.isCardDue(card)) return;
            Object.assign(card, window.SM2Engine.evaluate(card, correct ? 4 : 1));
            AppState.saveFlashcardDeck(deck).catch(error => console.error('[NexusApp] Card progress could not be saved:', error));
        }

        answerArcade(index) {
            const correctCard = this.arcadeCards[this.arcadeQuestionIndex];
            const correct = this.arcadeMode === 'truefalse'
                ? this.arcadeOptions[index] === this.arcadeCurrentIsTrue
                : this.arcadeOptions[index] === correctCard;
            if (correct) this.arcadeScore += 1;
            this.updateCardSchedule(correctCard, correct);
            this.arcadeStreak = correct ? this.arcadeStreak + 1 : 0;
            if (this.arcadeMode === 'survival' && !correct) this.arcadeLives -= 1;
            document.querySelectorAll('#arcade-game-content [data-action="arcade-answer"]').forEach(button => {
                button.disabled = true;
                const answer = this.arcadeOptions[Number(button.dataset.index)];
                if (this.arcadeMode === 'truefalse' ? answer === this.arcadeCurrentIsTrue : answer === correctCard) button.classList.add('correct');
            });
            const feedback = document.getElementById('arcade-feedback');
            if (feedback) feedback.textContent = correct ? 'Correct!' : `Not quite. ${correctCard.back}`;
            const next = document.createElement('button');
            next.className = 'primary-btn';
            next.dataset.action = 'arcade-next';
            next.textContent = this.arcadeQuestionIndex + 1 === this.arcadeCards.length
                || (this.arcadeMode === 'survival' && this.arcadeLives <= 0)
                ? 'See Results' : 'Next Question';
            document.getElementById('arcade-game-content').append(next);
            this.arcadeQuestionIndex += 1;
        }

        async awardSoloCoins() {
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
