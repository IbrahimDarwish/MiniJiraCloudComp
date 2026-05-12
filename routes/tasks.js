// File: routes/tasks.js
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const s3 = new S3Client({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

// READ TASKS (Team Isolated)
router.get('/', authenticateUser, async (req, res) => {
    const { role, teamId } = req.user;
    try {
        const command = role === 'Manager'
            ? new ScanCommand({ TableName: "Tasks" })
            : new QueryCommand({
                TableName: "Tasks", IndexName: "teamId-index",
                KeyConditionExpression: "teamId = :tid", ExpressionAttributeValues: { ":tid": teamId }
            });
        const response = await docClient.send(command);
        res.json(response.Items);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks" });
    }
});

// CREATE TASK
router.post('/', authenticateUser, upload.single('image'), async (req, res) => {
    const { title, description, priority, deadline, teamId } = req.body;
    const taskId = uuidv4();
    let imageUrl = null;
    let s3Key = null;

    try {
        if (req.file) {
            s3Key = `tasks/${taskId}-${Date.now()}-${req.file.originalname}`;
            await s3.send(new PutObjectCommand({
                Bucket: process.env.S3_ORIGINALS_BUCKET, Key: s3Key,
                Body: req.file.buffer, ContentType: req.file.mimetype
            }));
            imageUrl = `https://${process.env.S3_ORIGINALS_BUCKET}.s3.amazonaws.com/${s3Key}`;
        }

        const taskItem = {
            taskId, title, description, status: 'To Do', priority, deadline, teamId, imageUrl, s3Key,
            auditLog: [{ user: req.user.username, action: "Created Task", timestamp: new Date().toISOString() }],
            createdAt: new Date().toISOString()
        };

        await docClient.send(new PutCommand({ TableName: "Tasks", Item: taskItem }));
        res.status(201).json(taskItem);
    } catch (error) {
        res.status(500).json({ error: "Failed to create task" });
    }
});

// UPDATE STATUS & AUDIT LOG
router.put('/:taskId/status', authenticateUser, async (req, res) => {
    const { taskId } = req.params;
    const { status } = req.body; // 'To Do', 'In Progress', 'In Review', 'Done'
    const logEntry = [{ user: req.user.username, action: `Moved to ${status}`, timestamp: new Date().toISOString() }];

    try {
        await docClient.send(new UpdateCommand({
            TableName: "Tasks", Key: { taskId },
            UpdateExpression: "SET #s = :status, auditLog = list_append(if_not_exists(auditLog, :empty), :log)",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":status": status, ":log": logEntry, ":empty": [] }
        }));
        res.json({ success: true, message: "Status updated" });
    } catch (error) {
        res.status(500).json({ error: "Failed to update status" });
    }
});

// REPLACE IMAGE (Keeps old version in S3 by writing a new file, updates DB reference)
router.put('/:taskId/image', authenticateUser, upload.single('image'), async (req, res) => {
    const { taskId } = req.params;
    if (!req.file) return res.status(400).json({ error: "No image provided" });

    try {
        const s3Key = `tasks/${taskId}-${Date.now()}-${req.file.originalname}`;
        await s3.send(new PutObjectCommand({
            Bucket: process.env.S3_ORIGINALS_BUCKET, Key: s3Key,
            Body: req.file.buffer, ContentType: req.file.mimetype
        }));

        const imageUrl = `https://${process.env.S3_ORIGINALS_BUCKET}.s3.amazonaws.com/${s3Key}`;

        await docClient.send(new UpdateCommand({
            TableName: "Tasks", Key: { taskId },
            UpdateExpression: "SET imageUrl = :url, s3Key = :key",
            ExpressionAttributeValues: { ":url": imageUrl, ":key": s3Key }
        }));
        res.json({ success: true, imageUrl });
    } catch (error) {
        res.status(500).json({ error: "Failed to update image" });
    }
});

// DELETE TASK (Deletes associated image from S3)
router.delete('/:taskId', authenticateUser, async (req, res) => {
    const { taskId } = req.params;
    if (req.user.role !== 'Manager') return res.status(403).json({ error: "Manager access required" });

    try {
        // Fetch task to get S3 key
        const taskResponse = await docClient.send(new GetCommand({ TableName: "Tasks", Key: { taskId } }));
        const task = taskResponse.Item;

        // Delete from S3 if it exists
        if (task && task.s3Key) {
            await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_ORIGINALS_BUCKET, Key: task.s3Key }));
        }

        // Delete from DB
        await docClient.send(new DeleteCommand({ TableName: "Tasks", Key: { taskId } }));
        res.json({ success: true, message: "Task and associated files deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete task" });
    }
});

// ASSIGN TASK (Triggers SNS)
router.post('/:taskId/assign', authenticateUser, async (req, res) => {
    const { taskId } = req.params;
    const { assigneeId, teamId } = req.body;
    if (req.user.role !== 'Manager') return res.status(403).json({ error: "Only managers can assign tasks" });

    try {
        await docClient.send(new UpdateCommand({
            TableName: "Tasks", Key: { taskId },
            UpdateExpression: "set assigneeId = :a", ExpressionAttributeValues: { ":a": assigneeId }
        }));
        await snsClient.send(new PublishCommand({
            TopicArn: process.env.SNS_TASK_ASSIGNED_TOPIC_ARN,
            Message: JSON.stringify({ taskId, assigneeId, teamId, action: "ASSIGNED" })
        }));
        res.json({ success: true, message: "Task assigned and SNS triggered" });
    } catch (error) {
        res.status(500).json({ error: "Failed to assign task" });
    }
});

module.exports = router;