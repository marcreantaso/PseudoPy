// ============================================================
// CENTRAL BACKEND SERVER (Node.js / Express) — PseudoPy
// Single Source of Truth for Cross-Device Synchronization
// ============================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ══════════════════════════════════════════════════════════════
//  API ROUTES (Generic Collection-Based REST API)
// ══════════════════════════════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Count records
app.get('/api/:collection/count', async (req, res) => {
    try {
        const { collection } = req.params;
        const total = await db.count(collection);
        res.json({ count: total });
    } catch (err) {
        console.error(`[API] Error counting ${req.params.collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// Get all records in a collection (with pagination)
app.get('/api/:collection', async (req, res) => {
    try {
        const { collection } = req.params;
        const { limit, offset } = req.query;
        const items = await db.getAll(collection, limit, offset);
        res.json(items);
    } catch (err) {
        console.error(`[API] Error getting ${req.params.collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// Get single record by docId
app.get('/api/:collection/:id', async (req, res) => {
    try {
        const { collection, id } = req.params;
        const item = await db.getById(collection, id);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.json(item);
    } catch (err) {
        console.error(`[API] Error getting ${req.params.collection}/${req.params.id}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// Create a new record
app.post('/api/:collection', async (req, res) => {
    try {
        const { collection } = req.params;
        const created = await db.add(collection, req.body);
        res.status(201).json(created);
    } catch (err) {
        console.error(`[API] Error creating item in ${req.params.collection}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// Create or overwrite record with specific docId
app.put('/api/:collection/:id', async (req, res) => {
    try {
        const { collection, id } = req.params;
        const updated = await db.setById(collection, id, req.body);
        res.json(updated);
    } catch (err) {
        console.error(`[API] Error saving item ${req.params.collection}/${req.params.id}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// Partial update (merge fields)
app.patch('/api/:collection/:id', async (req, res) => {
    try {
        const { collection, id } = req.params;
        const updated = await db.updateById(collection, id, req.body);
        res.json(updated);
    } catch (err) {
        console.error(`[API] Error updating item ${req.params.collection}/${req.params.id}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// Delete record by docId
app.delete('/api/:collection/:id', async (req, res) => {
    try {
        const { collection, id } = req.params;
        const result = await db.deleteById(collection, id);
        res.json(result);
    } catch (err) {
        console.error(`[API] Error deleting item ${req.params.collection}/${req.params.id}:`, err);
        res.status(500).json({ error: err.message });
    }
});

// Start server and initialize database
async function startServer() {
    try {
        await db.initDatabase();
        app.listen(PORT, () => {
            console.log(`[PseudoPy Server] Central Backend running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('[PseudoPy Server] Failed to initialize backend:', err);
        process.exit(1);
    }
}

startServer();
