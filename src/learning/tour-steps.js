/* ============================================================
   TOUR STEP DEFINITIONS — data only (no DOM, no state, no I/O)
   Each step may declare a `page` (navigation route) containing its
   target, so the tutorial controller can navigate students there
   at runtime. Steps without a page live in the persistent topbar.
   ============================================================ */

const TOUR_STEPS = [
    {
        targetId: 'pseudocode-editor',
        page: 'write-pseudocode',
        icon: 'square-pen',
        title: 'Start in the Editor',
        text: 'Write your pseudocode here in plain English. You can use BEGIN/END, DECLARE, INPUT, SET, IF/ELSE, FOR and WHILE.',
        placement: 'below'
    },
    {
        targetId: 'btn-translate-pseudocode',
        page: 'write-pseudocode',
        icon: 'refresh-cw',
        title: 'Translate to Python',
        text: 'Click this button to convert your pseudocode into real Python code using the built-in translator.',
        placement: 'below'
    },
    {
        targetId: 'python-output',
        page: 'write-pseudocode',
        icon: 'code-2',
        title: 'Read the Python Output',
        text: 'The translated Python appears here. Use the Learning Feedback panel below it to review what you did well and what to improve.',
        placement: 'above'
    },
    {
        targetId: 'btn-run-code',
        page: 'write-pseudocode',
        icon: 'play',
        title: 'Run Your Code',
        text: 'Run the translated Python locally to check that it behaves as you expected.',
        placement: 'above'
    },
    {
        targetId: 'console-output',
        page: 'write-pseudocode',
        icon: 'terminal',
        title: 'See Your Results',
        text: 'Program output, errors and runtime messages appear here — just like a real console.',
        placement: 'above'
    },
    {
        targetId: 'topbar-progress-pill',
        page: '',
        icon: 'trophy',
        title: 'Track Your Progress',
        text: 'Your skill progress and improvement summary live in Settings. From there you can replay this tutorial any time.',
        placement: 'left'
    }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TOUR_STEPS };
}