import { Upload } from "@aws-sdk/lib-storage";
import { S3Client } from "@aws-sdk/client-s3";
import config from "../config";
import { Express } from "express";

interface UploadFile {
  name: string;
  mimetype: string;
  buffer: Buffer;
}

const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

/**
 * Upload single file
 */
export const uploadFileToAws = async (files: Express.Multer.File[]) => {
  if (!files || files.length === 0) {
    throw new Error("Invalid file buffer");
  }

  const fileName = `${Date.now()}_${files[0].originalname}`;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: config.aws.bucket,
      Key: fileName,
      Body: files[0].buffer,
      ContentType: files[0].mimetype,
    },
    queueSize: 3,
  });

  const data = await upload.done();

  return {
    images: data.Location, // keep same key for backward compatibility
  };
};

/**
 * Upload multiple files (Multer based)
 */
export const uploadMultipleFilesToAws = async (
  files: Express.Multer.File[] | Express.Multer.File
) => {
  const fileArray = Array.isArray(files) ? files : [files];

  const uploadPromises = fileArray.map(async (file) => {
    const fileName = `${Date.now()}_${file.originalname}`;

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: config.aws.bucket,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      },
      queueSize: 3,
    });

    const data = await upload.done();
    return data.Location as string;
  });

  const locations = await Promise.all(uploadPromises);

  return {
    images: locations, // array of URLs
  };
};

export default {
  uploadFileToAws,
  uploadMultipleFilesToAws,
};
