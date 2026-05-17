// File: lambdas/imageResize.js (Deploy in AWS Lambda Console)
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp'); // Must be packaged with your Lambda deployment
const s3 = new S3Client();

exports.handler = async (event) => {
    const srcBucket = event.Records[0].s3.bucket.name;
    const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    const dstBucket = srcBucket + "-resized";
    const dstKey = "resized-" + srcKey;

    const response = await s3.send(new GetObjectCommand({ Bucket: srcBucket, Key: srcKey }));
    const imageBuffer = await response.Body.transformToByteArray();

    const resizedImage = await sharp(imageBuffer).resize(200).toBuffer();

    await s3.send(new PutObjectCommand({
        Bucket: dstBucket,
        Key: dstKey,
        Body: resizedImage,
        ContentType: 'image/jpeg'
    }));
};