/* ============================================================
   UI ENHANCEMENTS: THEME & FORMATTER
   ============================================================ */

/**
 * Three-mode appearance control: Light, Dark and System.
 *
 * The head bootstrap in index.html applies the stored mode before first
 * paint; everything below keeps it in sync afterwards — the toggle menu,
 * the meta theme-color, and System mode's live OS preference tracking.
 * Every applied switch fires exactly one 'themechange' so charts and any
 * colour-caching UI can refresh in place.
 */
const THEME_MODES = ['light', 'dark', 'system'];

/** The stored preference: an explicit mode, or 'system'. */
function getThemeMode() {
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEYS.THEME); } catch (e) { /* private browsing */ }
    return THEME_MODES.indexOf(stored) !== -1 ? stored : 'dark';
}

/** Does the given mode resolve to dark right now? */
function themeModeIsDark(mode) {
    return mode === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : mode === 'dark';
}

/** The browser/OS chrome colour for the resolved theme. */
function themeColorFor(dark) {
    // Matches --bg-secondary (the topbar/header colour) in each theme, so the
    // browser/OS chrome never contradicts the app header (audit finding #9).
    return dark ? '#0d0d14' : '#f1f5f9';
}

/** Updates the toggle button icon/labels and the menu checkmarks. */
function updateThemeToggleUI(mode, theme) {
    const button = $id('theme-toggle-btn');
    if (button) {
        const icon = mode === 'system' ? 'sun-moon' : (theme === 'dark' ? 'moon' : 'sun');
        button.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
        refreshIcons(button);
        const label = `Theme: ${mode === 'system' ? 'System' : (theme === 'dark' ? 'Dark' : 'Light')} — choose appearance`;
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
    }
    const menu = $id('theme-menu');
    if (menu && menu.querySelectorAll) {
        menu.querySelectorAll('.theme-menu-item').forEach(item => {
            item.setAttribute('aria-checked', String(item.getAttribute('data-theme-mode') === mode));
        });
    }
}

/**
 * Applies a theme mode to the document.
 *
 * @param {string} mode 'light' | 'dark' | 'system'
 * @param {object} options persist — write the mode to storage (user action);
 *                         announce — fire 'themechange' (skip on boot, when
 *                         no listener can exist yet and the cascade alone
 *                         paints the first frame).
 */
function applyThemeMode(mode, options) {
    const opts = options || {};
    const dark = themeModeIsDark(mode);
    const theme = dark ? 'dark' : 'light';
    const root = document.documentElement;

    if (opts.persist) {
        try { localStorage.setItem(STORAGE_KEYS.THEME, mode); } catch (e) { /* private browsing */ }
    }

    // Short-lived class: components opt out of transitions so the whole
    // page swaps theme without animating every surface on the way.
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', theme);

    // Keep the browser/OS chrome colour in step with the resolved theme. The
    // head carries paired prefers-color-scheme metas for the pre-JS frame;
    // once a theme is applied, every meta takes the resolved colour so the
    // effective colour is right whichever media query matches.
    const themeColor = themeColorFor(dark);
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta =>
        meta.setAttribute('content', themeColor));

    updateThemeToggleUI(mode, theme);

    if (opts.announce !== false) {
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme, mode: mode } }));
    }

    requestAnimationFrame(() => root.classList.remove('theme-switching'));
    return theme;
}

/** Applies and persists a user-chosen mode, then closes the menu. */
function setThemeMode(mode) {
    if (THEME_MODES.indexOf(mode) === -1) return;
    applyThemeMode(mode, { persist: true });
    const spoken = mode === 'system' ? 'System' : (themeModeIsDark(mode) ? 'Dark' : 'Light');
    showToast(`Theme set to ${spoken} mode`, 'info');
    closeThemeMenu();
}

function openThemeMenu() {
    const button = $id('theme-toggle-btn');
    const menu = $id('theme-menu');
    if (!button || !menu) return;
    menu.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    const checked = menu.querySelector('.theme-menu-item[aria-checked="true"]') || menu.querySelector('.theme-menu-item');
    if (checked) checked.focus();
}

function closeThemeMenu() {
    const button = $id('theme-toggle-btn');
    const menu = $id('theme-menu');
    if (!menu) return;
    menu.classList.add('hidden');
    if (button) button.setAttribute('aria-expanded', 'false');
}

/** Wires the appearance menu and System-mode tracking. Called from init(). */
function initTheme() {
    // Re-apply the stored mode so icon, meta colour and menu state agree
    // with what the head bootstrap painted.
    applyThemeMode(getThemeMode(), { announce: false });

    // System mode follows the OS setting live.
    if (typeof window.matchMedia === 'function') {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onSystemChange = () => {
            if (getThemeMode() === 'system') applyThemeMode('system');
        };
        if (media.addEventListener) media.addEventListener('change', onSystemChange);
        else if (media.addListener) media.addListener(onSystemChange); // legacy Safari
    }

    const button = $id('theme-toggle-btn');
    const menu = $id('theme-menu');
    if (!button || !menu) return;

    // Android back / iOS swipe-back closes the theme menu via the
    // overlay-history stack with its real close action, so aria-expanded
    // and the check marks unwind together with visibility.
    if (typeof overlayHistoryOnClose === 'function') overlayHistoryOnClose(menu, closeThemeMenu);

    button.addEventListener('click', () => {
        if (menu.classList.contains('hidden')) openThemeMenu();
        else closeThemeMenu();
    });

    menu.addEventListener('click', event => {
        const item = event.target && event.target.closest ? event.target.closest('.theme-menu-item') : null;
        if (item) setThemeMode(item.getAttribute('data-theme-mode'));
    });

    // Roving focus inside the menu (ARIA menu keyboard contract).
    menu.addEventListener('keydown', event => {
        const items = Array.from(menu.querySelectorAll('.theme-menu-item'));
        const index = items.indexOf(document.activeElement);
        let next = -1;
        if (event.key === 'ArrowDown') next = (index + 1) % items.length;
        else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        if (next >= 0 && items[next]) {
            event.preventDefault();
            items[next].focus();
        }
    });

    // Outside click and Escape close the menu; Escape returns focus.
    document.addEventListener('click', event => {
        if (menu.classList.contains('hidden')) return;
        if (menu.contains(event.target) || button.contains(event.target)) return;
        closeThemeMenu();
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || menu.classList.contains('hidden')) return;
        closeThemeMenu();
        button.focus();
    });
}

/**
 * Automatically formats pseudocode with consistent indentation
 */
function autoFormatPseudocode() {
    const editor = $id('pseudocode-editor');
    if (!editor) return;

    const lines = editor.value.split('\n');
    let indentLevel = 0;
    const indentSize = 2; // Spaces per level

    const formattedLines = lines.map(line => {
        let trimmed = line.trim();
        if (!trimmed) return '';

        // Keywords that decrease indentation BEFORE the line
        if (trimmed.match(/^(END|ELSE|NEXT|UNTIL)/i)) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        const spaces = ' '.repeat(indentLevel * indentSize);
        const result = spaces + trimmed;

        // Keywords that increase indentation AFTER the line
        if (trimmed.match(/^(BEGIN|IF|WHILE|FOR|REPEAT|ELSE|FUNCTION|PROCEDURE|CASE)/i)) {
            // But don't increase if it's an inline IF or a single-line block
            if (!trimmed.match(/THEN.*END\s+IF/i) && !trimmed.match(/DO.*DONE/i)) {
                indentLevel++;
            }
        }

        return result;
    });

    editor.value = formattedLines.join('\n');
    updateGutter(); // Refresh line numbers
    showToast('Pseudocode formatted!', 'success');
}
