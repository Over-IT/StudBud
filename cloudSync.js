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
        }

        static mergeData(base, local, remote, field = 'account') {
            const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
                                leaderboardSyncPending: Boolean(l.leaderboardSyncPending && r.leaderboardSyncPending),
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
                if (field === 'account' && local.state?.gameMetrics?.xp !== base?.state?.gameMetrics?.xp
                    && remote.state?.gameMetrics?.xp !== base?.state?.gameMetrics?.xp) {
                    const previous = new Set((base?.studyHistory || []).map(session => session.id));
                    const remoteIds = new Set((remote.studyHistory || []).map(session => session.id));
                    const sharedXp = (local.studyHistory || []).filter(session => !previous.has(session.id) && remoteIds.has(session.id))
                        .reduce((xp, session) => xp + Math.max(1, Math.round((session.durationSec || 60) / 60)) * 10, 0);
                    merged.state.gameMetrics.xp -= sharedXp;
                    if (merged.state.gameMetrics.xp < 0) merged.state.gameMetrics.xp = 0;
                    merged.state.gameMetrics.level = Math.floor(merged.state.gameMetrics.xp / 500) + 1;
                }
                return merged;
            }
            throw new Error(`Both devices changed ${field}. Export a backup before reloading to resolve the conflict; neither version was overwritten.`);
        }

        async bootstrap() {
            this.bindAuthUI();
            this.showAuth();
            const config = window.STUDBUD_SUPABASE_CONFIG || {};
            if (!config.url || !config.anonKey) {
                this.showAuth();
                this.setConfigError('Account sync needs Supabase project settings. Add your project URL and anon key to supabase-config.js, then reload.');
                return;
            }
            if (!window.supabase?.createClient) {
                throw new Error('Supabase could not load. Check your internet connection and reload.');
            }
            this.client = window.supabase.createClient(config.url, config.anonKey);
            const { data: authListener } = this.client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT') {
                    this.handleSignedOut().catch(error => {
                        console.error('[StudBudCloud] Could not finish signing out:', error);
                        this.showAuth();
                        this.setAuthStatus('Signed out, but this device could not clear its saved data. Reload before another person signs in.', true);
                    });
                    return;
                }
                if (session?.user && ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
                    window.setTimeout(() => this.openAccount(session.user).catch(error => this.reportAccountError(error)), 0);
                }
            });
            this.authSubscription = authListener.subscription;
            const { data, error } = await this.client.auth.getSession();
            if (error) throw error;
            if (data.session) await this.openAccount(data.session.user);
        }

        bindAuthUI() {
            document.getElementById('auth-switch-btn')?.addEventListener('click', () => this.setAuthMode(this.authMode === 'login' ? 'signup' : 'login'));
            document.getElementById('login-form')?.addEventListener('submit', event => this.handleLogin(event));
            document.getElementById('signup-form')?.addEventListener('submit', event => this.handleSignup(event));
            document.getElementById('sign-out-btn')?.addEventListener('click', () => this.signOut());
        }

        showAuth() {
            document.getElementById('app-container')?.classList.add('hidden');
            document.getElementById('auth-screen')?.classList.remove('hidden');
        }

        setConfigError(message) {
            const notice = document.getElementById('auth-config-message');
            if (notice) {
                notice.textContent = message;
                notice.classList.remove('hidden');
            }
            document.querySelectorAll('#login-form button, #signup-form button').forEach(button => { button.disabled = true; });
            document.getElementById('auth-switch-btn')?.setAttribute('disabled', 'true');
        }

        setAuthMode(mode) {
            this.authMode = mode;
            const signup = mode === 'signup';
            document.getElementById('login-form')?.classList.toggle('hidden', signup);
            document.getElementById('signup-form')?.classList.toggle('hidden', !signup);
            document.getElementById('auth-title').textContent = signup ? 'Create your StudBud account' : 'Sign in to StudBud';
            document.getElementById('auth-description').textContent = signup
                ? 'Create an account to keep your school data and preferences in sync.'
                : 'Your classes, assignments, study history, and preferences sync to your account.';
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

        usernameEmail(username) {
            const normalized = String(username || '').trim().toLowerCase();
            if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
                throw new Error('Username must be 3–24 characters and contain only letters, numbers, or underscores.');
            }
            return `${normalized}@accounts.studbud.invalid`;
        }

        async handleLogin(event) {
            event.preventDefault();
            this.setAuthStatus('Signing in…');
            try {
                const { data, error } = await this.client.auth.signInWithPassword({
                    email: this.usernameEmail(document.getElementById('login-username').value),
                    password: document.getElementById('login-password').value
                });
                if (error) throw error;
                await this.openAccount(data.user);
            } catch (error) {
                console.error('[StudBudCloud] Sign-in failed:', error);
                this.setAuthStatus(this.friendlyAuthError(error, 'Could not sign in. Check your username and password, then try again.'), true);
            }
        }

        async handleSignup(event) {
            event.preventDefault();
            const username = document.getElementById('signup-username').value.trim().toLowerCase();
            const password = document.getElementById('signup-password').value;
            const school = document.getElementById('signup-school').value;
            try {
                this.usernameEmail(username);
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
            if (!['pchs', 'other'].includes(school)) {
                this.setAuthStatus('Choose your school to create an account.', true);
                return;
            }
            this.setAuthStatus('Creating your account…');
            try {
                const { data, error } = await this.client.auth.signUp({
                    email: this.usernameEmail(username),
                    password,
                    options: { data: { username, school } }
                });
                if (error) throw error;
                if (!data.session) {
                    this.setAuthStatus('Account created, but Supabase did not sign you in. Check that email confirmations are disabled in Supabase Auth.', true);
                    return;
                }
                await this.openAccount(data.user);
            } catch (error) {
                console.error('[StudBudCloud] Sign-up failed:', error);
                this.setAuthStatus(this.friendlyAuthError(error, 'Could not create your account. Check your details and try again.'), true);
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
            const savedBase = previousAccount === user.id ? localStorage.getItem('STUDBUD_CLOUD_SYNC_BASE') : null;
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
                    const merged = StudBudCloudSync.mergeData(JSON.parse(savedBase), local, remoteSnapshot);
                    await window.NexusApp.restoreCloudSnapshot(merged);
                    this.initialSnapshot = remoteSnapshot;
                } catch (mergeError) {
                    this.pendingConflict = { user, remoteSnapshot, local, savedBase };
                    throw mergeError;
                }
            }

            if (version !== this.accountVersion) return;
            localStorage.setItem('STUDBUD_CLOUD_ACCOUNT_ID', user.id);
            const username = user.user_metadata?.username || user.email;
            const accountName = document.getElementById('account-name');
            if (accountName) accountName.textContent = username;
            this.bindStateEvents();
            await window.NexusApp.recoverOwnedCommunityDecks();
            if (version !== this.accountVersion) return;
            this.accountReady = true;
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('app-container')?.classList.remove('hidden');
            this.setCloudStatus(this.initialSnapshot ? 'Synced to your account.' : 'Saving your account data…');
            this.queueSync();
            window.NexusApp?.refreshAdminAccess?.();
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
                    <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:8px;">
                        <button type="button" class="secondary-btn" id="auth-conflict-cloud-btn">Use Cloud Data</button>
                        <button type="button" class="secondary-btn" id="auth-conflict-local-btn">Keep Device Data</button>
                        <button type="button" class="text-btn" id="auth-conflict-backup-btn">Export Local Backup</button>
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
            document.getElementById('auth-conflict-backup-btn')?.addEventListener('click', () => {
                try {
                    const blob = new Blob([JSON.stringify(conflict.local, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `studbud-backup-conflict-${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (err) {
                    console.error('Could not export backup:', err);
                }
            });
        }

        friendlyAuthError(error, fallback) {
            const message = String(error?.message || '');
            if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
                return 'Could not reach the account server. Check your internet connection and try again.';
            }
            if (/invalid login credentials|invalid email or password/i.test(message)) {
                return 'That username or password was not recognized. Check your details and try again.';
            }
            if (/already registered|user already exists/i.test(message)) {
                return 'An account with that username already exists. Try signing in instead.';
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
            window.addEventListener('online', () => this.queueSync());
        }

        queueSync() {
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
            if (!this.accountReady || !this.user) return;
            if (this.syncPromise) return this.syncPromise;
            const userId = this.user.id;
            const version = this.accountVersion;
            let completedRevision = -1;
            this.syncPromise = (async () => {
                do {
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
                this.setCloudStatus(`Synced to your account · ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
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
            await Promise.all(['flashcards', 'studyHistory', 'gameMetrics'].map(store => window.NexusApp.clearLocalStore(store)));
        }

        async signOut() {
            if (!window.confirm('Sign out of StudBud on this device? Your synced account data will remain in the cloud.')) return;
            try { await this.syncNow(); }
            catch (error) {
                console.error('[StudBudCloud] Could not save before sign-out:', error);
                this.setCloudStatus(this.friendlyAuthError(error, 'Save failed. Please export a backup before signing out.'), true);
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
