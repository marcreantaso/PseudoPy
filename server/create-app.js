const express = require('express');
const cors = require('cors');
const path = require('path');
const { registerRoutes } = require('./routes');

function createApp(db) {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    app.use(express.static(path.join(__dirname, '..')));
    registerRoutes(app, db);
    return app;
}

module.exports = { createApp };
