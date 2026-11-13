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
        assignments: [{ id: 'private-assignment', title: 'Sensitive assignment title' }],
        settings: { theme: 'dark', gameGraphics: 'performance', shareSchoolCourses: true }
    },
    flashcards: [{ id: 'deck-1', cards: [{ front: 'private question', back: 'private answer' }] }],
    studyHistory: [{ id: 'study-1', answer: 'private response' }]
};

(async () => {
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
    console.log('Encrypted account snapshots round-trip; private content is opaque, projection is limited, and bad credentials/tampering are rejected.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
