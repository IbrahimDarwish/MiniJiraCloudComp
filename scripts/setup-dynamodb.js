// scripts/setup-dynamodb.js
// Run once to create all required DynamoDB tables and GSIs:
//   node scripts/setup-dynamodb.js
//
// Prerequisites: AWS credentials available (IAM role or ~/.aws/credentials)
//                AWS_REGION set in environment or .env

require('dotenv').config();
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand, waitUntilTableExists } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

const tables = [
    {
        TableName: 'Tasks',
        AttributeDefinitions: [
            { AttributeName: 'taskId',     AttributeType: 'S' },
            { AttributeName: 'teamId',     AttributeType: 'S' },
            { AttributeName: 'assigneeId', AttributeType: 'S' },
        ],
        KeySchema: [{ AttributeName: 'taskId', KeyType: 'HASH' }],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'teamId-index',
                KeySchema: [{ AttributeName: 'teamId', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
            },
            {
                IndexName: 'assigneeId-index',
                KeySchema: [{ AttributeName: 'assigneeId', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
            },
        ],
        BillingMode: 'PAY_PER_REQUEST',
    },
    {
        TableName: 'Projects',
        AttributeDefinitions: [{ AttributeName: 'projectId', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
    },
    {
        TableName: 'Teams',
        AttributeDefinitions: [{ AttributeName: 'teamId', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'teamId', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
    },
    {
        TableName: 'Users',
        AttributeDefinitions: [{ AttributeName: 'userId', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
    },
    {
        TableName: 'Comments',
        AttributeDefinitions: [
            { AttributeName: 'commentId', AttributeType: 'S' },
            { AttributeName: 'taskId',    AttributeType: 'S' },
        ],
        KeySchema: [{ AttributeName: 'commentId', KeyType: 'HASH' }],
        GlobalSecondaryIndexes: [
            {
                IndexName: 'taskId-index',
                KeySchema: [{ AttributeName: 'taskId', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
            },
        ],
        BillingMode: 'PAY_PER_REQUEST',
    },
];

async function tableExists(name) {
    try {
        await client.send(new DescribeTableCommand({ TableName: name }));
        return true;
    } catch (e) {
        if (e.name === 'ResourceNotFoundException') return false;
        throw e;
    }
}

async function setup() {
    console.log(`Setting up DynamoDB tables in region: ${process.env.AWS_REGION || 'us-east-1'}\n`);

    for (const def of tables) {
        if (await tableExists(def.TableName)) {
            console.log(`✔  ${def.TableName} already exists — skipping`);
            continue;
        }

        console.log(`Creating ${def.TableName}...`);
        await client.send(new CreateTableCommand(def));

        await waitUntilTableExists(
            { client, maxWaitTime: 60 },
            { TableName: def.TableName }
        );
        console.log(`${def.TableName} created successfully`);
    }

    console.log('\nAll tables are ready.');
}

setup().catch(err => {
    console.error('Setup failed:', err.message);
    process.exit(1);
});
