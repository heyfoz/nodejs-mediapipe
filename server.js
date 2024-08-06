/*
 * Copyright 2024 Forrest Moulin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * server.js
 */

// Use Express framework to serve Node.js files
const express = require('express');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

const app = express();
const port = 3000;

// Serve static files from the "public" directory
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.json()); // For parsing application/json

// Serve the index.html file for the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Serve other HTML files
app.get('/:page', (req, res) => {
    const page = req.params.page;
    res.sendFile(path.join(__dirname, 'templates', `${page}.html`));
});

// Create a logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Endpoint to handle gesture data and save it to a file
app.post('/save-gesture',
    // Validation and sanitization
    body('gesture').trim().isLength({ min: 1 }).escape(),
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { gesture } = req.body;
        const logFilePath = path.join(logsDir, 'gestures.log');
        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} - ${gesture}\n`;

        fs.appendFile(logFilePath, logEntry, (err) => {
            if (err) {
                console.error('Error writing to file', err);
                res.status(500).json({ message: 'Internal Server Error' });
            } else {
                console.log(`Gesture "${gesture}" received and written to ${logFilePath}`);
                res.status(200).json({ message: `Gesture "${gesture}" received and logged.` });
            }
        });
    }
);

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
