const { buildSeedUsers, SEED_EXERCISES, buildSeedActivity } = require('./seed-data');

// Module-level store — persists for the lifetime of this serverless instance
const store = new Map();

function getCollection(name) {
    if (!store.has(name)) {
        const map = new Map();
        if (name === 'pseudopy_users') buildSeedUsers().forEach(u => map.set(u._docId, u));
        else if (name === 'pseudopy_exercises') SEED_EXERCISES.forEach(e => map.set(e._docId, e));
        else if (name === 'pseudopy_activity') buildSeedActivity().forEach(a => map.set(a._docId, a));
        store.set(name, map);
    }
    return store.get(name);
}

function sanitize(name) {
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Invalid collection name: ' + name);
    return name;
}

function storeGetAll(collection, limit, offset) {
    const col = sanitize(collection);
    const map = getCollection(col);
    let results = Array.from(map.values());
    if (col === 'pseudopy_exercises') {
        results.sort((a, b) => {
            const an = (a._docId||'').startsWith('ex'), bn = (b._docId||'').startsWith('ex');
            if (an && !bn) return -1; if (!an && bn) return 1;
            if (an && bn) return (b._docId||'').localeCompare(a._docId||'');
            return (parseInt((a._docId||'').replace('algo_',''))||0) - (parseInt((b._docId||'').replace('algo_',''))||0);
        });
    }
    if (col === 'pseudopy_activity') results.sort((a,b) => (b.timestamp||0)-(a.timestamp||0));
    if (col === 'pseudopy_auditLog') results.sort((a,b) => (b.timestamp||'').localeCompare(a.timestamp||''));
    if (col === 'pseudopy_notifications') results.sort((a,b) => new Date(b.createdAt||0)-new Date(a.createdAt||0));
    if (limit !== null && limit !== undefined && limit !== '') {
        const l = parseInt(limit, 10), o = parseInt(offset, 10) || 0;
        results = results.slice(o, o + l);
    }
    return results;
}

function storeGetById(collection, docId) {
    return getCollection(sanitize(collection)).get(docId) || null;
}

function storeSetById(collection, docId, data) {
    const doc = { ...data, _docId: docId };
    getCollection(sanitize(collection)).set(docId, doc);
    return doc;
}

function storeAdd(collection, data) {
    const docId = data._docId || ('doc_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
    return storeSetById(collection, docId, data);
}

function storeUpdateById(collection, docId, updates) {
    const existing = storeGetById(collection, docId);
    return storeSetById(collection, docId, existing ? { ...existing, ...updates } : updates);
}

function storeDeleteById(collection, docId) {
    getCollection(sanitize(collection)).delete(docId);
    return { success: true };
}

function storeCount(collection) {
    return getCollection(sanitize(collection)).size;
}

module.exports = { storeGetAll, storeGetById, storeSetById, storeAdd, storeUpdateById, storeDeleteById, storeCount };
