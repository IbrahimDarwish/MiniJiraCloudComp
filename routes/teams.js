const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand, GetCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE_NAME = "Teams";

// Helper: Check if user is Manager or Admin
const requireManagerOrAdmin = (req, res, next) => {
    if (req.user.role !== 'Manager' && req.user.role !== 'Admin') {
        return res.status(403).json({ error: "Manager or Admin access required" });
    }
    next();
};

// READ ALL TEAMS
router.get('/', authenticateUser, async (req, res) => {
    try {
        const response = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
        res.json(response.Items);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch teams" });
    }
});

// READ SINGLE TEAM
router.get('/:teamId', authenticateUser, async (req, res) => {
    try {
        const response = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { teamId: req.params.teamId }
        }));
        if (!response.Item) return res.status(404).json({ error: "Team not found" });
        res.json(response.Item);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch team" });
    }
});

// CREATE TEAM (Manager/Admin only)
router.post('/', authenticateUser, requireManagerOrAdmin, async (req, res) => {
    const { name, description } = req.body;
    const teamId = uuidv4();
    const teamItem = {
        teamId,
        name,
        description,
        createdAt: new Date().toISOString(),
        members: [] // Array of user IDs
    };

    try {
        await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: teamItem }));
        res.status(201).json(teamItem);
    } catch (error) {
        res.status(500).json({ error: "Failed to create team" });
    }
});

// UPDATE TEAM (Manager/Admin only)
router.put('/:teamId', authenticateUser, requireManagerOrAdmin, async (req, res) => {
    const { teamId } = req.params;
    const { name, description } = req.body;

    try {
        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { teamId },
            UpdateExpression: "set #n = :name, description = :desc",
            ExpressionAttributeNames: { "#n": "name" },
            ExpressionAttributeValues: { ":name": name, ":desc": description }
        }));
        res.json({ success: true, message: "Team updated" });
    } catch (error) {
        res.status(500).json({ error: "Failed to update team" });
    }
});

// DELETE TEAM (Manager/Admin only)
router.delete('/:teamId', authenticateUser, requireManagerOrAdmin, async (req, res) => {
    try {
        await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { teamId: req.params.teamId }
        }));
        res.json({ success: true, message: "Team deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete team" });
    }
});

// ADD MEMBER TO TEAM (Manager/Admin only)
router.post('/:teamId/members', authenticateUser, requireManagerOrAdmin, async (req, res) => {
    const { teamId } = req.params;
    const { userId } = req.body;

    try {
        // Fetch team
        const teamResp = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { teamId }
        }));
        const team = teamResp.Item;
        if (!team) return res.status(404).json({ error: "Team not found" });

        // Add member if not already present
        const members = team.members || [];
        if (!members.includes(userId)) {
            members.push(userId);
        }

        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { teamId },
            UpdateExpression: "SET members = :m",
            ExpressionAttributeValues: { ":m": members }
        }));
        res.json({ success: true, message: "User added to team", members });
    } catch (error) {
        res.status(500).json({ error: "Failed to add member to team" });
    }
});

// REMOVE MEMBER FROM TEAM (Manager/Admin only)
router.delete('/:teamId/members/:userId', authenticateUser, requireManagerOrAdmin, async (req, res) => {
    const { teamId, userId } = req.params;

    try {
        const teamResp = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { teamId }
        }));
        const team = teamResp.Item;
        if (!team) return res.status(404).json({ error: "Team not found" });

        const members = team.members || [];
        const updatedMembers = members.filter(m => m !== userId);

        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { teamId },
            UpdateExpression: "SET members = :m",
            ExpressionAttributeValues: { ":m": updatedMembers }
        }));
        res.json({ success: true, message: "User removed from team" });
    } catch (error) {
        res.status(500).json({ error: "Failed to remove member from team" });
    }
});

module.exports = router;
