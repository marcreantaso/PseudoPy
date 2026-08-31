// Test Suite for Instructor Password Change with Admin Approval
const fs = require('fs');
const vm = require('vm');

let passCount = 0;
let failCount = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        passCount++;
    } else {
        console.error(`  ❌ FAIL: ${testName}`);
        failCount++;
    }
}

const domElements = {};
function getMockEl(id) {
    if (!domElements[id]) {
        const el = {
            id,
            value: '',
            _text: '',
            get textContent() { return this._text; },
            set textContent(v) { this._text = String(v); this.innerText = String(v); },
            get innerText() { return this._text; },
            set innerText(v) { this._text = String(v); },
            innerHTML: '',
            style: {},
            classList: {
                toggle: () => {},
                add: () => {},
                remove: () => {},
                contains: () => false
            },
            addEventListener: () => {},
            scrollTop: 0,
            scrollLeft: 0,
            focus: () => {},
            appendChild: () => {},
            remove: () => {},
            querySelector: () => ({ textContent: 'Mock User' })
        };
        domElements[id] = el;
    }
    return domElements[id];
}

const context = {
    console: console,
    crypto: require('crypto').webcrypto,
    TextEncoder: TextEncoder,
    Uint8Array: Uint8Array,
    localStorage: {
        _data: {},
        getItem(k) { return this._data[k] || null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; }
    },
    sessionStorage: {
        _data: {},
        getItem(k) { return this._data[k] || null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; },
        clear() { this._data = {}; }
    },
    window: {
        addEventListener: () => {},
        removeEventListener: () => {},
        screen: { width: 1920, height: 1080 }
    },
    screen: { width: 1920, height: 1080 },
    document: {
        documentElement: { setAttribute() {} },
        body: { classList: { add: () => {} }, style: {} },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        getElementById: getMockEl,
        createElement: (tag) => getMockEl('new_' + tag),
        addEventListener: () => {},
        removeEventListener: () => {}
    },
    navigator: { userAgent: 'test-agent' },
    setTimeout: (fn, ms) => setTimeout(fn, ms || 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms || 1000),
    clearInterval: (id) => clearInterval(id),
    Chart: function() { this.destroy = () => {}; this.update = () => {}; }
};
context.window.window = context.window;
context.window.document = context.document;
context.window.localStorage = context.localStorage;
context.window.navigator = context.navigator;

vm.createContext(context);

const files = ['database.js', 'mapper.js', 'compiler.js', 'metrics.js', 'app.js'];
files.forEach(f => {
    const code = fs.readFileSync(f, 'utf8');
    vm.runInContext(code, context);
});

async function runTests() {
    console.log('====================================================');
    console.log('INSTRUCTOR PASSWORD CHANGE & ADMIN APPROVAL TESTS');
    console.log('====================================================');

    await vm.runInContext('init()', context);

    // Test 1: Submit Instructor Password Recovery Request
    console.log('\n--- 1. Testing Instructor Recovery Request Submission ---');
    getMockEl('fp-username-input').value = 'mreantaso_instructor';
    await vm.runInContext('submitRecoveryRequest()', context);

    const requests = await vm.runInContext('dbGetAll(passwordRequestsRef)', context);
    const instReq = requests.find(r => r.studentUsername === 'mreantaso_instructor' && r.userRole === 'instructor');
    assert(instReq !== undefined, 'Instructor recovery request created in database');
    assert(instReq && instReq.status === 'pending', 'Instructor request status is pending');
    assert(instReq && instReq.targetRole === 'instructor', 'Request targetRole is instructor');

    // Test 2: Admin views Instructor Requests
    console.log('\n--- 2. Testing Admin Visibility of Requests ---');
    await vm.runInContext("currentUser = { id: 'u1', _docId: 'u1', username: 'mbautista_admin', role: 'admin', fullName: 'Mark Bautista' }", context);
    await vm.runInContext('loadPasswordRequests()', context);

    const adminPendingCount = parseInt(getMockEl('stat-admin-recovery-pending').innerText || '0', 10);
    assert(adminPendingCount >= 1, 'Admin sees at least 1 pending instructor request in KPI');
    assert(getMockEl('admin-recovery-requests-body').innerHTML.includes('Marc Reantaso'), 'Instructor name appears in Admin recovery table');

    // Test 3: Admin Reviews and Approves the Request
    console.log('\n--- 3. Testing Admin Review and Approval ---');
    await vm.runInContext(`openAdminRecoveryReview('${instReq._docId}')`, context);
    const activeReqId = await vm.runInContext('currentAdminReviewRequestId', context);
    assert(activeReqId === instReq._docId, 'currentAdminReviewRequestId correctly set');

    await vm.runInContext('approveAdminRecoveryRequest()', context);
    const updatedReq = await vm.runInContext(`dbGet(passwordRequestsRef, '${instReq._docId}')`, context);
    assert(updatedReq.status === 'approved', 'Request status transitioned to approved');
    assert(!!updatedReq.resetToken, 'Secure resetToken generated');
    assert(updatedReq.tokenExpiresAt > Date.now(), 'Token expiry is set in future (30 mins)');
    assert(updatedReq.reviewedBy === 'u1', 'ReviewedBy recorded as Admin ID');

    // Test 4: Instructor Checks Recovery Status and Submits New Password
    console.log('\n--- 4. Testing Instructor Password Reset ---');
    getMockEl('fp-check-username').value = 'mreantaso_instructor';
    await vm.runInContext('checkRecoveryStatus()', context);

    assert(getMockEl('fp-reset-request-id').value === instReq._docId, 'Reset form populated with request ID');
    assert(getMockEl('fp-reset-student-id').value === 'u2', 'Reset form populated with instructor docId');

    // Instructor inputs new password
    getMockEl('fp-reset-new-password').value = 'NewInstPass123!';
    getMockEl('fp-reset-confirm-password').value = 'NewInstPass123!';
    await vm.runInContext('submitPasswordReset()', context);

    const completedReq = await vm.runInContext(`dbGet(passwordRequestsRef, '${instReq._docId}')`, context);
    assert(completedReq.status === 'completed', 'Request status transitioned to completed');
    assert(completedReq.tokenUsed === true, 'Token is marked as used');

    // Test 5: Instructor Login with New Password
    console.log('\n--- 5. Testing Instructor Login with New Password ---');
    getMockEl('login-username').value = 'mreantaso_instructor';
    getMockEl('login-password').value = 'NewInstPass123!';
    await vm.runInContext('handleLogin()', context);
    const loggedInUser = await vm.runInContext('currentUser', context);
    assert(loggedInUser && loggedInUser.username === 'mreantaso_instructor', 'Instructor successfully logged in with new password');

    // Test 6: Testing Admin Rejection Flow
    console.log('\n--- 6. Testing Admin Rejection Flow ---');
    // Create new request for another instructor (cruz_admin)
    getMockEl('fp-username-input').value = 'cruz_admin';
    await vm.runInContext('submitRecoveryRequest()', context);

    const allReqs = await vm.runInContext('dbGetAll(passwordRequestsRef)', context);
    const cruzReq = allReqs.find(r => r.studentUsername === 'cruz_admin' && r.status === 'pending');
    assert(cruzReq !== undefined, 'Second instructor recovery request created');

    await vm.runInContext("currentUser = { id: 'u1', _docId: 'u1', username: 'mbautista_admin', role: 'admin', fullName: 'Mark Bautista' }", context);
    await vm.runInContext(`openAdminRecoveryReview('${cruzReq._docId}')`, context);
    await vm.runInContext('rejectAdminRecoveryRequest()', context);

    const rejectedReq = await vm.runInContext(`dbGet(passwordRequestsRef, '${cruzReq._docId}')`, context);
    assert(rejectedReq.status === 'rejected', 'Request status transitioned to rejected');

    console.log('\n====================================================');
    console.log(`TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('====================================================');

    process.exit(failCount > 0 ? 1 : 0);
}

runTests();
