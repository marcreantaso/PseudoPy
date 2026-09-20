/* ============================================================
   PASSWORD MANAGEMENT
   ============================================================ */

async function handleChangePassword() {
    const currentParam = getValue('cp-current-password');
    const newParam = getValue('cp-new-password');
    const confirmParam = getValue('cp-confirm-password');

    if (!currentParam || !newParam || !confirmParam) {
        showToast('Please fill in all fields.', 'error');
        return;
    }

    // Verify current password using hash-based check
    let currentValid = false;
    if (currentUser.passwordHash && currentUser.passwordSalt) {
        currentValid = await verifyPassword(currentParam, currentUser.passwordHash, currentUser.passwordSalt);
    } else if (currentUser.password) {
        // Legacy plaintext fallback
        currentValid = (currentParam === currentUser.password);
    }

    if (!currentValid) {
        showToast('Incorrect current password.', 'error');
        return;
    }



    if (newParam !== confirmParam) {
        showToast('New passwords do not match.', 'error');
        return;
    }

    try {
        const salt = generateSalt();
        const hash = await hashPassword(newParam, salt);

        const stored = await dbGet(usersRef, currentUser._docId);
        if (stored) {
            delete stored.password;
            stored.passwordHash = hash;
            stored.passwordSalt = salt;
            await dbSet(usersRef, stored._docId, stored);
        }

        // Update local state
        delete currentUser.password;
        currentUser.passwordHash = hash;
        currentUser.passwordSalt = salt;

        const uIndex = cachedUsers.findIndex(u => u.id === currentUser.id);
        if (uIndex !== -1) {
            delete cachedUsers[uIndex].password;
            cachedUsers[uIndex].passwordHash = hash;
            cachedUsers[uIndex].passwordSalt = salt;
        }

        await logAuditAction({
            action: 'password_changed',
            studentId: currentUser._docId || currentUser.id,
            studentName: currentUser.fullName,
            username: currentUser.username,
            instructorId: null,
            instructorName: null,
            requestId: null
        });

        showToast('Password updated successfully!', 'success');

        // Clear fields
        setValue('cp-current-password', '');
        setValue('cp-new-password', '');
        setValue('cp-confirm-password', '');
    } catch (err) {
        console.error('[Offline Database] Change password error:', err);
        showToast('Failed to update password.', 'error');
    }
}

// toggleUserPasswordVisibility() was removed for security.
// Instructor views of student accounts must NEVER display passwords.
// Use the Password Recovery workflow for access issues.

// ── Data Management ──
async function exportData(type) {
    try {
        let exportDataObj = null;
        let filename = 'pseudopy_export.json';

        if (type === 'users') {
            const users = await refreshUsers();
            const instructors = users.filter(u => u.role === 'instructor');
            if (!instructors || instructors.length === 0) {
                return showToast('No instructor data to export.', 'info');
            }
            exportDataObj = instructors.map(u => ({
                id: u.id || u._docId,
                fullName: u.fullName,
                username: u.username,
                email: u.email,
                role: u.role,
                status: u.status,
                createdBy: u.createdBy || 'u1'
            }));
            filename = `pseudopy_instructors_${new Date().toISOString().split('T')[0]}.json`;
        } else {
            const dataStr = localStorage.getItem('pseudopy_' + type);
            if (!dataStr) return showToast('No data to export.', 'info');
            exportDataObj = JSON.parse(dataStr);
            filename = `pseudopy_${type}_${new Date().toISOString().split('T')[0]}.json`;
        }

        const blob = new Blob([JSON.stringify(exportDataObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Data exported successfully!', 'success');
    } catch (err) {
        console.error('[ExportData]', err);
        showToast('Failed to export data.', 'error');
    }
}

