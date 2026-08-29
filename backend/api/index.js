'use strict';

const app = require('../src/app');
const { connectDatabase } = require('../src/config/database');

let dbPromise = null;

async function handler(req, res) {
    if (!dbPromise) {
        dbPromise = connectDatabase();
    }

    await dbPromise;

    return app(req, res);
}

module.exports = handler;