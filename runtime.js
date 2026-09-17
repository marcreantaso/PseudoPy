/* Isolated, cancellable Python execution shared by every workspace. */
(function (root) {
    function run(code, options = {}) {
        let worker, timer, settled = false, stdout = '', activeMs = 0, startedAt;
        let resolveDone, rejectDone;
        const inputs = [];
        const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
        function pause() {
            clearTimeout(timer);
            if (startedAt != null) activeMs += performance.now() - startedAt;
            startedAt = null;
        }
        function finish(error) {
            if (settled) return;
            settled = true;
            pause();
            worker?.terminate();
            const result = { stdout, inputs, durationMs: activeMs };
            if (error) { error.result = result; rejectDone(error); }
            else resolveDone(result);
        }
        function resume() {
            startedAt = performance.now();
            timer = setTimeout(() => finish(Object.assign(new Error('Execution time limit exceeded. Check your loop condition.'), { code: 'timeout' })), Math.max(1, (options.limitMs || 10000) - activeMs));
        }
        try {
            worker = new Worker('runtime-worker.js');
            worker.onerror = () => finish(Object.assign(new Error('Python runtime could not load. Reconnect and reload the application.'), { code: 'infrastructure' }));
            worker.onmessage = async ({ data }) => {
                if (settled) return;
                if (data.type === 'output') {
                    stdout += data.text;
                    if (stdout.length > 100000) return finish(Object.assign(new Error('Output limit exceeded. Check your loop.'), { code: 'output-limit' }));
                    options.onOutput?.(data.text);
                } else if (data.type === 'input') {
                    pause();
                    try {
                        if (!options.onInput) throw Object.assign(new Error('Expected output requires defined test inputs.'), { code: 'input-required' });
                        const value = String(await options.onInput(data.prompt));
                        if (settled) return;
                        inputs.push(value);
                        resume();
                        worker.postMessage({ type: 'input', value });
                    } catch (error) { finish(error); }
                } else if (data.type === 'done') finish();
                else if (data.type === 'error') finish(new Error(data.error));
            };
            resume();
            worker.postMessage({ type: 'run', code });
        } catch (error) { error.code = 'infrastructure'; finish(error); }
        return { done, cancel: () => finish(Object.assign(new Error('Execution cancelled.'), { code: 'cancelled' })) };
    }
    root.PythonRuntime = { run };
})(typeof window === 'undefined' ? globalThis : window);
