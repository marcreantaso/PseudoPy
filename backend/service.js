const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { idOf, collections, canRead, canWrite, publicRecord } = require('./access');
let database;
function store() {
    if (!database) {
        const { initializeApp, getApps, cert, applicationDefault } = require('firebase-admin/app');
        const { getFirestore } = require('firebase-admin/firestore');
        if (!getApps().length) initializeApp({ credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || 'pseudopy-e7e74' });
        database = getFirestore();
    }
    return database;
}
const fail = (status, message) => Object.assign(new Error(message), { status });
function secret() {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw fail(503, 'Server authentication is not configured.');
    return process.env.SESSION_SECRET;
}
const sign = data => crypto.createHmac('sha256', secret()).update(data).digest('base64url');
const stamp = user => crypto.createHash('sha256').update(user.passwordScrypt || user.passwordHash || user.password || '').digest('hex');
function equal(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x,y); }
async function verify(user, password) {
    if (typeof password !== 'string' || password.length > 1024) return false;
    if (user.passwordScrypt) {
        const [salt, hash] = user.passwordScrypt.split(':');
        return equal((await scrypt(password, salt, 64)).toString('hex'), hash);
    }
    if (user.passwordHash && user.passwordSalt) return equal(crypto.createHash('sha256').update(password + user.passwordSalt).digest('hex'), user.passwordHash);
    return typeof user.password === 'string' && equal(password, user.password);
}
function cookie(res, value, age=28800) { res.setHeader('Set-Cookie', `pseudopy_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : ''}`); }
async function authenticated(req) {
    const token = (req.headers.cookie || '').split('; ').find(v => v.startsWith('pseudopy_session='))?.slice(17);
    if (!token) throw fail(401, 'Please sign in.');
    const [body, signature] = token.split('.');
    if (!body || !signature || !equal(sign(body), signature)) throw fail(401, 'Session expired. Please sign in.');
    let claims;
    try { claims = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { throw fail(401, 'Invalid session.'); }
    if (claims.exp < Date.now()) throw fail(401, 'Session expired. Please sign in.');
    const doc = await store().collection('pseudopy_users').doc(claims.uid).get();
    const user = doc.exists ? { ...doc.data(), _docId: doc.id } : null;
    if (!user || ['archived','inactive'].includes(user.status) || claims.stamp !== stamp(user)) throw fail(401, 'Account or password changed. Please sign in.');
    if (user.role === 'instructor') {
        const device = await store().collection('pseudopy_devices').doc(claims.device).get();
        user.deviceApproved = device.exists && device.data().status === 'approved';
    }
    req.sessionClaims = claims;
    return user;
}
function renew(res, user, device) {
    const body = Buffer.from(JSON.stringify({ uid: idOf(user), stamp: stamp(user), device, exp: Date.now()+28800000 })).toString('base64url');
    cookie(res, body + '.' + sign(body));
}
async function login(req,res) {
    secret();
    const body = req.body || {};
    let username = String(body.username || '').trim();
    if (username === 'admin') username = 'mbautista_admin';
    if (!username || username.length > 150) throw fail(400, 'Enter a valid username.');
    // A persisted per-username throttle applies across serverless instances.
    const throttle = store().collection('pseudopy_loginLimits').doc(crypto.createHash('sha256').update(username).digest('hex'));
    await store().runTransaction(async tx => {
        const old = (await tx.get(throttle)).data() || {};
        const now = Date.now();
        const count = now - (old.start || 0) < 60000 ? (old.count || 0) + 1 : 1;
        if (count > 10) throw fail(429, 'Too many login attempts. Try again in a minute.');
        tx.set(throttle, { count, start: count === 1 ? now : old.start });
    });
    const rows = await store().collection('pseudopy_users').where('username','==',username).limit(1).get();
    const doc = rows.docs[0];
    if (!doc || !(await verify(doc.data(), body.password))) throw fail(401, 'Incorrect username or password.');
    let user = { ...doc.data(), _docId: doc.id };
    if (['archived','inactive'].includes(user.status)) throw fail(403, 'This account is inactive. Contact your administrator.');
    if (!user.passwordScrypt) {
        const salt = crypto.randomBytes(16).toString('hex');
        user.passwordScrypt = salt + ':' + (await scrypt(body.password, salt, 64)).toString('hex');
        delete user.password; delete user.passwordHash; delete user.passwordSalt;
        await doc.ref.set(user);
    }
    let deviceId;
    if (user.role === 'instructor') {
        const fingerprint = body.device || {};
        if (!/^[a-zA-Z0-9_-]{1,150}$/.test(fingerprint.deviceId || '')) throw fail(400, 'Device identifier required.');
        deviceId = 'device_' + crypto.createHash('sha256').update(doc.id + ':' + fingerprint.deviceId).digest('hex');
        const devices = store().collection('pseudopy_devices');
        const deviceRef = devices.doc(deviceId);
        await store().runTransaction(async tx => {
            const existing = await tx.get(devices.where('userId','==',doc.id));
            const match = existing.docs.find(d => d.data().deviceId === fingerprint.deviceId);
            if (match) { deviceId = match.id; return; }
            tx.set(deviceRef, { _docId:deviceId, userId:doc.id, username:user.username, deviceId:fingerprint.deviceId, deviceName:String(fingerprint.deviceName || 'Browser').slice(0,150), os:String(fingerprint.os || ''), status:existing.empty ? 'approved' : 'pending', requestedAt:new Date().toISOString() });
        });
    }
    renew(res,user,deviceId);
    return res.json(publicRecord(user));
}
async function recovery(req,res,id) {
    const collection = store().collection('pseudopy_passwordRequests');
    if (id === 'recover') {
        const lookup = String(req.body.lookup || '').trim();
        if (!lookup || lookup.length > 150) throw fail(400,'Enter your username, email or student ID.');
        const matches = await Promise.all(['username','email','studentId'].map(field=>store().collection('pseudopy_users').where(field,'==',lookup).limit(1).get()));
        const doc = matches.flatMap(s=>s.docs)[0];
        if (!doc || !['student','instructor'].includes(doc.data().role)) throw fail(400,'Contact your instructor or administrator for account recovery.');
        const user = doc.data();
        const existing = await collection.where('userId','==',doc.id).where('status','==','pending').get();
        if (!existing.empty) throw fail(409,'A recovery request is already pending. Continue in the browser where you requested it, or contact your administrator.');
        const ref = collection.doc();
        const proof = crypto.randomBytes(32).toString('hex');
        await ref.set({ _docId:ref.id,type:'recovery',userRole:user.role,targetRole:user.role,userId:doc.id,studentId:doc.id,studentName:user.fullName,studentUsername:user.username,studentEnrolledId:user.studentId || '',email:user.email || '',instructorId:user.instructorId || null,status:'pending',requestedAt:new Date().toISOString(),proofHash:crypto.createHash('sha256').update(proof).digest('hex'),tokenUsed:false });
        return res.json({requestId:ref.id,proof,name:user.fullName});
    }
    const requestId = req.body.requestId;
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(requestId)) throw fail(400,'Recovery request required.');
    let response;
    const password = req.body.password;
    let passwordScrypt;
    if (id === 'reset') {
        if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw fail(400,'Use a password of at least 8 characters.');
        const salt = crypto.randomBytes(16).toString('hex');
        passwordScrypt = salt + ':' + (await scrypt(password,salt,64)).toString('hex');
    }
    await store().runTransaction(async tx=> {
        const ref = collection.doc(requestId);
        const doc = await tx.get(ref);
        const request = doc.data();
        if (!request || !equal(request.proofHash,crypto.createHash('sha256').update(String(req.body.proof || '')).digest('hex'))) throw fail(403,'Recovery proof is invalid. Use the browser that requested recovery.');
        response = {requestId,status:request.status,expiresAt:request.tokenExpiresAt};
        if (id !== 'reset') return;
        if (request.status !== 'approved' || request.tokenUsed || request.tokenExpiresAt <= Date.now()) throw fail(403,'Recovery is not approved or has expired.');
        const userRef = store().collection('pseudopy_users').doc(request.userId);
        const userDoc = await tx.get(userRef);
        const user = userDoc.data();
        if (!user || ['archived','inactive'].includes(user.status)) throw fail(403,'Account is inactive.');
        delete user.password; delete user.passwordHash; delete user.passwordSalt;
        tx.set(userRef,{...user,passwordScrypt});
        tx.update(ref,{status:'completed',tokenUsed:true,completedAt:new Date().toISOString()});
        response = {success:true};
    });
    return res.json(response);
}
async function handle(req,res,collection,id) {
    res.setHeader('Cache-Control','no-store');
    try {
        if (req.method !== 'GET' && req.headers['x-pseudopy-request'] !== '1') throw fail(403,'Same-origin application request required.');
        if (collection === 'auth' && id === 'login' && req.method === 'POST') return await login(req,res);
        if (collection === 'auth' && id === 'logout' && req.method === 'POST') { cookie(res,'',0); return res.json({success:true}); }
        if (collection === 'auth' && ['recover','recovery-status','reset'].includes(id) && req.method === 'POST') return await recovery(req,res,id);
        const user = await authenticated(req);
        if (collection === 'auth' && id === 'password' && req.method === 'POST') {
            if (user.role === 'instructor' && !user.deviceApproved) throw fail(403,'Device approval required.');
            const password = req.body.password;
            if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw fail(400,'Use at least 8 characters.');
            if (req.body.currentPassword !== undefined && !(await verify(user,req.body.currentPassword))) throw fail(403,'Incorrect current password.');
            const salt = crypto.randomBytes(16).toString('hex');
            user.passwordScrypt = salt + ':' + (await scrypt(password,salt,64)).toString('hex');
            delete user.password; delete user.passwordHash; delete user.passwordSalt; delete user.deviceApproved;
            await store().collection('pseudopy_users').doc(idOf(user)).set(user);
            renew(res,user,req.sessionClaims.device);
            return res.json(publicRecord(user));
        }
        if (collection === 'auth' && id === 'verify' && req.method === 'POST') return res.json({ valid: await verify(user, req.body.password) });
        if (collection === 'auth' && id === 'session' && req.method === 'GET') return res.json(publicRecord(user));
        if (!collections.includes(collection)) throw fail(404,'Unknown collection.');
        if (user.role === 'instructor' && !user.deviceApproved && !(collection === 'pseudopy_devices' && req.method === 'GET')) throw fail(403,'This device requires administrator approval.');
        const ref = store().collection(collection);
        if (req.method === 'GET') {
            if (id && id !== 'count') {
                const doc = await ref.doc(id).get();
                const row = doc.exists ? {...doc.data(),_docId:doc.id} : null;
                if (!row || !canRead(user,collection,row)) throw fail(404,'Record not found.');
                return res.json(publicRecord(row));
            }
            const snap = await ref.get();
            const rows = snap.docs.map(d=>({...d.data(),_docId:d.id})).filter(r=>canRead(user,collection,r) && !(collection === 'pseudopy_activity' && (r.isDemo || r._docId.startsWith('act_sp_')))).map(publicRecord);
            return res.json(id === 'count' ? {count:rows.length} : rows);
        }
        if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) throw fail(405,'Method not allowed.');
        id = id || req.body?._docId || crypto.randomUUID();
        if (!/^[a-zA-Z0-9_.-]{1,240}$/.test(id)) throw fail(400,'Invalid record identifier.');
        const docRef = ref.doc(id);
        let saved;
        await store().runTransaction(async tx => {
            const doc = await tx.get(docRef);
            const previous = doc.exists ? {...doc.data(),_docId:id} : null;
            if (collection === 'pseudopy_users' && (req.body.password !== undefined || req.body.passwordScrypt !== undefined)) throw fail(400,'Use the password management endpoint.');
            const next = {...previous,...req.body,_docId:id};
            if (collection === 'pseudopy_activity' && user.role === 'student') {
                next.student = user.fullName; next.studentId = user.studentId || idOf(user); next.username = user.username; next.section = user.section || '';
            }
            for (const key of ['fullName','username','email','studentId','section','student','score','result','difficulty','status']) {
                if (typeof next[key] === 'string' && /[<>]/.test(next[key])) throw fail(400,'Use plain text in ' + key + '. Put program code in the code editor.');
            }
            if (!canWrite(user,collection,previous,next,req.method)) throw fail(403,'You are not authorized to change this record.');
            if (collection === 'pseudopy_notifications' && !previous && user.role !== 'admin') {
                const recipient = await tx.get(store().collection('pseudopy_users').doc(next.studentId));
                if (!recipient.exists || recipient.data().instructorId !== idOf(user)) throw fail(403,'Student is not assigned to you.');
            }
            if (collection === 'pseudopy_passwordRequests' && !previous && user.role !== 'admin') {
                const target = await tx.get(store().collection('pseudopy_users').doc(next.studentId));
                if (!target.exists || target.data().role !== 'student' || target.data().instructorId !== idOf(user)) throw fail(403,'Student is not assigned to you.');
            }
            if (collection === 'pseudopy_users' && (!previous || next.username !== previous.username)) {
                if (typeof next.username !== 'string' || !next.username.trim() || typeof next.fullName !== 'string' || !['student','instructor','admin'].includes(next.role)) throw fail(400,'Username, name and a valid role are required.');
                const duplicates = await tx.get(ref.where('username','==',next.username).limit(1));
                if (duplicates.docs.some(doc => doc.id !== id)) throw fail(409,'This username is already in use.');
                if (!previous && !req.body.passwordHash) throw fail(400,'A password is required for a new account.');
            }
            if (collection === 'pseudopy_users' && req.body.passwordHash) {
                if (!/^[a-f0-9]{64}$/.test(req.body.passwordHash) || !/^[a-f0-9]{32}$/.test(req.body.passwordSalt || '')) throw fail(400,'Invalid password format.');
                delete next.password; delete next.passwordScrypt;
            }
            if (collection === 'pseudopy_passwordRequests' && previous && next.status === 'approved') {
                next.tokenExpiresAt = Date.now() + 30*60000; next.tokenUsed = false;
                next.reviewedBy = idOf(user); delete next.resetToken;
            }
            delete next.deviceApproved;
            if (req.method === 'DELETE') tx.delete(docRef); else tx.set(docRef,next);
            saved = next;
        });
        // Password changes invalidate the session; the user signs in again.
        return res.json(req.method === 'DELETE' ? {success:true,deleted:true} : publicRecord(saved));
    } catch (error) {
        if (!error.status) console.error('[API]',error.message);
        return res.status(error.status || 503).json({error:error.status ? error.message : 'Database unavailable. Check server configuration and connectivity.'});
    }
}
module.exports = { handle, verify, store };
