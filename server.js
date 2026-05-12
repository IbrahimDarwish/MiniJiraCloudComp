// File: server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/tasks', taskRoutes);

// Health check for Application Load Balancer
app.get('/health', (req, res) => {
    res.status(200).send("OK");
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
    console.log(`MiniJira API running on port ${PORT}`);
});