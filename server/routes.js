/** Register the same HTTP contract against an injected collection repository. */
function registerRoutes(app, db) {
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', time: new Date().toISOString() });
    });

    const routes = [
        ['get', '/api/:collection/count', 'counting', async req => ({ count: await db.count(req.params.collection) })],
        ['get', '/api/:collection', 'getting', req => db.getAll(req.params.collection, req.query.limit, req.query.offset)],
        ['get', '/api/:collection/:id', 'getting', req => db.getById(req.params.collection, req.params.id)],
        ['post', '/api/:collection', 'creating item in', req => db.add(req.params.collection, req.body)],
        ['put', '/api/:collection/:id', 'saving item', req => db.setById(req.params.collection, req.params.id, req.body)],
        ['patch', '/api/:collection/:id', 'updating item', req => db.updateById(req.params.collection, req.params.id, req.body)],
        ['delete', '/api/:collection/:id', 'deleting item', req => db.deleteById(req.params.collection, req.params.id)]
    ];

    for (const [method, route, action, execute] of routes) {
        app[method](route, async (req, res) => {
            try {
                const result = await execute(req);
                if (method === 'get' && route.endsWith('/:id') && !result) {
                    return res.status(404).json({ error: 'Item not found' });
                }
                if (method === 'post') res.status(201);
                return res.json(result);
            } catch (err) {
                const resource = req.params.collection + (req.params.id ? `/${req.params.id}` : '');
                console.error(`[API] Error ${action} ${resource}:`, err);
                return res.status(500).json({ error: err.message });
            }
        });
    }
}

module.exports = { registerRoutes };
