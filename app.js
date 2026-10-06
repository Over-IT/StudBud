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
    }

    const AppState = new AppStateEngine();

    // ============================================================================
    // 4. ROUTER ENGINE
    // ============================================================================
    class RouterEngine {
        constructor() {
            this.routes = [
                "dashboard", "gpa", "grade-scenarios", "planner", "calendar", "schedule", "flashcard",
                "analytics", "exam-arcade", "importer", "settings", "appearance"
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
                const active = item.dataset.target === viewId;
                item.classList.toggle('active', active);
                if (active) item.setAttribute('aria-current', 'page');
                else item.removeAttribute('aria-current');
            });

            const activeItem = document.querySelector(`.nav-item[data-target="${viewId}"]`);
            const title = activeItem && activeItem.querySelector('span');
            const titleElement = document.getElementById('active-view-title');
            if (title && titleElement) titleElement.textContent = title.textContent.trim();
            else if (route === 'class' && titleElement) {
                const course = (AppState.get('courses') || []).find(item => item.code === this.selectedClassCode);
                titleElement.textContent = course ? course.title : 'Class';
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
        }

        async init() {
            await AppState.init();
            if (window.StudBudCloud.initialSnapshot) {
                await AppState.importAppState(window.StudBudCloud.initialSnapshot);
            }
            this.bindUI();
            this.renderUI();
            Router.init();

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

        escapeHTML(value) {
            return String(value ?? '').replace(/[&<>"']/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]);
        }

        bindUI() {
            document.addEventListener('click', event => this.handleClick(event));
            document.addEventListener('keydown', event => this.handleKeydown(event));
            document.addEventListener('submit', event => this.handleSubmit(event));
            document.addEventListener('change', event => this.handleChange(event));
            document.addEventListener('input', event => {
                if (event.target.matches('#assignment-search')) this.renderAssignments();
                if (event.target.matches('#course-search')) {
                    document.getElementById('course-name').value = '';
                    document.getElementById('course-selection-hint').textContent = 'Choose a PCHS course from the matches.';
                    this.filterCourseCatalog(event.target.value);
                }
                if (event.target.matches('input[type="range"][id^="vol-"]')) this.setMixerLevel(event.target, false);
            });
            window.addEventListener('resize', () => this.updateSidebarToggle());
            document.getElementById('modal-container').addEventListener('click', event => {
                if (event.target.id === 'modal-container') this.closeModal();
            });

            this.EventBus.on('courses:updated', () => this.renderUI());
            this.EventBus.on('assignments:updated', () => this.renderUI());
            this.EventBus.on('flashcards:updated', () => {
                this.renderDecks();
                this.renderDashboard();
            });
            this.EventBus.on('study:recorded', () => this.renderDashboard());
            this.EventBus.on('state:restored', () => this.renderUI());
            this.EventBus.on('router:navigated', route => {
                if (route === 'class') this.renderClassDetail();
                if (route === 'calendar') this.renderCalendar();
                if (route === 'schedule') this.renderSchedulePage();
                if (route === 'grade-scenarios') this.renderGradeScenarios();
                if (route === 'analytics') this.renderGradeProgress();
                if (!['class', 'flashcard'].includes(route)) this.stopFocusTimer();
            });
        }

        renderUI() {
            this.renderCourses();
            this.renderAssignments();
            this.renderDecks();
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
            const assignments = AppState.get('assignments') || [];
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
                    <strong>${Number(item.pointsEarned)} / ${Number(item.maxPoints)} (${(Number(item.pointsEarned) / Number(item.maxPoints) * 100).toFixed(1)}%)</strong>
                    <button class="icon-btn scenario-remove-btn" data-action="remove-scenario-item" data-id="${this.escapeHTML(item.id)}" aria-label="Remove ${this.escapeHTML(item.title)} from scenario" title="Remove"><i class="fas fa-xmark"></i></button>
                </article>`;
            }).join('') : '<p class="empty-state">Add hypothetical assignment scores to see their effect.</p>';

            resultContainer.innerHTML = courses.length ? courses.map(course => {
                const currentGrade = this.calculateCourseGrade(course, assignments);
                const projectedGrade = this.calculateScenarioCourseGrade(course, assignments, hypotheticalAssignments);
                const change = Number.isFinite(projectedGrade) && Number.isFinite(currentGrade) ? projectedGrade - currentGrade : 0;
                return `<article class="scenario-grade-row">
                    <strong>${this.escapeHTML(course.title)}</strong>
                    <span>${Number.isFinite(currentGrade) ? `${currentGrade.toFixed(1)}%` : 'Not graded'} <i class="fas fa-arrow-right" aria-hidden="true"></i> <strong>${Number.isFinite(projectedGrade) ? `${projectedGrade.toFixed(1)}%` : 'Not graded'}</strong></span>
                    <small class="${change > 0.005 ? 'grade-change-positive' : change < -0.005 ? 'grade-change-negative' : ''}">${Number.isFinite(projectedGrade) && Number.isFinite(currentGrade) ? `${change > 0.005 ? '+' : ''}${change.toFixed(1)} percentage points` : 'Add hypothetical scores to project this class'}</small>
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
                        const graded = group.assignments.filter(item => item.status === 'completed' || Number(item.pointsEarned) > 0);
                        const pointsEarned = graded.reduce((sum, item) => sum + Number(item.pointsEarned || 0), 0);
                        const pointsPossible = graded.reduce((sum, item) => sum + Number(item.maxPoints || 0), 0);
                        const categoryGrade = pointsPossible > 0 ? `${(pointsEarned / pointsPossible * 100).toFixed(1)}%` : '—';
                        const assignmentMarkup = group.assignments.length ? group.assignments.map(item => {
                            const hasScore = item.pointsEarned !== undefined && item.pointsEarned !== null && item.maxPoints;
                            return `<article class="transcript-assignment ${item.status === 'completed' ? 'is-complete' : ''}">
                                <span class="assignment-status-dot" aria-hidden="true"></span>
                                <div class="transcript-assignment-main">
                                    <strong>${this.escapeHTML(item.title)}</strong>
                                    <span>${this.escapeHTML(item.kind || 'Assignment')} · Due ${this.escapeHTML(item.dueDate || 'No due date')} · ${Number(item.estimatedMinutes || 30)} min planned</span>
                                </div>
                                <strong class="transcript-assignment-score">${hasScore ? `${Number(item.pointsEarned || 0)} / ${Number(item.maxPoints || 0)}` : 'Not graded'}</strong>
                                <div class="transcript-assignment-actions">
                                    <button class="secondary-btn" data-action="toggle-assignment" data-id="${this.escapeHTML(item.id)}">${item.status === 'completed' ? 'Reopen' : 'Complete'}</button>
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
                            <div class="transcript-assignment-list">${assignmentMarkup}</div>
                        </details>`;
                    }).join('');
                    return `<article class="transcript-class">
                        <details class="transcript-class-details" data-transcript-class="${this.escapeHTML(course.code)}">
                            <summary class="transcript-class-summary">
                                <span class="transcript-chevron" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>
                                <span class="transcript-class-name"><strong>${this.escapeHTML(course.title)}</strong><small>${this.escapeHTML(this.termLabel(course.term))} · ${course.isWeighted ? 'Weighted' : 'Regular'} · ${Number(course.credits || 0).toFixed(1)} credits</small></span>
                                <span class="transcript-grade"><strong>${this.escapeHTML(gradeLetter)}</strong><small>${currentGrade === null ? 'No graded work' : `${currentGrade.toFixed(1)}%`}</small></span>
                                <span class="transcript-class-target"><small>Target</small><strong>${course.targetPct !== null && course.targetPct !== undefined && Number.isFinite(Number(course.targetPct)) ? `${Number(course.targetPct).toFixed(1)}%` : '—'}</strong></span>
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
                        <p>Current grade <strong>${grade === null ? 'Not graded' : `${grade.toFixed(1)}%`}</strong> · Goal <strong>${Number.isFinite(target) ? `${target.toFixed(1)}%` : 'Not set'}</strong></p>
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
                (item.status === 'completed' || Number(item.pointsEarned) > 0)
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
                const earned = items.reduce((sum, item) => sum + Number(item.pointsEarned || 0), 0);
                const possible = items.reduce((sum, item) => sum + Number(item.maxPoints || 0), 0);
                const categoryGrade = possible > 0 ? `${(earned / possible * 100).toFixed(1)}%` : 'No graded work';
                return `<div class="category-row">
                    <div><strong>${this.escapeHTML(category.name)}</strong><span>${categoryGrade} · ${items.length} items</span></div>
                    <strong>${Number(category.weight || 0).toFixed(1)}%</strong>
                    <button class="danger-btn" data-action="remove-category" data-id="${this.escapeHTML(category.id)}" aria-label="Remove ${this.escapeHTML(category.name)}">Remove</button>
                </div>`;
            }).join('');
            const workRows = assignments.length ? assignments.map(item => `
                <tr>
                    <td><button class="secondary-btn" data-action="toggle-assignment" data-id="${this.escapeHTML(item.id)}">${item.status === 'completed' ? 'Done' : 'Open'}</button></td>
                    <td>${this.escapeHTML(item.title)}</td>
                    <td>${this.escapeHTML((categories.find(category => category.id === item.categoryId) || {}).name || 'Uncategorized')}</td>
                    <td>${this.escapeHTML(item.kind || 'assignment')}</td>
                    <td>${this.escapeHTML(item.dueDate || 'No date')}</td>
                    <td>${item.pointsEarned ?? 0} / ${item.maxPoints ?? 100}</td>
                    <td class="actions">
                        <button class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">Edit</button>
                        <button class="danger-btn" data-action="delete-assignment" data-id="${this.escapeHTML(item.id)}">Delete</button>
                    </td>
                </tr>`).join('') : '<tr><td colspan="7" class="empty-state">No assignments yet. Add homework, quizzes, or tests to track this class.</td></tr>';

            container.innerHTML = `
                <div class="class-detail-summary glass-card">
                    <div><span class="class-term">${this.escapeHTML(this.termLabel(course.term))}</span><h2>${this.escapeHTML(course.title)}</h2><p>Current grade uses scored work and your category weights.</p></div>
                    <div class="class-grade-metrics"><div><span>${grade === null ? '—' : `${grade.toFixed(1)}%`}</span><small>Current</small></div><div><span>${Number.isFinite(target) ? `${target.toFixed(1)}%` : '—'}</span><small>Optional target</small></div></div>
                </div>
                <div class="class-detail-grid">
                    <section class="glass-card">
                        <h3>Grade targets</h3>
                        <label for="class-target-percent">Target grade (%)</label>
                        <div class="inline-form"><input id="class-target-percent" type="number" min="0" max="100" step="0.1" value="${target}"><button class="primary-btn" data-action="save-class-target">Save target</button></div>
                        <p>${grade >= target ? 'You are currently meeting this class target.' : `You are ${(target - grade).toFixed(1)} points below your target.`}</p>
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
                <section class="glass-card"><h3>Study guidance</h3><div class="study-guidance-list">${this.getStudyRecommendations().filter(item => item.courseCode === course.code).slice(0, 4).map(item => `<p><strong>${this.escapeHTML(item.title)}</strong> — ${item.sessionMinutes} min today (about ${item.totalStudyMinutes} min total). ${this.escapeHTML(item.reason)} <strong>Method:</strong> ${this.escapeHTML(item.studyMethod)}</p>`).join('') || '<p>You are on track for this class. Keep up with spaced review.</p>'}</div></section>`;
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

        renderSchedulePage() {
            const container = document.getElementById('schedule-course-list');
            if (!container) return;
            const courses = AppState.get('courses') || [];
            const schedule = AppState.get('schedule') || { all: {}, odd: {}, even: {} };
            if (!courses.length) {
                container.innerHTML = '<p class="empty-state">Add a class before assigning it to a period.</p>';
                return;
            }
            const patterns = [
                ['all', 'All day'],
                ['odd', 'Odd day'],
                ['even', 'Even day']
            ];
            const periodOptions = '<option value="">Not scheduled</option>' +
                Array.from({ length: 7 }, (_, index) => `<option value="${index + 1}">Period ${index + 1}</option>`).join('');
            container.innerHTML = `
                <div class="schedule-pattern-headings"><span>Class</span>${patterns.map(([, label]) => `<span>${label}</span>`).join('')}</div>
                ${courses.map(course => `<div class="schedule-course-row">
                    <strong>${this.escapeHTML(course.title)}</strong>
                    ${patterns.map(([pattern, label]) => `<label class="schedule-period-select"><select aria-label="${this.escapeHTML(course.title)} period on ${this.escapeHTML(label)}" data-schedule-pattern="${pattern}" data-course="${this.escapeHTML(course.code)}">${periodOptions}</select></label>`).join('')}
                </div>`).join('')}`;
            patterns.forEach(([pattern]) => {
                container.querySelectorAll(`select[data-schedule-pattern="${pattern}"]`).forEach(select => {
                    const courseCode = select.dataset.course;
                    const assignedPeriod = Object.entries(schedule[pattern] || {}).find(([, code]) => code === courseCode)?.[0];
                    if (assignedPeriod) select.value = assignedPeriod;
                });
            });
        }

        saveSchedule() {
            const schedule = { all: {}, odd: {}, even: {} };
            document.querySelectorAll('#schedule-course-list select[data-schedule-pattern]').forEach(select => {
                if (select.value) schedule[select.dataset.schedulePattern][select.value] = select.dataset.course;
            });
            AppState.set('schedule', schedule);
            this.renderDashboard();
            this.renderCalendar();
            window.alert('Class schedule saved.');
        }

        getScheduleEntries(date) {
            const pchsSchedule = this.getSchoolSchedule(date);
            const pattern = this.getSchedulePattern(pchsSchedule);
            const periodMap = (AppState.get('schedule') || {})[pattern] || {};
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
                return `<article class="calendar-event"><div><strong>${this.escapeHTML(item.title)}</strong><span>${this.escapeHTML(course ? course.title : 'No class')} · ${this.escapeHTML(item.kind || 'assignment')}</span><small>Study today: ${recommendation?.sessionMinutes || Number(item.estimatedMinutes || 30)} min · ${this.escapeHTML(recommendation?.studyMethod || 'Break the work into focused steps.')}</small></div><button class="secondary-btn" data-action="edit-assignment" data-id="${this.escapeHTML(item.id)}">Edit</button></article>`;
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
            const recommended = assignments.filter(item => item.status !== 'completed').map(item => {
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
                if (gradeGap > 0) reason += ` ${gradeGap.toFixed(1)} points below your ${target.toFixed(1)}% class target.`;
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
                    return `<tr>
                        <td><button class="secondary-btn" data-action="toggle-assignment" data-id="${this.escapeHTML(item.id)}">${status === 'completed' ? 'Done' : 'Pending'}</button></td>
                        <td>${this.escapeHTML(item.title)}</td>
                        <td>${this.escapeHTML(course ? course.title : item.courseCode || 'Unassigned')}</td>
                        <td>${this.escapeHTML(item.dueDate || 'No due date')}</td>
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
                    <p>${(deck.cards || []).length} cards</p>
                    <div class="actions">
                        <button class="primary-btn" data-action="study-deck" data-id="${this.escapeHTML(deck.id)}">Study</button>
                        <button class="secondary-btn" data-action="add-card" data-id="${this.escapeHTML(deck.id)}">Add Card</button>
                        <button class="danger-btn" data-action="delete-deck" data-id="${this.escapeHTML(deck.id)}">Delete</button>
                    </div>
                </article>
            `).join('') : '<div class="empty-state glass-card full-width">No decks available. Create one or import from Quizlet.</div>';
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
            const colorScheme = ['forest', 'ocean', 'violet', 'sunset', 'monochrome'].includes(settings.colorScheme) ? settings.colorScheme : 'forest';
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
            const dueCount = document.getElementById('cards-due-count');
            if (dueCount) {
                const dueCards = (AppState.get('flashcards') || []).flatMap(deck => deck.cards || [])
                    .filter(card => this.isCardDue(card));
                dueCount.textContent = String(dueCards.length);
            }
            this.renderDailySchedule(new Date());
            const priorityList = document.getElementById('study-priority-list');
            this.renderTodayStudyPlan();
            this.renderFocusSprint();
            if (priorityList) {
                const recommendations = this.getStudyRecommendations().slice(0, 5);
                priorityList.innerHTML = recommendations.length ? recommendations.map((item, index) =>
                    `<article class="study-priority-item"><span class="priority-rank">${index + 1}</span><div><strong>${this.escapeHTML(item.title)}</strong><span>${this.escapeHTML(item.courseTitle)} · ${this.escapeHTML(item.kind || 'assignment')} · ${item.sessionMinutes} min today (about ${item.remainingStudyMinutes} min remaining)</span><small>${this.escapeHTML(item.reason)}</small><p><strong>Study method:</strong> ${this.escapeHTML(item.studyMethod)}</p><button class="secondary-btn" data-action="log-study" data-id="${this.escapeHTML(item.id)}"><i class="fas fa-stopwatch"></i> Log study session</button></div></article>`
                ).join('') : '<p class="empty-state">Add classes and upcoming work to get personalized study suggestions.</p>';
            }
            this.renderStudyProgress();
        }

        renderFocusSprint() {
            const select = document.getElementById('focus-assignment');
            if (!select) return;
            const recommendations = this.getStudyRecommendations().slice(0, 12);
            const currentId = this.dashboardSprintAssignmentId || select.value;
            select.innerHTML = '<option value="">Choose an assignment</option>' + recommendations.map(item =>
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
            if (!recommendations.length) status.textContent = 'Add an upcoming assignment to start a focused study session.';
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
                window.alert(`Focus sprint finished, but the session could not be logged: ${error.message}`);
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
                ? `Plan for about ${Math.floor(totalMinutes / 60)} hr ${totalMinutes % 60} min today across assignments${dueCardCount ? ` and ${dueCardCount} flashcard review${dueCardCount === 1 ? '' : 's'}` : ''}. Estimates use due dates, task size, and your study logs.`
                : 'No upcoming assignment or flashcard review blocks today. Add due dates and study cards to get a personalized time estimate.';
            classContainer.innerHTML = byClass.size ? Array.from(byClass.values()).map(item =>
                `<article class="study-progress-item"><strong>${this.escapeHTML(item.title)}</strong><span>${item.minutes} min · ${item.items} task${item.items === 1 ? '' : 's'}</span></article>`
            ).join('') : '<p class="empty-state">Add classes and assignments to create a daily plan.</p>';
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
                (item.status === 'completed' || Number(item.pointsEarned) > 0) && (item.gradedAt || item.dueDate)
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
                    (item.status === 'completed' || Number(item.pointsEarned) > 0) &&
                    (!selectedCourse || item.courseCode === selectedCourse.code)
                ).length;
                if (summary) summary.innerHTML = `
                    <article><span>${selectedCourse ? 'Current class grade' : 'Classes with grades'}</span><strong>${selectedCourse ? (currentGrades[0] ? `${currentGrades[0].grade.toFixed(1)}%` : '—') : `${currentGrades.length} / ${courses.length}`}</strong></article>
                    <article><span>Scored assignments</span><strong>${scoredCount}</strong></article>
                    <article><span>Grade target</span><strong>${selectedCourse?.targetPct ? `${Number(selectedCourse.targetPct).toFixed(1)}%` : 'Optional'}</strong></article>`;
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
                    <article><span>Scored assignments</span><strong>${assignments.filter(item => item.status === 'completed' || Number(item.pointsEarned) > 0).length}</strong></article>`;
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
                                label: context => `${context.dataset.label}: ${metric === 'class' ? `${Number(context.parsed.y).toFixed(1)}%` : Number(context.parsed.y).toFixed(2)}`
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
            const target = event.target.closest('button, .nav-item[data-target]');
            if (!target) return;

            if (target.matches('[data-target]')) {
                event.preventDefault();
                Router.navigate(target.dataset.target.replace(/-view$/, ''));
                return;
            }

            const id = target.id;
            const action = target.dataset.action;
            try {
                if (action === 'select-course') {
                    this.selectCatalogCourse(target.dataset.id);
                } else if (id === 'focus-sprint-start-btn') {
                    this.toggleFocusSprint();
                } else if (id === 'focus-sprint-reset-btn') {
                    this.resetFocusSprint();
                } else if (id === 'focus-assignment') {
                    this.dashboardSprintAssignmentId = target.value;
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
                    AppState.set('settings', { ...AppState.get('settings'), colorScheme: target.dataset.colorScheme });
                    this.applyAppearance();
                } else if (action === 'log-study') {
                    this.openStudyLog(target.dataset.id);
                } else if (id === 'quick-add-task-btn') {
                    this.openAssignmentForm();
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
                } else if (id === 'start-daily-review-btn') {
                    const deck = (AppState.get('flashcards') || []).find(item =>
                        (item.cards || []).some(card => this.isCardDue(card))
                    );
                    if (deck) this.startStudy(deck.id, true);
                    else window.alert('Create or import a flashcard deck to start a review.');
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
                } else if (id === 'process-import-btn') {
                    this.processQuizletImport();
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
                window.alert(`Action failed: ${error.message}`);
            }
        }

        handleKeydown(event) {
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
            if (form.id === 'practice-test-config-form') {
                event.preventDefault();
                this.beginPracticeTest(form);
                return;
            }
            if (form.id === 'practice-test-answer-form') {
                event.preventDefault();
                this.submitPracticeTestAnswer(form);
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
                window.alert(`Could not save: ${error.message}`);
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
            if (event.target.id === 'ui-theme-select') {
                AppState.set('settings', { ...AppState.get('settings'), theme: event.target.value });
                this.applyAppearance();
            } else if (event.target.id === 'ui-compact-mode') {
                AppState.set('settings', { ...AppState.get('settings'), compactUi: event.target.checked });
                this.applyAppearance();
            }
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
            const matches = catalog.filter(course =>
                `${course.code} ${course.title} ${course.category}`.toLowerCase().includes(normalized)
            ).slice(0, 8);
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

        openAssignmentForm(assignment, courseCode = '', dueDate = '') {
            const form = document.getElementById('assignment-form');
            form.reset();
            document.getElementById('assignment-id').value = assignment ? assignment.id : '';
            document.getElementById('assignment-modal-title').textContent = assignment ? 'Edit Assignment' : 'Add Assignment';
            document.getElementById('assignment-name').value = assignment ? assignment.title : '';
            document.getElementById('assignment-course').value = assignment ? assignment.courseCode : courseCode;
            document.getElementById('assignment-due-date').value = assignment ? assignment.dueDate : (dueDate || '');
            document.getElementById('assignment-points').value = assignment ? assignment.pointsEarned ?? 0 : 0;
            document.getElementById('assignment-max-points').value = assignment ? assignment.maxPoints ?? 100 : 100;
            document.getElementById('assignment-kind').value = assignment ? assignment.kind || 'assignment' : 'assignment';
            document.getElementById('assignment-size').value = assignment ? assignment.estimatedMinutes || 30 : 30;
            document.getElementById('assignment-importance').value = assignment ? assignment.importance || 3 : 3;
            this.updateAssignmentCategories(assignment ? assignment.categoryId : '');
            this.openModal('assignment-modal');
        }

        updateAssignmentCategories(selectedId = null) {
            const courseCode = document.getElementById('assignment-course').value;
            const course = (AppState.get('courses') || []).find(item => item.code === courseCode);
            const select = document.getElementById('assignment-category');
            if (!select) return;
            const selected = selectedId ?? select.value;
            select.innerHTML = '<option value="">No category / unweighted average</option>' +
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
            const pointsEarned = Number(document.getElementById('assignment-points').value) || 0;
            const assignment = {
                id,
                title: document.getElementById('assignment-name').value.trim(),
                courseCode: document.getElementById('assignment-course').value,
                dueDate: document.getElementById('assignment-due-date').value,
                pointsEarned,
                maxPoints: Number(document.getElementById('assignment-max-points').value) || 100,
                categoryId: document.getElementById('assignment-category').value || null,
                kind: document.getElementById('assignment-kind').value,
                estimatedMinutes: Number(document.getElementById('assignment-size').value) || 30,
                importance: Number(document.getElementById('assignment-importance').value) || 3,
                priority: current ? current.priority : 'high',
                status: current ? current.status : 'pending',
                gradedAt: pointsEarned > 0 ? (current?.gradedAt || localDateKey(new Date())) : current?.gradedAt || null
            };
            if (current) AppState.updateAssignment(id, assignment);
            else AppState.addAssignment(assignment);
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
                        gradedAt: status === 'completed' ? (assignment.gradedAt || localDateKey(new Date())) : assignment.gradedAt
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
            if (action === 'delete-deck' && window.confirm('Delete this flashcard deck and its cards?')) await AppState.deleteFlashcardDeck(id);
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
            this.studyCards = (deck.cards || []).filter(card => !dueOnly || this.isCardDue(card, now));
            if (!this.studyCards.length) {
                window.alert('There are no cards due for review in this deck.');
                return;
            }
            this.activeCardIndex = 0;
            document.getElementById('active-study-area').classList.remove('hidden');
            this.renderStudyCard();
        }

        renderStudyCard() {
            const card = this.studyCards[this.activeCardIndex];
            if (!card) return this.closeStudy();
            document.getElementById('study-deck-title').textContent =
                (AppState.get('flashcards') || []).find(deck => deck.id === this.activeDeckId)?.title || 'Flashcards';
            document.getElementById('study-progress').textContent = `Card ${this.activeCardIndex + 1} / ${this.studyCards.length}`;
            document.getElementById('card-front-content').textContent = card.front || '';
            document.getElementById('card-back-content').textContent = card.back || '';
            document.getElementById('current-flashcard').classList.remove('flipped');
            document.getElementById('card-back-content').classList.add('hidden');
            document.getElementById('card-front-content').classList.remove('hidden');
            document.getElementById('reveal-card-btn').classList.remove('hidden');
            document.getElementById('sm2-controls').classList.add('hidden');
        }

        revealCard() {
            document.getElementById('card-front-content').classList.add('hidden');
            document.getElementById('card-back-content').classList.remove('hidden');
            document.getElementById('reveal-card-btn').classList.add('hidden');
            document.getElementById('sm2-controls').classList.remove('hidden');
        }

        async rateCurrentCard(quality) {
            const deck = (AppState.get('flashcards') || []).find(item => item.id === this.activeDeckId);
            if (!deck) throw new Error('The selected deck no longer exists.');
            const card = this.studyCards[this.activeCardIndex];
            if (!window.SM2Engine) throw new Error('The spaced-repetition scheduler did not load.');
            Object.assign(card, window.SM2Engine.evaluate(card, quality));
            await AppState.saveFlashcardDeck(deck);
            this.activeCardIndex += 1;
            if (this.activeCardIndex < this.studyCards.length) this.renderStudyCard();
            else this.closeStudy();
        }

        closeStudy() {
            this.stopFocusTimer();
            document.getElementById('active-study-area').classList.add('hidden');
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

        processQuizletImport() {
            const title = document.getElementById('import-deck-name').value.trim();
            const rawDelimiter = document.getElementById('import-delimiter').value;
            const delimiter = rawDelimiter === '\\t' ? '\t' : rawDelimiter;
            const rows = document.getElementById('quizlet-data').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
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
                document.getElementById('quizlet-data').value = '';
            }).catch(error => {
                console.error('[NexusApp] Quizlet import failed:', error);
                window.alert(`Import failed: ${error.message}`);
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
                asteroids: 'Asteroid Definitions',
                match: 'Memory Match Tower',
                runner: 'Exam Runner',
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
            this.arcadeCards = (AppState.get('flashcards') || []).flatMap(deck => deck.cards || [])
                .filter(card => card.front && card.back);
            if (this.arcadeCards.length < 2) {
                window.alert('Create a flashcard deck with at least two cards to play.');
                return;
            }
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
                    <p>Choose the source deck, test length, and question styles. Mixed mode alternates between selected styles.</p>
                    <label>Flashcard deck
                        <select name="deckId" required>${usableDecks.map(deck =>
                            `<option value="${this.escapeHTML(deck.id)}">${this.escapeHTML(deck.title)} · ${(deck.cards || []).filter(card => card.front && card.back).length} cards</option>`
                        ).join('')}</select>
                    </label>
                    <label>Number of questions
                        <select name="questionCount">
                            <option value="5">5 questions</option>
                            <option value="10" selected>10 questions</option>
                            <option value="20">20 questions</option>
                            <option value="all">All cards in deck</option>
                        </select>
                    </label>
                    <fieldset>
                        <legend>Question styles</legend>
                        <label><input type="checkbox" name="multipleChoice" checked> Multiple choice</label>
                        <label><input type="checkbox" name="writtenAnswer"> Written answer</label>
                    </fieldset>
                    <button class="primary-btn" type="submit"><i class="fas fa-play"></i> Start practice test</button>
                </form>`;
        }

        beginPracticeTest(form) {
            const data = new FormData(form);
            const deck = (AppState.get('flashcards') || []).find(item => item.id === data.get('deckId'));
            if (!deck) throw new Error('Choose an available flashcard deck.');
            const availableCards = (deck.cards || []).filter(card => card.front && card.back);
            const hasMultipleChoice = data.has('multipleChoice');
            const hasWrittenAnswer = data.has('writtenAnswer');
            if (!hasMultipleChoice && !hasWrittenAnswer) throw new Error('Select at least one question style.');
            const requestedCount = data.get('questionCount');
            const questionCount = requestedCount === 'all'
                ? availableCards.length
                : Math.min(Number(requestedCount), availableCards.length);
            if (!Number.isInteger(questionCount) || questionCount < 1) throw new Error('Select a valid number of questions.');

            this.practiceTestCards = [...availableCards].sort(() => Math.random() - 0.5).slice(0, questionCount);
            const styles = [
                ...(hasMultipleChoice ? ['multiple-choice'] : []),
                ...(hasWrittenAnswer ? ['written'] : [])
            ];
            this.practiceTestQuestionTypes = this.practiceTestCards.map((_, index) => styles[index % styles.length]);
            this.practiceTestAnswers = [];
            this.arcadeQuestionIndex = 0;
            this.arcadeScore = 0;
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
            } else {
                const label = document.createElement('label');
                label.className = 'practice-test-written';
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
            if (form.dataset.questionType === 'multiple-choice') {
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
            this.practiceTestAnswers.push({ card, givenAnswer, correct });

            const feedback = document.createElement('p');
            feedback.className = `practice-test-feedback ${correct ? 'is-correct' : 'is-incorrect'}`;
            feedback.textContent = correct ? 'Correct!' : `Not quite. Correct answer: ${card.back}`;
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

        answerArcade(index) {
            const correctCard = this.arcadeCards[this.arcadeQuestionIndex];
            const correct = this.arcadeMode === 'truefalse'
                ? this.arcadeOptions[index] === this.arcadeCurrentIsTrue
                : this.arcadeOptions[index] === correctCard;
            if (correct) this.arcadeScore += 1;
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

        closeArcade() {
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
            status.textContent = `StudBud could not start: ${error.message}`;
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