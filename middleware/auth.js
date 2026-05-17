const { CognitoJwtVerifier } = require("aws-jwt-verify");

const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    tokenUse: "access",
    clientId: process.env.COGNITO_CLIENT_ID,
});

const authenticateUser = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ error: "No token provided" });

        const payload = await verifier.verify(token);

        // Cognito custom attributes store role and teamId
        req.user = {
            username: payload.username,
            role: payload["custom:role"] || "Employee",
            teamId: payload["custom:teamId"]
        };
        next();
    } catch (err) {
        res.status(401).json({ error: "Unauthorized", details: err.message });
    }
};

module.exports = { authenticateUser };