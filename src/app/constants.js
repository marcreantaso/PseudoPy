/* ============================================================
   SHARED APPLICATION CONSTANTS
   Single source of truth for page ids, role navigation, labels
   and browser-storage keys. Kept byte-identical to the original
   inline strings so the refactor stays behavior-neutral.
   ============================================================ */

// Every top-level (protected) page id in the app shell.
const PAGES = [
    'write-pseudocode',
    'translate',
    'execute',
    'feedback',
    'exercises-student',
    'student-settings',
    'change-password',
    'analytics',
    'manage-students',
    'manage-exercises',
    'generate-code',
    'compiler-metrics',
    'password-recovery',
    'manage-users',
    'password-requests',
    'admin-execute',
    'developer-options'
];

// Access-control lists (role -> allowed page ids). Order mirrors the
// historical checkAccess() layout; do not change without a test change.
const PAGES_BY_ROLE = {
    admin: ['manage-users', 'password-requests', 'admin-execute', 'developer-options'],
    instructor: ['analytics', 'manage-exercises', 'generate-code', 'compiler-metrics', 'manage-students', 'password-recovery'],
    student: ['write-pseudocode', 'translate', 'execute', 'feedback', 'exercises-student', 'student-settings', 'change-password']
};

// Landing page shown after login when no route is being restored.
const DEFAULT_PAGE_BY_ROLE = {
    student: 'write-pseudocode',
    instructor: 'analytics',
    admin: 'manage-users'
};

// Topbar title per page (fallback 'Dashboard' in navigateTo).
const PAGE_TITLES = {
    'write-pseudocode': 'Write Pseudocode',
    'translate': 'Translate Pseudocode',
    'execute': 'Execute Code',
    'feedback': 'Feedback & Suggestions',
    'exercises-student': 'Exercises & Tasks',
    'analytics': 'Learning Analytics',
    'manage-students': 'Manage Students',
    'manage-exercises': 'Manage Exercises',
    'generate-code': 'Generate Python Code',
    'manage-users': 'Manage Instructors',
    'admin-execute': 'Execute Code',
    'change-password': 'Change Password',
    'student-settings': 'Settings',
    'password-requests': 'Security Audit Log',
    'password-recovery': 'Password Recovery',
    'compiler-metrics': 'Compiler Metrics & Evaluation',
    'developer-options': 'Developer Options'
};

// Role display labels and sidebar badge classes.
const ROLE_LABELS = { student: 'Student', instructor: 'Instructor', admin: 'Administrator' };
const ROLE_BADGES = { student: 'badge-student', instructor: 'badge-instructor', admin: 'badge-admin' };

// Browser-storage keys (localStorage unless suffixed with SESSION).
const STORAGE_KEYS = {
    SESSION_USER: 'pseudopy_session_user',
    ROUTE: 'pseudopy_route',
    THEME: 'pseudopy_theme',
    ACTIVE_EXERCISE: 'pseudopy_active_exercise',
    DEVICE_ID: 'pseudopy_device_id',
    EDITOR_DRAFT: 'pseudopy_editor_draft',
    TUTORIAL_COMPLETED: 'pseudopy_tutorial_completed',
    UPDATE_DISMISSED: 'pseudopy_update_dismissed',
    LOCAL_PREFIX: 'pseudopy_local_'
};