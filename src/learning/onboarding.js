/* ============================================================
   PSEUDOPY LEARNING LAYER — Beginner Tutorial (Onboarding)
   ------------------------------------------------------------
   A step-by-step guided tour of the Write Pseudocode page for
   students. State is stored under 'pseudopy_tutorial_completed'
   behind a small adapter so Phase 6 can back it with the
   pseudopy_tutorialProgress DB ref without changing the UI code.
   ============================================================ */

const ONBOARDING = {
    storageKey: 'pseudopy_tutorial_completed',
    steps: [
        {
            targetId: 'pseudocode-editor',
            icon: 'square-pen',
            title: 'Start in the Editor',
            text: 'Write your pseudocode here in plain English. You can use BEGIN/END, DECLARE, INPUT, SET, IF/ELSE, FOR and WHILE.',
            placement: 'below'
        },
        {
            targetId: 'btn-translate-pseudocode',
            icon: 'refresh-cw',
            title: 'Translate to Python',
            text: 'Click this button to convert your pseudocode into real Python code using the built-in translator.',
            placement: 'below'
        },
        {
            targetId: 'python-output',
            icon: 'code-2',
            title: 'Read the Python Output',
            text: 'The translated Python appears here. Use the Learning Feedback panel below it to review what you did well and what to improve.',
            placement: 'above'
        },
        {
            targetId: 'btn-run-code',
            icon: 'play',
            title: 'Run Your Code',
            text: 'Run the translated Python locally to check that it behaves as you expected.',
            placement: 'above'
        },
        {
            targetId: 'console-output',
            icon: 'terminal',
            title: 'See Your Results',
            text: 'Program output, errors and runtime messages appear here — just like a real console.',
            placement: 'above'
        },
        {
            targetId: 'topbar-progress-pill',
            icon: 'trophy',
            title: 'Track Your Progress',
            text: 'Your skill progress and improvement summary live in Settings. From there you can replay this tutorial any time.',
            placement: 'left'
        }
    ]
};

const onboardingState = {
    overlay: null,
    spotlight: null,
    bubble: null,
    current: 0,
    active: false
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
      <div class="tour-bubble">
        <div class="tour-bubble-head"><span class="tour-bubble-icon"></span><h4 class="tour-bubble-title"></h4></div>
        <p class="tour-bubble-text"></p>
        <div class="tour-bubble-dots"></div>
        <div class="tour-bubble-actions">
          <button class="btn btn-ghost btn-sm tour-skip">Skip tour</button>
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
    overlay.querySelector('.tour-prev').addEventListener('click', () => onbGo(onboardingState.current - 1));
    overlay.querySelector('.tour-next').addEventListener('click', () => {
        if (onboardingState.current >= ONBOARDING.steps.length - 1) onbFinish();
        else onbGo(onboardingState.current + 1);
    });
    window.addEventListener('resize', onbReposition);
    window.addEventListener('scroll', onbReposition, { passive: true });
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

    const step = ONBOARDING.steps[onboardingState.current];
    const bubbleStyle = onbBubbleStyle(step.placement || 'below', rect, top, left, width, height);
    Object.keys(bubbleStyle).forEach(k => (onboardingState.bubble.style[k] = bubbleStyle[k]));
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', step.icon);
    const iconSlot = onboardingState.bubble.querySelector('.tour-bubble-icon');
    iconSlot.innerHTML = '';
    iconSlot.appendChild(icon);
    overlay.style.setProperty('--tour-bubble-w', onboardingState.bubble.offsetWidth + 'px');
}

function onbBubbleStyle(placement, rect, top, left, width, height) {
    const gap = 12;
    const base = { position: 'absolute' };
    const vw = window.innerWidth;
    if (placement === 'above') {
        base.bottom = (window.innerHeight - rect.top + gap) + 'px';
        base.left = (left + width / 2) + 'px';
        base.transform = 'translateX(-50%)';
    } else if (placement === 'left') {
        base.right = (vw - rect.left + gap) + 'px';
        base.top = (top + height / 2) + 'px';
        base.transform = 'translateY(-50%)';
        if (onboardingState.bubble && (vw - rect.left - gap - onboardingState.bubble.offsetWidth) < 8) {
            base.right = '12px';
        }
    } else {
        base.top = (rect.top + height + gap) + 'px';
        base.left = (left + width / 2) + 'px';
        base.transform = 'translateX(-50%)';
        if (onboardingState.bubble && (rect.left + width / 2 + onboardingState.bubble.offsetWidth / 2) > vw - 12) {
            base.left = (vw - 12) + 'px';
            base.transform = 'translateX(-100%)';
        }
    }
    return base;
}

function onbReposition() {
    if (!onboardingState.active) return;
    const step = ONBOARDING.steps[onboardingState.current];
    const target = document.getElementById(step.targetId);
    if (target) onbPositionFor(target);
}

function onbRender() {
    const step = ONBOARDING.steps[onboardingState.current];
    const target = document.getElementById(step.targetId);
    if (!target) { onbStop(); return; }
    onboardingState.bubble.querySelector('.tour-bubble-title').textContent = step.title;
    onboardingState.bubble.querySelector('.tour-bubble-text').textContent = step.text;
    onboardingState.bubble.querySelector('.tour-prev').disabled = onboardingState.current === 0;
    const nextBtn = onboardingState.bubble.querySelector('.tour-next');
    nextBtn.textContent = onboardingState.current >= ONBOARDING.steps.length - 1 ? 'Finish' : 'Next';

    const dots = onboardingState.bubble.querySelector('.tour-bubble-dots');
    dots.innerHTML = '';
    ONBOARDING.steps.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'tour-dot' + (i === onboardingState.current ? ' active' : '');
        dots.appendChild(dot);
    });
    onbPositionFor(target);
}

function onbGo(index) {
    if (index < 0 || index >= ONBOARDING.steps.length) return;
    onboardingState.current = index;
    onbRender();
}

function startBeginnerTutorial() {
    onbEnsureOverlay();
    onboardingState.active = true;
    onboardingState.current = 0;
    onboardingState.overlay.classList.remove('hidden');
    onbRender();
    if (typeof lucide !== 'undefined') lucide.createIcons({ icons: lucide.icons });
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
    onboardingState.active = false;
    if (onboardingState.overlay) onboardingState.overlay.classList.add('hidden');
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