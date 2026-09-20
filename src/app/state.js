/* ============================================================
   PSEUDOPY — APP.JS
   Automated Code Generation System
   Powered by Offline LocalStorage Database
   ============================================================ */

console.log('[App] app.js script is parsing and executing top-level');

// ── State ──
let currentUser = null;
let currentPage = '';
let editingExerciseId = null;
let editingUserId = null;
let currentErrorLineNumbers = [];
let exerciseState = {
    isTranslated: false,
    isExecuted: false,
    outputMatched: false,
    expectedOutput: null,
    expectedOutputResolved: false,
    activeExercise: null,
    resubmissionOf: null
};

// ── Cached data (loaded from Offline Database) ──
let cachedUsers = [];
let cachedExercises = [];
let cachedActivity = [];
let cachedDevices = [];
let activeDeviceInstructorId = null;
let pendingDeviceAuthData = null;
let instructorExOffset = 0;
let studentExOffset = 0;
const EX_PAGE_LIMIT = 20;

// ── Instructor Management State ──
let allCachedInstructors = [];
let filteredInstructors = [];
let instructorPage = 1;
const INSTR_PAGE_SIZE = 10;
let pendingArchiveInstructorId = null;
let pendingRestoreInstructorId = null;
let editingInstructorId = null;


