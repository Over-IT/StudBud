(function (window) {
    'use strict';

    class StudBudCloudSync {
        constructor() {
            this.client = null;
            this.user = null;
            this.initialSnapshot = null;
            this.syncTimer = null;
            this.appStarted = false;
            this.authMode = 'login';
            this.accountVersion = 0;
            this.accountReady = false;
            this.accountOpening = null;
            this.stateEventsBound = false;
            this.syncRevision = 0;
            this.syncPromise = null;
            this.signOutHandling = null;
            this.lastSnapshot = null;
            this.restoringSnapshot = false;
            this.offlineMode = false;
            this.mfaPendingUser = null;
            this.authBusy = false;
        }

        async getFriendRooms() {
            if (!this.user || this.user.is_anonymous || this.offlineMode || !this.client) return [];
            const { data, error } = await this.client.rpc('studbud_friend_open_rooms');
            if (error) throw new Error(error.message || 'Could not load buds’ games.');
            return Array.isArray(data) ? data : [];
        }

        async getFriendPresence() {
            if (!this.user || this.user.is_anonymous || this.offlineMode || !this.client) return null;
            const { data, error } = await this.client.rpc('studbud_friend_presence');
            if (error) throw new Error(error.message || 'Could not load buds’ status.');
            return Array.isArray(data) ? data : [];
        }

        async pingPresence(activity = '') {
            if (!this.user || this.user.is_anonymous || this.offlineMode || !this.client) return;
            const { error } = await this.client.rpc('studbud_presence_ping', { p_activity: activity || '' });
            if (error) throw new Error(error.message || 'Could not update your status.');
        }

        static mergeData(base, local, remote, field = 'account') {
            const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
            if (field === 'account.state' && local && remote
                && local.profile?.academicYearStart !== remote.profile?.academicYearStart
                && (base?.profile?.academicYearStart !== undefined
                    || !equal(local.academicYears || [], base?.academicYears || [])
                    || !equal(remote.academicYears || [], base?.academicYears || []))) {
                const baselineYear = base?.profile?.academicYearStart;
                const previousYear = local.profile?.academicYearStart === baselineYear ? local
                    : remote.profile?.academicYearStart === baselineYear ? remote : null;
                const academicFields = ['courses', 'assignments', 'calendarEvents', 'gradeScenarios', 'schedule', 'academicYears'];
                if (previousYear && academicFields.some(key => !equal(previousYear[key], base?.[key]))) {
                    const error = new Error('School data changed on another device while finishing a school year. Choose which version to keep. Neither version has been overwritten.');
                    error.code = 'STUDBUD_SYNC_CONFLICT';
                    throw error;
                }
            }
            if (field === 'account.state.gameMetrics' && local && remote && (local.resetId || '') !== (remote.resetId || '')) {
                // Progress from before an activity reset never merges into progress after it.
                return (local.resetId || '') > (remote.resetId || '') ? local : remote;
            }
            if (field === 'account.state.gameMetrics' && local && remote && !equal(local, base) && !equal(remote, base)) {
                let xp = equal(local.xp, base?.xp) ? remote.xp : equal(remote.xp, base?.xp) ? local.xp
                    : Number(local.xp) + Number(remote.xp) - Number(base?.xp || 0);
                if (!Number.isFinite(xp) || xp < 0) xp = Math.max(0, Number(local.xp) || Number(remote.xp) || 0);
                return { ...remote, ...local, xp, level: Math.floor(xp / 500) + 1,
                    streakDays: Math.max(local.streakDays || 0, remote.streakDays || 0),
                    lastStudyDate: [local.lastStudyDate, remote.lastStudyDate].filter(Boolean).sort().at(-1) || null };
            }
            if (field === 'account.studyHistory' && (Array.isArray(local) || Array.isArray(remote))) {
                const localList = Array.isArray(local) ? local : [];
                const remoteList = Array.isArray(remote) ? remote : [];
                const lMap = new Map(localList.map(item => [item?.id || item?.timestamp, item]).filter(([k]) => Boolean(k)));
                const rMap = new Map(remoteList.map(item => [item?.id || item?.timestamp, item]).filter(([k]) => Boolean(k)));
                const allKeys = new Set([...lMap.keys(), ...rMap.keys()]);
                const merged = [];
                for (const id of allKeys) {
                    const l = lMap.get(id);
                    const r = rMap.get(id);
                    if (l && !r) {
                        merged.push(l);
                    } else if (r && !l) {
                        merged.push(r);
                    } else if (l && r) {
                        if (equal(l, r)) {
                            merged.push(l);
                        } else {
                            const questions = (l.gameSummary?.questions?.length >= (r.gameSummary?.questions?.length || 0))
                                ? l.gameSummary?.questions : (r.gameSummary?.questions || l.gameSummary?.questions);
                            const standings = (l.gameSummary?.standings?.length >= (r.gameSummary?.standings?.length || 0))
                                ? l.gameSummary?.standings : (r.gameSummary?.standings || l.gameSummary?.standings);
                            const gameSummary = (l.gameSummary || r.gameSummary) ? {
                                ...(r.gameSummary || {}),
                                ...(l.gameSummary || {}),
                                ...(questions ? { questions } : {}),
                                ...(standings ? { standings } : {})
                            } : null;
                            merged.push({
                                ...r,
                                ...l,
                                durationSec: Math.max(Number(l.durationSec) || 0, Number(r.durationSec) || 0),
                                leaderboardSyncPending: (l.activityType || r.activityType) !== 'work' && (l.autoTracked || r.autoTracked
                                    ? Math.max(Number(l.durationSec) || 0, Number(r.durationSec) || 0) >
                                        Math.max(Number(l.leaderboardSyncedSeconds) || 0, Number(r.leaderboardSyncedSeconds) || 0)
                                    : Boolean(l.leaderboardSyncPending && r.leaderboardSyncPending)),
                                leaderboardSyncedSeconds: Math.max(Number(l.leaderboardSyncedSeconds) || 0, Number(r.leaderboardSyncedSeconds) || 0),
                                leaderboardSyncedAt: l.leaderboardSyncedAt || r.leaderboardSyncedAt || null,
                                ...(gameSummary ? { gameSummary } : {})
                            });
                        }
                    }
                }
                merged.sort((a, b) => (Date.parse(a.timestamp || 0) || 0) - (Date.parse(b.timestamp || 0) || 0));
                return merged;
            }
            if (field.startsWith('account.studyHistory.')) {
                if (!local) return remote;
                if (!remote) return local;
                return { ...(remote || {}), ...(local || {}) };
            }
            if (equal(local, base)) return remote;
            if (equal(remote, base) || equal(local, remote)) return local;
            if (/^account\.state\.academicYears\.[^.]+$/.test(field) && local && remote) {
                const error = new Error('This school year was archived differently on two devices. Choose which version to keep. Final transcripts cannot be combined automatically.');
                error.code = 'STUDBUD_SYNC_CONFLICT';
                throw error;
            }
            // Conflicting device preferences must not block access to study data.
            const devicePreferences = ['theme', 'colorScheme', 'schemePicked', 'compactUi', 'sidebarCollapsed',
                'reduceMotion', 'startPage', 'plannerDefaultStatus', 'plannerSort', 'tutorialSeen', 'tutorialVersion'];
            if (field === 'account.state.currentView'
                || devicePreferences.some(key => field === `account.state.settings.${key}`)
                || field.startsWith('account.state.settings.gameAudio.')) return local;
            if (/^account\.flashcards\.[^.]+\.cards\.[^.]+$/.test(field) && local && remote) {
                const fields = ['state', 'step', 'easeFactor', 'interval', 'repetitions', 'reps', 'lapses', 'leech',
                    'lastReviewed', 'nextReviewDate', 'schedulerVersion', 'stability', 'difficulty'];
                const changed = card => fields.some(key => !equal(card?.[key], base?.[key]));
                if (changed(local) && changed(remote)) {
                    // A schedule is one result, not independently mergeable state/interval/due fields.
                    const latest = (Date.parse(local.lastReviewed) || 0) >= (Date.parse(remote.lastReviewed) || 0) ? local : remote;
                    const withoutSchedule = card => card && Object.fromEntries(Object.entries(card).filter(([key]) => !fields.includes(key)));
                    const merged = this.mergeData(withoutSchedule(base), withoutSchedule(local), withoutSchedule(remote), field);
                    for (const key of fields) if (latest[key] !== undefined) merged[key] = latest[key];
                    return merged;
                }
            }
            if (/^account\.flashcards\..+\.practiceStats$/.test(field) && local && remote) {
                const latest = (Date.parse(local.lastAnswered) || 0) >= (Date.parse(remote.lastAnswered) || 0) ? local : remote;
                const earlier = latest === local ? remote : local;
                const delta = stats => Math.max(0, Number(stats.attempts || 0) - Number(base?.attempts || 0));
                const additions = (stats, key) => delta(stats) ? (stats[key] || []).slice(-delta(stats)) : [];
                const recentEvidence = [...(base?.recentEvidence || []), ...additions(earlier, 'recentEvidence'),
                    ...additions(latest, 'recentEvidence')].slice(-4);
                const recentAnswers = [...(base?.recentAnswers || []), ...additions(earlier, 'recentAnswers'),
                    ...additions(latest, 'recentAnswers')].slice(-4);
                return { ...latest,
                    attempts: Number(base?.attempts || 0) + delta(local) + delta(remote),
                    correct: Math.max(0, Number(local.correct || 0) + Number(remote.correct || 0) - Number(base?.correct || 0)),
                    ...(recentEvidence.length ? { recentEvidence } : {}),
                    ...(recentAnswers.length ? { recentAnswers } : {}) };
            }
            if (/^account\.flashcards\.[^.]+\.studiedCount$/.test(field)) {
                return Math.max(0, Number(local || 0) + Number(remote || 0) - Number(base || 0));
            }
            if (/^account\.flashcards\.[^.]+\.studiedAt$/.test(field) && local && remote) {
                return local < remote ? local : remote;
            }
            if (/^account\.flashcards\.[^.]+\.ankiToday$/.test(field) && local && remote) {
                if (local.day !== remote.day) return local.day > remote.day ? local : remote;
                const sameDay = base?.day === local.day ? base : {};
                return { day: local.day, newDone: Math.max(0, local.newDone + remote.newDone - (sameDay.newDone || 0)),
                    reviewsDone: Math.max(0, local.reviewsDone + remote.reviewsDone - (sameDay.reviewsDone || 0)) };
            }
            if (Array.isArray(local) && Array.isArray(remote)) {
                const key = [...local, ...remote].every(item => item && typeof item === 'object' && (item.id || item.code))
                    ? item => item.id || item.code : null;
                if (key) {
                    const b = new Map((base || []).map(item => [key(item), item]));
                    const l = new Map(local.map(item => [key(item), item]));
                    const r = new Map(remote.map(item => [key(item), item]));
                    return [...new Set([...r.keys(), ...l.keys()])].map(id =>
                        this.mergeData(b.get(id), l.get(id), r.get(id), `${field}.${id}`)).filter(item => item !== undefined);
                }
            }
            if (local && remote && !Array.isArray(local) && !Array.isArray(remote)
                && typeof local === 'object' && typeof remote === 'object') {
                const merged = {};
                for (const key of new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)])) {
                    if (key === 'exportedAt') { merged[key] = local[key]; continue; }
                    const value = this.mergeData(base?.[key], local[key], remote[key], `${field}.${key}`);
                    if (value !== undefined) merged[key] = value;
                }
                if (field === 'account' && (local.state?.gameMetrics?.resetId || '') === (remote.state?.gameMetrics?.resetId || '')
                    && local.state?.gameMetrics?.xp !== base?.state?.gameMetrics?.xp
                    && remote.state?.gameMetrics?.xp !== base?.state?.gameMetrics?.xp) {
                    const previous = new Set((base?.studyHistory || []).map(session => session.id));
                    const remoteIds = new Set((remote.studyHistory || []).map(session => session.id));
                    const sharedXp = (local.studyHistory || []).filter(session => session.activityType !== 'work' && !previous.has(session.id) && remoteIds.has(session.id))
                        .reduce((xp, session) => xp + Math.max(1, Math.round((session.durationSec || 60) / 60)) * 10, 0);
                    merged.state.gameMetrics.xp -= sharedXp;
                    if (merged.state.gameMetrics.xp < 0) merged.state.gameMetrics.xp = 0;
                    merged.state.gameMetrics.level = Math.floor(merged.state.gameMetrics.xp / 500) + 1;
                }
                return merged;
            }
            const label = field.startsWith('account.state.courses') ? 'the same class'
                : field.startsWith('account.state.assignments') ? 'the same assignment'
                : field.startsWith('account.flashcards') ? 'the same study set'
                : field.startsWith('account.state.settings.gradeGoal') ? 'your grade goals'
                : field.startsWith('account.state.settings') ? 'your settings'
                : field.startsWith('account.state.profile') ? 'your profile'
                : field.startsWith('account.state.calendarEvents') ? 'the same calendar event'
                : 'the same saved information';
            const error = new Error(`Both devices changed ${label}. Choose which version to keep. Neither version has been overwritten.`);
            error.code = 'STUDBUD_SYNC_CONFLICT';
            throw error;
        }

        async bootstrap() {
            this.bindAuthUI();
            this.showAuth();
            if (this.authMode === 'signup') this.setAuthMode('signup');
            if (window.navigator?.onLine === false || localStorage.getItem('STUDBUD_LOCAL_MODE') === 'true') return this.startOffline();
            let config;
            try {
                config = await this.loadAccountConfig();
            } catch (error) {
                console.error('[StudBudCloud] Account settings could not load:', error);
                this.setConfigError('Sign-in connection settings could not load. Check your connection and try again, or continue as a guest. Your saved data is still on this device.');
                return;
            }
            if (!window.supabase?.createClient) {
                throw new Error('Supabase could not load. Check your internet connection and reload.');
            }
            this.clearConfigError();
            this.client = window.supabase.createClient(config.url, config.anonKey);
            const { data: authListener } = this.client.auth.onAuthStateChange((event, session) => {
                if (this.offlineMode) {
                    if (event === 'SIGNED_OUT') {
                        this.user = null;
                        this.accountReady = false;
                        this.setCloudStatus('Offline data is retained. Sign in again after reconnecting to sync.');
                    }
                    return;
                }
                if (event === 'SIGNED_OUT') {
                    this.handleSignedOut().catch(error => {
                        console.error('[StudBudCloud] Could not finish signing out:', error);
                        this.showAuth();
                        this.setAuthStatus('Signed out, but this device could not clear its saved data. Reload before another person signs in.', true);
                    });
                    return;
                }
                if (session?.user && ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'MFA_CHALLENGE_VERIFIED'].includes(event)) {
                    window.setTimeout(() => this.routeAuthenticatedUser(session.user).catch(error => this.reportAccountError(error)), 0);
                }
            });
            this.authSubscription = authListener.subscription;
            const { data, error } = await this.client.auth.getSession();
            if (error) throw error;
            if (data.session) await this.routeAuthenticatedUser(data.session.user);
        }

        bindAuthUI() {
            if (this.authUiBound) return;
            this.authUiBound = true;
            document.getElementById('auth-config-retry')?.addEventListener('click', async event => {
                const button = event.currentTarget;
                button.disabled = true;
                try {
                    await this.connectOnline();
                } catch (error) {
                    this.reportAccountError(error);
                } finally {
                    button.disabled = false;
                }
            });
            document.getElementById('auth-switch-btn')?.addEventListener('click', () => this.setAuthMode(this.authMode === 'login' ? 'signup' : 'login'));
            document.getElementById('login-form')?.addEventListener('submit', event => this.handleLogin(event));
            document.getElementById('signup-form')?.addEventListener('submit', event => this.handleSignup(event));
            document.getElementById('mfa-login-form')?.addEventListener('submit', event => this.verifyMfaLogin(event));
            document.getElementById('mfa-login-cancel')?.addEventListener('click', () => this.cancelMfaLogin());
            document.getElementById('mfa-disable-btn')?.addEventListener('click', () => this.showMfaDisablePanel());
            document.getElementById('mfa-confirm-disable-btn')?.addEventListener('click', () => this.disableMfa());
            document.getElementById('mfa-cancel-disable-btn')?.addEventListener('click', () => this.hideMfaDisablePanel());
            document.getElementById('guest-game-form')?.addEventListener('submit', event => this.handleGuestJoin(event));
            document.getElementById('sign-out-btn')?.addEventListener('click', () => this.signOut());
            document.getElementById('offline-start-btn')?.addEventListener('click', () => this.startOffline().catch(error => this.reportAccountError(error)));
            document.getElementById('offline-connect-btn')?.addEventListener('click', () => this.connectOnline(this.isGuest() ? 'signup' : 'login').catch(error => this.reportAccountError(error)));
            document.getElementById('offline-signin-btn')?.addEventListener('click', () => this.connectOnline('login').catch(error => this.reportAccountError(error)));
            window.addEventListener('offline', () => {
                this.offlineMode = true;
                window.clearTimeout(this.syncTimer);
                this.updateOfflineNotice();
                this.setCloudStatus('Offline: changes are saved on this device. Sync resumes after reconnecting.');
            });
            window.addEventListener('online', () => {
                if (this.isGuest()) { this.updateOfflineNotice(); return; }
                if (this.offlineMode && !this.user && !localStorage.getItem('STUDBUD_CLOUD_ACCOUNT_ID')) {
                    this.setCloudStatus('Internet is available. Continue locally or choose Connect account to sync.');
                    return;
                }
                this.connectOnline().catch(error => {
                    console.error('[StudBudCloud] Reconnection failed:', error);
                    this.setCloudStatus(`Saved on this device. Reconnection failed: ${error.message}`, true);
                });
            });
        }

        updateOfflineNotice() {
            const guest = this.isGuest();
            const notice = document.getElementById('offline-notice');
            notice?.classList.toggle('hidden', !this.offlineMode);
            const text = notice?.querySelector?.('span');
            if (text) text.textContent = guest
                ? 'Guest mode: everything saves on this device. Create a free account to sync, earn coins and share sets.'
                : 'Offline: changes stay on this device until you reconnect.';
            const connect = document.getElementById('offline-connect-btn');
            if (connect) connect.textContent = guest ? 'Create account' : 'Connect account';
            document.getElementById('offline-signin-btn')?.classList.toggle('hidden', !guest);
            const signOut = document.getElementById('sign-out-btn');
            if (signOut) signOut.textContent = guest ? 'Sign in or create account' : this.offlineMode ? 'Connect account' : 'Sign out';
            document.body?.classList.toggle('guest-mode', guest);
        }

        isGuest() {
            return Boolean(this.offlineMode && !this.user && !(typeof localStorage !== 'undefined' && localStorage.getItem('STUDBUD_CLOUD_ACCOUNT_ID')));
        }

        async prepareGuestSession() {
            if (this.guestUser) return;
            if (window.navigator?.onLine === false) throw new Error('Online play needs an internet connection.');
            if (this.guestOpening) return this.guestOpening;
            this.guestOpening = (async () => {
                const config = window.STUDBUD_SUPABASE_CONFIG || {};
                if (!config.url || !config.anonKey || !window.supabase?.createClient) throw new Error('Online features need the Supabase configuration and SDK. Open StudBud online and reload.');
                // App guests keep one anonymous session across reloads; code-only joins forget it when the page closes.
                const persist = this.isGuest();
                this.guestClient ||= window.supabase.createClient(config.url, config.anonKey, {
                    auth: { persistSession: persist, autoRefreshToken: true, detectSessionInUrl: false, storageKey: persist ? 'studbud-guest-session' : 'studbud-guest-game' }
                });
                const existing = persist ? (await this.guestClient.auth.getSession()).data?.session?.user : null;
                if (existing?.is_anonymous) { this.guestUser = existing; return; }
                const { data, error } = await this.guestClient.auth.signInAnonymously();
                if (error) throw new Error(`Guest play is unavailable: ${error.message}. The administrator must enable Anonymous Sign-ins in Supabase Authentication.`);
                if (!data?.user?.is_anonymous) throw new Error('The server did not create a valid guest session.');
                this.guestUser = data.user;
            })();
            try { await this.guestOpening; } finally { this.guestOpening = null; }
        }

        async endGuestSession() {
            const client = this.guestClient;
            this.guestClient = null;
            this.guestUser = null;
            await client?.auth.signOut({ scope: 'local' }).catch(() => {});
            localStorage.removeItem('studbud-guest-session');
        }

        async handleGuestJoin(event) {
            event.preventDefault();
            const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
            if (button.disabled) return;
            button.disabled = true;
            this.setAuthStatus('Joining as a guest...');
            try {
                await this.prepareGuestSession();
                const app = window.NexusApp, panel = document.getElementById('hosted-game-room');
                this.guestRoomParent ||= panel.parentElement;
                this.guestLobbyOpen = true;
                const lobby = document.getElementById('guest-game-lobby');
                lobby.appendChild(panel);
                lobby.classList.remove('hidden');
                if (!this.guestControlsBound) {
                    document.getElementById('hosted-leave-btn').addEventListener('click', () => !this.appStarted && app.leaveHostedGame().catch(error => {
                        console.error('[Guest game] Leaving failed:', error);
                        document.getElementById('hosted-room-status').textContent = error.message;
                    }));
                    document.getElementById('copy-hosted-room-code-btn').addEventListener('click', () => { if (!this.appStarted) app.copyHostedRoomCode(); });
                    this.guestControlsBound = true;
                }
                await app.joinGame(form);
                document.querySelector('.auth-card').classList.add('hidden');
                this.setAuthStatus('');
            } catch (error) {
                console.error('[Guest game] Joining failed:', error);
                this.closeGuestLobby();
                this.setAuthStatus(error.message, true);
            } finally { button.disabled = false; }
        }

        closeGuestLobby() {
            if (!this.guestLobbyOpen) return;
            this.guestLobbyOpen = false;
            const panel = document.getElementById('hosted-game-room');
            if (this.guestRoomParent) this.guestRoomParent.appendChild(panel);
            panel?.classList.add('hidden');
            document.getElementById('guest-game-lobby')?.classList.add('hidden');
            document.querySelector('.auth-card')?.classList.remove('hidden');
        }

        async startOffline() {
            if (this.accountOpening || this.syncPromise) throw new Error('Wait for the account operation to finish before opening offline mode.');
            this.offlineMode = true;
            localStorage.setItem('STUDBUD_LOCAL_MODE', 'true');
            this.initialSnapshot = null;
            this.user = null;
            this.accountReady = false;
            await this.refreshLegacyMfaSettings();
            window.clearTimeout(this.syncTimer);
            if (!this.appStarted) {
                await window.NexusApp.init();
                this.appStarted = true;
            }
            if (localStorage.getItem('STUDBUD_CLOUD_ACCOUNT_ID') && !localStorage.getItem('STUDBUD_CLOUD_SYNC_BASE')) {
                const base = this.lastSnapshot || JSON.parse(await window.NexusApp.AppState.exportAppState());
                localStorage.setItem('STUDBUD_CLOUD_SYNC_BASE', JSON.stringify(base));
            }
            this.bindStateEvents();
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('app-container')?.classList.remove('hidden');
            this.updateOfflineNotice();
            const accountName = document.getElementById('account-name');
            if (accountName) accountName.textContent = this.isGuest() ? 'Guest' : 'Offline on this device';
            this.setCloudStatus(this.isGuest() ? 'Guest mode: saved on this device.' : 'Offline / local mode: saved on this device. Cloud and community features require a connection.');
            window.NexusApp?.refreshGuestFeatures?.();
        }

        async connectOnline(mode) {
            if (mode === 'login' || mode === 'signup') this.authMode = mode;
            if (window.navigator?.onLine === false) {
                this.setCloudStatus('Still offline. Your changes are saved on this device; connect to the internet to sync.', true);
                return;
            }
            this.offlineMode = false;
            localStorage.removeItem('STUDBUD_LOCAL_MODE');
            this.updateOfflineNotice();
            if (!this.client) return this.bootstrap();
            const { data, error } = await this.client.auth.getSession();
            if (error) throw error;
            if (data.session?.user) {
                await this.routeAuthenticatedUser(data.session.user);
                if (!this.accountReady) return;
                this.queueSync();
                await window.NexusApp?.syncPendingStudyTime?.();
                await window.NexusApp?.refreshPendingSharedDecks?.();
            } else {
                this.showAuth();
                if (mode) this.setAuthMode(this.authMode);
                this.setAuthStatus(this.authMode === 'signup'
                    ? 'Create a free account. Your guest decks and progress on this device come with you.'
                    : 'Sign in to connect your saved device data. You can also continue offline.');
            }
        }

        showAuth() {
            document.getElementById('app-container')?.classList.add('hidden');
            document.getElementById('auth-screen')?.classList.remove('hidden');
        }

        async loadAccountConfig() {
            const ready = () => window.STUDBUD_SUPABASE_CONFIG?.url && window.STUDBUD_SUPABASE_CONFIG?.anonKey;
            if (ready()) return window.STUDBUD_SUPABASE_CONFIG;
            if (!this.configLoading) {
                this.configLoading = (async () => {
                    const script = document.createElement('script');
                    script.src = 'supabase-config.js';
                    let timeout;
                    try {
                        await new Promise((resolve, reject) => {
                            script.onload = resolve;
                            script.onerror = () => reject(new Error('Account connection settings could not be downloaded.'));
                            timeout = window.setTimeout(() => reject(new Error('Account connection settings timed out.')), 8000);
                            document.head.appendChild(script);
                        });
                        if (!ready()) throw new Error('The account configuration is missing its project URL or publishable key.');
                        return window.STUDBUD_SUPABASE_CONFIG;
                    } finally {
                        window.clearTimeout(timeout);
                        script.remove();
                    }
                })();
            }
            try {
                return await this.configLoading;
            } finally {
                this.configLoading = null;
            }
        }

        clearConfigError() {
            document.getElementById('auth-config-message')?.classList.add('hidden');
            document.getElementById('auth-config-retry')?.classList.add('hidden');
            document.querySelectorAll('#login-form button, #signup-form button').forEach(button => { button.disabled = false; });
            document.getElementById('auth-switch-btn')?.removeAttribute('disabled');
        }

        setConfigError(message) {
            const notice = document.getElementById('auth-config-message');
            if (notice) {
                notice.textContent = message;
                notice.classList.remove('hidden');
            }
            document.getElementById('auth-config-retry')?.classList.remove('hidden');
            document.querySelectorAll('#login-form button, #signup-form button').forEach(button => { button.disabled = true; });
            document.getElementById('auth-switch-btn')?.setAttribute('disabled', 'true');
        }

        setAuthMode(mode) {
            if (this.authBusy || this.mfaPendingUser) return;
            this.authMode = mode;
            const signup = mode === 'signup';
            document.getElementById('login-form')?.classList.toggle('hidden', signup);
            document.getElementById('signup-form')?.classList.toggle('hidden', !signup);
            document.getElementById('auth-title').textContent = signup ? 'Create your free account' : 'Welcome to StudBud';
            document.getElementById('auth-description').textContent = signup
                ? 'Sync your classes and sets across devices, earn coins and share sets. Anything saved as a guest on this device comes with you.'
                : 'Sign in to sync across devices, or continue as a guest. No account needed.';
            document.getElementById('auth-switch-prompt').textContent = signup ? 'Already have an account?' : 'New to StudBud?';
            document.getElementById('auth-switch-btn').textContent = signup ? 'Sign in' : 'Create an account';
            this.setAuthStatus('');
        }

        setAuthStatus(message, isError = false) {
            const status = document.getElementById('auth-status');
            if (!status) return;
            status.textContent = message;
            status.classList.toggle('error', isError);
        }

        async routeAuthenticatedUser(user) {
            if (!user?.id) return;
            if (this.pendingConflict?.user?.id === user.id) {
                this.renderConflictResolution(this.pendingConflict, this.pendingConflict.message);
                return;
            }
            if (this.accountReady && this.user?.id === user.id) {
                this.user = user;
                return;
            }
            if (!this.client?.auth?.mfa?.getAuthenticatorAssuranceLevel) return this.openAccount(user);
            const { data, error } = await this.client.auth.mfa.getAuthenticatorAssuranceLevel();
            if (error) throw new Error(this.friendlyAuthError(error, 'Could not check your authenticator status. Please try signing in again.'));
            if (data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2') {
                this.showMfaLoginPrompt(user);
                return;
            }
            this.clearMfaLoginPrompt();
            await this.openAccount(user);
        }

        showMfaLoginPrompt(user) {
            this.mfaPendingUser = user;
            this.showAuth();
            document.getElementById('mfa-login-prompt')?.classList.remove('hidden');
            ['login-form', 'signup-form', 'auth-switch-prompt', 'auth-switch-btn', 'offline-start-btn', 'guest-start-hint', 'auth-divider', 'guest-join', 'auth-legal'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
            this.setAuthStatus('');
            document.getElementById('mfa-login-code')?.focus();
        }

        clearMfaLoginPrompt() {
            this.mfaPendingUser = null;
            document.getElementById('mfa-login-prompt')?.classList.add('hidden');
            document.getElementById('login-form')?.classList.toggle('hidden', this.authMode === 'signup');
            document.getElementById('signup-form')?.classList.toggle('hidden', this.authMode !== 'signup');
            ['auth-switch-prompt', 'auth-switch-btn', 'offline-start-btn', 'guest-start-hint', 'auth-divider', 'guest-join', 'auth-legal'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
        }

        async verifyMfaLogin(event) {
            event.preventDefault();
            if (!this.mfaPendingUser) return;
            const code = document.getElementById('mfa-login-code')?.value.trim() || '';
            if (!/^[0-9]{6}$/.test(code)) { this.setAuthStatus('Enter the 6-digit code from your authenticator app.', true); return; }
            this.setAuthStatus('Verifying your code...');
            try {
                const { data: factors, error: factorsError } = await this.client.auth.mfa.listFactors();
                if (factorsError) throw factorsError;
                const factor = (factors?.totp || []).find(item => item.status === 'verified');
                if (!factor) throw new Error('No verified authenticator was found for this account. Contact support or sign in another way.');
                const { error } = await this.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
                if (error) throw error;
                const user = this.mfaPendingUser;
                document.getElementById('mfa-login-code').value = '';
                await this.routeAuthenticatedUser(user);
            } catch (error) {
                console.error('[StudBudCloud] Authenticator verification failed:', error);
                this.setAuthStatus(this.friendlyAuthError(error, 'That code could not be verified. Check your authenticator and try again.'), true);
            }
        }

        async cancelMfaLogin() {
            try {
                const { error } = await this.client.auth.signOut({ scope: 'local' });
                if (error) throw error;
                await this.handleSignedOut();
                this.setAuthStatus('Signed out. You can sign in again when ready.');
            } catch (error) {
                this.setAuthStatus(this.friendlyAuthError(error, 'Could not cancel sign-in. Please try again.'), true);
            }
        }

        usernameEmail(username) {
            const normalized = String(username || '').trim().toLowerCase();
            if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
                throw new Error('Username must be 3–24 characters and contain only letters, numbers, or underscores.');
            }
            return `${normalized}@accounts.studbud.invalid`;
        }

        setAuthBusy(busy) {
            this.authBusy = busy;
            document.querySelectorAll('#login-form button, #signup-form button, #auth-switch-btn, #offline-start-btn')
                .forEach(button => { button.disabled = busy; });
        }

        async handleLogin(event) {
            event.preventDefault();
            if (this.authBusy) return;
            this.setAuthBusy(true);
            this.setAuthStatus('Signing in…');
            try {
                const identifier = document.getElementById('login-username').value.trim();
                const { data, error } = await this.client.auth.signInWithPassword({
                    email: this.usernameEmail(identifier),
                    password: document.getElementById('login-password').value
                });
                if (error) throw error;
                document.getElementById('login-password').value = '';
                await this.routeAuthenticatedUser(data.user || data.session?.user);
            } catch (error) {
                console.error('[StudBudCloud] Sign-in failed:', error);
                this.reportAccountError(error);
            } finally {
                this.setAuthBusy(false);
            }
        }

        async handleSignup(event) {
            event.preventDefault();
            if (this.authBusy) return;
            const username = document.getElementById('signup-username').value.trim().toLowerCase();
            const password = document.getElementById('signup-password').value;
            const school = document.getElementById('signup-school').value;
            try {
                this.usernameEmail(username);
                window.StudBudNameModeration.assertAllowed(username, 'Username');
            } catch (error) {
                this.setAuthStatus(error.message, true);
                return;
            }
            if (password.length < 8) {
                this.setAuthStatus('Password must be at least 8 characters.', true);
                return;
            }
            if (password !== document.getElementById('signup-password-confirm').value) {
                this.setAuthStatus('The passwords do not match.', true);
                return;
            }
            if (!['pchs', 'pnhs', 'pshs', 'pwhs', 'other'].includes(school)) {
                this.setAuthStatus('Choose your school to create an account.', true);
                return;
            }
            this.setAuthBusy(true);
            this.setAuthStatus('Creating your account...');
            try {
                const { data, error } = await this.client.auth.signUp({
                    email: this.usernameEmail(username),
                    password,
                    options: { data: { username, school } }
                });
                if (error) throw error;
                if (!data.session) {
                    this.setAuthStatus('Account creation is waiting for server email confirmation. The site administrator must turn off Confirm email in Supabase so username accounts can be created without email verification.', true);
                    return;
                }
                document.getElementById('signup-password').value = '';
                document.getElementById('signup-password-confirm').value = '';
                await this.routeAuthenticatedUser(data.user || data.session.user);
            } catch (error) {
                console.error('[StudBudCloud] Sign-up failed:', error);
                this.reportAccountError(error);
            } finally {
                this.setAuthBusy(false);
            }
        }

        async refreshLegacyMfaSettings() {
            const card = document.getElementById('mfa-settings-card');
            if (!card) return;
            if (!this.user?.id || this.offlineMode) { card.classList.add('hidden'); return; }
            const status = document.getElementById('mfa-settings-status');
            const message = document.getElementById('mfa-settings-message');
            const disable = document.getElementById('mfa-disable-btn');
            if (message) message.textContent = '';
            if (status) status.textContent = 'Checking authenticator status...';
            try {
                const { data, error } = await this.client.auth.mfa.listFactors();
                if (error) throw error;
                const factors = data?.totp || [];
                const verified = factors.find(factor => factor.status === 'verified');
                card.classList.toggle('hidden', !verified);
                if (status) status.textContent = verified ? 'Authenticator app is enabled.' : 'Authenticator app is not enabled.';
                disable?.classList.toggle('hidden', !verified);
                if (disable) disable.disabled = false;
            } catch (error) {
                card.classList.remove('hidden');
                if (status) status.textContent = this.friendlyAuthError(error, 'Could not check authenticator status.');
                if (disable) disable.disabled = true;
            }
        }

        showMfaDisablePanel() {
            document.getElementById('mfa-disable-code').value = '';
            document.getElementById('mfa-disable-panel')?.classList.remove('hidden');
        }

        hideMfaDisablePanel() {
            document.getElementById('mfa-disable-panel')?.classList.add('hidden');
            document.getElementById('mfa-settings-message').textContent = '';
        }

        async disableMfa() {
            const code = document.getElementById('mfa-disable-code')?.value.trim() || '';
            const message = document.getElementById('mfa-settings-message');
            if (!/^[0-9]{6}$/.test(code)) { message.textContent = 'Enter the 6-digit code from your authenticator app.'; return; }
            try {
                const { data, error } = await this.client.auth.mfa.listFactors();
                if (error) throw error;
                const factor = (data?.totp || []).find(item => item.status === 'verified');
                if (!factor) throw new Error('No verified authenticator was found.');
                const { error: verifyError } = await this.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
                if (verifyError) throw verifyError;
                for (const verifiedFactor of (data?.totp || []).filter(item => item.status === 'verified')) {
                    const { error: removeError } = await this.client.auth.mfa.unenroll({ factorId: verifiedFactor.id });
                    if (removeError) throw removeError;
                }
                document.getElementById('mfa-disable-panel')?.classList.add('hidden');
                message.textContent = 'Two-factor authentication is disabled.';
                await this.refreshLegacyMfaSettings();
            } catch (error) {
                message.textContent = this.friendlyAuthError(error, 'That code could not be verified or the authenticator could not be removed. Try again.');
            }
        }

        async openAccount(user) {
            if (!user?.id) return;
            if (this.accountReady && this.user?.id === user.id) return;
            if (this.accountOpening?.userId === user.id) return this.accountOpening.promise;
            if (this.accountOpening) {
                this.accountVersion++;
                this.accountReady = false;
                this.user = null;
                window.clearTimeout(this.syncTimer);
                await this.accountOpening.promise.catch(() => {});
                return this.openAccount(user);
            }

            const version = ++this.accountVersion;
            this.accountReady = false;
            this.user = null;
            window.clearTimeout(this.syncTimer);
            const promise = this.loadAccount(user, version);
            this.accountOpening = { userId: user.id, promise };
            try {
                await promise;
            } catch (error) {
                if (version === this.accountVersion) {
                    this.user = null;
                    this.accountReady = false;
                    this.showAuth();
                }
                throw error;
            } finally {
                if (this.accountOpening?.promise === promise) this.accountOpening = null;
            }
        }

        async loadAccount(user, version) {
            this.pendingConflict = null;
            this.setAuthStatus('');
            const { data: row, error } = await this.client
                .from('studbud_user_data')
                .select('data')
                .eq('user_id', user.id)
                .maybeSingle();
            if (error) throw new Error(`Could not load your cloud data: ${error.message}`);
            if (version !== this.accountVersion) return;

            const remoteSnapshot = row?.data || null;
            const previousAccount = localStorage.getItem('STUDBUD_CLOUD_ACCOUNT_ID');
            const savedBase = previousAccount === user.id ? localStorage.getItem('STUDBUD_CLOUD_SYNC_BASE')
                : !previousAccount && localStorage.getItem('STUDBUD_LOCAL_ONLY_DATA') ? '{}' : null;
            this.initialSnapshot = savedBase ? null : remoteSnapshot;
            this.lastSnapshot = remoteSnapshot ? JSON.parse(JSON.stringify(remoteSnapshot)) : null;
            this.user = user;
            if (this.initialSnapshot) {
                if (!this.appStarted) {
                    await window.NexusApp.init();
                    this.appStarted = true;
                } else {
                    await window.NexusApp.restoreCloudSnapshot(this.initialSnapshot);
                }
            } else {
                const previousAccount = localStorage.getItem('STUDBUD_CLOUD_ACCOUNT_ID');
                if (previousAccount && previousAccount !== user.id) {
                    await window.NexusApp.resetForCloudAccount();
                }
                if (!this.appStarted) {
                    await window.NexusApp.init();
                    this.appStarted = true;
                }
            }
            if (version !== this.accountVersion) return;
            if (savedBase && remoteSnapshot) {
                const local = JSON.parse(await window.NexusApp.AppState.exportAppState());
                if (version !== this.accountVersion) return;
                try {
                    const base = !previousAccount
                        ? window.NexusApp.AppState.emptyCloudSnapshot()
                        : JSON.parse(savedBase);
                    const merged = StudBudCloudSync.mergeData(base, local, remoteSnapshot);
                    await window.NexusApp.restoreCloudSnapshot(merged);
                    this.initialSnapshot = remoteSnapshot;
                } catch (mergeError) {
                    this.pendingConflict = { user, remoteSnapshot, local, savedBase, message: mergeError.message };
                    throw mergeError;
                }
            }

            if (version !== this.accountVersion) return;
            localStorage.setItem('STUDBUD_CLOUD_ACCOUNT_ID', user.id);
            localStorage.removeItem('STUDBUD_LOCAL_ONLY_DATA');
            const username = user.user_metadata?.username || 'Account';
            const accountName = document.getElementById('account-name');
            if (accountName) accountName.textContent = window.NexusApp?.multiplayerDisplayName?.() || username;
            this.bindStateEvents();
            await window.NexusApp.recoverOwnedCommunityDecks();
            if (version !== this.accountVersion) return;
            this.accountReady = true;
            this.offlineMode = false;
            await this.refreshLegacyMfaSettings();
            localStorage.removeItem('STUDBUD_LOCAL_MODE');
            this.endGuestSession();
            this.updateOfflineNotice();
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('app-container')?.classList.remove('hidden');
            this.setCloudStatus(this.initialSnapshot ? 'Synced to your account.' : 'Saving your account data…');
            this.queueSync();
            window.NexusApp?.syncPendingStudyTime?.().catch(error => {
                console.error('[StudBudCloud] Study time could not sync after sign-in:', error);
                this.setCloudStatus('Your account is open, but study time could not sync. Check your connection and try again.', true);
            });
            window.NexusApp?.refreshAdminAccess?.();
            await window.NexusApp?.refreshPendingSharedDecks?.();
        }

        reportAccountError(error) {
            console.error('[StudBudCloud] Could not open account:', error);
            const conflict = this.pendingConflict;
            this.user = null;
            this.accountReady = false;
            this.showAuth();
            const message = this.friendlyAuthError(error, 'Could not load your account data. Check your connection and try again.');
            if (conflict && /both devices/i.test(message)) {
                this.renderConflictResolution(conflict, message);
                return;
            }
            this.setAuthStatus(message, true);
        }

        renderConflictResolution(conflict, message) {
            const status = document.getElementById('auth-status');
            if (!status) return;
            status.classList.add('error');
            status.innerHTML = `
                <div class="auth-conflict-panel" style="text-align:center;">
                    <p style="margin-bottom:10px;">${window.NexusApp?.escapeHTML?.(message) || message}</p>
                    <p>This choice applies to your whole study plan, not just the item above. Check your other device first if you are unsure which copy to use.</p>
                    <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:8px;">
                        <button type="button" class="secondary-btn" id="auth-conflict-cloud-btn">Use account copy</button>
                        <button type="button" class="secondary-btn" id="auth-conflict-local-btn">Use this device's copy</button>
                    </div>
                </div>
            `;
            document.getElementById('auth-conflict-cloud-btn')?.addEventListener('click', async () => {
                localStorage.removeItem('STUDBUD_CLOUD_SYNC_BASE');
                this.pendingConflict = null;
                this.setAuthStatus('Applying cloud data…');
                try {
                    await window.NexusApp.restoreCloudSnapshot(conflict.remoteSnapshot);
                    await this.openAccount(conflict.user);
                } catch (err) {
                    this.reportAccountError(err);
                }
            });
            document.getElementById('auth-conflict-local-btn')?.addEventListener('click', async () => {
                this.pendingConflict = null;
                this.setAuthStatus('Uploading device data…');
                try {
                    await window.NexusApp.restoreCloudSnapshot(conflict.local);
                    localStorage.setItem('STUDBUD_CLOUD_ACCOUNT_ID', conflict.user.id);
                    localStorage.setItem('STUDBUD_CLOUD_SYNC_BASE', JSON.stringify(conflict.remoteSnapshot));
                    await this.openAccount(conflict.user);
                    await this.syncNow();
                } catch (err) {
                    this.reportAccountError(err);
                }
            });
        }

        friendlyAuthError(error, fallback) {
            const message = String(error?.message || '');
            if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
                return 'Could not reach the account server. Check your internet connection and try again.';
            }
            if (/invalid login credentials|invalid email or password/i.test(message)) {
                return 'Your username or password was not recognized. Check your details and try again.';
            }
            if (/already registered|user already exists/i.test(message)) {
                return 'An account with those details already exists. Try signing in instead.';
            }
            if (error?.code === '23505' || /studbud_auth_username_unique|username is already taken/i.test(message)) {
                return 'That username is already taken. Choose another username.';
            }
            if (/database error saving new user/i.test(message)) {
                return 'Your account could not be created. That username may be taken; try another username. If this continues, contact the site administrator.';
            }
            if (error?.code === 'otp_expired' || /token.*(expired|invalid)|expired.*(token|code)|email link.*(invalid|expired)/i.test(message)) {
                return 'That authentication code is invalid or has expired. Check your authenticator and try again.';
            }
            if (/rate.?limit|too many requests|security purposes.*seconds/i.test(message)) {
                return 'Too many code requests. Wait a minute before trying again.';
            }
            if (/password.*(weak|short|least)/i.test(message)) {
                return 'Choose a stronger password with at least 8 characters.';
            }
            return window.NexusApp?.friendlyErrorMessage(error, fallback) || fallback;
        }

        bindStateEvents() {
            if (this.stateEventsBound) return;
            const syncEvents = ['state:changed', 'state:restored', 'courses:updated', 'assignments:updated', 'flashcards:updated', 'study:recorded', 'metrics:updated'];
            syncEvents.forEach(eventName => window.NexusApp.EventBus.on(eventName, () => this.queueSync()));
            this.stateEventsBound = true;
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.syncNow().catch(error => this.setCloudStatus(this.friendlyAuthError(error, 'Could not sync before leaving.'), true));
                } else if (this.accountReady) this.queueSync();
            });
            window.setInterval(() => {
                if (document.visibilityState === 'hidden' || window.navigator?.onLine === false) return;
                if (this.accountReady) this.queueSync();
                else if (this.appStarted && this.isGuest()) {
                    window.NexusApp.reconcileRemovedDecks?.().catch(error => {
                        console.error('[StudBudCloud] Removed sets could not be checked:', error);
                        this.setCloudStatus(this.friendlyAuthError(error, 'Could not check removed flashcard sets.'), true);
                    });
                }
            }, 60000);
        }

        queueSync() {
            if (this.offlineMode || window.navigator?.onLine === false) {
                this.syncRevision++;
                if (!localStorage.getItem('STUDBUD_CLOUD_ACCOUNT_ID')) localStorage.setItem('STUDBUD_LOCAL_ONLY_DATA', 'true');
                this.setCloudStatus(this.isGuest() ? 'Guest mode: saved on this device.' : 'Offline / local mode: changes saved on this device; waiting to sync.');
                return;
            }
            if (this.restoringSnapshot || !this.accountReady || !this.user || !window.NexusApp?.AppState) return;
            this.syncRevision++;
            window.clearTimeout(this.syncTimer);
            this.setCloudStatus('Syncing to your account…');
            this.syncTimer = window.setTimeout(() => {
                this.syncNow().catch(error => {
                    console.error('[StudBudCloud] Cloud sync failed:', error);
                    this.setCloudStatus(this.friendlyAuthError(error, 'Your changes could not sync. Check your connection and try again.'), true);
                });
            }, 350);
        }

        async syncNow() {
            if (this.offlineMode || window.navigator?.onLine === false) return;
            if (!this.accountReady || !this.user) return;
            if (this.syncPromise) return this.syncPromise;
            const userId = this.user.id;
            const version = this.accountVersion;
            let completedRevision = -1;
            this.syncPromise = (async () => {
                do {
                    await window.NexusApp.reconcileRemovedDecks?.();
                    completedRevision = this.syncRevision;
                    const backup = JSON.parse(await window.NexusApp.AppState.exportAppState());
                    if (!this.accountReady || this.user?.id !== userId || this.accountVersion !== version) return;
                    if (completedRevision !== this.syncRevision) continue;
                    let saved = false;
                    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
                        const { data: current, error: readError } = await this.client.from('studbud_user_data')
                            .select('data,updated_at').eq('user_id', userId).maybeSingle();
                        if (readError) throw new Error(readError.message);
                        if (!this.accountReady || this.user?.id !== userId || this.accountVersion !== version) return;
                        if (completedRevision !== this.syncRevision) break;
                        const merged = current ? StudBudCloudSync.mergeData(this.lastSnapshot || {}, backup, current.data) : backup;
                        const nextWrite = Math.max(Date.now(), current ? Date.parse(current.updated_at) + 1 : 0);
                        const row = { user_id: userId, data: merged, updated_at: new Date(nextWrite).toISOString() };
                        const { data, error } = current
                            ? await this.client.from('studbud_user_data').update(row).eq('user_id', userId).eq('updated_at', current.updated_at).select('user_id')
                            : await this.client.from('studbud_user_data').insert(row).select('user_id');
                        if (!this.accountReady || this.user?.id !== userId || this.accountVersion !== version) return;
                        if (error && error.code !== '23505') throw new Error(error.message);
                        if (error || !data?.length) continue;
                        this.lastSnapshot = backup;
                        localStorage.setItem('STUDBUD_CLOUD_SYNC_BASE', JSON.stringify(backup));
                        saved = true;
                        if (completedRevision === this.syncRevision
                            && JSON.stringify({ ...merged, exportedAt: '' }) !== JSON.stringify({ ...backup, exportedAt: '' })) {
                            this.restoringSnapshot = true;
                            try {
                                await window.NexusApp.restoreCloudSnapshot(merged);
                                if (!this.accountReady || this.user?.id !== userId || this.accountVersion !== version) return;
                                this.lastSnapshot = merged;
                                localStorage.setItem('STUDBUD_CLOUD_SYNC_BASE', JSON.stringify(merged));
                            }
                            finally { this.restoringSnapshot = false; }
                        }
                    }
                    if (!saved && completedRevision === this.syncRevision) throw new Error('Your account changed on another device repeatedly. Please try syncing again.');
                    if (!this.accountReady || this.user?.id !== userId || this.accountVersion !== version) return;
                } while (completedRevision !== this.syncRevision);
                if (window.NexusApp.removedDeckCheckUnavailable) {
                    this.setCloudStatus('Study data synced. Automatic set removals need the latest supabase-setup.sql on the server.', true);
                } else {
                    this.setCloudStatus(`Synced to your account · ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
                }
            })();
            try {
                await this.syncPromise;
            } finally {
                this.syncPromise = null;
            }
        }

        setCloudStatus(message, isError = false) {
            window.NexusApp?.AppState?.setSaveStatus(message, isError ? 'error' : 'saved');
        }

        async clearDeviceCache() {
            localStorage.removeItem('PCHS_NEXUS_STATE_V1');
            localStorage.removeItem('STUDBUD_CLOUD_SYNC_BASE');
            localStorage.removeItem('STUDBUD_LOCAL_ONLY_DATA');
            localStorage.removeItem('STUDBUD_LOCAL_MODE');
            await this.endGuestSession();
            await Promise.all(['flashcards', 'studyHistory', 'gameMetrics'].map(store => window.NexusApp.clearLocalStore(store)));
        }

        async signOut() {
            if (this.offlineMode) return this.connectOnline().catch(error => this.reportAccountError(error));
            if (!await window.StudBudDialogs.confirm('Sign out of StudBud on this device? Your synced account data will remain in the cloud.')) return;
            try {
                await window.NexusApp?.flushAutomaticStudy?.();
                await this.syncNow();
            }
            catch (error) {
                console.error('[StudBudCloud] Could not save before sign-out:', error);
                this.setCloudStatus(this.friendlyAuthError(error, 'Save failed. Stay signed in and retry syncing before signing out.'), true);
                return;
            }
            const { error } = await this.client.auth.signOut();
            if (error) {
                console.error('[StudBudCloud] Sign-out failed:', error);
                this.setCloudStatus(this.friendlyAuthError(error, 'Could not sign out. Please try again.'), true);
                return;
            }
            await this.handleSignedOut();
        }

        async handleSignedOut() {
            if (this.signOutHandling) return this.signOutHandling;
            this.accountVersion++;
            this.accountReady = false;
            this.user = null;
            this.initialSnapshot = null;
            window.clearTimeout(this.syncTimer);
            this.syncTimer = null;
            this.clearMfaLoginPrompt();
            ['login-password'].forEach(id => {
                const input = document.getElementById(id);
                if (input) input.value = '';
            });
            document.getElementById('mfa-settings-card')?.classList.add('hidden');
            this.showAuth();
            this.signOutHandling = (async () => {
            try {
                await this.clearDeviceCache();
            } catch (clearError) {
                console.error('[StudBudCloud] Could not clear signed-out device cache:', clearError);
                this.setAuthStatus('Signed out, but could not clear this device’s saved data. Reload before another person signs in.', true);
            } finally {
                this.signOutHandling = null;
            }
            })();
            return this.signOutHandling;
        }
    }

    window.StudBudCloud = new StudBudCloudSync();
})(window);
