/* ============================================================
   MOBILE NAVIGATION HANDLERS
   ============================================================ */

let sidebarPreviousFocus = null;
function setMobileSidebar(open) {
    const sidebar = $qs('.sidebar');
    const overlay = $id('sidebar-overlay');
    const button = $id('hamburger-btn');
    if (!sidebar) return;
    open = !!open && window.innerWidth < 1024;
    if (open) sidebarPreviousFocus = document.activeElement;
    sidebar.classList.toggle('open', open);
    if (overlay) overlay.classList.toggle('hidden', !open);
    if (button) button.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('navigation-open', open);
    sidebar.inert = window.innerWidth < 1024 && !open;
    if (window.innerWidth < 1024) sidebar.setAttribute('aria-hidden', String(!open));
    else sidebar.removeAttribute('aria-hidden');
    // Keep keyboard navigation within the drawer while it is open.
    for (const el of [$qs('.main-content'), $qs('.topbar')]) if (el) el.inert = open;
    if (open) sidebar.querySelector('.sidebar-close')?.focus();
    else if (sidebarPreviousFocus && sidebar.contains(document.activeElement)) sidebarPreviousFocus.focus();
    if (!open) sidebarPreviousFocus = null;
}
function toggleMobileSidebar() { setMobileSidebar(!$qs('.sidebar')?.classList.contains('open')); }
function closeMobileSidebar() { setMobileSidebar(false); }

document.addEventListener('keydown', event => {
    const sidebar = $qs('.sidebar.open');
    if (!sidebar) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMobileSidebar(); }
    if (event.key === 'Tab') {
        const items = Array.from(sidebar.querySelectorAll('button, a[href], [tabindex="0"]')).filter(el => !el.disabled && el.getClientRects().length);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', closeMobileSidebar);
else closeMobileSidebar();

window.addEventListener('resize', () => {
    closeMobileSidebar();
});


