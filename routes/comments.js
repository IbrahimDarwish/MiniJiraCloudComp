// File: routes/comments.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE_NAME = "Comments";

// GET COMMENTS FOR A SPECIFIC TASK
router.get('/:taskId', authenticateUser, async (req, res) => {
    const { taskId } = req.params;

    try {
        const response = await docClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: "taskId-index", // Ensure this GSI exists in AWS
            KeyConditionExpression: "taskId = :tid",
            ExpressionAttributeValues: { ":tid": taskId }
        }));

        // Sort comments by timestamp
        const sortedComments = response.Items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        res.json(sortedComments);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch comments" });
    }
});

// ADD A COMMENT TO A TASK
router.post('/', authenticateUser, async (req, res) => {
    const { taskId, text } = req.body;
    const commentItem = {
        commentId: uuidv4(),
        taskId,
        author: req.user.username,
        text,
        createdAt: new Date().toISOString()
    };

    try {
        await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: commentItem }));
        res.status(201).json(commentItem);
    } catch (error) {
        res.status(500).json({ error: "Failed to add comment" });
    }
});

module.exports = router;