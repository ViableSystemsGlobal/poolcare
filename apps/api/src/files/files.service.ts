import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import * as MinIO from "minio";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class FilesService {
  private minioClient: MinIO.Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.minioClient = new MinIO.Client({
      endPoint: this.configService.get<string>("MINIO_ENDPOINT") || "localhost",
      port: parseInt(this.configService.get<string>("MINIO_PORT") || "9000"),
      useSSL: this.configService.get<string>("MINIO_USE_SSL") === "true",
      accessKey: this.configService.get<string>("MINIO_ACCESS_KEY") || "minioadmin",
      secretKey: this.configService.get<string>("MINIO_SECRET_KEY") || "minioadmin",
    });

    this.bucket = this.configService.get<string>("MINIO_BUCKET") || "poolcare";
  }

  async presign(orgId: string, dto: {
    scope: string;
    refId: string;
    contentType: string;
    fileName?: string;
    sizeBytes?: number;
  }) {
    // Validate content type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "text/html",
    ];
    if (!allowedTypes.includes(dto.contentType)) {
      throw new Error(`Content type ${dto.contentType} not allowed`);
    }

    // Generate storage key
    const fileId = uuidv4();
    const ext = dto.fileName?.split(".").pop() || dto.contentType.split("/")[1];
    const key = `org/${orgId}/${dto.scope}/${dto.refId}/${fileId}.${ext}`;

    // Generate presigned POST URL
    const policy = new MinIO.PostPolicy();
    policy.setBucket(this.bucket);
    policy.setKey(key);
    policy.setContentType(dto.contentType);
    if (dto.sizeBytes) {
      policy.setContentLengthRange(0, dto.sizeBytes);
    }
    policy.setExpires(new Date(Date.now() + 10 * 60 * 1000)); // 10 min

    const formData = await this.minioClient.presignedPostPolicy(policy);

    return {
      url: `${this.configService.get<string>("MINIO_ENDPOINT")}:${this.configService.get<string>("MINIO_PORT")}/${this.bucket}`,
      method: "POST",
      fields: formData,
      key,
    };
  }

  async commit(orgId: string, dto: { key: string; scope: string; refId: string }) {
    // Verify key belongs to org
    if (!dto.key.startsWith(`org/${orgId}/`)) {
      throw new ForbiddenException("Invalid key");
    }

    // Create file record (will be processed by worker)
    const file = await prisma.fileObject.create({
      data: {
        orgId,
        scope: dto.scope,
        refId: dto.refId,
        storageKey: dto.key,
        storageBucket: this.bucket,
        contentType: "image/jpeg", // TODO: extract from key or metadata
        sizeBytes: 0, // TODO: get from object metadata
      },
    });

    // TODO: Queue processing job (exif, variants)
    // await this.queue.processFile(file.id);

    return file;
  }

  async sign(orgId: string, role: string, userId: string, dto: {
    fileId: string;
    variant?: string;
    ttlSec?: number;
  }) {
    const file = await prisma.fileObject.findFirst({
      where: {
        id: dto.fileId,
        orgId,
      },
    });

    if (!file) {
      throw new NotFoundException("File not found");
    }

    // TODO: Check access permissions based on scope/refId and role
    // For now, allow org members to access any file in org

    const ttl = dto.ttlSec || 300; // 5 min default
    const key = dto.variant ? `${file.storageKey}.${dto.variant}` : file.storageKey;

    const url = await this.minioClient.presignedGetObject(this.bucket, key, ttl);

    return { url };
  }

  async bulkSign(orgId: string, role: string, userId: string, dto: {
    fileIds: string[];
    variant?: string;
    ttlSec?: number;
  }) {
    const files = await prisma.fileObject.findMany({
      where: {
        id: { in: dto.fileIds },
        orgId,
      },
    });

    if (files.length !== dto.fileIds.length) {
      throw new NotFoundException("Some files not found");
    }

    const ttl = dto.ttlSec || 300;
    const urls = await Promise.all(
      files.map(async (file) => {
        const key = dto.variant ? `${file.storageKey}.${dto.variant}` : file.storageKey;
        const url = await this.minioClient.presignedGetObject(this.bucket, key, ttl);
        return { fileId: file.id, url };
      })
    );

    return { urls };
  }

  async delete(orgId: string, fileId: string) {
    const file = await prisma.fileObject.findFirst({
      where: {
        id: fileId,
        orgId,
      },
    });

    if (!file) {
      throw new NotFoundException("File not found");
    }

    // Soft delete
    await prisma.fileObject.update({
      where: { id: fileId },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }
}

