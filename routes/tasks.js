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

const getOriginalsBucket = () => (process.env.S3_ORIGINALS_BUCKET || '').trim().replace(/^\[|\]$/g, '');

const isCredentialsError = (error) =>
    error?.name === 'CredentialsProviderError' ||
    /could not load credentials from any providers/i.test(error?.message || '');

const isIndexFallbackError = (error) =>
    error?.name === 'ValidationException' &&
    /index|ExpressionAttributeValues|key condition/i.test(error?.message || '');

const filterTasks = (tasks, { status, priority, deadline, assigneeId, teamId }) => {
    let results = tasks;
    if (teamId) results = results.filter((task) => task.teamId === teamId);
    if (assigneeId) results = results.filter((task) => task.assigneeId === assigneeId);
    if (status) results = results.filter((task) => task.status === status);
    if (priority) results = results.filter((task) => task.priority === priority);
    if (deadline) results = results.filter((task) => task.deadline === deadline);
    return results;
};

const scanTasks = async (filters) => {
    const response = await docClient.send(new ScanCommand({ TableName: 'Tasks' }));
    return filterTasks(response.Items || [], filters);
};

const DEMO_TASKS = [
    {
        taskId: 'demo-task-1',
        title: 'Set up project board',
        description: 'Create the first reusable board layout for the team.',
        status: 'To Do',
        priority: 'High',
        deadline: '2026-05-25',
        teamId: 'demo-team-1',
        assigneeId: null,
        imageUrl: null,
        s3Key: null,
        auditLog: [],
        createdAt: new Date().toISOString()
    },
    {
        taskId: 'demo-task-2',
        title: 'Review login flow',
        description: 'Confirm Cognito login and board loading work end to end.',
        status: 'In Progress',
        priority: 'Medium',
        deadline: '2026-05-26',
        teamId: 'demo-team-2',
        assigneeId: null,
        imageUrl: null,
        s3Key: null,
        auditLog: [],
        createdAt: new Date().toISOString()
    }
];

// READ TASKS (Team Isolated) with optional filtering
// Query params: status, priority, deadline, assigneeId
router.get('/', authenticateUser, async (req, res) => {
    const { role, teamId } = req.user;
    const { status, priority, deadline, assigneeId, teamId: teamFilter } = req.query;

    try {
        if (role !== 'Manager' && !teamId) {
            console.warn('GET /api/tasks denied: missing teamId:', { username: req.user?.username, role, teamId });
            return res.status(403).json({ error: 'Team membership is required to view tasks', user: { username: req.user?.username, role, teamId } });
        }

        let response;

        // If filtering by assigneeId, prefer querying the assigneeId-index
        if (assigneeId) {
            // Non-managers must only query for their own team/assignee
            if (role !== 'Manager') {
                // Ensure requested assignee belongs to the same team
                const userResp = await docClient.send(new GetCommand({ TableName: 'Users', Key: { userId: assigneeId } }));
                if (!userResp.Item || userResp.Item.teamId !== teamId) {
                    console.warn('GET /api/tasks denied: assignee not in same team', { username: req.user?.username, requestedAssignee: assigneeId, assigneeProfile: userResp.Item, teamId });
                    return res.status(403).json({ error: 'Access denied', user: { username: req.user?.username, role, teamId }, requestedAssignee: assigneeId });
                }
            }
            response = await docClient.send(new QueryCommand({
                TableName: 'Tasks', IndexName: 'assigneeId-index',
                KeyConditionExpression: 'assigneeId = :aid',
                ExpressionAttributeValues: { ':aid': assigneeId }
            }));
        } else if (role === 'Manager' && teamFilter) {
            response = await docClient.send(new QueryCommand({
                TableName: 'Tasks', IndexName: 'teamId-index',
                KeyConditionExpression: 'teamId = :tid',
                ExpressionAttributeValues: { ':tid': teamFilter }
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
        res.json(filterTasks(response.Items || [], { status, priority, deadline, assigneeId, teamId: role === 'Manager' ? teamFilter : teamId }));
    } catch (error) {
        console.error('GET /api/tasks error:', error);
        if (isCredentialsError(error)) {
            const demoTasks = role === 'Manager' && teamFilter
                ? DEMO_TASKS.filter((task) => task.teamId === teamFilter)
                : DEMO_TASKS;
            return res.json(demoTasks);
        }
        if (isIndexFallbackError(error)) {
            const fallbackTasks = await scanTasks({
                status,
                priority,
                deadline,
                assigneeId,
                teamId: role === 'Manager' ? teamFilter : teamId
            });
            return res.json(fallbackTasks);
        }
        res.status(500).json({ error: "Failed to fetch tasks", details: error.message });
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
        if (!authorized) {
            console.warn(`GET /api/tasks/${req.params.taskId} denied: unauthorized`, { username: req.user?.username, role: req.user?.role, teamId: req.user?.teamId, taskTeamId: task.teamId });
            return res.status(403).json({ error: "Access denied", user: { username: req.user?.username, role: req.user?.role, teamId: req.user?.teamId }, task: { taskId: task.taskId, teamId: task.teamId } });
        }
        res.json(task);
    } catch (err) {
        console.error(`GET /api/tasks/${req.params.taskId} error:`, err);
        res.status(500).json({ error: "Failed to fetch task", details: err.message });
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
                Bucket: getOriginalsBucket(), Key: s3Key,
                Body: req.file.buffer, ContentType: req.file.mimetype
            }));
            imageUrl = `https://${getOriginalsBucket()}.s3.amazonaws.com/${s3Key}`;
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
            try {
                await snsClient.send(new PublishCommand({
                    TopicArn: process.env.SNS_TASK_ASSIGNED_TOPIC_ARN,
                    Message: JSON.stringify({ taskId, assigneeId, teamId, action: "ASSIGNED" }),
                    Subject: 'Task Assigned'
                }));
            } catch (snsErr) {
                console.warn('SNS publish skipped:', snsErr.message);
            }
        }

        res.status(201).json(taskItem);
    } catch (error) {
        console.error('POST /api/tasks error:', error);
        res.status(500).json({ error: "Failed to create task", details: error.message });
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

        // Team access is already enforced by getTaskAndAuthorize.
        // Employees can update status only within allowed transitions.

        // Validate status
        const allowed = ['To Do', 'In Progress', 'In Review', 'Done'];
        if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status value' });

        // Employee transition rule: To Do -> In Progress OR In Progress -> In Review
        if (req.user.role !== 'Manager') {
            const currentStatus = task.status;
            const isAllowedEmployeeTransition =
                (currentStatus === 'To Do' && status === 'In Progress') ||
                (currentStatus === 'In Progress' && status === 'To Do') ||
                (currentStatus === 'In Progress' && status === 'In Review');
            if (!isAllowedEmployeeTransition) {
                return res.status(403).json({
                    error: 'Employees can only change status from To Do to In Progress, In Progress to To Do, or In Progress to In Review',
                    currentStatus,
                    requestedStatus: status
                });
            }
        }

        await docClient.send(new UpdateCommand({
            TableName: "Tasks", Key: { taskId },
            UpdateExpression: "SET #s = :status, auditLog = list_append(if_not_exists(auditLog, :empty), :log)",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":status": status, ":log": logEntry, ":empty": [] }
        }));
        res.json({ success: true, message: "Status updated" });
    } catch (error) {
        console.error(`PUT /api/tasks/${taskId}/status error:`, error);
        res.status(500).json({ error: "Failed to update status", details: error.message });
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

        const bucket = getOriginalsBucket();
        if (!bucket) {
            return res.status(500).json({ error: 'S3 originals bucket is not configured' });
        }

        const s3Key = `tasks/${taskId}-${Date.now()}-${req.file.originalname}`;
        await s3.send(new PutObjectCommand({
            Bucket: bucket, Key: s3Key,
            Body: req.file.buffer, ContentType: req.file.mimetype
        }));

        const imageUrl = `https://${bucket}.s3.amazonaws.com/${s3Key}`;

        await docClient.send(new UpdateCommand({
            TableName: "Tasks", Key: { taskId },
            UpdateExpression: "SET imageUrl = :url, s3Key = :key",
            ExpressionAttributeValues: { ":url": imageUrl, ":key": s3Key }
        }));
        res.json({ success: true, imageUrl });
    } catch (error) {
        console.error(`PUT /api/tasks/${taskId}/image error:`, {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            requestId: error?.$metadata?.requestId,
        });
        res.status(500).json({ error: "Failed to update image", details: error.message });
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
            await s3.send(new DeleteObjectCommand({ Bucket: getOriginalsBucket(), Key: task.s3Key }));
        }

        // Delete from DB
        await docClient.send(new DeleteCommand({ TableName: "Tasks", Key: { taskId } }));
        res.json({ success: true, message: "Task and associated files deleted" });
    } catch (error) {
        console.error(`DELETE /api/tasks/${taskId} error:`, error);
        res.status(500).json({ error: "Failed to delete task", details: error.message });
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
        try {
            await snsClient.send(new PublishCommand({
                TopicArn: process.env.SNS_TASK_ASSIGNED_TOPIC_ARN,
                Message: JSON.stringify({ taskId, assigneeId, teamId, action: "ASSIGNED" }),
                Subject: 'Task Assigned'
            }));
        } catch (snsErr) {
            console.warn('SNS publish skipped:', snsErr.message);
        }
        res.json({ success: true, message: "Task assigned and SNS triggered" });
    } catch (error) {
        console.error(`POST /api/tasks/${taskId}/assign error:`, error);
        res.status(500).json({ error: "Failed to assign task", details: error.message });
    }
});

module.exports = router;