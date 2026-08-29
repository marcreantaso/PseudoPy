// api/[collection]/count.js — GET count of records
const { storeCount } = require('../_db');

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { collection } = req.query;

    try {
        const total = storeCount(collection);
        return res.json({ count: total });
    } catch (err) {
        console.error('[API] Error counting collection:', err.message);
        res.status(500).json({ error: err.message });
    }
};