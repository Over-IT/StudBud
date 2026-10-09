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
            this.setAuthStatus('Creating your account…');
            try {
                const { data, error } = await this.client.auth.signUp({
                    email: this.usernameEmail(username),
                    password,
                    options: { data: { username } }
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

            this.initialSnapshot = row?.data || null;
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

            localStorage.setItem('STUDBUD_CLOUD_ACCOUNT_ID', user.id);
            const username = user.user_metadata?.username || user.email;
            const accountName = document.getElementById('account-name');
            if (accountName) accountName.textContent = username;
            this.bindStateEvents();
            this.accountReady = true;
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('app-container')?.classList.remove('hidden');
            this.setCloudStatus(this.initialSnapshot ? 'Synced to your account.' : 'Saving your account data…');
            this.queueSync();
            window.NexusApp?.refreshAdminAccess?.();
        }

        reportAccountError(error) {
            console.error('[StudBudCloud] Could not open account:', error);
            this.user = null;
            this.accountReady = false;
            this.showAuth();
            this.setAuthStatus(this.friendlyAuthError(error, 'Could not load your account data. Check your connection and try again.'), true);
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
        }

        queueSync() {
            if (!this.accountReady || !this.user || !window.NexusApp?.AppState) return;
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
                    const { error } = await this.client.from('studbud_user_data').upsert({
                        user_id: userId,
                        data: backup,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });
                    if (error) throw new Error(error.message);
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
            await Promise.all(['flashcards', 'studyHistory', 'gameMetrics'].map(store => window.NexusApp.clearLocalStore(store)));
        }

        async signOut() {
            if (!window.confirm('Sign out of StudBud on this device? Your synced account data will remain in the cloud.')) return;
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
