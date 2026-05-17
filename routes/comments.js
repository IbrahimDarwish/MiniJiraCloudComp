// File: routes/comments.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, DeleteCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE_NAME = "Comments";
const TASKS_TABLE = "Tasks";

// GET COMMENTS FOR A SPECIFIC TASK
router.get('/:taskId', authenticateUser, async (req, res) => {
    const { taskId } = req.params;

    try {
        // Verify user has access to the task (team isolation)
        const taskResp = await docClient.send(new GetCommand({ TableName: TASKS_TABLE, Key: { taskId } }));
        const task = taskResp.Item;
        if (!task) return res.status(404).json({ error: "Task not found" });
        if (req.user.role !== 'Manager' && req.user.teamId !== task.teamId) return res.status(403).json({ error: "Access denied" });

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
    if (!text || !taskId) return res.status(400).json({ error: "taskId and text are required" });

    const commentItem = {
        commentId: uuidv4(),
        taskId,
        author: req.user.username,
        text,
        createdAt: new Date().toISOString()
    };

    try {
        // Ensure commenter has access to the task
        const taskResp = await docClient.send(new GetCommand({ TableName: TASKS_TABLE, Key: { taskId } }));
        const task = taskResp.Item;
        if (!task) return res.status(404).json({ error: "Task not found" });
        if (req.user.role !== 'Manager' && req.user.teamId !== task.teamId) return res.status(403).json({ error: "Access denied" });

        await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: commentItem }));
        res.status(201).json(commentItem);
    } catch (error) {
        res.status(500).json({ error: "Failed to add comment" });
    }
});

// DELETE A COMMENT
router.delete('/:commentId', authenticateUser, async (req, res) => {
    const { commentId } = req.params;

    try {
        // Fetch comment by primary key (commentId)
        const getResp = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { commentId } }));
        const comment = getResp.Item;

        if (!comment) return res.status(404).json({ error: "Comment not found" });

        // Only author or Manager can delete
        if (req.user.username !== comment.author && req.user.role !== 'Manager') {
            return res.status(403).json({ error: "You can only delete your own comments" });
        }

        // Verify task access
        const taskResp = await docClient.send(new GetCommand({ TableName: TASKS_TABLE, Key: { taskId: comment.taskId } }));
        const task = taskResp.Item;
        if (!task) return res.status(404).json({ error: "Task not found" });
        if (req.user.role !== 'Manager' && req.user.teamId !== task.teamId) return res.status(403).json({ error: "Access denied" });

        await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { commentId } }));
        res.json({ success: true, message: "Comment deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete comment" });
    }
});

module.exports = router;