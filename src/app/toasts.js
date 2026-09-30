/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

function showToast(message, type = 'info') {
    const container = $id('toast-container');
    if (!container) return;
    const layout = $id('app-layout');
    const region = $id('app-status-region');
    if (region && layout && !layout.classList.contains('hidden')) region.appendChild(container);
    else if (container.parentNode !== document.body) document.body.appendChild(container);
    const icons = { success: 'circle-check', error: 'circle-x', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icon(icons[type] || 'info')}</span><span>${message}</span>`;
    container.appendChild(toast);
    refreshIcons(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}



// Public sync-notice API reuses the singleton status region.
function showSyncNotice(message) {
    return showOfflineSaveStatus(message);
}
function resolveSyncNotice() {
    hideOfflineSaveStatus();
}
