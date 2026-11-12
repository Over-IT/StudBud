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
        settings: { theme: 'dark', gameGraphics: 'performance' }
    },
    flashcards: [{ id: 'deck-1', cards: [{ front: 'private question', back: 'private answer' }] }],
    studyHistory: [{ id: 'study-1', answer: 'private response' }]
};

(async () => {
    await cloud.unlockAccountData(user, password, null);
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
    console.log('Encrypted account snapshots round-trip; private content is opaque, projection is limited, and bad credentials/tampering are rejected.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
