# Mini-Jira on AWS

Lightweight team task-management API built with Node.js + Express, backed by DynamoDB, S3, SNS, SQS, EventBridge, and Cognito.

---

## Prerequisites

- Node.js 18+
- An AWS account with the services below provisioned
- EC2 instance role (or local credentials) with the IAM permissions listed in this README

---

## 1. Environment Variables

Copy `.env.example` to `.env` and fill in every value before starting the server:

```bash
cp .env.example .env
nano .env          # fill in your real values
```

**If running on EC2:** prefer setting env vars via the instance's IAM role + Systems Manager Parameter Store instead of a plain `.env` file.

---

## 2. Create DynamoDB Tables

Run the setup script once — it creates all five tables and their GSIs if they don't already exist:

```bash
npm install
npm run setup
```

Tables created:

| Table     | Primary Key   | GSIs                                    |
|-----------|---------------|-----------------------------------------|
| Tasks     | taskId (S)    | teamId-index, assigneeId-index          |
| Projects  | projectId (S) | —                                       |
| Teams     | teamId (S)    | —                                       |
| Users     | userId (S)    | —                                       |
| Comments  | commentId (S) | taskId-index                            |

> **Important:** If the setup script times out or returns `AccessDeniedException`, the EC2 IAM role is missing DynamoDB permissions — see Section 4.

---

## 3. VPC / Network Requirements

EC2 instances run in **private subnets** (as required by the architecture). They must reach DynamoDB without going through the public internet. Add a **VPC Endpoint for DynamoDB**:

1. AWS Console → VPC → Endpoints → **Create Endpoint**
2. Service: `com.amazonaws.YOUR_REGION.dynamodb`  (type: **Gateway**)
3. Attach to the private route table used by your EC2 subnets

This is **free** and eliminates the need for a NAT Gateway for DynamoDB traffic specifically. Without it, every DynamoDB call from a private subnet will silently time out.

---

## 4. Required IAM Permissions for the EC2 Role

Attach an inline policy (or managed policy) to your EC2 instance role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/Tasks",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/Tasks/index/*",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/Projects",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/Teams",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/Users",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/Comments",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/Comments/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": [
        "arn:aws:sns:REGION:ACCOUNT_ID:TaskAssigned",
        "arn:aws:sns:REGION:ACCOUNT_ID:DailyDigest"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricData"],
      "Resource": "*"
    }
  ]
}
```

Replace `REGION`, `ACCOUNT_ID`, and `YOUR_BUCKET_NAME` with your actual values.

---

## 5. Start the Server

```bash
npm install
npm start
```

The server listens on `PORT` (default 80). The ALB health check hits `GET /health`.

---

## 6. Diagnosing DynamoDB Errors on EC2

SSH into your instance and run:

```bash
# Confirm env vars are loaded
node -e "require('dotenv').config(); console.log('Region:', process.env.AWS_REGION)"

# Test DynamoDB connectivity using the AWS CLI (uses same role as the app)
aws dynamodb list-tables --region us-east-1

# Check which IAM role is attached
curl -s http://169.254.169.254/latest/meta-data/iam/info

# View live app logs (adjust for your process manager)
pm2 logs
# or
journalctl -u minijira -n 100
```

Common error → cause mapping:

| Error | Cause |
|---|---|
| `AccessDeniedException` | EC2 IAM role missing DynamoDB permissions (Section 4) |
| `ResourceNotFoundException` | Table or GSI not created yet — run `npm run setup` |
| `UnrecognizedClientException` | No credentials at all — IAM role not attached to EC2 |
| Request times out | No VPC Endpoint and no NAT Gateway (Section 3) |
| `Missing region` | `AWS_REGION` not set in `.env` or environment |

---

## Architecture Overview

```
Internet → CloudFront → ALB → EC2 (Auto Scaling, 2 AZs)
                                │
                    ┌───────────┼───────────┐
                  DynamoDB     S3        Cognito
                    │
                  SNS → SQS → Lambda (sqsWorker)
                    └────────→ Email notification
                  EventBridge → Lambda (dailyDigest)
                  S3 PUT event → Lambda (imageResize)
```
