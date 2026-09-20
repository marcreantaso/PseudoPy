const db = require('./db');
const { createApp } = require('./server/create-app');
const app = createApp(db);
const PORT = process.env.PORT || 3000;

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
