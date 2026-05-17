// File: server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const taskRoutes = require('./routes/tasks');
const projectRoutes = require('./routes/projects');
const commentRoutes = require('./routes/comments');
const teamRoutes = require('./routes/teams');
const userRoutes = require('./routes/users');

const app = express();

app.use(cors());
app.use(express.json());

// Main API Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/users', userRoutes);

// Health check for ALB
app.get('/health', (req, res) => res.status(200).send("OK"));

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
    console.log(`MiniJira API running on port ${PORT}`);
});