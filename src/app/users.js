/* ============================================================
   USER MANAGEMENT (Admin) — Manage Instructors
   ============================================================ */

function _fmtDate(dateStr, fallback = 'Never') {
    if (!dateStr) return fallback;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

async function loadUsers() {
    const tbody = $id('users-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">Loading instructors...</td></tr>`;

    try {
        const users = await refreshUsers();
        const instructors = (users || []).filter(u => u.role === 'instructor');

        // Load device records to track pending device approvals per instructor
        try {
            cachedDevices = await dbGetAll(devicesRef);
        } catch (e) {
            console.warn('[App] Device load warning:', e);
            cachedDevices = [];
        }

        allCachedInstructors = instructors;

        // KPI cards calculation
        const totalCount = instructors.filter(u => u.status !== 'archived').length;
        const activeCount = instructors.filter(u => u.status === 'active').length;
        const inactiveCount = instructors.filter(u => u.status === 'inactive').length;

        setText('stat-total-instructors', totalCount);
        setText('stat-active-instructors', activeCount);
        setText('stat-inactive-instructors', inactiveCount);

        // apply existing filter state
        applyInstructorFilters();
    } catch (err) {
        console.error('[App] Failed to load instructors:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:3rem;color:var(--danger)">
                        <div style="font-size:2rem;margin-bottom:0.5rem">{{ui:TriangleAlert}}</div>
                        <div style="font-weight:600;font-size:1rem;margin-bottom:0.4rem">Unable to load instructors. Please try again.</div>
                        <div style="font-size:0.83rem;color:var(--text-muted);margin-bottom:1rem">${err.message || 'Check database connection.'}</div>
                        <button class="btn btn-secondary btn-sm" onclick="loadUsers()" style="margin:0 auto">{{ui:RefreshCw}} Try Again</button>
                    </td>
                </tr>`;
        }
    }
}

function applyInstructorFilters() {
    const searchVal = ($id('instructor-search')?.value || '').toLowerCase().trim();
    const statusVal = $id('instructor-filter-status')?.value || '';
    const sortVal = $id('instructor-sort')?.value || 'newest';

    let list = allCachedInstructors.filter(u => {
        if (statusVal) {
            if (u.status !== statusVal) return false;
        } else {
            // Default "All Statuses": hide archived instructors from normal active list
            if (u.status === 'archived') return false;
        }
        if (searchVal) {
            const hay = [u.fullName || '', u.username || '', u.email || ''].join(' ').toLowerCase();
            if (!hay.includes(searchVal)) return false;
        }
        return true;
    });

    if (sortVal === 'name' || sortVal === 'name-asc') {
        list = list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    } else if (sortVal === 'name-desc') {
        list = list.sort((a, b) => (b.fullName || '').localeCompare(a.fullName || ''));
    } else if (sortVal === 'oldest') {
        list = list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    } else if (sortVal === 'last-login') {
        list = list.sort((a, b) => new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0));
    } else {
        // Default: newest
        list = list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    filteredInstructors = list;
    instructorPage = 1;
    renderInstructorTable();
}

function renderInstructorTable() {
    const tbody = $id('users-table-body');
    if (!tbody) return;

    const total = filteredInstructors.length;
    const pageCount = Math.max(1, Math.ceil(total / INSTR_PAGE_SIZE));
    instructorPage = Math.min(instructorPage, pageCount);
    const start = (instructorPage - 1) * INSTR_PAGE_SIZE;
    const slice = filteredInstructors.slice(start, start + INSTR_PAGE_SIZE);

    // count label
    setText('instructor-count-label', total === 0 ? 'No instructors found' : `${total} instructor${total !== 1 ? 's' : ''}`);

    // pagination info
    const showing = total === 0 ? 0 : start + 1;
    const showEnd = Math.min(start + INSTR_PAGE_SIZE, total);
    setText('instructor-page-info', `Showing ${showing} to ${showEnd} of ${total} results`);

    // page number buttons
    const pageNumbers = $id('instructor-page-numbers');
    if (pageNumbers) {
        let html = '';
        for (let p = 1; p <= pageCount; p++) {
            html += `<button class="an-page-btn ${p === instructorPage ? 'active' : ''}" onclick="instructorGoPage(${p})">${p}</button>`;
        }
        pageNumbers.innerHTML = html;
    }

    const prevBtn = $id('instructor-prev-btn');
    const nextBtn = $id('instructor-next-btn');
    if (prevBtn) prevBtn.disabled = instructorPage <= 1;
    if (nextBtn) nextBtn.disabled = instructorPage >= pageCount;

    if (total === 0) {
        tbody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align:center;padding:3rem;color:var(--text-muted)">
                <div style="font-size:2.5rem;margin-bottom:0.75rem">{{ui:Users}}</div>
                <div style="font-weight:600;font-size:1rem;margin-bottom:0.4rem">No instructors found</div>
                <div style="font-size:0.83rem">Try adjusting your search or filter, or click <strong>Add Instructor</strong> to create one.</div>
              </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = slice.map(u => {
        const isArchived = u.status === 'archived';
        const statusBadge = u.status === 'active'
            ? `<span class="badge badge-active">ACTIVE</span>`
            : isArchived
            ? `<span class="badge badge-archived">ARCHIVED</span>`
            : `<span class="badge badge-inactive">INACTIVE</span>`;
        const dateAdded = _fmtDate(u.createdAt, 'N/A');
        const lastLogin = _fmtDate(u.lastLogin, 'Never');

        const userDevices = (cachedDevices || []).filter(d => d.userId === u.id || d.userId === u._docId || d.username === u.username);
        const pendingDevices = userDevices.filter(d => d.status === 'pending');
        const pendingCount = pendingDevices.length;
        const instructorId = u.id || u._docId;

        return `
        <tr>
          <td>
            <div class="user-cell">
              <div class="avatar-sm">{{ui:UserRound}}</div>
              <div>
                <div style="font-weight:600;color:var(--text-primary)">${u.fullName}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);font-family:monospace">@${u.username}</div>
              </div>
            </div>
          </td>
          <td style="color:var(--text-secondary);font-size:0.85rem">${u.email}</td>
          <td><span class="badge badge-instructor" style="font-size:0.7rem;padding:0.25rem 0.6rem;letter-spacing:0.05em">INSTRUCTOR</span></td>
          <td>${statusBadge}</td>
          <td style="font-size:0.8rem;color:var(--text-muted)">${dateAdded}</td>
          <td style="font-size:0.8rem;color:var(--text-muted)">${lastLogin}</td>
          <td>
            <div style="display:flex;gap:0.35rem;align-items:center">
              <button class="btn btn-ghost btn-sm" onclick="viewInstructor('${instructorId}')" title="View Details" aria-label="View instructor details" style="padding:0.3rem 0.5rem;font-size:0.8rem">
                {{ui:Eye}}
              </button>
              <button class="btn btn-ghost btn-sm" onclick="openInstructorEditModal('${instructorId}')" title="Edit" aria-label="Edit instructor" style="padding:0.3rem 0.5rem;font-size:0.8rem">
                {{ui:Pencil}}
              </button>
              <button class="btn btn-ghost btn-sm device-action-btn" onclick="openInstructorDevicesModal('${instructorId}')" title="Manage Authorized Devices (${userDevices.length} registered${pendingCount > 0 ? `, ${pendingCount} pending approval` : ''})" aria-label="Manage authorized devices (${userDevices.length} registered${pendingCount > 0 ? `, ${pendingCount} pending approval` : ''})" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:${pendingCount > 0 ? '#f59e0b' : '#38bdf8'}">
                {{ui:Monitor}}
                ${pendingCount > 0 ? `<span class="device-pending-badge"></span>` : ''}
              </button>
              ${isArchived ? `
                <button class="btn btn-ghost btn-sm" onclick="openRestoreInstructorModal('${instructorId}')" title="Restore Instructor" aria-label="Restore instructor" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--success)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                </button>
              ` : `
                <button class="btn btn-ghost btn-sm" onclick="confirmToggleInstructorStatus('${instructorId}')" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}" aria-label="${u.status === 'active' ? 'Deactivate instructor' : 'Activate instructor'}" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:${u.status === 'active' ? 'var(--warning)' : 'var(--success)'}">
                  ${u.status === 'active' ? '{{ui:LockKeyhole}}' : '{{ui:LockKeyholeOpen}}'}
                </button>
                <button class="btn btn-ghost btn-sm" onclick="openArchiveInstructorModal('${instructorId}')" ${instructorId === currentUser?.id || instructorId === currentUser?._docId ? 'disabled title="Cannot archive yourself"' : 'title="Archive Instructor" aria-label="Archive instructor"'} style="padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--warning)">
                  {{ui:Archive}}
                </button>
              `}
            </div>
          </td>
        </tr>`;
    }).join('');
}

function instructorPageNav(dir) {
    const total = filteredInstructors.length;
    const pageCount = Math.max(1, Math.ceil(total / INSTR_PAGE_SIZE));
    instructorPage = Math.max(1, Math.min(instructorPage + dir, pageCount));
    renderInstructorTable();
}

function instructorGoPage(p) {
    instructorPage = p;
    renderInstructorTable();
}

// ── Instructor Device Management & Approvals ──────────────────

async function openInstructorDevicesModal(instructorId) {
    activeDeviceInstructorId = instructorId;
    const instructor = allCachedInstructors.find(u => u.id === instructorId || u._docId === instructorId);
    if (!instructor) {
        showToast('Instructor not found.', 'error');
        return;
    }

    setText('device-modal-instructor-name', instructor.fullName);
    setText('device-modal-instructor-handle', '@' + instructor.username);
    setText('device-modal-instructor-subtitle', `Authorized device access control for ${instructor.fullName}`);

    show('instructor-devices-modal');
    await renderDeviceModalTable();
}

function closeInstructorDevicesModal() {
    hide('instructor-devices-modal');
    activeDeviceInstructorId = null;
}

async function renderDeviceModalTable() {
    const tbody = $id('device-modal-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading devices...</td></tr>`;

    const allDevices = await dbGetAll(devicesRef);
    cachedDevices = allDevices;
    const instructor = allCachedInstructors.find(u => u.id === activeDeviceInstructorId || u._docId === activeDeviceInstructorId);
    if (!instructor) return;

    const devices = allDevices.filter(d =>
        d.userId === instructor.id ||
        d.userId === instructor._docId ||
        d.username === instructor.username
    );

    const total = devices.length;
    const approved = devices.filter(d => d.status === 'approved').length;
    const pending = devices.filter(d => d.status === 'pending').length;

    setText('device-modal-total-count', total);
    setText('device-modal-approved-count', approved);
    setText('device-modal-pending-count', pending);

    const approveAllBtn = $id('btn-approve-all-devices');
    if (approveAllBtn) {
        approveAllBtn.style.display = pending > 0 ? 'inline-flex' : 'none';
    }

    if (devices.length === 0) {
        tbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">
                <div style="font-size:1.8rem; margin-bottom:0.4rem;">{{ui:Monitor}}</div>
                <div style="font-weight:600; font-size:0.9rem;">No Registered Devices Yet</div>
                <div style="font-size:0.75rem;">When this instructor signs in from a device, it will automatically appear here for verification.</div>
              </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = devices.map(d => {
        const isMobile = d.deviceType === 'Mobile';
        const icon = isMobile ? '{{ui:Smartphone}}' : '{{ui:Monitor}}';
        const reqTime = _fmtDate(d.requestedAt);
        const lastSeen = _fmtDate(d.lastSeenAt);

        let statusBadge = '';
        if (d.status === 'approved') {
            statusBadge = `<span class="badge-device-approved">{{ui:CircleCheck}} Approved</span>`;
        } else if (d.status === 'pending') {
            statusBadge = `<span class="badge-device-pending">{{ui:Clock}} Pending Approval</span>`;
        } else {
            statusBadge = `<span class="badge-device-revoked">{{ui:CircleX}} Revoked</span>`;
        }

        return `
        <tr>
          <td data-label="Device">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span style="font-size:1.1rem; flex-shrink:0;">${icon}</span>
              <div>
                <strong style="color:var(--text-primary); font-size:0.85rem;">${d.deviceName || 'Device'}</strong>
                <div style="font-size:0.72rem; color:var(--text-muted); font-family:monospace;">${d.deviceId ? d.deviceId.substring(0, 16) + '...' : '-'}</div>
              </div>
            </div>
          </td>
          <td data-label="OS & Browser">
            <div style="font-size:0.82rem; color:var(--text-primary);">${d.os || 'Unknown OS'}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">${d.browser || 'Unknown Browser'}</div>
          </td>
          <td data-label="Requested">
            <div style="font-size:0.78rem; color:var(--text-primary);">${reqTime}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Active: ${lastSeen}</div>
          </td>
          <td data-label="Status">${statusBadge}</td>
          <td data-label="Action" class="device-action-cell" style="text-align:right;">
            <div class="device-action-group">
              ${d.status !== 'approved' ? `
                <button class="btn btn-sm device-action-approve" data-device-action="${d._docId}" data-device-action-label="${d.status === 'revoked' ? 'Approve Again' : 'Approve'}" onclick="approveDevice('${d._docId}')" title="${d.status === 'revoked' ? 'Approve this device again' : 'Approve this device'}">
                  {{ui:CircleCheck}} ${d.status === 'revoked' ? 'Approve Again' : 'Approve'}
                </button>
              ` : `
                <button class="btn btn-sm device-action-revoke" data-device-action="${d._docId}" data-device-action-label="Revoke" onclick="revokeDevice('${d._docId}')" title="Revoke authorization">
                  {{ui:LockKeyhole}} Revoke
                </button>
              `}
              <button class="btn btn-ghost btn-sm" data-device-action="${d._docId}" onclick="deleteDeviceRecord('${d._docId}')" style="color:var(--danger); padding:0.25rem 0.4rem; font-size:0.75rem;" title="Remove record" aria-label="Remove device record from instructor">
                {{ui:Trash2}}
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
}

const _busyDevices = new Set();

function _deviceActionButtons(docId) {
    return document.querySelectorAll(`[data-device-action="${docId}"]`);
}

function _setDeviceButtonsBusy(docId, busy) {
    _deviceActionButtons(docId).forEach(b => {
        if (busy) {
            b.classList.add('is-loading-text');
            b.classList.remove('is-loading');
            b.disabled = true;
            b.setAttribute('aria-busy', 'true');
            const action = (b.dataset.deviceActionLabel || (
                b.classList.contains('device-action-approve') ? 'Approve' : 'Revoke'
            )).trim();
            const stem = action.toLowerCase().startsWith('approve') ? 'Approving' : 'Revoking';
            b.textContent = stem + '...';
        } else {
            b.classList.remove('is-loading-text', 'is-loading');
            b.disabled = false;
            b.removeAttribute('aria-busy');
        }
    });
}

async function _runDeviceAction(deviceDocId, action) {
    if (_busyDevices.has(deviceDocId)) return false;
    _busyDevices.add(deviceDocId);
    _setDeviceButtonsBusy(deviceDocId, true);
    try {
        await action();
        return true;
    } catch (err) {
        console.error('[Device] action error:', err);
        showToast('Device action failed. Please try again.', 'error');
        return false;
    } finally {
        _busyDevices.delete(deviceDocId);
        _setDeviceButtonsBusy(deviceDocId, false);
    }
}

async function approveDevice(deviceDocId) {
    await _runDeviceAction(deviceDocId, async () => {
        await dbUpdate(devicesRef, deviceDocId, {
            status: 'approved',
            approvedAt: new Date().toISOString(),
            approvedBy: currentUser?.username || 'admin'
        });
        showToast('Device approved successfully!', 'success');
        await renderDeviceModalTable();
        await loadUsers();
    });
}

async function revokeDevice(deviceDocId) {
    await _runDeviceAction(deviceDocId, async () => {
        await dbUpdate(devicesRef, deviceDocId, {
            status: 'revoked',
            revokedAt: new Date().toISOString(),
            revokedBy: currentUser?.username || 'admin'
        });
        showToast('Device access revoked.', 'info');
        await renderDeviceModalTable();
        await loadUsers();
    });
}

async function deleteDeviceRecord(deviceDocId) {
    if (!confirm('Are you sure you want to remove this device record?')) return;
    await _runDeviceAction(deviceDocId, async () => {
        await dbDelete(devicesRef, deviceDocId);
        showToast('Device record removed.', 'info');
        await renderDeviceModalTable();
        await loadUsers();
    });
}

let _approveAllDevicesBusy = false;

async function approveAllPendingDevices() {
    if (_approveAllDevicesBusy) return;
    if (!activeDeviceInstructorId) return;
    const instructor = allCachedInstructors.find(u => u.id === activeDeviceInstructorId || u._docId === activeDeviceInstructorId);
    if (!instructor) return;

    const approveAllBtn = $id('btn-approve-all-devices');
    _approveAllDevicesBusy = true;
    if (approveAllBtn) {
        approveAllBtn.classList.add('is-loading');
        approveAllBtn.disabled = true;
    }

    try {
        const allDevices = await dbGetAll(devicesRef);
        const pendingDevices = allDevices.filter(d =>
            (d.userId === instructor.id || d.userId === instructor._docId || d.username === instructor.username) &&
            d.status === 'pending'
        );

        for (const dev of pendingDevices) {
            await dbUpdate(devicesRef, dev._docId, {
                status: 'approved',
                approvedAt: new Date().toISOString(),
                approvedBy: currentUser?.username || 'admin'
            });
        }

        showToast(`Approved ${pendingDevices.length} pending device(s) for ${instructor.fullName}!`, 'success');
        await renderDeviceModalTable();
        await loadUsers();
    } catch (err) {
        console.error('[Device] Approve all error:', err);
        showToast('Failed to approve devices. Please try again.', 'error');
    } finally {
        _approveAllDevicesBusy = false;
        if (approveAllBtn) {
            approveAllBtn.classList.remove('is-loading');
            approveAllBtn.disabled = false;
        }
    }
}

// ── Add / Edit Instructor Modal ──────────────────────────────

function openInstructorAddModal() {
    editingInstructorId = null;
    setText('instructor-modal-title', '{{ui:Plus}} Add Instructor');
    const saveBtn = $id('inst-save-btn');
    if (saveBtn) saveBtn.textContent = '{{ui:Plus}} Add Instructor';

    setValue('inst-fullname', '');
    setValue('inst-username', '');
    setValue('inst-email', '');
    setValue('inst-password', '');
    setValue('inst-confirm-password', '');
    setValue('inst-status', 'active');

    const pwGroup = $id('inst-password-group');
    const cpGroup = $id('inst-confirm-password-group');
    if (pwGroup) pwGroup.classList.remove('hidden');
    if (cpGroup) cpGroup.classList.remove('hidden');

    const alert = $id('inst-form-alert');
    if (alert) { alert.textContent = ''; alert.classList.add('hidden'); }

    const modal = $id('instructor-modal');
    if (modal) modal.classList.remove('hidden');
}

async function openInstructorEditModal(id) {
    const users = allCachedInstructors.length ? allCachedInstructors : await refreshUsers().then(u => u.filter(x => x.role === 'instructor'));
    const user = users.find(u => u.id === id || u._docId === id);
    if (!user) return;

    editingInstructorId = id;
    setText('instructor-modal-title', '{{ui:Pencil}} Edit Instructor');
    const saveBtn = $id('inst-save-btn');
    if (saveBtn) saveBtn.textContent = '{{ui:Save}} Save Changes';

    setValue('inst-fullname', user.fullName || '');
    setValue('inst-username', user.username || '');
    setValue('inst-email', user.email || '');
    setValue('inst-password', '');
    setValue('inst-confirm-password', '');
    setValue('inst-status', user.status || 'active');

    // hide password fields during edit
    const pwGroup = $id('inst-password-group');
    const cpGroup = $id('inst-confirm-password-group');
    if (pwGroup) pwGroup.classList.add('hidden');
    if (cpGroup) cpGroup.classList.add('hidden');

    const alert = $id('inst-form-alert');
    if (alert) { alert.textContent = ''; alert.classList.add('hidden'); }

    const modal = $id('instructor-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeInstructorModal() {
    const modal = $id('instructor-modal');
    if (modal) modal.classList.add('hidden');
    editingInstructorId = null;
}

function _showInstAlert(msg) {
    const el = $id('inst-form-alert');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

async function saveInstructor() {
    const fullName = getValue('inst-fullname').trim();
    const username = getValue('inst-username').trim();
    const email = getValue('inst-email').trim();
    const password = getValue('inst-password').trim();
    const confirm = getValue('inst-confirm-password').trim();
    const status = getValue('inst-status') || 'active';

    const alertEl = $id('inst-form-alert');
    if (alertEl) { alertEl.textContent = ''; alertEl.classList.add('hidden'); }

    // Validate required fields
    if (!fullName) { _showInstAlert('Full Name is required.'); return; }
    if (!username) { _showInstAlert('Username is required.'); return; }
    if (!email) { _showInstAlert('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { _showInstAlert('Enter a valid email address.'); return; }

    const allUsers = cachedUsers.length ? cachedUsers : await refreshUsers();

    // Duplicate check
    const dupUser = allUsers.find(u => (u.username || '').toLowerCase() === username.toLowerCase() && u.id !== editingInstructorId && u._docId !== editingInstructorId);
    if (dupUser) { _showInstAlert('Username is already taken. Choose another.'); return; }

    const dupEmail = allUsers.find(u => (u.email || '').toLowerCase() === email.toLowerCase() && u.id !== editingInstructorId && u._docId !== editingInstructorId);
    if (dupEmail) { _showInstAlert('Email is already registered to another account.'); return; }

    try {
        if (editingInstructorId) {
            // Edit mode
            const user = allUsers.find(u => u.id === editingInstructorId || u._docId === editingInstructorId);
            if (!user) { _showInstAlert('Instructor not found.'); return; }
            await dbUpdate(usersRef, user._docId || user.id, { fullName, username, email, status, role: 'instructor' });
            showToast('Instructor updated successfully.', 'success');
        } else {
            // Add mode — password required
            if (!password) { _showInstAlert('Password is required.'); return; }
            if (password.length < 6) { _showInstAlert('Password must be at least 6 characters long.'); return; }
            if (password !== confirm) { _showInstAlert('Passwords do not match.'); return; }

            const newId = 'u_inst_' + Date.now();
            const creatorId = currentUser ? (currentUser.id || currentUser._docId || 'u1') : 'u1';
            const salt = generateSalt();
            const passwordHash = await hashPassword(password, salt);
            await dbSet(usersRef, newId, {
                _docId: newId,
                id: newId,
                fullName,
                username,
                email,
                passwordHash,
                passwordSalt: salt,
                role: 'instructor',
                status,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                createdBy: creatorId
            });
            showToast('Instructor account created successfully.', 'success');
        }
        closeInstructorModal();
        await loadUsers();
    } catch (err) {
        console.error('[Instructor] saveInstructor error:', err);
        _showInstAlert(editingInstructorId ? 'Unable to update Instructor.' : 'Unable to add Instructor.');
    }
}

// ── View Instructor Detail ───────────────────────────────────

async function viewInstructor(id) {
    const allUsers = cachedUsers.length ? cachedUsers : await refreshUsers();
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    // Update all fields in the detail modal
    setText('idm-name', user.fullName || 'N/A');
    setText('idm-username', '@' + (user.username || 'N/A'));
    setText('idm-email', user.email || 'N/A');

    const roleEl = $id('idm-role');
    if (roleEl) roleEl.innerHTML = `<span class="badge badge-instructor" style="font-size:0.75rem">INSTRUCTOR</span>`;

    const statusEl = $id('idm-status');
    if (statusEl) {
        if (user.status === 'active') {
            statusEl.innerHTML = `<span class="badge badge-active" style="font-size:0.75rem">ACTIVE</span>`;
        } else if (user.status === 'archived') {
            statusEl.innerHTML = `<span class="badge badge-archived" style="font-size:0.75rem">ARCHIVED</span>`;
        } else {
            statusEl.innerHTML = `<span class="badge badge-inactive" style="font-size:0.75rem">INACTIVE</span>`;
        }
    }

    setText('idm-date-added', user.createdAt ? _fmtDate(user.createdAt) : 'N/A');
    setText('idm-last-login', user.lastLogin ? _fmtDate(user.lastLogin) : 'N/A');

    // Compute totals from live data
    const students = (cachedUsers.length ? cachedUsers : await refreshUsers()).filter(u => u.role === 'student' && u.instructorId === id);
    const exercises = await refreshExercises();
    const activity = cachedActivity.length ? cachedActivity : await dbGetAll(activityRef);

    setText('idm-students', String(students.length));
    setText('idm-exercises', String(exercises.length));
    setText('idm-submissions', String(activity.filter(a => {
        const sid = students.map(s => s.id);
        return sid.some(sid => a.studentId === students.find(s => s.id === sid)?.studentId);
    }).length || activity.length));

    const modal = $id('instructor-detail-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeInstructorDetailModal() {
    const modal = $id('instructor-detail-modal');
    if (modal) modal.classList.add('hidden');
}

// ── Status Toggle with Confirmation ─────────────────────────

async function confirmToggleInstructorStatus(id) {
    const user = allCachedInstructors.find(u => u.id === id);
    if (!user) return;
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'inactive' ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} ${user.fullName}?\n\n${newStatus === 'inactive' ? 'They will not be able to log in.' : 'They will be able to log in again.'}`)) return;
    try {
        await dbUpdate(usersRef, user._docId, { status: newStatus });
        showToast(`Instructor status updated to ${newStatus} successfully.`, 'success');
        await loadUsers();
    } catch (err) {
        console.error('[Instructor] Toggle status error:', err);
        showToast('Unable to update instructor status.', 'error');
    }
}

// ── Archive & Restore Instructor (Soft-Delete) ───────────────

function openArchiveInstructorModal(id) {
    if (id === currentUser?.id) {
        showToast('You cannot archive your own account.', 'error');
        return;
    }
    pendingArchiveInstructorId = id;
    const user = allCachedInstructors.find(u => u.id === id || u._docId === id) || cachedUsers.find(u => u.id === id);
    setText('archive-instructor-name', user ? user.fullName : 'this instructor');
    const modal = $id('archive-instructor-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeArchiveInstructorModal() {
    const modal = $id('archive-instructor-modal');
    if (modal) modal.classList.add('hidden');
    pendingArchiveInstructorId = null;
}

async function executeArchiveInstructor() {
    if (!pendingArchiveInstructorId) {
        closeArchiveInstructorModal();
        return;
    }
    const id = pendingArchiveInstructorId;
    if (id === currentUser?.id) {
        showToast('You cannot archive your own account.', 'error');
        closeArchiveInstructorModal();
        return;
    }
    try {
        const allUsers = cachedUsers.length ? cachedUsers : await refreshUsers();
        const user = allUsers.find(u => u.id === id || u._docId === id);
        if (!user) {
            showToast('Instructor not found.', 'error');
            closeArchiveInstructorModal();
            return;
        }
        await dbUpdate(usersRef, user._docId || user.id, { status: 'archived' });
        showToast(`Instructor ${user.fullName} has been archived.`, 'info');
        closeArchiveInstructorModal();
        await loadUsers();
    } catch (err) {
        console.error('[Instructor] Archive error:', err);
        showToast('Failed to archive instructor.', 'error');
    }
}

function openRestoreInstructorModal(id) {
    pendingRestoreInstructorId = id;
    const user = allCachedInstructors.find(u => u.id === id || u._docId === id) || cachedUsers.find(u => u.id === id);
    setText('restore-instructor-name', user ? user.fullName : 'this instructor');
    const modal = $id('restore-instructor-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeRestoreInstructorModal() {
    const modal = $id('restore-instructor-modal');
    if (modal) modal.classList.add('hidden');
    pendingRestoreInstructorId = null;
}

async function executeRestoreInstructor() {
    if (!pendingRestoreInstructorId) {
        closeRestoreInstructorModal();
        return;
    }
    const id = pendingRestoreInstructorId;
    try {
        const allUsers = cachedUsers.length ? cachedUsers : await refreshUsers();
        const user = allUsers.find(u => u.id === id || u._docId === id);
        if (!user) {
            showToast('Instructor not found.', 'error');
            closeRestoreInstructorModal();
            return;
        }
        await dbUpdate(usersRef, user._docId || user.id, { status: 'active' });
        showToast(`Instructor ${user.fullName} has been restored to Active status.`, 'success');
        closeRestoreInstructorModal();
        await loadUsers();
    } catch (err) {
        console.error('[Instructor] Restore error:', err);
        showToast('Failed to restore instructor.', 'error');
    }
}

async function loadStudents() {
    const users = await refreshUsers();
    const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
    const students = users.filter(u => u.role === 'student' && (
        u.instructorId === currentUser?.id ||
        u.instructorId === currentUser?._docId ||
        (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
    ));
    const tbody = $id('students-table-body');

    setText('stat-student-total', String(students.length));
    setText('stat-student-active', String(students.filter(u => u.status === 'active').length));
    setText('stat-student-inactive', String(students.filter(u => u.status === 'inactive').length));
    refreshIcons($id('page-manage-students'));

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">No students enrolled under your class yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(u => `
    <tr>
      <td><div class="user-cell"><div class="avatar-sm">{{ui:UserRound}}</div><div><div style="font-weight:600;color:var(--text-primary)">${u.fullName}</div><div style="font-size:0.75rem;color:var(--text-muted)">@${u.username}</div></div></div></td>
      <td>${readStudentNumber(u)}</td>
      <td><span class="badge ${u.status === 'active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
      <td><div style="display:flex;gap:0.5rem">
        <button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')" title="Edit" aria-label="Edit user">{{ui:Pencil}}</button>
<button class="btn btn-ghost btn-sm" onclick="toggleUserStatus('${u.id}')" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}" aria-label="${u.status === 'active' ? 'Deactivate user' : 'Activate user'}">${u.status === 'active' ? '{{ui:LockKeyhole}}' : '{{ui:LockKeyholeOpen}}'}</button>
      <button class="btn btn-ghost btn-sm" onclick="deleteUser('${u.id}')" title="Delete" aria-label="Delete user">{{ui:Trash2}}</button>
      </div></td>
    </tr>`).join('');
}

// resetStudentPassword() was removed for security.
// Instructors must use the Password Recovery workflow instead:
// navigateTo('password-recovery') → Approve Request → Student resets own password.


async function toggleUserStatus(id) {
    try {
        const user = cachedUsers.find(u => u.id === id);
        if (!user) return;
        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        await dbUpdate(usersRef, user._docId, { status: newStatus });
        showToast(`Status for ${user.fullName} is now ${newStatus}.`, 'success');
        if (currentUser.role === 'admin') {
            await loadUsers();
        } else if (currentUser.role === 'instructor') {
            await loadStudents();
        }
    } catch (err) {
        console.error('[User Management] Toggle status error:', err);
        showToast('Failed to toggle user status.', 'error');
    }
}

async function openUserModal(id = null) {
    editingUserId = id;
    const modal = $id('user-modal');
    const title = $id('user-modal-title');
    const roleGroup = $id('user-role-group');
    if (!modal || !title) return;

    if (currentUser.role === 'admin') {
        setValue('user-role-select', 'instructor');
        if (roleGroup) roleGroup.classList.add('hidden');
    } else if (currentUser.role === 'instructor') {
        setValue('user-role-select', 'student');
        if (roleGroup) roleGroup.classList.add('hidden');
    } else {
        if (roleGroup) roleGroup.classList.remove('hidden');
    }

    if (id) {
        const users = cachedUsers.length ? cachedUsers : await refreshUsers();
        const user = users.find(u => u.id === id);
        if (user) {
            title.textContent = currentUser.role === 'admin' ? 'Edit Instructor' : (currentUser.role === 'instructor' ? 'Edit Student' : 'Edit User');
            setValue('user-fullname', user.fullName);
            setValue('user-username', user.username);
            setValue('user-email', user.email);
            setValue('user-password', '');
            setValue('user-role-select', user.role);
            const pwGroup = $id('user-password-group');
            if (pwGroup) pwGroup.classList.add('hidden');
        }
    } else {
        title.textContent = currentUser.role === 'admin' ? 'Add New Instructor' : (currentUser.role === 'instructor' ? 'Add New Student' : 'Add New User');
        setValue('user-fullname', '');
        setValue('user-username', '');
        setValue('user-email', '');
        setValue('user-password', '');
        if (currentUser.role === 'admin') {
            setValue('user-role-select', 'instructor');
        } else if (currentUser.role === 'instructor') {
            setValue('user-role-select', 'student');
        } else {
            setValue('user-role-select', 'student');
        }
        const pwGroup = $id('user-password-group');
        if (pwGroup) pwGroup.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
}

function closeUserModal() {
    const modal = $id('user-modal');
    if (modal) modal.classList.add('hidden');
    editingUserId = null;
}

async function saveUser() {
    const fullName = getValue('user-fullname').trim();
    const username = getValue('user-username').trim();
    const email = getValue('user-email').trim();
    const password = getValue('user-password').trim();
    let role = getValue('user-role-select');

    if (currentUser.role === 'admin') {
        role = 'instructor';
    } else if (currentUser.role === 'instructor') {
        role = 'student';
    }

    if (!fullName || !username || !email || (!editingUserId && !password)) { showToast('Please fill in all required fields.', 'error'); return; }

    try {
        const users = cachedUsers.length ? cachedUsers : await refreshUsers();
        const dup = users.find(u => u.username === username && u.id !== editingUserId);
        if (dup) { showToast('Username already exists!', 'error'); return; }

        if (editingUserId) {
            const user = users.find(u => u.id === editingUserId);
            if (user) {
                const updateData = { fullName, username, email, role };
                await dbUpdate(usersRef, user._docId, updateData);
            }
            showToast('User updated successfully!', 'success');
        } else {
            const newId = 'u' + Date.now();
            const salt = generateSalt();
            const userHash = await hashPassword(password, salt);
            const userData = {
                id: newId,
                fullName,
                username,
                email,
                passwordHash: userHash,
                passwordSalt: salt,
                role,
                status: 'active',
                createdBy: currentUser.id
            };
            if (currentUser.role === 'instructor') {
                userData.instructorId = currentUser.id;
            }
            if (role === 'student') {
                try {
                    userData.studentNumber = await allocateStudentNumber();
                } catch (allocErr) {
                    console.error('[StudentNumber] Allocation failed:', allocErr);
                    showToast(allocErr && allocErr.message ? allocErr.message : 'Failed to generate student number.', 'error');
                    return;
                }
            }
            await dbSet(usersRef, newId, userData);
            showToast(role === 'student' && userData.studentNumber
                ? `${userData.fullName} · Student No. ${userData.studentNumber} · @${userData.username} created successfully!`
                : 'User created successfully!', 'success');
        }
        closeUserModal();
        if (currentUser.role === 'admin') {
            await loadUsers();
        } else if (currentUser.role === 'instructor') {
            await loadStudents();
        }
    } catch (err) {
        console.error('[Offline Database] Save user error:', err);
        showToast('Failed to save user.', 'error');
    }
}

function editUser(id) { openUserModal(id); }

async function deleteUser(id) {
    if (!confirm('Delete this user?')) return;
    if (id === currentUser?.id) { showToast('You cannot delete your own account!', 'error'); return; }
    try {
        const user = cachedUsers.find(u => u.id === id);
        if (user) await dbDelete(usersRef, user._docId);
        showToast('User deleted.', 'info');
        if (currentUser.role === 'admin') {
            await loadUsers();
        } else if (currentUser.role === 'instructor') {
            await loadStudents();
        }
    } catch (err) {
        console.error('[Offline Database] Delete user error:', err);
        showToast('Failed to delete user.', 'error');
    }
}


