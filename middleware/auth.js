const { CognitoJwtVerifier } = require("aws-jwt-verify");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { CognitoIdentityProviderClient, GetUserCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    tokenUse: "access",
    clientId: process.env.COGNITO_CLIENT_ID,
});

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const findTeamIdForUser = async (userId) => {
    const response = await docClient.send(new ScanCommand({
        TableName: 'Teams',
        FilterExpression: 'contains(#members, :userId)',
        ExpressionAttributeNames: { '#members': 'members' },
        ExpressionAttributeValues: { ':userId': userId }
    }));

    return response.Items?.[0]?.teamId || null;
};

const authenticateUser = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ error: "No token provided" });

        const payload = await verifier.verify(token);
        const cognitoUsername = payload.username || payload["cognito:username"] || null;
        const tokenEmail = payload.email || null;

        let role = payload["custom:role"] || "Employee";
        let teamId = payload["custom:teamId"] || null;
        let resolvedEmail = tokenEmail;

        // Try to resolve email from Cognito using the access token (more robust mapping)
        if (token) {
            try {
                const getUserResp = await cognitoClient.send(new GetUserCommand({ AccessToken: token }));
                console.warn('authenticateUser: GetUser attributes', getUserResp.UserAttributes || []);
                const emailAttr = (getUserResp.UserAttributes || []).find(a => a.Name === 'email');
                const email = emailAttr?.Value;
                if (email) resolvedEmail = email;
                if (email) {
                    try {
                        const byEmail = await docClient.send(new GetCommand({ TableName: 'Users', Key: { userId: email } }));
                        if (byEmail.Item) {
                            role = byEmail.Item.role || role;
                            teamId = byEmail.Item.teamId || teamId;
                            resolvedEmail = resolvedEmail || byEmail.Item.email || byEmail.Item.userId;
                            console.warn('authenticateUser: mapped Cognito token to Users by email', { cognitoUsername, email: resolvedEmail, userId: byEmail.Item.userId, teamId: byEmail.Item.teamId });
                        }
                    } catch (e) {
                        console.warn('authenticateUser: lookup by email failed', e.message);
                    }
                }
            } catch (e) {
                console.warn('authenticateUser: GetUser failed', e.message);
            }
        }

        const identityCandidates = [resolvedEmail, cognitoUsername].filter(Boolean);

        if ((!role || !teamId) && identityCandidates.length > 0) {
            try {
                let profile = null;

                for (const identity of identityCandidates) {
                    if (profile) break;

                    try {
                        const userResp = await docClient.send(new GetCommand({
                            TableName: "Users",
                            Key: { userId: identity }
                        }));
                        profile = userResp.Item || null;
                    } catch (getErr) {
                        console.warn('authenticateUser: primary user lookup failed', { identity, err: getErr.message });
                    }

                    if (!profile) {
                        try {
                            const scanResp = await docClient.send(new ScanCommand({
                                TableName: 'Users',
                                FilterExpression: 'userId = :u OR email = :u OR cognitoId = :u OR #sub = :u',
                                ExpressionAttributeNames: { '#sub': 'sub' },
                                ExpressionAttributeValues: { ':u': identity }
                            }));
                            profile = (scanResp.Items || [])[0] || null;
                            if (profile) console.warn('authenticateUser: located user profile via scan', { identity, profileId: profile.userId });
                        } catch (scanErr) {
                            // scanning may fail if AWS creds are missing; ignore and fall back to token claims
                            console.warn('authenticateUser: users scan failed', scanErr.message);
                        }
                    }
                }

                if (profile) {
                    role = profile.role || role;
                    teamId = profile.teamId || teamId;
                }

                // Still no teamId? Try to infer from Teams.members list
                if (!teamId) {
                    try {
                        // Try inferring team by email first (Teams.members commonly store emails), then by username
                        if (resolvedEmail) {
                            teamId = await findTeamIdForUser(resolvedEmail);
                            if (teamId) console.warn('authenticateUser: inferred teamId from Teams.members using email', { resolvedEmail, teamId });
                        }
                        if (!teamId && cognitoUsername) {
                            teamId = await findTeamIdForUser(cognitoUsername);
                            if (teamId) console.warn('authenticateUser: inferred teamId from Teams.members using username', { cognitoUsername, teamId });
                        }
                    } catch (teamLookupErr) {
                        console.warn('authenticateUser: findTeamIdForUser failed', teamLookupErr.message);
                    }
                }
            } catch (lookupError) {
                // Fall back to token claims if the profile lookup is unavailable.
                console.warn('authenticateUser: primary user lookup failed', lookupError.message);
            }
        }

        req.user = {
            username: resolvedEmail || cognitoUsername,
            email: resolvedEmail || tokenEmail || null,
            cognitoUsername,
            role,
            teamId
        };
        next();
    } catch (err) {
        res.status(401).json({ error: "Unauthorized", details: err.message });
    }
};

module.exports = { authenticateUser };