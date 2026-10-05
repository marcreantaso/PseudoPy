// Dependency-free Chrome DevTools Protocol harness for PseudoPy QA runs.
// Node 22+ exposes a global WebSocket, so Playwright is not required.
// Used by scripts/qa/*.cjs to emulate offline, resize viewports and capture
// before/after screenshots without adding a runtime dependency.
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME_CANDIDATES = [
    process.env.CHROMIUM_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
    for (const candidate of CHROME_CANDIDATES) {
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error('No Chrome/Chromium binary found. Set CHROMIUM_PATH.');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url, attempts = 40) {
    for (let i = 0; i < attempts; i++) {
        try {
            const response = await fetch(url);
            if (response.ok) return await response.json();
        } catch (e) { /* not listening yet */ }
        await sleep(250);
    }
    throw new Error('CDP endpoint never became ready: ' + url);
}

/** Launch headless Chrome with a throwaway profile and return its debugger URL. */
async function launchChrome({ port = 0 } = {}) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseudopy-qa-'));
    const child = spawn(findChrome(), [
        '--headless=new',
        '--remote-debugging-port=' + port,
        '--user-data-dir=' + userDataDir,
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--hide-scrollbars',
        '--disable-extensions',
        '--disable-background-networking',
        'about:blank',
    ], { stdio: 'ignore' });
    for (let i = 0; i < 200; i++) {
        const portFile = path.join(userDataDir, 'DevToolsActivePort');
        if (fs.existsSync(portFile)) {
            // Chrome holds the port file open exclusively on Windows.
            let raw = '';
            try { raw = fs.readFileSync(portFile, 'utf8'); } catch (e) { continue; }
            const lines = raw.split(/\r?\n/).filter(Boolean);
            if (lines.length >= 2 && lines[1].trim()) {
                return { child, userDataDir, wsUrl: 'ws://127.0.0.1:' + lines[0].trim() + lines[1].trim() };
            }
        }
        await sleep(250);
    }
    child.kill();
    throw new Error('Chrome did not report a DevTools port.');
}

/** Minimal CDP session: send(method, params) plus page-level conveniences. */
class Session {
    constructor(socket) {
        this.socket = socket;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        socket.addEventListener('message', event => {
            let message;
            try { message = JSON.parse(event.data); } catch (e) { return; }
            if (message.id && this.pending.has(message.id)) {
                const { resolve, reject } = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) reject(new Error(message.error.message));
                else resolve(message.result);
                return;
            }
            const handlers = this.listeners.get(message.method);
            if (handlers) handlers.forEach(handler => handler(message.params));
        });
    }

    on(method, handler) {
        if (!this.listeners.has(method)) this.listeners.set(method, new Set());
        this.listeners.get(method).add(handler);
    }

    send(method, params) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params: params || {} }));
        });
    }

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression: `(() => { ${expression.includes('return') ? expression : 'return (' + expression + ')'} })()`,
            awaitPromise: true,
            returnByValue: true,
        });
        if (result.exceptionDetails) {
            throw new Error('Page evaluation failed: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text));
        }
        return result.result.value;
    }

    /** Run statements (no return required) inside the page; awaits are allowed. */
    async run(body) {
        const source = body.includes('return') ? body : body + '\n;return true;';
        const result = await this.send('Runtime.evaluate', {
            expression: `(async () => { ${source} })()`,
            awaitPromise: true,
            returnByValue: true,
        });
        if (result.exceptionDetails) {
            throw new Error('Page run failed: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text));
        }
        return result.result.value;
    }

    async setViewport(width, height, deviceScaleFactor = 1, mobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
    }

    /** Emulate a hard offline network the way DevTools does. */
    async setOffline(offline) {
        await this.send('Network.emulateNetworkConditions', {
            offline,
            latency: 0,
            downloadThroughput: offline ? 0 : -1,
            uploadThroughput: offline ? 0 : -1,
        });
    }

    async screenshot(file, { fullPage = false } = {}) {
        const params = { format: 'png', captureBeyondViewport: fullPage };
        if (fullPage) {
            const metrics = await this.send('Page.getLayoutMetrics');
            const size = metrics.cssContentSize || metrics.contentSize;
            params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
        }
        const shot = await this.send('Page.captureScreenshot', params);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
        return file;
    }
}

async function connect(wsUrl) {
    const socket = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    return new Session(socket);
}

/** Fresh isolated tab with console/error capture and the domains QA needs. */
async function newPage(browserWs, url) {
    // Chrome requires PUT for /json/new; older builds only accept GET.
    const endpoint = 'http://127.0.0.1:' + new URL(browserWs).port + '/json/new?' + encodeURIComponent(url);
    const target = await (async () => {
        let response = await fetch(endpoint, { method: 'PUT' });
        if (!response.ok) response = await fetch(endpoint);
        if (!response.ok) throw new Error('Could not open a tab: ' + response.status);
        return response.json();
    })();
    const session = await connect(target.webSocketDebuggerUrl || 'ws://127.0.0.1:' + new URL(browserWs).port + '/devtools/page/' + targetId);
    const consoleErrors = [];
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Network.enable');
    await session.send('Log.enable');
    session.on('Runtime.consoleAPICalled', params => {
        if (params.type === 'error') consoleErrors.push(params.args.map(a => a.value ?? a.description).join(' '));
    });
    session.on('Runtime.exceptionThrown', params => {
        consoleErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'exception');
    });
    session.consoleErrors = consoleErrors;
    return session;
}

async function closePage(session) {
    try { session.socket.close(); } catch (e) { /* already closed */ }
}

/** Block every cross-origin request so the app runs from local caches only. */
async function blockRemote(session, origin) {
    await session.send('Network.setBlockedURLs', { urls: ['https://*/*'] });
    await session.send('Network.setRequestInterception', { patterns: [{ urlPattern: 'http://*/*' }] }).catch(() => {});
    await session.send('Fetch.enable', {
        patterns: [{ urlPattern: 'https://*/*', requestStage: 'Request' }],
    }).catch(() => {});
    session.on('Fetch.requestPaused', async params => {
        try {
            const u = new URL(params.request.url);
            if (u.origin !== origin) await session.send('Fetch.continueRequest', { requestId: params.requestId });
            else await session.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 204, body: '' });
        } catch (e) {
            try { await session.send('Fetch.continueRequest', { requestId: params.requestId }); } catch (e2) { }
        }
    });
}

/** Reload and wait for the new execution context to settle. */
async function reload(session, { timeout = 20000 } = {}) {
    const loaded = new Promise(resolve => session.on('Page.loadEventFired', resolve));
    await session.send('Page.reload', { ignoreCache: false });
    await Promise.race([loaded, sleep(timeout)]);
}

/** Poll a page expression until it is truthy. */
async function waitFor(session, expression, { timeout = 15000, interval = 200 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try { if (await session.evaluate(expression)) return true; } catch (e) { /* still loading */ }
        await sleep(interval);
    }
    throw new Error('Timed out waiting for: ' + expression);
}

module.exports = { launchChrome, connect, newPage, closePage, sleep, blockRemote, findChrome, reload, waitFor };