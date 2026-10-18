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
            this.emailSignIn = null;
            this.emailAuthBusy = false;
            this.pendingAccountEmail = null;
            this.emailLinkBusy = false;
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
                if (field === 'account' && (local.state?.gameMetrics?.resetId || '') === (remote.state?.gameMetrics?.resetId || '')
                    && local.state?.gameMetrics?.xp !== base?.state?.gameMetrics?.xp
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
            throw new Error(`Both devices changed ${field}. Choose which version to keep; neither version was overwritten.`);
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
            document.getElementById('email-signin-form')?.addEventListener('submit', event => this.handleEmailLogin(event));
            document.getElementById('email-login-form')?.addEventListener('submit', event => this.verifyEmailLogin(event));
            document.getElementById('email-login-resend')?.addEventListener('click', () => this.resendEmailLogin());
            document.getElementById('email-login-cancel')?.addEventListener('click', () => this.cancelEmailLogin());
            document.getElementById('email-link-form')?.addEventListener('submit', event => this.linkAccountEmail(event));
            document.getElementById('email-link-verify-form')?.addEventListener('submit', event => this.verifyAccountEmail(event));
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
            this.clearEmailLoginPrompt();
            this.offlineMode = true;
            localStorage.setItem('STUDBUD_LOCAL_MODE', 'true');
            this.initialSnapshot = null;
            this.user = null;
            this.accountReady = false;
            this.pendingAccountEmail = null;
            await this.refreshEmailSettings();
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
            if (this.emailAuthBusy || this.mfaPendingUser) return;
            this.authMode = mode;
            this.clearEmailLoginPrompt();
            const signup = mode === 'signup';
            document.getElementById('login-form')?.classList.toggle('hidden', signup);
            document.getElementById('signup-form')?.classList.toggle('hidden', !signup);
            document.getElementById('email-signin-options')?.classList.toggle('hidden', signup);
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
            if (this.accountReady && this.user?.id === user.id) {
                const emailChanged = this.user.email !== user.email;
                this.user = user;
                if (emailChanged) await this.refreshEmailSettings();
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
            ['login-form', 'signup-form', 'email-signin-options', 'email-login-prompt', 'auth-switch-prompt', 'auth-switch-btn', 'offline-start-btn', 'guest-start-hint', 'auth-divider', 'guest-join', 'auth-legal'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
            this.setAuthStatus('');
            document.getElementById('mfa-login-code')?.focus();
        }

        clearMfaLoginPrompt() {
            this.mfaPendingUser = null;
            document.getElementById('mfa-login-prompt')?.classList.add('hidden');
            document.getElementById('login-form')?.classList.toggle('hidden', this.authMode === 'signup');
            document.getElementById('signup-form')?.classList.toggle('hidden', this.authMode !== 'signup');
            document.getElementById('email-signin-options')?.classList.toggle('hidden', this.authMode === 'signup');
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

        emailAddress(value) {
            const email = String(value || '').trim().toLowerCase();
            if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@accounts.studbud.invalid')) {
                throw new Error('Enter a real email address where you can receive a sign-in code.');
            }
            return email;
        }

        setEmailAuthBusy(busy) {
            this.emailAuthBusy = busy;
            document.querySelectorAll('#login-form button, #signup-form button, #email-signin-form button, #email-login-prompt button, #auth-switch-btn, #offline-start-btn')
                .forEach(button => { button.disabled = busy; });
        }

        async handleEmailLogin(event) {
            event.preventDefault();
            if (this.emailAuthBusy) return;
            try {
                const email = this.emailAddress(document.getElementById('login-email').value);
                await this.sendEmailLogin({ email, options: { shouldCreateUser: false } });
            } catch (error) {
                this.setAuthStatus(this.friendlyAuthError(error, 'Could not send your sign-in code. Please try again.'), true);
            }
        }

        async handleLogin(event) {
            event.preventDefault();
            if (this.emailAuthBusy) return;
            this.setEmailAuthBusy(true);
            this.setAuthStatus('Signing in…');
            try {
                const identifier = document.getElementById('login-username').value.trim();
                const { data, error } = await this.client.auth.signInWithPassword({
                    email: identifier.includes('@') ? this.emailAddress(identifier) : this.usernameEmail(identifier),
                    password: document.getElementById('login-password').value
                });
                if (error) throw error;
                document.getElementById('login-password').value = '';
                await this.routeAuthenticatedUser(data.user || data.session?.user);
            } catch (error) {
                console.error('[StudBudCloud] Sign-in failed:', error);
                this.reportAccountError(error);
            } finally {
                this.setEmailAuthBusy(false);
            }
        }

        async handleSignup(event) {
            event.preventDefault();
            if (this.emailAuthBusy) return;
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
            this.setEmailAuthBusy(true);
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
                this.setEmailAuthBusy(false);
            }
        }

        async sendEmailLogin(request) {
            this.setEmailAuthBusy(true);
            this.setAuthStatus('Sending your email code...');
            try {
                const { error } = await this.client.auth.signInWithOtp(request);
                if (error) throw error;
                this.emailSignIn = { request, sentAt: Date.now() };
                document.getElementById('email-login-description').textContent = `Enter the code sent to ${request.email}. If it does not arrive, check spam and that you have an account with this email.`;
                document.getElementById('email-login-code').value = '';
                ['login-form', 'signup-form', 'email-signin-options', 'auth-switch-prompt', 'auth-switch-btn'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
                document.getElementById('email-login-prompt')?.classList.remove('hidden');
                this.setAuthStatus('Code requested. Keep this page open while you check your email.');
                document.getElementById('email-login-code')?.focus();
            } finally {
                this.setEmailAuthBusy(false);
            }
        }

        async resendEmailLogin() {
            if (!this.emailSignIn || this.emailAuthBusy) return;
            const wait = Math.ceil((60000 - (Date.now() - this.emailSignIn.sentAt)) / 1000);
            if (wait > 0) {
                this.setAuthStatus(`Wait ${wait} seconds before requesting another code.`);
                return;
            }
            try {
                await this.sendEmailLogin(this.emailSignIn.request);
            } catch (error) {
                this.setAuthStatus(this.friendlyAuthError(error, 'Could not resend the code. Please try again.'), true);
            }
        }

        clearEmailLoginPrompt() {
            this.emailSignIn = null;
            document.getElementById('email-login-prompt')?.classList.add('hidden');
            const code = document.getElementById('email-login-code');
            if (code) code.value = '';
            document.getElementById('login-form')?.classList.toggle('hidden', this.authMode === 'signup');
            document.getElementById('signup-form')?.classList.toggle('hidden', this.authMode !== 'signup');
            document.getElementById('email-signin-options')?.classList.toggle('hidden', this.authMode === 'signup');
            ['auth-switch-prompt', 'auth-switch-btn'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
        }

        cancelEmailLogin() {
            if (this.emailAuthBusy) return;
            this.clearEmailLoginPrompt();
            this.setAuthStatus('');
            const options = document.getElementById('email-signin-options');
            if (options) options.open = true;
            document.getElementById('login-email')?.focus();
        }

        async verifyEmailLogin(event) {
            event.preventDefault();
            if (!this.emailSignIn || this.emailAuthBusy) return;
            const token = document.getElementById('email-login-code')?.value.trim() || '';
            if (!/^[0-9]{6,10}$/.test(token)) {
                this.setAuthStatus('Enter the numeric code from your email.', true);
                return;
            }
            this.setEmailAuthBusy(true);
            this.setAuthStatus('Verifying your email code...');
            try {
                const { data, error } = await this.client.auth.verifyOtp({ email: this.emailSignIn.request.email, token, type: 'email' });
                if (error) throw error;
                if (!data.session?.user) throw new Error('Your email was not verified. Please request a new code.');
                this.clearEmailLoginPrompt();
                await this.routeAuthenticatedUser(data.session.user);
            } catch (error) {
                this.reportAccountError(error);
            } finally {
                this.setEmailAuthBusy(false);
            }
        }

        async refreshEmailSettings() {
            const card = document.getElementById('email-settings-card');
            const signedIn = Boolean(this.user?.id && !this.user.is_anonymous && !this.offlineMode);
            card?.classList.toggle('hidden', !signedIn);
            if (!signedIn) {
                document.getElementById('mfa-settings-card')?.classList.add('hidden');
                return;
            }
            const email = this.user.email || '';
            const legacy = !email || email.endsWith('@accounts.studbud.invalid');
            if (this.pendingAccountEmail === email.toLowerCase()) {
                this.pendingAccountEmail = null;
                document.getElementById('email-link-verify-form')?.classList.add('hidden');
                const code = document.getElementById('email-link-code');
                if (code) code.value = '';
                const message = document.getElementById('email-settings-message');
                if (message) message.textContent = 'Email verified. You can now sign in with email codes.';
            }
            const status = document.getElementById('email-settings-status');
            if (status) status.textContent = legacy
                ? 'No email is linked. You can keep signing in with your username and password, or optionally verify an email below.'
                : `Sign-in codes are sent to ${email}. Your email is not shown on your public profile.`;
            const input = document.getElementById('account-email');
            if (input && !this.pendingAccountEmail) input.value = legacy ? '' : email;
            await this.refreshLegacyMfaSettings();
        }

        async linkAccountEmail(event) {
            event.preventDefault();
            if (this.emailLinkBusy) return;
            const message = document.getElementById('email-settings-message');
            if (!this.user?.id || this.offlineMode) {
                if (message) message.textContent = 'Connect your account to verify an email.';
                return;
            }
            this.emailLinkBusy = true;
            const userId = this.user.id;
            const version = this.accountVersion;
            const button = document.getElementById('email-link-btn');
            if (button) button.disabled = true;
            try {
                const email = this.emailAddress(document.getElementById('account-email').value);
                if (email === this.user.email?.toLowerCase()) throw new Error('This email is already linked to your account.');
                message.textContent = 'Sending email verification...';
                const { error } = await this.client.auth.updateUser({ email });
                if (error) throw error;
                if (this.user?.id !== userId || this.accountVersion !== version || this.offlineMode) return;
                this.pendingAccountEmail = email;
                document.getElementById('email-link-code').value = '';
                document.getElementById('email-link-verify-form')?.classList.remove('hidden');
                message.textContent = `Enter the code sent to ${email}. If your server requires confirmation at both addresses, also confirm the message at your old address. For an old undeliverable username address, contact the site administrator to finish linking.`;
                document.getElementById('email-link-code')?.focus();
            } catch (error) {
                if (this.user?.id !== userId || this.accountVersion !== version) return;
                message.textContent = this.friendlyAuthError(error, 'Could not send email verification. Please try again.');
            } finally {
                this.emailLinkBusy = false;
                if (button) button.disabled = false;
            }
        }

        async verifyAccountEmail(event) {
            event.preventDefault();
            if (!this.pendingAccountEmail || this.emailLinkBusy) return;
            const message = document.getElementById('email-settings-message');
            if (!this.user?.id || this.offlineMode) {
                message.textContent = 'Connect your account to verify an email.';
                return;
            }
            const token = document.getElementById('email-link-code')?.value.trim() || '';
            if (!/^[0-9]{6,10}$/.test(token)) { message.textContent = 'Enter the numeric code from your email.'; return; }
            this.emailLinkBusy = true;
            const userId = this.user.id;
            const version = this.accountVersion;
            const email = this.pendingAccountEmail;
            try {
                const { data, error } = await this.client.auth.verifyOtp({ email, token, type: 'email_change' });
                if (error) throw error;
                if (this.user?.id !== userId || this.accountVersion !== version || this.offlineMode) return;
                if (data.user?.id !== userId || data.user.email?.toLowerCase() !== email) {
                    throw new Error('The email change is not finished. Confirm the message at your old address too. If it is an undeliverable username address, contact the site administrator.');
                }
                this.user = data.user;
                this.pendingAccountEmail = null;
                document.getElementById('email-link-code').value = '';
                document.getElementById('email-link-verify-form')?.classList.add('hidden');
                await this.refreshEmailSettings();
                message.textContent = 'Email verified. You can now sign in with email codes. Your account and saved data are unchanged.';
            } catch (error) {
                if (this.user?.id !== userId || this.accountVersion !== version) return;
                message.textContent = this.friendlyAuthError(error, 'Could not verify this email. Check the code and try again.');
            } finally {
                this.emailLinkBusy = false;
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
                    this.pendingConflict = { user, remoteSnapshot, local, savedBase };
                    throw mergeError;
                }
            }

            if (version !== this.accountVersion) return;
            localStorage.setItem('STUDBUD_CLOUD_ACCOUNT_ID', user.id);
            localStorage.removeItem('STUDBUD_LOCAL_ONLY_DATA');
            const username = user.user_metadata?.username || user.email;
            const accountName = document.getElementById('account-name');
            if (accountName) accountName.textContent = window.NexusApp?.multiplayerDisplayName?.() || username;
            this.bindStateEvents();
            await window.NexusApp.recoverOwnedCommunityDecks();
            if (version !== this.accountVersion) return;
            this.accountReady = true;
            this.offlineMode = false;
            this.clearEmailLoginPrompt();
            await this.refreshEmailSettings();
            localStorage.removeItem('STUDBUD_LOCAL_MODE');
            this.endGuestSession();
            this.updateOfflineNotice();
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('app-container')?.classList.remove('hidden');
            this.setCloudStatus(this.initialSnapshot ? 'Synced to your account.' : 'Saving your account data…');
            this.queueSync();
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
                    <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:8px;">
                        <button type="button" class="secondary-btn" id="auth-conflict-cloud-btn">Use Cloud Data</button>
                        <button type="button" class="secondary-btn" id="auth-conflict-local-btn">Keep Device Data</button>
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
                return 'Your username/email or password was not recognized. Check your details and try again.';
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
                return 'That email code is invalid or has expired. Check the latest email or request another code.';
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
            localStorage.removeItem('STUDBUD_LOCAL_ONLY_DATA');
            localStorage.removeItem('STUDBUD_LOCAL_MODE');
            await this.endGuestSession();
            await Promise.all(['flashcards', 'studyHistory', 'gameMetrics'].map(store => window.NexusApp.clearLocalStore(store)));
        }

        async signOut() {
            if (this.offlineMode) return this.connectOnline().catch(error => this.reportAccountError(error));
            if (!await window.StudBudDialogs.confirm('Sign out of StudBud on this device? Your synced account data will remain in the cloud.')) return;
            try { await this.syncNow(); }
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
            this.clearEmailLoginPrompt();
            this.pendingAccountEmail = null;
            document.getElementById('email-link-verify-form')?.classList.add('hidden');
            ['email-link-code', 'account-email', 'login-password'].forEach(id => {
                const input = document.getElementById(id);
                if (input) input.value = '';
            });
            ['email-settings-card', 'mfa-settings-card'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
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
