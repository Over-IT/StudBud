const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextDecoder, TextEncoder } = require('node:util');

const sandbox = {
    console,
    crypto: webcrypto,
    TextDecoder,
    TextEncoder,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { onLine: true },
    setTimeout,
    clearTimeout
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'cloudSync.js'), 'utf8'), sandbox);

const cloud = sandbox.StudBudCloud;
const user = { id: 'account-uuid-1', user_metadata: { school: 'pchs' } };
const password = 'correct horse battery';
const privateSnapshot = {
    state: {
        profile: { school: 'pchs', firstName: 'Private', lastName: 'Student', graduationYear: 2028 },
        courses: [{ code: 'BIO101', catalogCode: 'BIO101', title: 'Biology', term: 'FY', school: 'pchs' }],
        schedule: { all: { 1: 'BIO101' }, meetings: [{ courseCode: 'BIO101', start: '08:05', end: '09:10', pattern: 'all', period: '1' }] },
        assignments: [{ id: 'private-assignment', title: 'Sensitive assignment title' }],
        settings: { theme: 'dark', gameGraphics: 'performance', shareSchoolCourses: true }
    },
    flashcards: [{ id: 'deck-1', cards: [{ front: 'private question', back: 'private answer' }] }],
    studyHistory: [{ id: 'study-1', answer: 'private response' }]
};

(async () => {
    const authCredential = await cloud.deriveAuthCredential(password);
    assert.equal(authCredential, await cloud.deriveAuthCredential(password));
    assert.notEqual(authCredential, await cloud.deriveAuthCredential('a different private password'));
    assert.equal(authCredential.length, 48);
    assert.ok(!authCredential.includes(password));
    const authRequests = [];
    const legacyClient = { auth: { signInWithPassword: async credentials => {
        authRequests.push(credentials);
        return credentials.password === password ? { data: { user } } : { error: { code: 'invalid_credentials' } };
    } } };
    const legacySignIn = await cloud.signInCredentials(legacyClient, 'student', password, { allowLegacy: true });
    assert.equal(legacySignIn.legacy, true);
    assert.deepEqual(authRequests.map(request => request.password), [authCredential, password],
        'legacy compatibility sends the original password only after the private credential is rejected');
    authRequests.length = 0;
    await cloud.signInCredentials(legacyClient, 'student', password);
    assert.deepEqual(authRequests.map(request => request.password), [authCredential],
        'private sign-in never silently retries with the original password without explicit compatibility consent');
    let attempts = 0;
    await cloud.signInCredentials({ auth: { signInWithPassword: async () => { attempts++; return { error: { message: 'Network unavailable' } }; } } }, 'student', password, { allowLegacy: true });
    assert.equal(attempts, 1, 'network/server errors do not trigger a plaintext-password retry');
    const renamedRequests = [];
    const privateClient = { auth: { signInWithPassword: async credentials => {
        renamedRequests.push(credentials); return { data: { user } };
    } } };
    await cloud.signInCredentials(privateClient, 'before_rename', password);
    await cloud.signInCredentials(privateClient, 'after_rename', password);
    assert.equal(renamedRequests[0].password, renamedRequests[1].password,
        'username changes keep working without changing the authentication or encryption password');
    assert.notEqual(renamedRequests[0].email, renamedRequests[1].email);
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(`${user.id}|${password}|studbud-zk-account-v1`));
    const passphrase = Buffer.from(digest).toString('base64');
    const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const legacyKey = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
        material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, legacyKey,
        new TextEncoder().encode(JSON.stringify(privateSnapshot)));
    const legacy = { zk: { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2', hash: 'SHA-256', iter: 150000,
        salt: Buffer.from(salt).toString('base64'), iv: Buffer.from(iv).toString('base64'),
        ct: Buffer.from(ciphertext).toString('base64') } };
    await assert.rejects(cloud.unlockAccountData(user, 'wrong password', legacy), error => error.code === 'STUDBUD_BAD_DATA_PASSWORD');
    const legacySnapshot = await cloud.unlockAccountData(user, password, legacy);
    assert.equal(legacySnapshot.state.assignments[0].title, 'Sensitive assignment title', 'legacy accounts unlock without data loss');
    assert.equal((await cloud.decryptAccountData(legacy, user.id)).state.assignments[0].id, 'private-assignment',
        'sync can re-read the legacy envelope before migrating it');
    const migrated = await cloud.encryptAccountData(legacySnapshot, user.id);
    assert.equal(migrated.encryption.format, 'studbud-aes-gcm');
    assert.equal((await cloud.decryptAccountData(migrated, user.id)).state.assignments[0].id, 'private-assignment');
    await assert.rejects(cloud.unlockAccountData(user, password, { zk: { v: 99 } }), /unsupported encryption format/i);

    await cloud.unlockAccountData(user, password, null);
    sandbox.STUDBUD_SCHOOLS = { catalog: () => [{ code: 'BIO101', title: 'Biology' }] };
    const encrypted = await cloud.encryptAccountData(privateSnapshot, user.id);
    assert.equal(encrypted.encryption.format, 'studbud-aes-gcm');
    assert.equal(encrypted.encryption.version, 1);
    assert.equal(encrypted.encryption.kdf, 'PBKDF2-SHA-256');
    assert.equal(encrypted.encryption.iterations, 600000);
    assert.equal(encrypted.encryption.iv.length > 0, true);
    assert.equal(typeof encrypted.ciphertext, 'string');
    assert.notEqual(encrypted.ciphertext, JSON.stringify(privateSnapshot));
    assert.deepEqual(JSON.parse(JSON.stringify(encrypted.state.profile)), { school: 'pchs' });
    assert.deepEqual(JSON.parse(JSON.stringify(encrypted.state.courses)), [{
        code: 'BIO101', catalogCode: 'BIO101', title: 'Biology', term: 'FY', school: 'pchs'
    }]);
    assert.deepEqual(JSON.parse(JSON.stringify(encrypted.flashcards)), [{ id: 'deck-1', communityDeckId: '', communitySourceId: '' }]);
    assert.equal(JSON.stringify(encrypted).includes('Sensitive assignment title'), false);
    assert.equal(JSON.stringify(encrypted).includes('private question'), false);
    assert.equal(JSON.stringify(encrypted).includes('private response'), false);
    assert.equal(JSON.stringify(encrypted).includes('08:05'), false, 'schedule times never enter the readable sync projection');
    assert.equal(Object.hasOwn(encrypted.state, 'schedule'), false);
    const privateCourses = JSON.parse(JSON.stringify(privateSnapshot));
    delete privateCourses.state.settings.shareSchoolCourses;
    const defaultPrivate = await cloud.encryptAccountData(privateCourses, user.id);
    assert.equal(defaultPrivate.state.courses.length, 0, 'course index is off without explicit sharing consent');
    assert.equal((await cloud.decryptAccountData(defaultPrivate, user.id)).state.courses[0].title, 'Biology',
        'private course details are still available after decryption');
    const custom = JSON.parse(JSON.stringify(privateSnapshot));
    custom.state.courses[0].title = 'Private student name in edited title';
    custom.state.courses.push(
        { code: 'CUSTOM', title: 'Private custom class name', term: 'S1', school: 'pchs' },
        { code: 'OLD', title: 'Old school class', school: 'pwhs' });
    const limited = await cloud.encryptAccountData(custom, user.id);
    assert.deepEqual(JSON.parse(JSON.stringify(limited.state.courses)), [
        { code: 'BIO101', catalogCode: 'BIO101', title: 'Biology', term: 'FY', school: 'pchs' },
        { code: 'CUSTOM', catalogCode: '', title: '', term: 'S1', school: 'pchs' }
    ], 'index uses only public catalog titles and excludes courses from another school');
    assert.equal(JSON.stringify(limited).includes('Private'), false);
    assert.equal((await cloud.decryptAccountData(limited, user.id)).state.courses[0].title, custom.state.courses[0].title,
        'private titles remain intact inside encryption');
    custom.state.profile.school = 'other';
    const other = await cloud.encryptAccountData(custom, user.id);
    assert.equal(other.state.courses.length, 0, 'unsupported schools do not need a readable course index');
    assert.equal((await cloud.decryptAccountData(other, user.id)).state.courses.length, 3,
        'omitting the public index never deletes private courses');

    const decrypted = await cloud.decryptAccountData(encrypted, user.id);
    assert.deepEqual(JSON.parse(JSON.stringify(decrypted)), {
        state: {
            profile: { school: 'pchs' },
            courses: privateSnapshot.state.courses,
            schedule: privateSnapshot.state.schedule,
            assignments: privateSnapshot.state.assignments,
            settings: privateSnapshot.state.settings
        },
        flashcards: privateSnapshot.flashcards,
        studyHistory: privateSnapshot.studyHistory
    });

    await assert.rejects(
        cloud.unlockAccountData(user, 'wrong password', encrypted),
        error => error.code === 'STUDBUD_BAD_DATA_PASSWORD'
    );
    await assert.rejects(cloud.unlockAccountData(user, authCredential, encrypted),
        error => error.code === 'STUDBUD_BAD_DATA_PASSWORD', 'the credential known to the auth provider cannot directly decrypt private snapshots');
    await assert.rejects(
        cloud.unlockAccountData({ id: 'account-uuid-2' }, password, encrypted),
        error => error.code === 'STUDBUD_BAD_DATA_PASSWORD'
    );

    await cloud.unlockAccountData(user, password, encrypted);
    const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -4)}AAAA` };
    await assert.rejects(
        cloud.decryptAccountData(tampered, user.id),
        error => error.code === 'STUDBUD_BAD_DATA_PASSWORD'
    );

    const firstIv = encrypted.encryption.iv;
    await cloud.unlockAccountData(user, password, encrypted);
    const second = await cloud.encryptAccountData(privateSnapshot, user.id);
    assert.notEqual(second.encryption.iv, firstIv, 'each save uses a fresh AES-GCM nonce');

    const syncStorage = new Map();
    sandbox.localStorage.getItem = key => syncStorage.get(key) || null;
    sandbox.localStorage.setItem = (key, value) => syncStorage.set(key, value);
    sandbox.localStorage.removeItem = key => syncStorage.delete(key);
    await cloud.saveSyncBase(privateSnapshot, user.id);
    const savedBase = syncStorage.get('STUDBUD_CLOUD_SYNC_BASE');
    assert.ok(!savedBase.includes('Sensitive assignment title') && !savedBase.includes('BIO101'), 'the local sync baseline contains no readable private data or course index');
    assert.equal(JSON.parse(savedBase).format, 'studbud-encrypted-sync-base');
    assert.equal((await cloud.readSyncBase(user.id)).state.assignments[0].title, 'Sensitive assignment title');
    await assert.rejects(cloud.readSyncBase('another-account'), /different account/);
    syncStorage.set('STUDBUD_CLOUD_SYNC_BASE', JSON.stringify(privateSnapshot));
    await cloud.readSyncBase(user.id);
    assert.ok(!syncStorage.get('STUDBUD_CLOUD_SYNC_BASE').includes('Sensitive assignment title'), 'legacy plaintext baselines migrate only after successful account unlock');

    const storedRows = [];
    cloud.accountReady = true;
    cloud.user = user;
    cloud.lastSnapshot = null;
    cloud.syncRevision = 1;
    cloud.client = {
        from(table) {
            assert.equal(table, 'studbud_user_data');
            const query = {
                select() { return this; },
                eq() { return this; },
                maybeSingle: async () => ({ data: null, error: null }),
                insert(row) { this.row = row; return this; },
                then(resolve) {
                    storedRows.push(this.row);
                    resolve({ data: [{ user_id: user.id }], error: null });
                }
            };
            return query;
        }
    };
    sandbox.NexusApp = {
        AppState: {
            exportAppState: async () => JSON.stringify(privateSnapshot),
            setSaveStatus() {}
        }
    };
    await cloud.syncNow();
    assert.equal(storedRows.length, 1);
    assert.equal(cloud.isEncryptedData(storedRows[0].data), true, 'sync writes an encrypted envelope, not the clear snapshot');
    assert.equal(JSON.stringify(storedRows[0]).includes('Sensitive assignment title'), false);
    assert.deepEqual(JSON.parse(JSON.stringify(await cloud.decryptAccountData(storedRows[0].data, user.id))),
        JSON.parse(JSON.stringify(cloud.sanitizeSnapshot(privateSnapshot))));
    cloud.lastSnapshot = legacySnapshot;
    cloud.syncRevision++;
    cloud.client = { from: () => ({
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: { data: legacy, updated_at: '2026-01-01T00:00:00.000Z' }, error: null }),
        update(row) { this.row = row; return this; },
        then(resolve) { storedRows.push(this.row); resolve({ data: [{ user_id: user.id }], error: null }); }
    }) };
    await cloud.syncNow();
    assert.equal(storedRows[1].data.encryption.format, 'studbud-aes-gcm', 'sync migrates an existing legacy envelope');
    assert.equal((await cloud.decryptAccountData(storedRows[1].data, user.id)).state.assignments[0].id, 'private-assignment');
    let remoteData = storedRows[1].data, remoteReads = 0, remoteWrites = 0, restores = 0;
    let localSnapshot = JSON.parse(JSON.stringify(cloud.lastSnapshot));
    sandbox.NexusApp.AppState.exportAppState = async () => JSON.stringify({ ...localSnapshot, exportedAt: new Date().toISOString() });
    sandbox.NexusApp.restoreCloudSnapshot = async data => { restores++; localSnapshot = JSON.parse(JSON.stringify(data)); };
    cloud.client = { from: () => ({
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => { remoteReads++; return { data: { data: remoteData, updated_at: '2026-01-02T00:00:00.000Z' } }; },
        update(row) { remoteWrites++; remoteData = row.data; return this; },
        then(resolve) { resolve({ data: [{ user_id: user.id }] }); }
    }) };
    await cloud.syncNow();
    await cloud.syncNow();
    assert.equal(remoteReads, 2, 'idle synchronization still checks for remote updates');
    assert.equal(remoteWrites, 0, 'unchanged encrypted snapshots are not reuploaded because export timestamps changed');
    const changedRemote = JSON.parse(JSON.stringify(localSnapshot));
    changedRemote.state.assignments[0].notes = 'An independent remote edit';
    remoteData = await cloud.encryptAccountData(changedRemote, user.id);
    const previousBase = syncStorage.get('STUDBUD_CLOUD_SYNC_BASE');
    const previousSnapshot = cloud.lastSnapshot;
    const restoreSnapshot = sandbox.NexusApp.restoreCloudSnapshot;
    sandbox.NexusApp.restoreCloudSnapshot = async () => { throw new Error('Device write failed'); };
    await assert.rejects(cloud.syncNow(), /Device write failed/);
    assert.equal(syncStorage.get('STUDBUD_CLOUD_SYNC_BASE'), previousBase, 'a failed remote restore does not acknowledge unapplied cloud changes');
    assert.equal(cloud.lastSnapshot, previousSnapshot);
    assert.equal(cloud.restoringSnapshot, false);
    sandbox.NexusApp.restoreCloudSnapshot = restoreSnapshot;
    await cloud.syncNow();
    assert.equal(restores, 1, 'a remote-only edit is applied even when this device made no changes');
    assert.equal(localSnapshot.state.assignments[0].notes, 'An independent remote edit');
    assert.equal(remoteWrites, 0, 'a remote-only edit does not need another cloud write');
    localSnapshot.state.assignments[0].notes = 'A new local edit';
    cloud.syncRevision++;
    await cloud.syncNow();
    assert.equal(remoteWrites, 1, 'genuine local changes still upload');
    const backupSnapshot = { version: '1.0.0', ...privateSnapshot };
    const keyBeforeBackup = cloud.encryptionKey;
    const encryptedBackup = await cloud.encryptBackup(backupSnapshot, 'a separate backup passphrase');
    assert.equal(encryptedBackup.format, 'studbud-encrypted-backup');
    assert.equal(Object.hasOwn(encryptedBackup, 'state'), false, 'backups contain no readable school/course index');
    assert.equal(Object.hasOwn(encryptedBackup, 'flashcards'), false, 'backups contain no readable set identifiers');
    assert.ok(!JSON.stringify(encryptedBackup).includes('BIO101'));
    const restoredBackup = await cloud.decryptBackup(encryptedBackup, 'a separate backup passphrase');
    assert.deepEqual(JSON.parse(JSON.stringify(restoredBackup)), JSON.parse(JSON.stringify(cloud.sanitizeSnapshot(backupSnapshot))));
    assert.equal(cloud.encryptionKey, keyBeforeBackup, 'backup operations never replace the signed-in account key');
    assert.equal(cloud.encryptionUserId, user.id);
    await assert.rejects(cloud.encryptBackup(backupSnapshot, 'short'), /12 characters/);
    await assert.rejects(cloud.decryptBackup(encryptedBackup, 'wrong backup passphrase'), /did not unlock/);
    await assert.rejects(cloud.decryptBackup({ ...encryptedBackup, id: webcrypto.randomUUID() }, 'a separate backup passphrase'), /did not unlock/);
    await assert.rejects(cloud.decryptBackup({ ...encryptedBackup, ciphertext: encryptedBackup.ciphertext.slice(0, -4) + 'AAAA' }, 'a separate backup passphrase'), /did not unlock/);
    await assert.rejects(cloud.decryptBackup(backupSnapshot, 'a separate backup passphrase'), /supported encrypted/);
    await assert.rejects(cloud.decryptBackup({ ...backupSnapshot, format: encryptedBackup.format, id: encryptedBackup.id, version: 1 }, 'a separate backup passphrase'),
        /supported encrypted/, 'a renamed plaintext snapshot cannot bypass authenticated decryption');

    syncStorage.clear();
    {
        let remembered = null, writes = 0, assurance = 'aal1', requiresMfa = false, credentialUpdates = 0;
        const nodes = new Map();
        sandbox.document = { getElementById: id => {
            if (!nodes.has(id)) nodes.set(id, { value: '', classList: { add() {}, remove() {}, toggle() {} } });
            return nodes.get(id);
        } };
        sandbox.NexusApp = {
            init: async () => {}, recoverOwnedCommunityDecks: async () => {}, resetForCloudAccount: async () => {},
            readDeviceUnlock: async () => remembered && structuredClone(remembered),
            saveDeviceUnlock: async record => { remembered = structuredClone(record); writes++; },
            clearLocalStore: async store => { assert.equal(store, 'deviceAuth'); remembered = null; }
        };
        function device() {
            const instance = new cloud.constructor();
            instance.prompts = [];
            instance.showAuth = instance.setAuthStatus = instance.queueSync = instance.bindStateEvents = instance.updateOfflineNotice = () => {};
            instance.endGuestSession = instance.refreshLegacyMfaSettings = async () => {};
            instance.showDataSignIn = (_user, message) => instance.prompts.push(message || 'Password required');
            instance.showMfaLoginPrompt = (value, secret) => {
                instance.mfaPendingUser = value; instance.mfaPendingPassword = secret;
                instance.prompts.push('Authenticator required');
            };
            instance.client = {
                from: () => ({ select() { return this; }, eq() { return this; },
                    maybeSingle: async () => ({ data: { data: encrypted } }) }),
                auth: { updateUser: async request => {
                    credentialUpdates++;
                    assert.equal(request.password, authCredential);
                    assert.equal(request.data.auth_credential_version, 1);
                    return {};
                }, mfa: {
                    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: assurance, nextLevel: requiresMfa ? 'aal2' : 'aal1' } }),
                    listFactors: async () => ({ data: { totp: [{ id: 'authenticator', status: 'verified' }] } }),
                    challengeAndVerify: async ({ code }) => { assert.equal(code, '123456'); assurance = 'aal2'; return {}; }
                } }
            };
            return instance;
        }
        const first = device();
        first.rememberDeviceRequested = true;
        await first.routeAuthenticatedUser(user, password);
        assert.equal(first.accountReady, true);
        assert.equal(remembered.userId, user.id);
        assert.equal(remembered.expiresAt - remembered.createdAt, 30 * 24 * 60 * 60 * 1000);
        assert.equal(JSON.stringify(remembered).includes(password), false);
        assert.equal(remembered.key.extractable, false);
        await assert.rejects(webcrypto.subtle.exportKey('raw', remembered.key));
        await assert.rejects(webcrypto.subtle.exportKey('raw', remembered.legacyMaterial));
        const saved = structuredClone(remembered);
        const reloaded = device();
        await reloaded.routeAuthenticatedUser(user);
        assert.equal(reloaded.accountReady, true, 'a new instance decrypts the account with the remembered key and no password');
        assert.equal(reloaded.initialSnapshot.flashcards[0].cards[0].back, 'private answer');
        assert.equal(reloaded.prompts.length, 0);
        assert.equal(writes, 1, 'reload never renews the fixed remembered-device period');
        assert.equal(remembered.expiresAt, saved.expiresAt);

        requiresMfa = true;
        const protectedDevice = device();
        await protectedDevice.routeAuthenticatedUser(user);
        assert.equal(protectedDevice.accountReady, false, 'a remembered key never bypasses server-required MFA');
        assert.equal(protectedDevice.mfaPendingPassword, '', 'restored-device MFA does not need a stored password');
        assert.deepEqual(protectedDevice.prompts, ['Authenticator required']);
        sandbox.document.getElementById('mfa-login-code').value = '123456';
        await protectedDevice.verifyMfaLogin({ preventDefault() {} });
        assert.equal(protectedDevice.accountReady, true, 'passwordless restore completes after a valid authenticator challenge');
        assert.equal(protectedDevice.mfaPendingUser, null);
        assurance = 'aal1';
        const upgrading = device();
        upgrading.pendingCredentialUpgrade = { userId: user.id, credential: authCredential };
        await upgrading.routeAuthenticatedUser(user, password);
        assert.equal(credentialUpdates, 0, 'legacy authentication is not upgraded before MFA succeeds');
        sandbox.document.getElementById('mfa-login-code').value = '123456';
        await upgrading.verifyMfaLogin({ preventDefault() {} });
        assert.equal(upgrading.accountReady, true);
        assert.equal(credentialUpdates, 1);
        assert.equal(upgrading.pendingCredentialUpgrade, null);
        assurance = 'aal1';
        requiresMfa = false;
        const upgradeFailure = device();
        upgradeFailure.pendingCredentialUpgrade = { userId: user.id, credential: authCredential };
        upgradeFailure.client.auth.updateUser = async () => ({ error: new Error('Upgrade unavailable') });
        await upgradeFailure.routeAuthenticatedUser(user, password);
        assert.equal(upgradeFailure.accountReady, true, 'a failed privacy upgrade does not remove existing account functionality');
        assert.match(upgradeFailure.authPrivacyWarning, /upgrade could not finish/);
        assert.match(sandbox.document.getElementById('account-privacy-notice').textContent, /study data is still encrypted/);

        remembered = { ...saved, expiresAt: Date.now() - 1, createdAt: Date.now() - 1 - 30 * 24 * 60 * 60 * 1000 };
        const expired = device();
        await expired.routeAuthenticatedUser(user);
        assert.equal(expired.accountReady, false);
        assert.equal(remembered, null, 'expired unlock keys are deleted');
        assert.deepEqual(expired.prompts, ['Password required']);
        remembered = { ...saved, userId: 'another-account' };
        const wrongAccount = device();
        await wrongAccount.routeAuthenticatedUser(user);
        assert.equal(wrongAccount.accountReady, false);
        assert.equal(wrongAccount.encryptionKey, null, 'keys cannot be restored for a different account');
        assert.equal(remembered, null);

        remembered = structuredClone(saved);
        const optedOut = device();
        optedOut.rememberDeviceRequested = false;
        await optedOut.routeAuthenticatedUser(user, password);
        assert.equal(optedOut.accountReady, true);
        assert.equal(remembered, null, 'signing in without remembering removes a previous remembered unlock');
        const privateReload = device();
        await privateReload.routeAuthenticatedUser(user);
        assert.equal(privateReload.accountReady, false);
        assert.deepEqual(privateReload.prompts, ['Password required']);

        remembered = structuredClone(saved);
        await reloaded.handleSignedOut();
        assert.equal(remembered, null, 'sign-out clears persisted keys');
        assert.equal(reloaded.encryptionKey, null);
        assert.equal(reloaded.encryptionUserId, null);
        remembered = structuredClone(saved);
        await first.clearDeviceCache();
        assert.equal(remembered, null, 'clearing device data removes the saved unlock');
        const readDeviceUnlock = sandbox.NexusApp.readDeviceUnlock;
        for (const action of ['sign-out', 'offline']) {
            let finishRead;
            sandbox.NexusApp.readDeviceUnlock = () => new Promise(resolve => { finishRead = resolve; });
            const interrupted = device();
            const restoring = interrupted.routeAuthenticatedUser(user);
            if (action === 'sign-out') await interrupted.handleSignedOut();
            else interrupted.offlineMode = true;
            finishRead(structuredClone(saved));
            await restoring;
            assert.equal(interrupted.encryptionKey, null, `${action} cannot be undone by a pending device-key restore`);
            assert.equal(interrupted.accountReady, false);
        }
        sandbox.NexusApp.readDeviceUnlock = readDeviceUnlock;
        const storageError = device();
        sandbox.NexusApp.readDeviceUnlock = async () => { throw new Error('Storage unavailable'); };
        await storageError.routeAuthenticatedUser(user);
        assert.equal(storageError.accountReady, false);
        assert.match(storageError.prompts[0], /could not restore/);
        sandbox.NexusApp.saveDeviceUnlock = async () => { throw new Error('Storage unavailable'); };
        storageError.rememberDeviceRequested = true;
        await assert.rejects(storageError.routeAuthenticatedUser(user, password), /Could not save your remembered-device choice/);
        assert.equal(storageError.accountReady, false, 'a failed device write is reported instead of claiming the device is remembered');
    }
    console.log('Encrypted account snapshots, remembered-device reload/expiry/opt-out/cleanup, non-extractable keys, MFA and storage failures passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
