/* ============================================================
   OVERLAY HISTORY — Android back / iOS swipe-back closes overlays
   The app had no popstate handling anywhere, so the system back
   gesture left the app instead of closing the open drawer, modal
   or popup. This module owns a small stack of open overlays; each
   open pushes one history entry, and each back gesture closes the
   overlay that owned the entry being left. Manual closes unwind
   their own history entry with history.back(), which the
   popstate handler recognizes (the leaving owner is null) and
   ignores, so a manual close never double-closes the next
   overlay underneath.
   ============================================================ */

const OVERLAY_HISTORY_STATE_KEY = 'ppOverlay';

/** Stable per-element key so id-less overlays still stack correctly. */
const overlayHistoryKeys = new WeakMap();
let overlayHistoryKeySeq = 0;

/** Real close actions for overlays whose close does more than toggle the
    `hidden` class (e.g. the mobile nav drawer also unwinds body/inert/aria). */
const overlayHistoryCloseFns = new WeakMap();

/** Register the real close action for an overlay. Unregistered overlays close
    by adding the `hidden` class — the universal close signal the
    MutationObserver below watches. */
function overlayHistoryOnClose(el, close) {
    if (!el || typeof close !== 'function') return;
    overlayHistoryCloseFns.set(el, close);
}

/** Entries own one history entry each: { id, close } — top of stack = current. */
let overlayHistoryStack = [];
/** Overlay id owning the CURRENT history entry (null = our own entry or none). */
let overlayHistoryCurrent = null;
/** True while a popstate-initiated close is running, so the close callback
    does not try to unwind history again. */
let overlayHistoryClosingFromPop = false;

function overlayHistoryKeyFor(el) {
    if (el.id) return el.id;
    if (!overlayHistoryKeys.has(el)) overlayHistoryKeys.set(el, 'overlay-' + (++overlayHistoryKeySeq));
    return overlayHistoryKeys.get(el);
}

function overlayHistoryVisible(el) {
    return el && !el.classList.contains('hidden') && el.getClientRects().length > 0;
}

/**
 * Records an open overlay and claims one history entry for it.
 * Safe to call repeatedly for the same overlay (idempotent) and
 * safe in contexts where pushState throws (sandboxed frames).
 */
function overlayHistoryOpen(el, close) {
    const id = overlayHistoryKeyFor(el);
    if (overlayHistoryStack.some(e => e.id === id)) return;
    overlayHistoryStack.push({ id, close, el });
    try {
        const state = {};
        state[OVERLAY_HISTORY_STATE_KEY] = id;
        history.pushState(state, '');
        overlayHistoryCurrent = id;
    } catch (e) {
        // No history integration available; the stack still works for closeAll.
    }
}

/**
 * Records a manual close. If the closed overlay owned the current history
 * entry, the entry is unwound with history.back(); the resulting popstate
 * sees a null leaving-owner and does nothing.
 */
function overlayHistoryClosed(el) {
    const id = overlayHistoryKeyFor(el);
    const idx = overlayHistoryStack.map(e => e.id).lastIndexOf(id);
    if (idx === -1) return;
    overlayHistoryStack.splice(idx, 1);
    if (overlayHistoryCurrent !== id) return;
    overlayHistoryCurrent = null;
    if (overlayHistoryClosingFromPop) return;
    try { history.back(); } catch (e) { /* best effort */ }
}

function overlayHistoryInit() {
    window.addEventListener('popstate', () => {
        const state = history.state;
        const arriving = state && state[OVERLAY_HISTORY_STATE_KEY] || null;
        const leaving = overlayHistoryCurrent;
        overlayHistoryCurrent = arriving;
        if (!leaving || overlayHistoryClosingFromPop) return;
        const idx = overlayHistoryStack.map(e => e.id).lastIndexOf(leaving);
        if (idx === -1) return;
        const entry = overlayHistoryStack.splice(idx, 1)[0];
        // Only the leaving owner's own close runs here; nested overlays below
        // keep their stack entries and close on later back gestures.
        if (overlayHistoryStack.some(e => e.id === leaving)) return;
        overlayHistoryClosingFromPop = true;
        try { entry.close(); } catch (e) { /* close must never break history */ }
        finally { overlayHistoryClosingFromPop = false; }
    });

    // Wire every modal/drawer overlay the same way the a11y layer watches
    // them: static markup at boot plus any overlay added later.
    const wired = new WeakSet();
    const wire = (el) => {
        if (wired.has(el)) return;
        wired.add(el);
        const fallbackClose = () => el.classList.add('hidden');
        let wasVisible = overlayHistoryVisible(el);
        const sync = () => {
            const nowVisible = overlayHistoryVisible(el);
            if (nowVisible === wasVisible) return;
            wasVisible = nowVisible;
            if (nowVisible) overlayHistoryOpen(el, overlayHistoryCloseFns.get(el) || fallbackClose);
            else overlayHistoryClosed(el);
        };
        new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'] });
    };
    // The selector also covers the mobile nav-drawer backdrop and the theme
    // menu, whose registered close callbacks (see overlayHistoryOnClose)
    // unwind body, inert and aria state together with visibility.
    // #notif-dropdown is deliberately NOT wired: its outside-click close
    // shares the same tap as whatever opens next (e.g. the theme menu), and
    // a history unwind in that window would immediately close the overlay
    // the user had just opened.
    const OVERLAY_SELECTOR = '.modal-overlay, .drawer-overlay, #sidebar-overlay, #theme-menu';
    document.querySelectorAll(OVERLAY_SELECTOR).forEach(wire);
    new MutationObserver((muts) => {
        muts.forEach((m) => {
            m.addedNodes && m.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                if (node.matches && node.matches(OVERLAY_SELECTOR)) wire(node);
                else if (node.querySelectorAll) node.querySelectorAll(OVERLAY_SELECTOR).forEach(wire);
            });
        });
    }).observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', overlayHistoryInit);
    } else {
        overlayHistoryInit();
    }
}
