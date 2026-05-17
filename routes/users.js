const express = require('express');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const USERS_TABLE = "Users";
const TEAMS_TABLE = "Teams";

// GET CURRENT USER PROFILE
router.get('/me', authenticateUser, async (req, res) => {
    try {
        const userResp = await docClient.send(new GetCommand({
            TableName: USERS_TABLE,
            Key: { userId: req.user.username }
        }));

        if (!userResp.Item) {
            // If user not in DB, return from token
            return res.json({
                userId: req.user.username,
                role: req.user.role,
                teamId: req.user.teamId
            });
        }

        res.json(userResp.Item);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch user profile" });
    }
});

// GET SINGLE USER BY ID
router.get('/:userId', authenticateUser, async (req, res) => {
    try {
        const userResp = await docClient.send(new GetCommand({
            TableName: USERS_TABLE,
            Key: { userId: req.params.userId }
        }));

        if (!userResp.Item) return res.status(404).json({ error: "User not found" });
        res.json(userResp.Item);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// LIST ALL USERS (Manager only)
router.get('/', authenticateUser, async (req, res) => {
    if (req.user.role !== 'Manager' && req.user.role !== 'Admin') {
        return res.status(403).json({ error: "Manager or Admin access required" });
    }

    try {
        const response = await docClient.send(new ScanCommand({ TableName: USERS_TABLE }));
        res.json(response.Items);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// LIST USERS IN A TEAM
router.get('/team/:teamId', authenticateUser, async (req, res) => {
    const { teamId } = req.params;

    try {
        // Fetch team to get members
        const teamResp = await docClient.send(new GetCommand({
            TableName: TEAMS_TABLE,
            Key: { teamId }
        }));

        if (!teamResp.Item) return res.status(404).json({ error: "Team not found" });

        const team = teamResp.Item;
        const memberIds = team.members || [];

        // Fetch each member's full profile
        const members = [];
        for (const userId of memberIds) {
            const userResp = await docClient.send(new GetCommand({
                TableName: USERS_TABLE,
                Key: { userId }
            }));
            if (userResp.Item) {
                members.push(userResp.Item);
            }
        }

        res.json(members);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch team members" });
    }
});

module.exports = router;
