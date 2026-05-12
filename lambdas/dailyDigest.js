// File: lambdas/dailyDigest.js (Deploy in AWS Lambda Console)
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient());
const sns = new SNSClient();

exports.handler = async () => {
    const today = new Date().toISOString().split('T')[0];

    const { Items } = await docClient.send(new ScanCommand({
        TableName: "Tasks",
        FilterExpression: "deadline = :today AND #st <> :done",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: { ":today": today, ":done": "Done" }
    }));

    for (const task of Items) {
        await sns.send(new PublishCommand({
            TopicArn: process.env.SNS_DAILY_DIGEST_TOPIC_ARN,
            Message: `Reminder: Task "${task.title}" is due today!`
        }));
    }
};