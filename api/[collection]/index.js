// api/[collection]/index.js — GET all records / POST new record
const { storeGetAll, storeAdd } = require('../_db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { collection } = req.query;

    try {
        if (req.method === 'GET') {
            const { limit, offset } = req.query;
            const items = storeGetAll(collection, limit, offset);
            return res.json(items);
        }

        if (req.method === 'POST') {
            const created = storeAdd(collection, req.body);
            return res.status(201).json(created);
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('[API] Error on collection:', err.message);
        res.status(500).json({ error: err.message });
    }
};