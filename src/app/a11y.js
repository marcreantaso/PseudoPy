/* ============================================================
   ACCESSIBILITY — shared a11y behaviors
   - togglePasswordVisibility (L1 fix: was referenced but never defined)
   - Global focus trap + initial-focus lift for modal/drawer overlays
   - Keyboard-driven skip link handling
   ============================================================ */

/**
 * Toggles the visibility of a password field between hidden and plain text.
 * Keeps the toggle button labelled and swaps the eye icon so the state is
 * announced independently of the (non-aria) text.
 */
function togglePasswordVisibility(inputId, btn) {
    const input = $id(inputId);
    if (!input) return;

    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');

    const icon = btn.querySelector('[data-lucide]');
    if (icon) {
        icon.setAttribute('data-lucide', show ? 'eye-off' : 'eye');
        refreshIcons(btn);
    }
}

const A11Y_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const A11Y_OVERLAYS = '.modal-overlay, .drawer-overlay';

function a11yVisible(el) {
    return el && !el.classList.contains('hidden') && el.getClientRects().length > 0;
}

function a11yFocusables(container) {
    return Array.from(container.querySelectorAll(A11Y_FOCUSABLE))
        .filter(el => el.getClientRects().length > 0);
}

/**
 * Traps Tab/Shift+Tab within the currently visible overlay. Handles every
 * modal and drawer uniformly instead of per-modal wiring.
 */
function a11yTrapKeydown(e) {
    if (e.key !== 'Tab') return;
    const overlay = Array.from(document.querySelectorAll(A11Y_OVERLAYS))
        .find(o => a11yVisible(o) && o.contains(document.activeElement));
    if (!overlay) return;

    const focusables = a11yFocusables(overlay);
    if (!focusables.length) { e.preventDefault(); return; }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

let a11yLastFocus = null;

/**
 * Observes overlay visibility so that when a modal/drawer opens, focus moves
 * into it, and when it closes, focus returns to the triggering element.
 * resubmission-request-modal already manages its own focus lifecycle and is
 * excluded to avoid fighting its internal logic.
 */
function a11yWatchOverlays() {
    const overlays = Array.from(document.querySelectorAll(A11Y_OVERLAYS));
    const prevVisible = new WeakMap(overlays.map(o => [o, a11yVisible(o)]));

    const observer = new MutationObserver((muts) => {
        const touched = new Set(muts.map(m => m.target));
        touched.forEach((overlay) => {
            if (!overlay.matches(A11Y_OVERLAYS)) return;
            const nowVisible = a11yVisible(overlay);
            const wasVisible = prevVisible.get(overlay) || false;
            prevVisible.set(overlay, nowVisible);

            if (nowVisible && !wasVisible && overlay.id !== 'resubmission-request-modal') {
                a11yLastFocus = document.activeElement;
                const target = a11yFocusables(overlay)[0];
                if (target) setTimeout(() => target.focus(), 0);
            } else if (!nowVisible && wasVisible) {
                if (a11yLastFocus && a11yLastFocus.isConnected) {
                    setTimeout(() => a11yLastFocus.focus(), 0);
                }
                a11yLastFocus = null;
            }
        });
    });

    overlays.forEach((overlay) => observer.observe(overlay, { attributes: true, attributeFilter: ['class'] }));
}

/**
 * Adds scope="col" to header cells of any table (static or JS-rendered) so
 * screen readers can announce column headers reliably.
 */
function a11yUpgradeTableHeaders(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches('thead th')) {
        if (!root.hasAttribute('scope')) root.setAttribute('scope', 'col');
        return;
    }
    root.querySelectorAll('thead th').forEach(th => {
        if (!th.hasAttribute('scope')) th.setAttribute('scope', 'col');
    });
}

function initA11y() {
    document.addEventListener('keydown', a11yTrapKeydown);
    a11yWatchOverlays();

    const main = $id('main-content') || document.body;
    a11yUpgradeTableHeaders(main);
    const observer = new MutationObserver((muts) => {
        muts.forEach((m) => {
            if (!m.addedNodes) return;
            m.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                if (node.matches && node.matches('thead, thead th')) a11yUpgradeTableHeaders(node);
                else if (node.querySelector) a11yUpgradeTableHeaders(node);
            });
        });
    });
    observer.observe(main, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initA11y);
    } else {
        initA11y();
    }
}