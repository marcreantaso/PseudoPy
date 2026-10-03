#!/usr/bin/env node
/* ============================================================
   DUPLICATE-STUDENT AUDIT (report-only, always)

   Finds student profiles that collide on the fields the system
   treats as unique: studentNumber, username and email.

   This exists because a double-submitted "Add Student" form once
   produced ONE person holding two consecutive 230-series numbers
   (2300003 and 2300004). That is not an orphan record — both
   documents are live and both belong to a real account, so
   audit-student-orphans.js lists them side by side and correctly
   declines to call either one dead.

   It NEVER deletes anything. Every finding goes to a JSON report
   for human review, and destructive steps are intentionally not
   implemented.

   Unlike the orphan audit, a duplicate IS provable: two live
   profiles sharing a canonical identity field is a violation of
   the uniqueness contract regardless of who they belong to.
   Ownership is still a human decision, so the report records
   cross-references rather than proposing a winner.

   Credentials: Application Default Credentials
     gcloud auth application-default login
   ============================================================ */

const USERS = 'pseudopy_users';
const COUNTERS = 'pseudopy_counters';

// Collections scanned for records that point at an account. Used only to show
// what would become unreachable if one of a duplicate pair is removed.
const DEPENDENT_COLLECTIONS = [
    'pseudopy_activity',
    'pseudopy_evidence',
    'pseudopy_notifications',
    'pseudopy_tutorialProgress'
];

// Username claims outlive nothing: a claim whose owner no longer exists is a
// username reserved for an account that is gone, and the instructor has no way
// to see why the name is refused.
const CLAIMS_COLLECTION = 'pseudopy_usernameClaims';

const IDENTITY_FIELDS = [
    { key: 'studentNumber', label: 'Student number', normalize: v => String(v || '').trim() },
    { key: 'username', label: 'Username', normalize: v => String(v || '').trim().toLowerCase() },
    { key: 'email', label: 'Email', normalize: v => String(v || '').trim().toLowerCase() }
];

function accountIsLive(data) {
    if (!data) return false;
    const role = String(data.role || '').toLowerCase();
    const status = String(data.status || 'active').toLowerCase();
    return role === 'student' && status === 'active';
}

/**
 * Group live profiles by each identity field.
 *
 * A shared display name is deliberately NOT inspected: two different students
 * can legitimately be called the same thing, which is exactly why the orphan
 * audit treats `fullName` as proof of nothing.
 */
function classifyDuplicateStudents(profiles) {
    const live = (profiles || []).filter(p => accountIsLive(p.data));
    const groups = [];

    IDENTITY_FIELDS.forEach(field => {
        const buckets = new Map();
        live.forEach(p => {
            const value = field.normalize(p.data && p.data[field.key]);
            if (!value) return;
            if (!buckets.has(value)) buckets.set(value, []);
            buckets.get(value).push(p);
        });

        buckets.forEach((members, value) => {
            if (members.length < 2) return;
            groups.push({
                field: field.key,
                fieldLabel: field.label,
                value,
                count: members.length,
                memberIds: members.map(m => m.id),
                members: members.map(m => ({
                    id: m.id,
                    fullName: (m.data && m.data.fullName) || null,
                    username: (m.data && m.data.username) || null,
                    email: (m.data && m.data.email) || null,
                    studentNumber: (m.data && m.data.studentNumber) || null,
                    role: (m.data && m.data.role) || null,
                    status: (m.data && m.data.status) || null,
                    instructorId: (m.data && m.data.instructorId) || null,
                    createdAt: (m.data && m.data.createdAt) || null,
                    updatedAt: (m.data && m.data.updatedAt) || null,
                    // Distinguishing the pair mechanically: the same creation
                    // key means the UI submitted twice; near-identical emails
                    // means a typo at data entry.
                    creationRequestId: (m.data && m.data.creationRequestId) || null
                }))
            });
        });
    });

    // One profile can collide on more than one field; report each group but
    // also list the profiles involved so an operator sees the full picture.
    const involved = new Set();
    groups.forEach(g => g.memberIds.forEach(id => involved.add(id)));

    return {
        groups,
        involvedIds: Array.from(involved).sort(),
        liveStudentProfiles: live.length
    };
}

/**
 * Count records referencing each document id. Read-only: this exists so a
 * reviewer can see the blast radius before choosing which record survives.
 */
async function collectReferences(db, ids) {
    const wanted = new Set((ids || []).map(String));
    const references = {};
    wanted.forEach(id => { references[id] = {}; });

    for (const name of DEPENDENT_COLLECTIONS) {
        let snap;
        try {
            snap = await db.collection(name).get();
        } catch (err) {
            console.error(`warning: could not read ${name}: ${err && err.message}`);
            continue;
        }
        snap.docs.forEach(d => {
            const data = d.data() || {};
            Object.keys(data).forEach(field => {
                const value = data[field];
                if (typeof value !== 'string') return;
                if (!wanted.has(value)) return;
                references[value][`${name}.${field}`] = (references[value][`${name}.${field}`] || 0) + 1;
            });
        });
    }
    return references;
}

/**
 * Claims held by an account that no longer exists.
 *
 * Distinct from a duplicate: nothing is duplicated, but the username is
 * permanently unavailable with no visible cause. Usually a hard delete that
 * predates claim release, or a soft delete whose release failed while offline.
 */
async function findOrphanedClaims(db, liveDocIds) {
    let snap;
    try {
        snap = await db.collection(CLAIMS_COLLECTION).get();
    } catch (err) {
        console.error(`warning: could not read ${CLAIMS_COLLECTION}: ${err && err.message}`);
        return [];
    }
    const live = new Set((liveDocIds || []).map(String));
    return snap.docs
        .map(d => ({ id: d.id, data: d.data() || {} }))
        .filter(c => {
            const owner = c.data.ownerId ? String(c.data.ownerId) : '';
            return !owner || !live.has(owner);
        })
        .map(c => ({
            claimId: c.id,
            ownerId: c.data.ownerId || null,
            claimedAt: c.data.claimedAt || null,
            reason: c.data.ownerId ? 'owner no longer exists' : 'claim has no owner'
        }));
}

/** Snapshot every duplicate member so a future fix can be reversed. */
async function runBackup(admin, report, outPath) {
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();

    const docs = {};
    for (const id of report.duplicateStudentNumbers.involvedIds || []) {
        const snap = await db.collection(USERS).doc(id).get();
        docs[id] = snap.exists ? { exists: true, data: snap.data() } : { exists: false };
    }

    let counter = null;
    try {
        const snap = await db.collection(COUNTERS).doc('studentNumbers').get();
        counter = snap.exists ? snap.data() : null;
    } catch (err) {
        console.error(`warning: could not read the counter document: ${err && err.message}`);
    }

    const payload = {
        generatedAt: new Date().toISOString(),
        mode: 'backup',
        projectId: projectIdOf(admin),
        students: docs,
        studentNumberCounter: counter,
        notes: [
            'This backup writes to disk only. No Firestore document was modified.',
            'Restore is a manual operation performed after reviewing the duplicate report.'
        ]
    };
    writeJson(outPath, payload);
    return payload;
}

function projectIdOf(admin) {
    return process.env.GCLOUD_PROJECT
        || process.env.GOOGLE_CLOUD_PROJECT
        || (admin.app().options && admin.app().options.projectId)
        || null;
}

function writeJson(file, data) {
    const fs = require('fs');
    const path = require('path');
    const target = path.resolve(file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(data, null, 2));
    console.log(`wrote ${target}`);
}

// ── CLI ──────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = { dryRun: false, apply: false, out: null, backup: null, json: false, reference: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--dry-run') args.dryRun = true;
        else if (arg === '--apply') { args.apply = true; args.applyFile = argv[++i]; }
        else if (arg === '--out') args.out = argv[++i];
        else if (arg === '--backup') args.backup = argv[++i];
        else if (arg === '--json') args.json = true;
        else if (arg === '--references') args.reference = true;
        else if (arg === '--help' || arg === '-h') args.help = true;
        else throw new Error(`Unknown option: ${arg}`);
    }
    return args;
}

const USAGE = `PseudoPy duplicate-student audit

  Report (default, deletes nothing):
    --dry-run                     Report only.
    --out <file.json>             Write the JSON report to this path.
    --json                        Print the report to stdout.

  Extra context (still deletes nothing):
    --references                  Count records pointing at each duplicate.

  Backup (reads live documents, writes nothing back):
    --backup <file.json>          Snapshot every duplicate member plus the
                                  student-number counter.
    --out <file.json>             Required with --backup: the report to read.

  --apply <file.json>            Execute a reviewed fix. NOT IMPLEMENTED: a
                                  human must choose which record survives, and
                                  that decision is never inferred from a field
                                  that two people are allowed to share.

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

    const usersSnap = await db.collection(USERS).get();
    const profiles = usersSnap.docs.map(d => ({ id: d.id, data: d.data() }));
    const classified = classifyDuplicateStudents(profiles);
    const liveDocIds = profiles.filter(p => accountIsLive(p.data)).map(p => p.id);

    const report = {
        generatedAt: new Date().toISOString(),
        projectId: projectIdOf(admin),
        mode: 'dry-run',
        liveStudentProfiles: classified.liveStudentProfiles,
        duplicateStudentNumbers: classified,
        orphanedUsernameClaims: await findOrphanedClaims(db, liveDocIds),
        notes: [
            'This report deletes nothing.',
            'A duplicate is reported when two live student profiles share a student number, username or email.',
            'Sharing a full name is never treated as a duplicate: two students can legitimately share one.',
            'Deciding which record survives is a human decision. No survivor is proposed here.',
            'A duplicate student number means two accounts were issued for one student, not that one of them is orphaned.',
            'An orphaned username claim blocks a username with no account behind it. Releasing one is safe: no profile depends on it.'
        ]
    };

    if (args.reference && classified.involvedIds.length) {
        report.references = await collectReferences(db, classified.involvedIds);
    }

    return report;
}

function printHumanSummary(report) {
    const groups = (report.duplicateStudentNumbers && report.duplicateStudentNumbers.groups) || [];
    console.log(`\nProject:            ${report.projectId || '(unknown)'}`);
    console.log(`Live students:      ${report.liveStudentProfiles}`);
    console.log(`Duplicate groups:   ${groups.length}`);
    if (!groups.length) {
        console.log('\nNo duplicate student numbers, usernames or emails found.');
        return;
    }
    console.log('');
    groups.forEach(g => {
        console.log(`── ${g.fieldLabel}: ${g.value} (${g.count} records)`);
        g.members.forEach(m => {
            const number = m.studentNumber || '—';
            console.log(`     ${m.id}  ${number}  @${m.username || '—'}  ${m.fullName || '(no name)'}`);
            if (m.email) console.log(`        email: ${m.email}`);
            if (m.creationRequestId) console.log(`        creationRequestId: ${m.creationRequestId} (same key ⇒ double-submitted form)`);
        });
        if (report.references && report.references[g.memberIds[0]]) {
            console.log('     references:');
            g.memberIds.forEach(id => {
                const refs = report.references[id] || {};
                const keys = Object.keys(refs);
                console.log(`       ${id}: ${keys.length ? keys.map(k => `${k}=${refs[k]}`).join(', ') : 'none'}`);
            });
        }
        console.log('');
    });
    console.log('This report deletes nothing. Choose the surviving record by hand,');
    console.log('take a --backup first, then write a reviewed fix.');

    const orphans = report.orphanedUsernameClaims || [];
    if (orphans.length) {
        console.log('');
        console.log(`── Orphaned username claims (${orphans.length})`);
        orphans.forEach(c => {
            console.log(`     ${c.claimId}  owner=${c.ownerId || '(none)'}  ${c.reason}`);
        });
        console.log('     These usernames are reserved with no account behind them.');
    }
}

async function main() {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    } catch (e) {
        console.error(e.message);
        console.error('\n' + USAGE);
        process.exitCode = 1;
        return;
    }

    if (args.help) {
        console.log(USAGE);
        return;
    }

    if (args.apply) {
        console.error('--apply is intentionally not implemented in this change.');
        console.error('Choose the surviving record by hand after reviewing the report.');
        process.exitCode = 1;
        return;
    }

    const admin = await loadAdmin();
    if (!admin) return;

    if (args.backup) {
        if (!args.out) {
            console.error('--backup requires --out <report.json> so the backup knows what it is snapshotting.');
            process.exitCode = 1;
            return;
        }
        const fs = require('fs');
        const path = require('path');
        let report;
        try {
            report = JSON.parse(fs.readFileSync(path.resolve(args.out), 'utf8'));
        } catch (e) {
            console.error(`could not read the report at ${args.out}: ${e.message}`);
            process.exitCode = 1;
            return;
        }
        await runBackup(admin, report, args.backup);
        return;
    }

    const report = await runReport(admin, args);

    if (args.out) {
        writeJson(args.out, report);
    } else {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        writeJson(`reports/duplicate-students-${stamp}.json`, report);
    }

    printHumanSummary(report);
    if (args.json) console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
    main().catch(err => {
        console.error('duplicate-student audit failed:', err && err.message);
        process.exitCode = 1;
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        classifyDuplicateStudents,
        parseArgs,
        USAGE
    };
}