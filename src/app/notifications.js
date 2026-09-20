/* ============================================================
   STUDENT NOTIFICATION SYSTEM
   ============================================================ */

/**
 * Creates notifications for all enrolled students when an exercise is added or updated.
 */
async function createExerciseNotifications(exerciseId, exerciseTitle, actionType = 'added') {
    try {
        const users = await refreshUsers();
        const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
        const students = users.filter(u => u.role === 'student' && (
            u.instructorId === currentUser?.id ||
            u.instructorId === currentUser?._docId ||
            (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
        ));
        if (students.length === 0) return;

        const isAdded = actionType === 'added';
        const title = isAdded ? 'New Exercise Added' : 'Exercise Updated';
        const message = isAdded
            ? `Your instructor added a new exercise: "${exerciseTitle}".`
            : `Your instructor updated this exercise.`;

        const now = new Date().toISOString();

        for (const s of students) {
            const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '_' + (s._docId || s.id);
            await dbSet(notificationsRef, notifId, {
                _docId: notifId,
                studentId: s._docId || s.id,
                instructorId: currentUser?.id || currentUser?._docId || 'u2',
                exerciseId: exerciseId,
                exerciseTitle: exerciseTitle,
                title: title,
                message: message,
                type: isAdded ? 'exercise_added' : 'exercise_updated',
                isRead: false,
                createdAt: now
            });
        }

        console.log(`[Notifications] Sent "${title}" notifications to ${students.length} students `);
    } catch (err) {
        console.error('[Notifications] Failed to create notifications:', err);
    }
}

/**
 * Loads and renders notifications for the currently logged-in student.
 */
async function loadStudentNotifications() {
    if (!currentUser || currentUser.role !== 'student') return;

    try {
        const allNotifs = await dbGetAll(notificationsRef);
        const studentId = currentUser._docId || currentUser.id;
        const myNotifs = allNotifs
            .filter(n => n.studentId === studentId || n.studentId === currentUser.id || n.studentId === currentUser._docId || n.accountId === studentId || n.accountId === currentUser.id || n.accountId === currentUser._docId)
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

        const unreadCount = myNotifs.filter(n => !n.isRead).length;

        // Update badge
        const badge = $id('notif-badge');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        // Update unread count in dropdown header
        const countEl = $id('notif-unread-count');
        if (countEl) {
            countEl.textContent = `${unreadCount} unread`;
        }

        // Render notifications list
        const listEl = $id('notif-list');
        if (!listEl) return;

        if (myNotifs.length === 0) {
            listEl.innerHTML = `
                <div class="notif-empty">
                    <div style="font-size:1.75rem; margin-bottom:0.35rem; opacity:0.6;">{{ui:BellOff}}</div>
                    <div style="font-weight:600; color:var(--text-secondary); margin-bottom:0.25rem;">No notifications yet</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">You will be notified when your instructor adds or updates exercises.</div>
                </div>`;
            return;
        }

        listEl.innerHTML = myNotifs.map(n => {
            const dt = n.createdAt
                ? new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Recent';
            const isUnread = !n.isRead;
            return `
                <div class="notif-item ${isUnread ? 'unread' : 'read'}" onclick="handleNotificationClick('${n._docId}', '${n.exerciseId || ''}', '${n.submissionId || ''}')">
                    <div class="notif-item-header">
                        <div class="notif-item-title-row">
                            ${isUnread ? '<span class="notif-unread-dot"></span>' : ''}
                            <strong class="notif-item-title">${n.title || 'New Exercise Added'}</strong>
                        </div>
                        <span class="notif-item-status ${isUnread ? 'unread' : 'read'}">${isUnread ? 'Unread' : 'Read'}</span>
                    </div>
                    <div class="notif-item-ex-title">"${n.exerciseTitle || 'Exercise'}"</div>
                    <div class="notif-item-msg">${n.message || ''}</div>
                    <div class="notif-item-time">{{ui:Calendar}} ${dt} &bull; <span style="font-weight:500;">${isUnread ? 'Unread' : 'Read'}</span></div>
                </div>`;
        }).join('');
    } catch (err) {
        console.error('[Notifications] Failed to load student notifications:', err);
    }
}

/**
 * Toggles the notification dropdown panel.
 */
function toggleNotificationDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = $id('notif-dropdown');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
        dropdown.classList.remove('hidden');
        loadStudentNotifications();
    } else {
        dropdown.classList.add('hidden');
    }
}

/**
 * Handles clicking a notification item: marks as read and navigates to exercise.
 */
async function handleNotificationClick(notifId, exerciseId, submissionId = '') {
    try {
        if (notifId) {
            await dbUpdate(notificationsRef, notifId, { isRead: true });
        }

        // Close dropdown
        const dropdown = $id('notif-dropdown');
        if (dropdown) dropdown.classList.add('hidden');

        // Refresh badge
        await loadStudentNotifications();

        // Navigate to Exercises & Tasks
        navigateTo('exercises-student');

        // If specific exercise is provided, launch it directly for the student
        if (exerciseId) {
            setTimeout(async () => {
                const ex = await dbGet(exercisesRef, exerciseId);
                if (ex) {
                    attemptExercise(exerciseId, submissionId || null);
                }
            }, 200);
        }
    } catch (err) {
        console.error('[Notifications] Error handling notification click:', err);
    }
}

/**
 * Marks all notifications for the current student as read.
 */
async function markAllNotificationsAsRead(event) {
    if (event) event.stopPropagation();
    if (!currentUser || currentUser.role !== 'student') return;

    try {
        const allNotifs = await dbGetAll(notificationsRef);
        const studentId = currentUser._docId || currentUser.id;
        const unread = allNotifs.filter(n =>
            (n.studentId === studentId || n.studentId === currentUser.id || n.studentId === currentUser._docId) && !n.isRead
        );

        for (const n of unread) {
            await dbUpdate(notificationsRef, n._docId, { isRead: true });
        }

        await loadStudentNotifications();
        showToast('All notifications marked as read.', 'info');
    } catch (err) {
        console.error('[Notifications] Failed to mark all as read:', err);
        showToast('Failed to mark notifications as read.', 'error');
    }
}

