const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const read = (p) => fs.readFileSync(p, 'utf8');

const expectedPages = [
    'write-pseudocode', 'translate', 'execute', 'feedback',
    'exercises-student', 'student-settings', 'change-password',
    'analytics', 'manage-students', 'manage-exercises', 'generate-code',
    'compiler-metrics', 'password-recovery', 'manage-users',
    'password-requests', 'admin-execute', 'developer-options'
];

const expectedByRole = {
    admin: ['manage-users', 'password-requests', 'admin-execute', 'developer-options'],
    instructor: ['analytics', 'manage-exercises', 'generate-code', 'compiler-metrics', 'manage-students', 'password-recovery'],
    student: ['write-pseudocode', 'translate', 'execute', 'feedback', 'exercises-student', 'student-settings', 'change-password']
};

const expectedDefaults = {
    student: 'write-pseudocode',
    instructor: 'analytics',
    admin: 'manage-users'
};

test('constants module is bundled before every consumer', () => {
    const bundles = JSON.parse(read('src/bundles.json'));
    const list = bundles['app.js'];
    const constantsIdx = list.indexOf('src/app/constants.js');
    assert.ok(constantsIdx !== -1, 'constants.js not in the app bundle');
    assert.ok(constantsIdx < list.indexOf('src/app/navigation.js'), 'constants.js must load before navigation.js');
    assert.ok(constantsIdx < list.indexOf('src/app/authentication.js'), 'constants.js must load before authentication.js');
});

test('page constants preserve the historical access-control contract', () => {
    const constants = read('src/app/constants.js');
    for (const page of expectedPages) {
        assert.ok(constants.includes(`'${page}'`), `page id '${page}' missing from constants`);
    }
    for (const [role, pages] of Object.entries(expectedByRole)) {
        assert.ok(constants.includes(`${role}: [${pages.map(p => `'${p}'`).join(', ')}]`), `PAGES_BY_ROLE[${role}] drifted from the historical list`);
    }
});

test('duplicated role-page maps and labels are removed from consumers', () => {
    const auth = read('src/app/authentication.js');
    assert.ok(!auth.includes('adminPages = ['), 'checkAccess still inlines admin pages');
    assert.ok(!auth.includes('const roleLabelsForDisplay'), 'showApp still duplicates role labels');
    assert.ok(!auth.includes("const defaults = {"), 'showApp still duplicates default page map');
    assert.deepEqual(auth.match(/const ROLE_LABELS/g) || [], [], 'ROLE_LABELS must be defined once (constants.js)');
    assert.deepEqual(auth.match(/const ROLE_BADGES/g) || [], [], 'ROLE_BADGES must be defined once (constants.js)');

    const nav = read('src/app/navigation.js');
    assert.ok(!nav.includes('const defaults = {'), 'navigateTo still duplicates default page map');
    assert.ok(!nav.includes('const titles = {'), 'navigateTo still duplicates the title map');

    const constants = read('src/app/constants.js');
    assert.match(constants, /const ROLE_LABELS/, 'ROLE_LABELS missing from constants.js');
    assert.match(constants, /const ROLE_BADGES/, 'ROLE_BADGES missing from constants.js');
    assert.match(constants, /const PAGE_TITLES = \{/, 'PAGE_TITLES missing from constants.js');
    assert.match(constants, /const DEFAULT_PAGE_BY_ROLE = \{/, 'DEFAULT_PAGE_BY_ROLE missing from constants.js');
    assert.match(constants, /const STORAGE_KEYS = \{/, 'STORAGE_KEYS missing from constants.js');
});

test('role labels and badges referenced by consumers resolve to constants', () => {
    const auth = read('src/app/authentication.js');
    assert.match(auth, /ROLE_LABELS\[currentUser\.role\]/, 'sidebar role label no longer resolved via ROLE_LABELS');
    assert.match(auth, /DEFAULT_PAGE_BY_ROLE\[currentUser\.role\]/, 'role default no longer resolved via DEFAULT_PAGE_BY_ROLE');
    const settings = read('src/app/student-settings.js');
    assert.match(settings, /ROLE_BADGES\[currentUser\.role\]/, 'badge class no longer resolved via ROLE_BADGES');
});

test('storage keys are centralized and never re-literalized in src', () => {
    const constants = read('src/app/constants.js');
    assert.match(constants, /SESSION_USER: 'pseudopy_session_user'/, 'SESSION_USER key missing');
    assert.match(constants, /THEME: 'pseudopy_theme'/, 'THEME key missing');
    assert.match(constants, /ACTIVE_EXERCISE: 'pseudopy_active_exercise'/, 'ACTIVE_EXERCISE key missing');
    assert.match(constants, /DEVICE_ID: 'pseudopy_device_id'/, 'DEVICE_ID key missing');
    assert.match(constants, /EDITOR_DRAFT: 'pseudopy_editor_draft'/, 'EDITOR_DRAFT key missing');
    assert.match(constants, /TUTORIAL_COMPLETED: 'pseudopy_tutorial_completed'/, 'TUTORIAL_COMPLETED key missing');
    assert.match(constants, /UPDATE_DISMISSED: 'pseudopy_update_dismissed'/, 'UPDATE_DISMISSED key missing');

    const srcFiles = {};
    for (const dir of ['src/app', 'src/learning']) {
        for (const file of fs.readdirSync(dir)) {
            srcFiles[`${dir}/${file}`] = read(`${dir}/${file}`);
        }
    }
    const offenders = [];
    for (const [file, content] of Object.entries(srcFiles)) {
        if (file.endsWith('/constants.js')) continue;
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
            if (/(['"])pseudopy_(theme|route|session_user|active_exercise|device_id|editor_draft|tutorial_completed|update_dismissed)(['"])/.test(line)) {
                offenders.push(`${file}:${i + 1}`);
            }
        });
    }
    assert.deepEqual(offenders, [], `storage-key literals still exist outside constants.js:\n${offenders.join('\n')}`);
});