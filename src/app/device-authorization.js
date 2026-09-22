/* ============================================================
   DEVICE FINGERPRINTING & AUTHORIZATION
   ============================================================ */

/**
 * Generates and retrieves device details for the current client.
 */
function getDeviceFingerprint() {
let devId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!devId) {
        devId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, devId);
    }

    const ua = navigator.userAgent || '';
    let os = 'Unknown OS';
    if (ua.includes('Win')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    let browser = 'Unknown Browser';
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Microsoft Edge';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';

    const deviceType = (/Mobi|Android|iPhone|iPad/i.test(ua)) ? 'Mobile' : 'Desktop';
    const deviceName = `${os} ${deviceType} (${browser})`;

    return {
        deviceId: devId,
        deviceName,
        os,
        browser,
        deviceType,
        screen: `${window.screen.width}x${window.screen.height}`,
        userAgent: ua
    };
}

function showPendingDeviceModal(deviceInfo, user) {
    pendingDeviceAuthData = { deviceInfo, user };
    setText('pending-device-info-name', deviceInfo.deviceName || 'Desktop/Browser');
    setText('pending-device-info-os', `${deviceInfo.os} — ${deviceInfo.browser}`);
    setText('pending-device-info-id', deviceInfo.deviceId || '-');
    show('new-device-pending-modal');
}

function closePendingDeviceModal() {
    hide('new-device-pending-modal');
    pendingDeviceAuthData = null;
}

async function checkCurrentDeviceApprovalStatus() {
    if (!pendingDeviceAuthData) {
        closePendingDeviceModal();
        return;
    }
    const { deviceInfo, user } = pendingDeviceAuthData;
    showToast('Checking device approval status with admin...', 'info');

    const devices = await dbGetAll(devicesRef);
    const matched = devices.find(d => d.deviceId === deviceInfo.deviceId && (d.userId === (user._docId || user.id) || d.username === user.username));

    if (matched && matched.status === 'approved') {
        closePendingDeviceModal();
        showToast('Device authorized by Administrator! Signing in...', 'success');
        currentUser = user;
        saveSession(currentUser);
        try {
            await dbUpdate(usersRef, currentUser._docId || currentUser.id, { lastLogin: new Date().toISOString() });
            currentUser.lastLogin = new Date().toISOString();
        } catch (e) { }
        showApp();
    } else if (matched && matched.status === 'revoked') {
        closePendingDeviceModal();
        showToast('This device was revoked by Administrator. Access denied.', 'error');
    } else {
        showToast('Device is still awaiting Administrator approval.', 'warning');
    }
}

