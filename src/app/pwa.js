/* ============================================================
   PWA INSTALL PROMPT
   ============================================================ */

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] Install prompt available');
});

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((result) => {
            if (result.outcome === 'accepted') showToast('PseudoPy installed as an app!', 'success');
            deferredPrompt = null;
        });
    }
}

if (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true) {
    document.body.classList.add('ios-standalone');
}

/**
 * Toggles visibility of a password field.
 * @param {string} inputId The ID of the password input element
 * @param {HTMLElement} btn The button element to update the icon
 */
function togglePasswordVisibility(inputId, btn) {
    const input = $id(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i data-lucide="eye-off" aria-hidden="true"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i data-lucide="eye" aria-hidden="true"></i>';
    }
    refreshIcons(btn);
}
window.togglePasswordVisibility = togglePasswordVisibility;


