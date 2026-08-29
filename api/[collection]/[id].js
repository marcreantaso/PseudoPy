// api/[collection]/[id].js — GET / PUT / PATCH / DELETE by ID
const { storeGetById, storeSetById, storeUpdateById, storeDeleteById } = require('../_db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { collection, id } = req.query;

    // Reject if id is "count" — that is handled by count.js
    if (id === 'count') {
        const { storeCount } = require('../_db');
        const total = storeCount(collection);
        return res.json({ count: total });
    }

    try {
        if (req.method === 'GET') {
            const item = storeGetById(collection, id);
            if (!item) return res.status(404).json({ error: 'Item not found' });
            return res.json(item);
        }

        if (req.method === 'PUT') {
            const updated = storeSetById(collection, id, req.body);
            return res.json(updated);
        }

        if (req.method === 'PATCH') {
            const updated = storeUpdateById(collection, id, req.body);
            return res.json(updated);
        }

        if (req.method === 'DELETE') {
            const result = storeDeleteById(collection, id);
            return res.json(result);
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('[API] Error on item:', err.message);
        res.status(500).json({ error: err.message });
    }
};