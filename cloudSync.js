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
                this.setAuthStatus(error.message || 'Could not sign in. Check your credentials and try again.', true);
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
                this.setAuthStatus(error.message || 'Could not create your account.', true);
            }
        }

        async openAccount(user) {
            this.user = user;
            this.setAuthStatus('');
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('app-container')?.classList.remove('hidden');

            const { data: row, error } = await this.client
                .from('studbud_user_data')
                .select('data')
                .eq('user_id', user.id)
                .maybeSingle();
            if (error) {
                this.showAuth();
                throw new Error(`Could not load your cloud data: ${error.message}`);
            }
            this.initialSnapshot = row?.data || null;
            if (!this.appStarted) {
                await window.NexusApp.init();
                this.appStarted = true;
            } else if (this.initialSnapshot) {
                await window.NexusApp.restoreCloudSnapshot(this.initialSnapshot);
            }
            const username = user.user_metadata?.username || user.email;
            const accountName = document.getElementById('account-name');
            if (accountName) accountName.textContent = username;
            this.bindStateEvents();
            this.setCloudStatus('Synced to your account.');
            this.queueSync();
        }

        bindStateEvents() {
            const syncEvents = ['state:changed', 'state:restored', 'courses:updated', 'assignments:updated', 'flashcards:updated', 'study:recorded', 'metrics:updated'];
            syncEvents.forEach(eventName => window.NexusApp.EventBus.on(eventName, () => this.queueSync()));
        }

        queueSync() {
            if (!this.user || !window.NexusApp?.AppState) return;
            window.clearTimeout(this.syncTimer);
            this.setCloudStatus('Syncing to your account…');
            this.syncTimer = window.setTimeout(() => {
                this.syncNow().catch(error => {
                    console.error('[StudBudCloud] Cloud sync failed:', error);
                    this.setCloudStatus(`Cloud sync failed: ${error.message}`, true);
                });
            }, 350);
        }

        async syncNow() {
            if (!this.user) return;
            const backup = JSON.parse(await window.NexusApp.AppState.exportAppState());
            const { error } = await this.client.from('studbud_user_data').upsert({
                user_id: this.user.id,
                data: backup,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
            if (error) throw new Error(error.message);
            this.setCloudStatus(`Synced to your account · ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
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
                this.setCloudStatus(`Could not sign out: ${error.message}`, true);
                return;
            }
            this.user = null;
            window.clearTimeout(this.syncTimer);
            try {
                await this.clearDeviceCache();
            } catch (clearError) {
                console.error('[StudBudCloud] Could not clear signed-out device cache:', clearError);
                this.showAuth();
                this.setAuthStatus(`Signed out, but could not clear this device's cache: ${clearError.message}`, true);
                return;
            }
            window.location.reload();
        }
    }

    window.StudBudCloud = new StudBudCloudSync();
})(window);
