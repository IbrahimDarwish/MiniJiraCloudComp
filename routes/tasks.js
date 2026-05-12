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

// READ TASKS (Team Isolated) with optional filtering
// Query params: status, priority, deadline, assigneeId
router.get('/', authenticateUser, async (req, res) => {
    const { role, teamId } = req.user;
    const { status, priority, deadline, assigneeId } = req.query;

    try {
        let response;

        // If filtering by assigneeId, prefer querying the assigneeId-index
        if (assigneeId) {
            // Non-managers must only query for their own team/assignee
            if (role !== 'Manager') {
                // Ensure requested assignee belongs to the same team
                const userResp = await docClient.send(new GetCommand({ TableName: 'Users', Key: { userId: assigneeId } }));
                if (!userResp.Item || userResp.Item.teamId !== teamId) return res.status(403).json({ error: 'Access denied' });
            }
            response = await docClient.send(new QueryCommand({
                TableName: 'Tasks', IndexName: 'assigneeId-index',
                KeyConditionExpression: 'assigneeId = :aid',
                ExpressionAttributeValues: { ':aid': assigneeId }
            }));
        } else {
            const command = role === 'Manager'
                ? new ScanCommand({ TableName: 'Tasks' })
                : new QueryCommand({
                    TableName: 'Tasks', IndexName: 'teamId-index',
                    KeyConditionExpression: 'teamId = :tid', ExpressionAttributeValues: { ':tid': teamId }
                });
            response = await docClient.send(command);
        }

        // Apply optional filters (in-memory for filters other than assignee)
        let tasks = response.Items || [];
        if (status) tasks = tasks.filter(t => t.status === status);
        if (priority) tasks = tasks.filter(t => t.priority === priority);
        if (deadline) tasks = tasks.filter(t => t.deadline === deadline);

        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks" });
    }
});

// Helper: fetch task and enforce team access
const getTaskAndAuthorize = async (taskId, user) => {
    const taskResp = await docClient.send(new GetCommand({ TableName: "Tasks", Key: { taskId } }));
    const task = taskResp.Item;
    if (!task) return { task: null, authorized: false };
    const authorized = (user.role === 'Manager') || (user.teamId && user.teamId === task.teamId);
    return { task, authorized };
};

// READ SINGLE TASK (Team Isolated)
router.get('/:taskId', authenticateUser, async (req, res) => {
    try {
        const { task, authorized } = await getTaskAndAuthorize(req.params.taskId, req.user);
        if (!task) return res.status(404).json({ error: "Task not found" });
        if (!authorized) return res.status(403).json({ error: "Access denied" });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch task" });
    }
});

// CREATE TASK (Manager only)
router.post('/', authenticateUser, upload.single('image'), async (req, res) => {
    if (req.user.role !== 'Manager') return res.status(403).json({ error: "Manager access required to create tasks" });

    const { title, description, priority, deadline, teamId } = req.body;
    if (!title || !teamId) return res.status(400).json({ error: "title and teamId are required" });

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

        const { assigneeId } = req.body || {};

        const taskItem = {
            taskId, title, description, status: 'To Do', priority, deadline, teamId, assigneeId: assigneeId || null, imageUrl, s3Key,
            auditLog: [{ user: req.user.username, action: "Created Task", timestamp: new Date().toISOString() }],
            createdAt: new Date().toISOString()
        };

        await docClient.send(new PutCommand({ TableName: "Tasks", Item: taskItem }));

        // If an assignee was provided at creation, publish assignment event
        if (assigneeId) {
            const logEntry = [{ user: req.user.username, action: `Assigned to ${assigneeId}`, timestamp: new Date().toISOString() }];
            await docClient.send(new UpdateCommand({
                TableName: "Tasks", Key: { taskId },
                UpdateExpression: "SET auditLog = list_append(if_not_exists(auditLog, :empty), :log)",
                ExpressionAttributeValues: { ":log": logEntry, ":empty": [] }
            }));
            await snsClient.send(new PublishCommand({
                TopicArn: process.env.SNS_TASK_ASSIGNED_TOPIC_ARN,
                Message: JSON.stringify({ taskId, assigneeId, teamId, action: "ASSIGNED" })
            }));
        }

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
        const { task } = await getTaskAndAuthorize(taskId, req.user);
        if (!task) return res.status(404).json({ error: "Task not found" });

        // Only managers or the assignee may update status
        const isAssignee = task.assigneeId && task.assigneeId === req.user.username;
        if (req.user.role !== 'Manager' && !isAssignee) return res.status(403).json({ error: "Only assignee or manager can update status" });

        // Validate status
        const allowed = ['To Do', 'In Progress', 'In Review', 'Done'];
        if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status value' });

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
        const { task, authorized } = await getTaskAndAuthorize(taskId, req.user);
        if (!task) return res.status(404).json({ error: "Task not found" });
        if (!authorized) return res.status(403).json({ error: "Access denied" });

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

    const logEntry = [{ user: req.user.username, action: `Assigned to ${assigneeId}`, timestamp: new Date().toISOString() }];

    try {
        await docClient.send(new UpdateCommand({
            TableName: "Tasks", Key: { taskId },
            UpdateExpression: "SET assigneeId = :a, auditLog = list_append(if_not_exists(auditLog, :empty), :log)",
            ExpressionAttributeValues: { ":a": assigneeId, ":log": logEntry, ":empty": [] }
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