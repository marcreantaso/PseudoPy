#!/usr/bin/env node
/* ============================================================
   ORPHANED-STUDENT AUDIT (report-only by default)

   Finds records that no live student account owns, and Firebase Auth
   accounts with no verified profile binding. It NEVER deletes anything:
   every finding is written to a JSON report for review, and destructive
   steps require an explicit manifest plus a backup.

   Usage
     node scripts/audit-student-orphans.js --dry-run
     node scripts/audit-student-orphans.js --dry-run --out reports/orphans.json
     node scripts/audit-student-orphans.js --plan reports/approved-plan.json
     node scripts/audit-student-orphans.js --apply reports/approved-plan.json

   Credentials come from Application Default Credentials, exactly like the
   Cloud Functions. Nothing is read from the repository and no key material is
   ever written to the report.
   ============================================================ */

const fs = require('node:fs');
const path = require('node:path');

// ── Pure classification (unit-tested; no firebase-admin import) ──

/**
 * Fields that PROVE a record belongs to a known account. A match here is
 * actionable; anything else is reported but never deleted automatically.
 */
const OWNER_FIELDS = ['studentAccountId', 'userId', 'accountId', 'studentId'];

/** Human-readable fields that can collide and therefore prove nothing. */
const AMBIGUOUS_FIELDS = ['username', 'email', 'studentNumber', 'student'];

function docIdOf(doc) {
    // Accepts both a Firestore DocumentSnapshot and a plain `{ id, data }`.
    const data = (doc && typeof doc.data === 'function' ? doc.data() : (doc && doc.data)) || doc || {};
    return String((doc && doc.id) || data._docId || data.id || '');
}

function accountIsLive(profile) {
    if (!profile) return false;
    const status = String(profile.status || 'active').toLowerCase();
    if (status === 'deleted' || status === 'archived') return false;
    return String(profile.role || '').toLowerCase() === 'student';
}

/**
 * Classify every record in a collection against the live account set.
 *
 * @param {string[]} docIds    Document ids of live student accounts.
 * @param {object[]} records   Records as `{ id, data }`.
 */
function classifyRecords(docIds, records) {
    const live = new Set((docIds || []).map(String));
    const orphaned = [];
    const ambiguous = [];
    for (const record of records || []) {
        const data = (record && record.data) || {};
        const id = String((record && record.id) || data._docId || data.id || '');
        let owned = false;
        let maybeOwned = false;
        for (const field of OWNER_FIELDS) {
            const value = data[field];
            if (value === undefined || value === null || value === '') continue;
            if (live.has(String(value))) { owned = true; break; }
        }
        if (owned) continue;
        for (const field of OWNER_FIELDS) {
            const value = data[field];
            if (value !== undefined && value !== null && value !== '' && !live.has(String(value))) {
                // Points at an account that does not exist (or never did).
                maybeOwned = true;
            }
        }
        if (maybeOwned) { orphaned.push({ id, fields: pickFields(data) }); continue; }
        for (const field of AMBIGUOUS_FIELDS) {
            const value = data[field];
            if (value !== undefined && value !== null && value !== '') {
                ambiguous.push({ id, matchedOn: field, value: String(value) });
                break;
            }
        }
    }
    return { orphaned, ambiguous };
}

/** Profiles that are dead but still hold a verified uid: no account to remove. */
function classifyProfiles(profiles) {
    const students = [];
    for (const profile of profiles || []) {
        const docId = docIdOf(profile);
        const data = (profile && typeof profile.data === 'function' ? profile.data() : (profile && profile.data)) || profile || {};
        if (String(data.role || '').toLowerCase() !== 'student') continue;
        if (accountIsLive(data)) continue;
        students.push({
            id: docId,
            fullName: data.fullName || null,
            username: data.username || null,
            studentNumber: data.studentNumber || null,
            status: data.status || 'active',
            uid: data.uid || null,
            reason: String(data.status || '').toLowerCase() === 'deleted'
                ? 'soft-deleted'
                : 'archived'
        });
    }
    return students;
}

/** Auth users without a verified profile binding. Never auto-deleted. */
function classifyAuthUsers(authUsers, profilesByUid) {
    const out = [];
    for (const user of authUsers || []) {
        const uid = String((user && user.uid) || '');
        if (!uid) continue;
        if (!profilesByUid.has(uid)) {
            out.push({
                uid,
                email: (user && user.email) || null,
                createdAt: (user && user.metadata && user.metadata.creationTime) || null,
                reason: 'no profile binds this uid'
            });
        }
    }
    return out;
}

function pickFields(data) {
    const out = {};
    for (const field of OWNER_FIELDS) {
        if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
            out[field] = String(data[field]);
        }
    }
    return out;
}

/**
 * Decide what a plan is allowed to do. Only records the audit actually
 * classified as orphaned may be deleted; ambiguous ones may never be.
 */
function buildApplyPlan(report, approvedIds) {
    const allowed = new Set((approvedIds || []).map(String));
    const actions = [];
    for (const collection of (report && report.collections) || []) {
        for (const entry of collection.orphaned) {
            if (allowed.has(entry.id)) {
                actions.push({ collection: collection.name, id: entry.id, operation: 'delete' });
            }
        }
    }
    return { createdAt: new Date().toISOString(), actions };
}

/**
 * Which documents a backup must contain.
 *
 * Only `delete` actions are snapshotted, and a document appears once even if
 * a plan lists it twice. Anything the plan does not name is deliberately left
 * out, so the backup is a restorable copy of exactly what a plan would remove.
 */
function selectSnapshotIds(plan) {
    const seen = new Set();
    const out = [];
    for (const action of (plan && plan.actions) || []) {
        if (!action || action.operation !== 'delete') continue;
        if (!action.collection || !action.id) continue;
        const key = `${action.collection}/${action.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ collection: action.collection, id: String(action.id) });
    }
    return out;
}

/**
 * Read an approved-id list. Accepts a bare array or `{ ids: [...] }` so a
 * reviewer can edit either form.
 */
function parseApprovedIds(value) {
    const list = Array.isArray(value) ? value : (value && Array.isArray(value.ids) ? value.ids : null);
    if (!list) throw new Error('The approved-id file must be a JSON array of document ids.');
    return list.map(v => String(v)).filter(Boolean);
}

// ── CLI ──────────────────────────────────────────────────────────

const COLLECTIONS = [
    'pseudopy_activity',
    'pseudopy_notifications',
    'pseudopy_passwordRequests',
    'pseudopy_evidence',
    'pseudopy_tutorialProgress'
];

function parseArgs(argv) {
    const args = { dryRun: false, apply: false, plan: null, planFile: null, ids: null, report: null, out: null, backup: null, json: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--dry-run') args.dryRun = true;
        else if (arg === '--apply') { args.apply = true; args.applyFile = argv[++i]; }
        else if (arg === '--json') args.json = true;
        else if (arg === '--plan') args.plan = argv[++i];
        else if (arg === '--plan-file') args.planFile = argv[++i];
        else if (arg === '--ids') args.ids = argv[++i];
        else if (arg === '--report') args.report = argv[++i];
        else if (arg === '--out') args.out = argv[++i];
        else if (arg === '--backup') args.backup = argv[++i];
        else if (arg === '--help' || arg === '-h') args.help = true;
        else throw new Error(`Unknown option: ${arg}`);
    }
    return args;
}

const USAGE = `PseudoPy orphaned-student audit

  Report (default, deletes nothing):
    --dry-run                     Report only.
    --out <file.json>             Write the JSON report to this path.
    --json                        Print the report to stdout.

  Review (still deletes nothing):
    --plan <file.json>            Build a deletion plan from a report plus an
                                  approved-id list. Writes the plan.
    --report <file.json>          Read an existing report instead of scanning.
    --ids <file.json>             Approved document ids (JSON array, or
                                  { "ids": [...] }).

  Backup (reads live documents, writes nothing back):
    --backup <file.json>          Snapshot every document a plan would delete.
    --plan-file <file.json>       The plan to snapshot. Required with --backup.

  --apply <file.json>            Execute a reviewed plan. NOT IMPLEMENTED: a
                                  human review gate is required before this
                                  change ships destructive code.

  Credentials: Application Default Credentials (gcloud auth application-default login).`;

async function loadAdmin() {
    let admin;
    try {
        admin = require('firebase-admin');
    } catch (e) {
        console.error('firebase-admin is not installed in this workspace.');
        console.error('Run:  npm install firebase-admin --no-save');
        console.error('(or run this script from a machine with Application Default Credentials)');
        process.exitCode = 1;
        return null;
    }
    return admin;
}

async function runReport(admin, args) {
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();
    const auth = admin.auth();

    const usersSnap = await db.collection('pseudopy_users').get();
    const profiles = usersSnap.docs.map(d => ({ id: d.id, data: d.data() }));
    const liveDocIds = profiles.filter(p => accountIsLive(p.data)).map(p => p.id);
    const deadStudents = classifyProfiles(profiles);

    const collections = [];
    for (const name of COLLECTIONS) {
        let snap;
        try {
            snap = await db.collection(name).get();
        } catch (err) {
            console.error(`warning: could not read ${name}: ${err && err.message}`);
            continue;
        }
        const records = snap.docs.map(d => ({ id: d.id, data: d.data() }));
        const classified = classifyRecords(liveDocIds, records);
        collections.push(Object.assign({ name, scanned: records.length }, classified));
    }

    let authOrphans = [];
    try {
        const listed = await auth.listUsers(1000);
        const profilesByUid = new Set(
            profiles.map(p => p.data && p.data.uid).filter(Boolean).map(String)
        );
        authOrphans = classifyAuthUsers(listed.users, profilesByUid);
    } catch (err) {
        console.error(`warning: could not list Firebase Auth users: ${err && err.message}`);
    }

    return {
        generatedAt: new Date().toISOString(),
        projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || admin.app().options.projectId || null,
        mode: 'dry-run',
        liveStudentAccounts: liveDocIds.length,
        deadStudentProfiles: deadStudents,
        authUsersWithoutProfile: authOrphans,
        collections,
        notes: [
            'This report deletes nothing.',
            'A record is only auto-deletable when a strict owner field points at an account that no longer exists.',
            'Records that only match by username, email, student number or display name are reported as ambiguous and require manual review.',
            'Auth users without a profile binding are reported only; they may be a legitimate unmigrated account.',
            'Karl Francis Calagos records are listed individually because a shared display name is not proof of ownership.'
        ]
    };
}

async function writeJson(file, value) {
    const target = path.resolve(file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value, null, 2));
    return target;
}

function readJson(file, label) {
    const target = path.resolve(file);
    if (!fs.existsSync(target)) throw new Error(`${label} not found: ${target}`);
    try {
        return JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch (err) {
        throw new Error(`${label} is not valid JSON (${target}): ${err.message}`);
    }
}

/**
 * Snapshot the live documents a plan would delete, so a mistake can be undone
 * by re-creating them. Reads only; the Admin SDK is never used to write here.
 */
async function runBackup(admin, plan, report) {
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();
    const targets = selectSnapshotIds(plan);
    const documents = [];
    for (const target of targets) {
        let snap;
        try {
            snap = await db.collection(target.collection).doc(target.id).get();
        } catch (err) {
            console.error(`warning: could not read ${target.collection}/${target.id}: ${err && err.message}`);
            continue;
        }
        documents.push({
            collection: target.collection,
            id: target.id,
            exists: Boolean(snap && snap.exists),
            data: snap && snap.exists ? snap.data() : null
        });
    }
    return {
        generatedAt: new Date().toISOString(),
        projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || admin.app().options.projectId || null,
        mode: 'backup',
        planActions: (plan && plan.actions) || [],
        documents,
        reference: {
            deadStudentProfiles: (report && report.deadStudentProfiles) || [],
            authUsersWithoutProfile: (report && report.authUsersWithoutProfile) || []
        },
        notes: [
            'Every document listed in planActions is captured above with its full contents.',
            'Restore by writing each documents[].data back to documents[].collection/documents[].id.',
            'exists:false means the document was already gone when the backup was taken.'
        ]
    };
}

/** Build a plan from an existing report plus a human-approved id list. */
function runPlan(args) {
    const report = readJson(args.report, 'Report');
    const approved = parseApprovedIds(readJson(args.ids, 'Approved id list'));
    const plan = buildApplyPlan(report, approved);
    const rejected = approved.filter(id => !plan.actions.some(a => a.id === String(id)));
    plan.rejectedIds = rejected;
    plan.notes = [
        'Only ids the audit classified as ORPHANED appear in actions.',
        'rejectedIds were approved but not auto-deletable; they need manual review.',
        'No document has been touched. Execution is a separate, deliberate step.'
    ];
    return { plan, report };
}

async function main() {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error(err.message);
        console.error(USAGE);
        process.exitCode = 1;
        return;
    }
    if (args.help) {
        console.log(USAGE);
        return;
    }
    if (args.apply) {
        console.error('--apply is intentionally not implemented in this change.');
        console.error('Review the report and the plan by hand first; see docs/student-deletion.md.');
        process.exitCode = 1;
        return;
    }

    // ── Plan mode: pure file-in, file-out, no database access ──
    if (args.plan) {
        if (!args.report || !args.ids) {
            console.error('--plan requires both --report and --ids.');
            console.error(USAGE);
            process.exitCode = 1;
            return;
        }
        let built;
        try {
            built = runPlan(args);
        } catch (err) {
            console.error(err.message);
            process.exitCode = 1;
            return;
        }
        const target = args.out || args.plan;
        const written = await writeJson(target, built.plan);
        console.log(`Plan written to ${written}`);
        console.log(`Planned deletions: ${built.plan.actions.length}`);
        if (built.plan.rejectedIds.length) {
            console.log(`Not auto-deletable (review manually): ${built.plan.rejectedIds.join(', ')}`);
        }
        if (args.json) console.log(JSON.stringify(built.plan, null, 2));
        return;
    }

    const admin = await loadAdmin();
    if (!admin) return;

    // ── Backup mode: needs a plan to know what to snapshot ──
    if (args.backup) {
        if (!args.planFile) {
            console.error('--backup requires --plan-file <plan.json> to know what to snapshot.');
            console.error(USAGE);
            process.exitCode = 1;
            return;
        }
        let plan;
        let report = null;
        try {
            plan = readJson(args.planFile, 'Plan');
            if (args.report) report = readJson(args.report, 'Report');
        } catch (err) {
            console.error(err.message);
            process.exitCode = 1;
            return;
        }
        const backup = await runBackup(admin, plan, report);
        const written = await writeJson(args.backup, backup);
        console.log(`Backup written to ${written}`);
        console.log(`Documents captured: ${backup.documents.length}`);
        const missing = backup.documents.filter(d => !d.exists).length;
        if (missing) console.log(`Already absent when snapshotted: ${missing}`);
        return;
    }

    // ── Default: report only ──
    const report = await runReport(admin, args);
    const target = args.out || path.join('reports', `orphan-audit-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
    const written = await writeJson(target, report);
    console.log(`Report written to ${written}`);
    console.log(`Live student accounts: ${report.liveStudentAccounts}`);
    console.log(`Dead student profiles:  ${report.deadStudentProfiles.length}`);
    console.log(`Auth users without a profile binding: ${report.authUsersWithoutProfile.length}`);
    for (const collection of report.collections) {
        console.log(`  ${collection.name}: ${collection.orphaned.length} orphaned, ${collection.ambiguous.length} ambiguous (of ${collection.scanned})`);
    }
    if (args.json) console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err && err.stack ? err.stack : String(err));
        process.exitCode = 1;
    });
}

module.exports = {
    OWNER_FIELDS,
    AMBIGUOUS_FIELDS,
    classifyRecords,
    classifyProfiles,
    classifyAuthUsers,
    accountIsLive,
    buildApplyPlan,
    selectSnapshotIds,
    parseApprovedIds,
    parseArgs
};