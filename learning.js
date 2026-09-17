/* Learning feedback uses real attempts. No demo records enter user analytics. */
const beginnerExamples = [
    { title:'Add two numbers', input:['4','7'], expected:'11', pseudocode:'BEGIN\nDECLARE first AS INTEGER\nDECLARE second AS INTEGER\nINPUT first\nINPUT second\nDISPLAY first + second\nEND' },
    { title:'Odd or even', input:['5'], expected:'Odd', pseudocode:'BEGIN\nDECLARE number AS INTEGER\nINPUT number\nIF number MOD 2 = 0 THEN\nDISPLAY "Even"\nELSE\nDISPLAY "Odd"\nEND IF\nEND' },
    { title:'A conditional decision', input:['75'], expected:'Passed', pseudocode:'BEGIN\nDECLARE grade AS FLOAT\nINPUT grade\nIF grade >= 60 THEN\nDISPLAY "Passed"\nELSE\nDISPLAY "Try again"\nEND IF\nEND' },
    { title:'A counting loop', input:[], expected:'1\n2\n3', pseudocode:'BEGIN\nFOR count FROM 1 TO 3 DO\nDISPLAY count\nEND FOR\nEND' }
];
function installLearningGuide() {
    document.querySelectorAll('.operator-guide').forEach(guide => {
        if (guide.dataset.tutorialInstalled) return;
        guide.dataset.tutorialInstalled = 'true';
        const panel = document.createElement('div');
        const intro = document.createElement('p');
        intro.textContent = 'Beginner walkthrough: describe your steps between BEGIN and END → declare variables → translate → run → submit each INPUT with Enter → read the console feedback. You can close this guide at any time and reopen it to replay.';
        panel.appendChild(intro);
        const typing = document.createElement('p');
        typing.textContent = 'Python input() returns text. INTEGER generates int(input()); FLOAT/REAL generates float(input()). These are similar to Java Scanner nextInt() and nextDouble(), but Python input() itself does not convert numbers. Assign with SET name TO value; compare with = or == inside IF. Translation preserves your algorithm; successful execution alone does not prove it solves a problem.';
        panel.appendChild(typing);
        beginnerExamples.forEach(example => {
            const detail = document.createElement('details');
            const title = document.createElement('summary');
            title.textContent = example.title;
            const pseudo = document.createElement('pre');
            pseudo.textContent = example.pseudocode;
            const pythonLabel = document.createElement('p');
            pythonLabel.textContent = 'Generated Python';
            const python = document.createElement('pre');
            const compiled = compilerEngine.compile(example.pseudocode);
            python.textContent = compiled.valid ? compiled.python : 'Example unavailable.';
            const io = document.createElement('pre');
            io.textContent = 'Sample input: ' + (example.input.join(', ') || '(none)') + '\nExpected output:\n' + example.expected;
            detail.append(title, pseudo, pythonLabel, python, io);
            panel.appendChild(detail);
        });
        guide.appendChild(panel);
    });
}
async function recordLearningAttempt(kind, details = {}) {
    if (!currentUser || currentUser.role !== 'student') return;
    const user = currentUser;
    const exercise = currentPage === 'write-pseudocode' ? exerciseState.activeExercise : null;
    const id = 'attempt_' + crypto.randomUUID();
    const row = { _docId:id, kind, userId:user._docId || user.id, studentId:user.studentId || user.id,
        username:user.username, student:user.fullName, section:user.section || '', instructorId:user.instructorId || null,
        exerciseId:exercise?._docId || exercise?.id || null, exercise:exercise?.title || 'Independent practice',
        difficulty:exercise?.difficulty || '', status:details.errorType ? 'Failed' : 'In Progress',
        score:'—', result:details.errorType || 'Success', errorType:details.errorType || null,
        timestamp:Date.now(), time:new Date().toISOString(), processingTime:details.durationMs == null ? '—' : (details.durationMs/1000).toFixed(3)+'s',
        output:details.output || '', errors:details.errors || [] };
    try { await dbSet(activityRef,id,row); }
    catch(error) { showToast('Attempt was not saved: ' + error.message,'error'); }
}
let learningSyncTimer = null;
let learningSyncGeneration = 0;
function stopLearningSync() { clearTimeout(learningSyncTimer); learningSyncGeneration++; }
function startLearningSync() {
    stopLearningSync();
    const generation = learningSyncGeneration;
    const userId = currentUser?._docId || currentUser?.id;
    const valid = () => generation === learningSyncGeneration && userId === (currentUser?._docId || currentUser?.id);
    async function refresh() {
        if (!valid()) return;
        try {
            if (!document.hidden) {
                const [users, exercises, activity] = await Promise.all([dbGetAll(usersRef), dbGetAll(exercisesRef), dbGetAll(activityRef)]);
                if (!valid()) return;
                cachedUsers = users; cachedExercises = exercises; cachedActivity = activity;
                if (currentPage === 'analytics') {
                    cachedInstructorActivity = activity;
                    applyAnalyticsFilters();
                }
                if (currentUser.role === 'student') await loadStudentProgress();
                updateDataStatus('Synchronized · refreshes every 10 seconds');
            }
        } catch(error) {
            if (!valid()) return;
            updateDataStatus('Data unavailable · displayed data may be outdated');
            if (error.status === 401) { handleLogout('expired'); return; }
        }
        if (valid()) learningSyncTimer = setTimeout(refresh,10000);
    }
    refresh();
}
function updateDataStatus(text) {
    let status = document.getElementById('data-sync-status');
    if (!status) {
        status = document.createElement('span');
        status.id = 'data-sync-status';
        status.className = 'text-muted';
        status.setAttribute('role','status');
        const welcome = document.getElementById('topbar-welcome');
        welcome?.parentElement.appendChild(status);
    }
    status.textContent = text;
}
function restoreLearningDrafts() {
    const uid = currentUser._docId || currentUser.id;
    const editors = ['pseudocode-editor','translate-input','execute-editor','instructor-pseudo-input'];
    for (const id of editors) {
        const editor = document.getElementById(id);
        if (!editor) continue;
        try { editor.value = localStorage.getItem('pseudopy_draft_' + uid + '_' + id) || ''; } catch {}
        if (!editor.dataset.draftListener) {
            editor.dataset.draftListener = 'true';
            editor.addEventListener('input', () => {
                if (!currentUser) return;
                try { localStorage.setItem('pseudopy_draft_' + (currentUser._docId || currentUser.id) + '_' + id,editor.value); }
                catch { showToast('Draft could not be saved on this device.','error'); }
            });
        }
        editor.dispatchEvent(new Event('input'));
    }
    let exerciseId;
    try { exerciseId = localStorage.getItem('pseudopy_active_exercise_' + uid); } catch {}
    if (exerciseId && currentUser.role === 'student') dbGet(exercisesRef,exerciseId).then(exercise=> {
        if (exercise && currentUser && uid === (currentUser._docId || currentUser.id)) renderActiveExercise(exercise);
    }).catch(()=>{});
}
