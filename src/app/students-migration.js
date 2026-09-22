/* ============================================================
   STUDENT NUMBER MIGRATION (Admin only)
   Assigns 230-series student numbers to student accounts that
   still carry legacy 'studentId' (2024-xxx) placeholders or none.
   The preview is side-effect-free; only the confirm step writes
   user records, and it touches ONLY the document's
   'studentNumber' field.
   ============================================================ */

let _snMigrationRunning = false;

async function obtainAllStudentsCached() {
    let users = cachedUsers;
    if (!users || users.length === 0) {
        users = await refreshUsers();
    }
    return users;
}

/** Highest ''230'' sequence currently in use by ANY user document. */
function _max230Sequence(users) {
    let max = 0;
    (Array.isArray(users) ? users : []).forEach((u) => {
        const sn = u && u.studentNumber;
        if (isValidStudentNumber(sn)) {
            const n = parseInt(sn.slice(3), 10);
            if (n > max) max = n;
        }
    });
    return max;
}

/**
 * Preview migration plan. Never mutates the counter or users.
 * Returns a list of { user, current, proposed } sorted by
 * current legacy id then account id, plus the base sequence used.
 */
async function buildStudentNumberMigrationPlan() {
    const users = await obtainAllStudentsCached();
    const targets = (users || []).filter(
        (u) => u && u.role === 'student' && !isValidStudentNumber(u.studentNumber)
    );
    targets.sort((a, b) => String(a.id || a._docId || '').localeCompare(String(b.id || b._docId || '')));

    let baseSeq = _max230Sequence(users);
    const rows = targets.map((u) => {
        baseSeq += 1;
        return {
            user: u,
            current: readStudentNumber(u),
            proposed: formatStudentNumber(baseSeq)
        };
    });

    // Duplicate detection within the proposed plan + against live users.
    let duplicateConflict = null;
    const proposedSeen = new Set();
    for (const row of rows) {
        if (proposedSeen.has(row.proposed) || (users || []).some(
            (u) => u && u.studentNumber === row.proposed && u !== row.user)
        ) {
            duplicateConflict = row.proposed;
            break;
        }
        proposedSeen.add(row.proposed);
    }

    return { rows, duplicateConflict };
}

/**
 * Render the preview modal (side-effect-free) with an admin guard.
 */
async function openStudentNumberMigration() {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('Only administrators can manage student numbers.', 'error');
        return;
    }
    const modal = $id('sn-migration-modal');
    if (!modal) return;

    $id('sn-migration-body').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">Preparing preview...</td></tr>';
    $id('sn-migration-total').textContent = '…';
    modal.classList.remove('hidden');

    try {
        const { rows, duplicateConflict } = await buildStudentNumberMigrationPlan();
        const tbody = $id('sn-migration-body');
        if (duplicateConflict) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--danger)">Duplicate proposed number detected (${duplicateConflict}). Aborting — contact your developer.</td></tr>`;
            $id('sn-migration-total').textContent = 'ERROR';
            const runBtn = $id('sn-migration-run-btn');
            if (runBtn) runBtn.disabled = true;
            return;
        }
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">All student accounts already have 230-series numbers. Nothing to migrate.</td></tr>';
            $id('sn-migration-total').textContent = '0';
            const runBtn = $id('sn-migration-run-btn');
            if (runBtn) runBtn.disabled = true;
            return;
        }
        tbody.innerHTML = rows.map((row) => `
            <tr>
              <td>
                <div class="user-cell">
                  <div class="avatar-sm">{{ui:UserRound}}</div>
                  <div>
                    <div style="font-weight:600;color:var(--text-primary)">${row.user.fullName || ''}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);font-family:monospace">@${row.user.username || ''}</div>
                  </div>
                </div>
              </td>
              <td style="font-family:monospace;font-size:0.85rem;color:var(--text-muted)">${row.current}</td>
              <td style="font-family:monospace;font-size:0.85rem;color:var(--text-accent)">${row.proposed}</td>
              <td><span class="badge badge-active">READY</span></td>
            </tr>`).join('');
        $id('sn-migration-total').textContent = String(rows.length) + ' student(s)';
        const runBtn = $id('sn-migration-run-btn');
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.dataset.count = String(rows.length);
        }
    } catch (err) {
        console.error('[StudentMigration] Preview error:', err);
        $id('sn-migration-body').innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--danger)">${err && err.message ? err.message : 'Failed to prepare migration preview.'}</td></tr>`;
        $id('sn-migration-total').textContent = 'ERROR';
    }
}

function closeStudentNumberMigration() {
    const modal = $id('sn-migration-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Confirmed migration: allocate + patch 'studentNumber' only.
 * Re-snapshots users so we never double-write an account that was
 * allocated in the meantime.
 */
async function runStudentNumberMigration() {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('Only administrators can manage student numbers.', 'error');
        return;
    }
    if (_snMigrationRunning) return;
    const runBtn = $id('sn-migration-run-btn');
    if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = '{{ui:Loader}} Migrating…';
    }
    _snMigrationRunning = true;

    try {
        let users = await refreshUsers();
        let targets = (users || []).filter(
            (u) => u && u.role === 'student' && !isValidStudentNumber(u.studentNumber)
        );
        targets.sort((a, b) => String(a.id || a._docId || '').localeCompare(String(b.id || b._docId || '')));

        if (targets.length === 0) {
            showToast('All student accounts already have 230-series numbers.', 'info');
            closeStudentNumberMigration();
            return;
        }

        let assigned = 0;
        let failed = 0;
        for (const u of targets) {
            try {
                const number = await allocateStudentNumber();
                await dbUpdate(usersRef, u._docId || u.id, { studentNumber: number });
                assigned++;
            } catch (rowErr) {
                failed++;
                console.error(`[StudentMigration] Failed for ${u.username}:`, rowErr);
            }
        }

        await refreshUsers();
        let toastTxt;
        if (failed === 0) {
            toastTxt = `Assigned 230-series numbers to ${assigned} student(s).`;
        } else if (assigned === 0) {
            toastTxt = `Migration failed for all ${failed} student(s).`;
        } else {
            toastTxt = `Assigned numbers to ${assigned} student(s); ${failed} failed.`;
        }
        showToast(toastTxt, failed === 0 ? 'success' : 'warning');
        closeStudentNumberMigration();
    } catch (err) {
        console.error('[StudentMigration] Migration error:', err);
        showToast(err && err.message ? err.message : 'Migration failed.', 'error');
        closeStudentNumberMigration();
    } finally {
        _snMigrationRunning = false;
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.innerHTML = '{{ui:CheckCheck}} Migrate Now';
        }
    }
}