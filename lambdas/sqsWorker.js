// File: lambdas/sqsWorker.js (Deploy in AWS Lambda Console)
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");
const cwClient = new CloudWatchClient();

exports.handler = async (event) => {
    for (const record of event.Records) {
        const snsMessage = JSON.parse(record.body);
        const taskData = JSON.parse(snsMessage.Message);

        console.log(`Writing log: Task ${taskData.taskId} assigned to ${taskData.assigneeId}`);

        await cwClient.send(new PutMetricDataCommand({
            Namespace: "MiniJira/Activity",
            MetricData: [{
                MetricName: "TasksAssignedPerTeam",
                Dimensions: [{ Name: "TeamID", Value: taskData.teamId }],
                Value: 1,
                Unit: "Count"
            }]
        }));
    }
};