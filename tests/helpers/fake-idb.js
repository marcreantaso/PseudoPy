/* In-memory IndexedDB replacement for testing src/database/idb-store.js
   without a browser. Mirrors the IDB object-model surface that the module
   actually touches (open + onupgradeneeded/onsuccess, transactions,
   createObjectStore + createIndex, get/put/getAll/delete with onsuccess). */

'use strict';

function createFakeIndexedDB() {
    const databases = new Map();

    function queue(fn) {
        setImmediate(fn);
    }

    function makeDb(name) {
        const stores = new Map();
        const db = {
            name,
            objectStoreNames: { contains: n => stores.has(n) },
            createObjectStore(storeName, opts) {
                if (stores.has(storeName)) return null;
                const store = {
                    keyPath: (opts && opts.keyPath) || null,
                    records: new Map(),
                    indexes: new Map()
                };
                stores.set(storeName, store);
                db._stores = stores;
                return {
                    createIndex: (indexName, keyPath, indexOpts) => {
                        store.indexes.set(indexName, { keyPath, options: indexOpts || {} });
                    }
                };
            },
            transaction(storeName, mode) {
                const store = stores.get(storeName);
                if (!store) throw new Error('NotFoundError: ' + storeName);
                let pending = 0;
                const tx = {
                    _store: store,
                    objectStore: () => makeStore(store, tx),
                    oncomplete: null,
                    onerror: null,
                    onabort: null,
                    error: null,
                    mode,
                    commit() { finish(); },
                    abort() { if (tx.onabort) tx.onabort({ target: tx }); }
                };
                function maybeDone() {
                    pending--;
                    if (pending === 0 && tx.oncomplete) {
                        const fn = tx.oncomplete;
                        queue(() => fn({ target: tx }));
                    }
                }
                function finish() {
                    pending = 0;
                    if (tx.oncomplete) {
                        const fn = tx.oncomplete;
                        queue(() => fn({ target: tx }));
                    }
                }
                function makeStore(store, owner) {
                    function op(run) {
                        pending++;
                        const req = {};
                        queue(() => {
                            try {
                                const result = run(store.records);
                                req.result = result;
                                if (req.onsuccess) req.onsuccess({ target: req });
                            } catch (err) {
                                req.error = err;
                                owner.error = err;
                                if (req.onerror) req.onerror({ target: req });
                            } finally {
                                maybeDone();
                            }
                        });
                        return req;
                    }
                    return {
                        get: key => op(records => records.get(key)),
                        getAll: () => op(records => Array.from(records.values())),
                        put: record => op(records => {
                            const key = store.keyPath ? record[store.keyPath] : record;
                            records.set(key, JSON.parse(JSON.stringify(record)));
                            return key;
                        }),
                        delete: key => op(records => records.delete(key))
                    };
                }
                return tx;
            },
            close() {}
        };
        return db;
    }

    function open(name) {
        let db = databases.get(name);
        const firstOpen = !db;
        if (firstOpen) {
            db = makeDb(name);
            databases.set(name, db);
        }
        const request = {};
        const event = { target: request };
        queue(() => {
            if (firstOpen && request.onupgradeneeded) {
                request.result = db;
                request.onupgradeneeded(event);
            }
            request.result = db;
            if (request.onsuccess) request.onsuccess(event);
        });
        return request;
    }

    return {
        open,
        dump() {
            const out = {};
            for (const [name, db] of databases) {
                const stores = {};
                for (const [sName, s] of db._stores) {
                    stores[sName] = { keyPath: s.keyPath, records: Array.from(s.records.entries()).map(([k, v]) => ({ key: k, value: v })) };
                }
                out[name] = stores;
            }
            return out;
        }
    };
}

module.exports = { createFakeIndexedDB };