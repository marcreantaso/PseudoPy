/* ============================================================
   PSEUDOPY LEARNING LAYER — Beginner Tutorial (Onboarding)
   ------------------------------------------------------------
   A step-by-step guided tour of the Write Pseudocode page for
   students. State is stored under STORAGE_KEYS.TUTORIAL_COMPLETED
   behind a small adapter so a future upgrade can back it with a
   DB ref without changing the UI code.
   ============================================================ */

const ONBOARDING = {
    storageKey: STORAGE_KEYS.TUTORIAL_COMPLETED,
    steps: TOUR_STEPS
};

const tourModel = createTourModel(TOUR_STEPS);

const onboardingState = {
    overlay: null,
    spotlight: null,
    bubble: null,
    current: 0,
    active: false,
    returnFocus: null,
    safeAreas: null
};

/* ── State adapter (localStorage now; DB-backed in Phase 6) ── */

function onbGetCompleted() {
    try { return onbStorageGet(ONBOARDING.storageKey) === 'true'; } catch (e) { return false; }
}

function onbSetCompleted(done) {
    try {
        const key = ONBOARDING.storageKey;
        const userId = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser._docId || currentUser.id) : 'anonymous';
        onbStorageSet(key + '_' + userId, done ? 'true' : '');
        onbStorageSet(key + '_shown_' + userId, 'true');
    } catch (e) { /* non-critical */ }
}

function onbStorageGet(key) {
    return localStorage.getItem(key);
}

function onbStorageSet(key, value) {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
}

function onbShouldAutoStart() {
    if (typeof currentUser === 'undefined' || !currentUser) return false;
    if (currentUser.role !== 'student') return false;
    try {
        const userId = currentUser._docId || currentUser.id;
        return localStorage.getItem(ONBOARDING.storageKey + '_' + userId) !== 'true';
    } catch (e) { return false; }
}

/* ── Overlay construction ──────────────────────────────────── */

function onbEnsureOverlay() {
    if (onboardingState.overlay) return;
    const overlay = document.createElement('div');
    overlay.id = 'tour-overlay';
    overlay.className = 'tour-overlay hidden';
    overlay.innerHTML = `
      <div class="tour-spotlight"></div>
      <div class="tour-bubble" role="dialog" aria-modal="true" aria-label="Beginner tutorial" tabindex="-1">
        <div class="tour-bubble-head"><span class="tour-bubble-icon" aria-hidden="true"></span><span class="tour-bubble-step" aria-hidden="true"></span></div>
        <h4 class="tour-bubble-title"></h4>
        <p class="tour-bubble-text"></p>
        <div class="tour-bubble-meta">
          <div class="tour-bubble-dots" role="group" aria-label="Tour progress"></div>
          <button class="btn btn-ghost btn-sm tour-skip">Skip tour</button>
        </div>
        <div class="tour-bubble-actions">
          <button class="btn btn-secondary btn-sm tour-prev" disabled>Back</button>
          <button class="btn btn-primary btn-sm tour-next">Next</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    onboardingState.overlay = overlay;
    onboardingState.spotlight = overlay.querySelector('.tour-spotlight');
    onboardingState.bubble = overlay.querySelector('.tour-bubble');

    overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay || ev.target.classList.contains('tour-overlay')) {
            onbStop();
        }
    });
    overlay.querySelector('.tour-skip').addEventListener('click', () => onbStop());
    overlay.querySelector('.tour-prev').addEventListener('click', () => onbGo(tourModel.getIndex() - 1));
    overlay.querySelector('.tour-next').addEventListener('click', () => {
        if (tourModel.isLast()) onbFinish();
        else onbGo(tourModel.getIndex() + 1);
    });

    bubbleEl().addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            ev.stopPropagation();
            onbStop();
            return;
        }
        if (ev.key === 'Tab') onbTrapFocus(ev);
    });
    document.addEventListener('keydown', (ev) => {
        if (onboardingState.active && ev.key === 'Escape') onbStop();
    });

    window.addEventListener('resize', () => { onboardingState.safeAreas = null; onbReposition(); });
    window.addEventListener('scroll', onbReposition, { passive: true });
    window.addEventListener('orientationchange', () => { onboardingState.safeAreas = null; onbReposition(); });
    // Layout can shift if the sidebar/panels collapse mid-tour; reposition when announced.
    document.addEventListener('layoutchange', () => onbReposition());
}

function bubbleEl() {
    return onboardingState.bubble;
}

function onbTrapFocus(ev) {
    const focusables = bubbleEl().querySelectorAll('button:not([disabled])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
    }
}

function onbSafeAreas() {
    if (onboardingState.safeAreas) return onboardingState.safeAreas;
    if (typeof CSS === 'undefined' || !CSS.supports('padding-bottom', 'env(safe-area-inset-bottom)')) {
        onboardingState.safeAreas = { safeTop: 0, safeLeft: 0, safeBottom: 0, safeRight: 0 };
        return onboardingState.safeAreas;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    probe.style.paddingTop = 'env(safe-area-inset-top)';
    probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
    probe.style.paddingLeft = 'env(safe-area-inset-left)';
    probe.style.paddingRight = 'env(safe-area-inset-right)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    onboardingState.safeAreas = {
        safeTop: num(cs.paddingTop),
        safeBottom: num(cs.paddingBottom),
        safeLeft: num(cs.paddingLeft),
        safeRight: num(cs.paddingRight)
    };
    probe.remove();
    return onboardingState.safeAreas;
}

function onbPositionFor(target) {
    const rect = target.getBoundingClientRect();
    const overlay = onboardingState.overlay;
    const pad = 6;
    const top = Math.max(0, rect.top - pad);
    const left = Math.max(0, rect.left - pad);
    const width = rect.width + pad * 2;
    const height = rect.height + pad * 2;
    onboardingState.spotlight.style.top = top + 'px';
    onboardingState.spotlight.style.left = left + 'px';
    onboardingState.spotlight.style.width = width + 'px';
    onboardingState.spotlight.style.height = height + 'px';

    const step = tourModel.current() || ONBOARDING.steps[onboardingState.current];
    const bubble = bubbleEl();
    const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        margin: 16,
        safeTop: onbSafeAreas().safeTop,
        safeLeft: onbSafeAreas().safeLeft,
        safeBottom: onbSafeAreas().safeBottom,
        safeRight: onbSafeAreas().safeRight
    };
    const targetRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const size = { width: bubble.offsetWidth, height: bubble.offsetHeight };
    const pos = computeTourBubbleRect(viewport, targetRect, step.placement || 'below', size);
    bubble.style.left = pos.left + 'px';
    bubble.style.top = pos.top + 'px';
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
}

function onbReposition() {
    if (!onboardingState.active) return;
    const step = tourModel.current() || ONBOARDING.steps[onboardingState.current];
    const target = document.getElementById(step.targetId);
    if (target) onbPositionFor(target);
}

/**
 * Resolve the current step's target element.
 * Policy: (1) immediate hit; (2) navigate to the step's page when a
 * step lives there and the element is not in the DOM yet; (3) bounded
 * retries after the navigation settles.
 */
async function onbResolveTarget(step) {
    let target = document.getElementById(step.targetId);
    if (target) return target;

    if (step.page && (typeof currentPage === 'undefined' || currentPage !== step.page)) {
        try { navigateTo(step.page); } catch (e) { /* navigation must never throw */ }
        await new Promise((r) => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => requestAnimationFrame(r));
            } else {
                setTimeout(r, 50);
            }
        });
        target = document.getElementById(step.targetId);
        if (target) return target;
    }

    // Bounded retry — pages render their targets asynchronously (data loads).
    for (let i = 0; i < 4 && !target; i++) {
        await new Promise((r) => setTimeout(r, 250));
        target = document.getElementById(step.targetId);
    }
    return target;
}

async function onbRender() {
    const step = tourModel.current();
    if (!step) { onbStop(); return; }

    const target = await onbResolveTarget(step);
    if (!target) {
        // Missing target policy: skip forward; never block the student.
        console.warn(`[Tour] Step target #${step.targetId} not found; skipping step.`);
        showToast('One of the tutorial steps could not be found and was skipped.', 'info');
        if (!tourModel.isLast()) onbGo(tourModel.getIndex() + 1);
        else onbFinish();
        return;
    }

    const bubble = bubbleEl();

    const iconEl = bubble.querySelector('.tour-bubble-icon');
    iconEl.innerHTML = '';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', step.icon);
    icon.setAttribute('aria-hidden', 'true');
    iconEl.appendChild(icon);

    bubble.querySelector('.tour-bubble-step').textContent = (tourModel.getIndex() + 1) + ' / ' + ONBOARDING.steps.length;
    bubble.querySelector('.tour-bubble-title').textContent = step.title;
    bubble.querySelector('.tour-bubble-text').textContent = step.text;
    bubble.querySelector('.tour-prev').disabled = tourModel.isFirst();
    const nextBtn = bubble.querySelector('.tour-next');
    nextBtn.textContent = tourModel.isLast() ? 'Finish' : 'Next';

    const dots = bubble.querySelector('.tour-bubble-dots');
    dots.setAttribute('aria-label', 'Step ' + (tourModel.getIndex() + 1) + ' of ' + ONBOARDING.steps.length);
    dots.innerHTML = '';
    ONBOARDING.steps.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'tour-dot' + (i === tourModel.getIndex() ? ' active' : '');
        dot.setAttribute('aria-hidden', 'true');
        dots.appendChild(dot);
    });

    onbPositionFor(target);
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        try { lucide.createIcons({ icons: lucide.icons }); } catch (e) { /* icon render must never break the tour */ }
    }
    bubble.focus({ preventScroll: true });
}

function onbGo(index) {
    if (!tourModel.go(index)) onbStop();
    else onbRender();
}

function startBeginnerTutorial() {
    if (onboardingState.active && !overlayEl().classList.contains('hidden')) return;
    onbEnsureOverlay();
    onboardingState.active = true;
    tourModel.reset();
    onboardingState.current = 0;
    onboardingState.returnFocus = document.activeElement;
    overlayEl().classList.remove('hidden');
    onbRender();
}

function overlayEl() {
    return onboardingState.overlay;
}

function onbFinish() {
    onbSetCompleted(true);
    try {
        if (PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.evidenceStore) {
            PseudoPyLearning.register.evidenceStore.saveTutorialProgress(evUserId(), { completed: true, step: ONBOARDING.steps.length, finishedAt: new Date().toISOString() });
        }
    } catch (e) { /* non-critical */ }
    onbStop();
    showToast('Tutorial completed. You can replay it from Settings.', 'success');
}

function restartBeginnerTutorial() {
    onbSetCompleted(false);
    startBeginnerTutorial();
}

function onbStop() {
    const wasActive = onboardingState.active;
    onboardingState.active = false;
    if (onboardingState.overlay) onboardingState.overlay.classList.add('hidden');
    if (wasActive && onboardingState.returnFocus && typeof onboardingState.returnFocus.focus === 'function' && document.contains(onboardingState.returnFocus)) {
        try { onboardingState.returnFocus.focus({ preventScroll: true }); } catch (e) { /* no-op */ }
    }
    onboardingState.returnFocus = null;
}

function maybeAutoStartTutorial() {
    if (!onbShouldAutoStart()) return;
    try { startBeginnerTutorial(); } catch (e) { /* never block navigation */ }
}

PseudoPyLearning.register.onboarding = {
    start: startBeginnerTutorial,
    restart: restartBeginnerTutorial,
    stop: onbStop,
    autoStart: maybeAutoStartTutorial,
    isCompleted: onbGetCompleted
};