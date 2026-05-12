// File: routes/tasks.js
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const s3 = new S3Client({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

// 1. GET TASKS (Enforces Team Isolation)
router.get('/', authenticateUser, async (req, res) => {
    const { role, teamId } = req.user;
    try {
        let command;
        if (role === 'Manager') {
            command = new ScanCommand({ TableName: "Tasks" }); // Manager sees all
        } else {
            command = new QueryCommand({
                TableName: "Tasks",
                IndexName: "teamId-index", // GSI required in DynamoDB
                KeyConditionExpression: "teamId = :tid",
                ExpressionAttributeValues: { ":tid": teamId }
            });
        }
        const response = await docClient.send(command);
        res.json(response.Items);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks" });
    }
});

// 2. CREATE TASK (Handles S3 Image Upload)
router.post('/', authenticateUser, upload.single('image'), async (req, res) => {
    const { title, description, priority, deadline, teamId } = req.body;
    const taskId = uuidv4();
    let imageUrl = null;

    try {
        if (req.file) {
            const fileKey = `tasks/${taskId}-${req.file.originalname}`;
            await s3.send(new PutObjectCommand({
                Bucket: process.env.S3_ORIGINALS_BUCKET,
                Key: fileKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            }));
            imageUrl = `https://${process.env.S3_ORIGINALS_BUCKET}.s3.amazonaws.com/${fileKey}`;
        }

        const taskItem = {
            taskId, title, description, status: 'To Do', priority, deadline, teamId, imageUrl,
            createdAt: new Date().toISOString()
        };

        await docClient.send(new PutCommand({ TableName: "Tasks", Item: taskItem }));
        res.status(201).json({ message: "Task created", task: taskItem });
    } catch (error) {
        res.status(500).json({ error: "Failed to create task" });
    }
});

// 3. ASSIGN TASK (Triggers SNS/SQS)
router.post('/:taskId/assign', authenticateUser, async (req, res) => {
    const { taskId } = req.params;
    const { assigneeId, teamId } = req.body;
    const { role } = req.user;

    if (role !== 'Manager') return res.status(403).json({ error: "Only managers can assign tasks" });

    try {
        await docClient.send(new UpdateCommand({
            TableName: "Tasks",
            Key: { taskId },
            UpdateExpression: "set assigneeId = :a",
            ExpressionAttributeValues: { ":a": assigneeId }
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