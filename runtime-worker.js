/* One interpreter per worker: no app state, credentials or DOM are exposed. */
importScripts('vendor/skulpt.min.js', 'vendor/skulpt-stdlib.js');
let pendingInput = null;
let started = false;
self.onmessage = async ({ data }) => {
    if (data.type === 'input' && pendingInput) {
        const resolve = pendingInput;
        pendingInput = null;
        resolve(String(data.value));
        return;
    }
    if (data.type !== 'run' || started) return;
    started = true;
    Sk.configure({
        output: text => self.postMessage({ type: 'output', text }),
        read: name => {
            if (!Object.prototype.hasOwnProperty.call(Sk.builtinFiles.files, name)) throw new Error('Module unavailable: ' + name);
            return Sk.builtinFiles.files[name];
        },
        inputfun: prompt => new Promise(resolve => {
            pendingInput = resolve;
            self.postMessage({ type: 'input', prompt });
        }),
        inputfunTakesPrompt: true,
        __future__: Sk.python3
    });
    try {
        await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<stdin>', false, data.code, true));
        self.postMessage({ type: 'done' });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.toString() });
    }
};
