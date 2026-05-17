// File: routes/projects.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE_NAME = "Projects";

// READ ALL PROJECTS
router.get('/', authenticateUser, async (req, res) => {
    try {
        const response = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
        res.json(response.Items);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch projects" });
    }
});

// CREATE PROJECT (Manager Only)
router.post('/', authenticateUser, async (req, res) => {
    if (req.user.role !== 'Manager') return res.status(403).json({ error: "Manager access required" });

    const { name, description } = req.body;
    const projectItem = { projectId: uuidv4(), name, description, createdAt: new Date().toISOString() };

    try {
        await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: projectItem }));
        res.status(201).json(projectItem);
    } catch (error) {
        res.status(500).json({ error: "Failed to create project" });
    }
});

// UPDATE PROJECT (Manager Only)
router.put('/:projectId', authenticateUser, async (req, res) => {
    if (req.user.role !== 'Manager') return res.status(403).json({ error: "Manager access required" });

    const { projectId } = req.params;
    const { name, description } = req.body;

    try {
        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { projectId },
            UpdateExpression: "set #n = :name, description = :desc",
            ExpressionAttributeNames: { "#n": "name" },
            ExpressionAttributeValues: { ":name": name, ":desc": description }
        }));
        res.json({ success: true, message: "Project updated" });
    } catch (error) {
        res.status(500).json({ error: "Failed to update project" });
    }
});

// DELETE PROJECT (Manager Only)
router.delete('/:projectId', authenticateUser, async (req, res) => {
    if (req.user.role !== 'Manager') return res.status(403).json({ error: "Manager access required" });

    try {
        await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { projectId: req.params.projectId } }));
        res.json({ success: true, message: "Project deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete project" });
    }
});

module.exports = router;