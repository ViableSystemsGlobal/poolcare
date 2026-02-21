import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@poolcare/db";
import * as MinIO from "minio";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class FilesService {
  private minioClient: MinIO.Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {
    // Use localhost for internal API connections
    this.minioClient = new MinIO.Client({
      endPoint: this.configService.get<string>("MINIO_ENDPOINT") || "localhost",
      port: parseInt(this.configService.get<string>("MINIO_PORT") || "9000"),
      useSSL: this.configService.get<string>("MINIO_USE_SSL") === "true",
      accessKey: this.configService.get<string>("MINIO_ACCESS_KEY") || "minioadmin",
      secretKey: this.configService.get<string>("MINIO_SECRET_KEY") || "minioadmin",
    });

    this.bucket = this.configService.get<string>("MINIO_BUCKET") || "poolcare";
  }

  private getNetworkIp(): string {
    // Get the network IP from environment or extract from API URL
    const networkIp = this.configService.get<string>("NETWORK_IP");
    if (networkIp) return networkIp;
    
    const apiUrl = this.configService.get<string>("EXPO_PUBLIC_API_URL") || process.env.EXPO_PUBLIC_API_URL;
    if (apiUrl) {
      try {
        const url = new URL(apiUrl);
        return url.hostname;
      } catch {
        // If URL parsing fails, try to extract IP
        const match = apiUrl.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match) return match[1];
      }
    }
    return "172.20.10.2"; // Default network IP
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

    // Generate presigned PUT URL (simpler for mobile apps)
    try {
      // Check if bucket exists, create if not (development only)
      let bucketExists = false;
      try {
        bucketExists = await this.minioClient.bucketExists(this.bucket);
      } catch (bucketCheckError: any) {
        console.error("Error checking bucket existence:", bucketCheckError);
        throw new BadRequestException(
          `Cannot connect to MinIO. Error: ${bucketCheckError.message || "Connection failed"}. Please ensure MinIO is running on ${this.configService.get<string>("MINIO_ENDPOINT") || "localhost"}:${this.configService.get<string>("MINIO_PORT") || "9000"}`
        );
      }

      if (!bucketExists) {
        console.warn(`Bucket ${this.bucket} does not exist. Creating...`);
        try {
          await this.minioClient.makeBucket(this.bucket, "us-east-1");
          console.log(`Bucket ${this.bucket} created successfully`);
        } catch (bucketCreateError: any) {
          console.error("Error creating bucket:", bucketCreateError);
          throw new BadRequestException(
            `Failed to create bucket: ${bucketCreateError.message || "Unknown error"}`
          );
        }
      }

      // Generate presigned URL - MinIO will generate it for localhost
      // We need to create a custom presigned URL with the network IP
      const networkIp = this.getNetworkIp();
      const minioPort = this.configService.get<string>("MINIO_PORT") || "9000";
      
      // Generate presigned URL with network IP in the request
      // We'll manually construct the URL with proper signature
      const expiry = 10 * 60; // 10 minutes
      
      // Use presignedPutObject which generates the URL
      // Then we need to replace the hostname while preserving query params
      const uploadUrl = await this.minioClient.presignedPutObject(
        this.bucket,
        key,
        expiry
      );
      
      // Parse the URL to replace hostname while keeping query parameters intact
      try {
        const url = new URL(uploadUrl);
        url.hostname = networkIp;
        const mobileUploadUrl = url.toString();
        
        console.log("Generated presigned URL for network IP:", mobileUploadUrl.substring(0, 150) + "...");
        
        return {
          uploadUrl: mobileUploadUrl,
          key,
          method: "PUT",
        };
      } catch (urlError) {
        // Fallback: simple string replacement if URL parsing fails
        console.warn("URL parsing failed, using string replacement:", urlError);
        const mobileUploadUrl = uploadUrl
          .replace(/http:\/\/localhost:/g, `http://${networkIp}:`)
          .replace(/http:\/\/127\.0\.0\.1:/g, `http://${networkIp}:`);
        
        return {
          uploadUrl: mobileUploadUrl,
          key,
          method: "PUT",
        };
      }
    } catch (error: any) {
      console.error("MinIO presign error:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
        endpoint: this.configService.get<string>("MINIO_ENDPOINT") || "localhost",
        port: this.configService.get<string>("MINIO_PORT") || "9000",
        bucket: this.bucket,
      });
      
      const errorMessage = error.message || "Unknown error";
      
      // Provide helpful error message
      if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("connect") || error.code === "ECONNREFUSED") {
        throw new BadRequestException(
          `Cannot connect to MinIO storage at ${this.configService.get<string>("MINIO_ENDPOINT") || "localhost"}:${this.configService.get<string>("MINIO_PORT") || "9000"}. Please ensure MinIO is running.`
        );
      }
      
      if (error.code === "ENOTFOUND" || errorMessage.includes("getaddrinfo")) {
        throw new BadRequestException(
          `Cannot resolve MinIO hostname: ${this.configService.get<string>("MINIO_ENDPOINT") || "localhost"}. Please check your MINIO_ENDPOINT configuration.`
        );
      }
      
      throw new BadRequestException(
        `Failed to generate upload URL: ${errorMessage}${error.code ? ` (code: ${error.code})` : ""}`
      );
    }
  }

  async commit(orgId: string, dto: { key: string; scope: string; refId: string }) {
    // Verify key belongs to org
    if (!dto.key.startsWith(`org/${orgId}/`)) {
      throw new ForbiddenException("Invalid key");
    }

    let contentType = "image/jpeg";
    let sizeBytes = 0;
    try {
      const stat = await this.minioClient.statObject(this.bucket, dto.key);
      if (stat.metaData?.["content-type"]) contentType = stat.metaData["content-type"];
      sizeBytes = stat.size ?? 0;
    } catch {
      // Fallback: infer from key extension
      const ext = dto.key.split(".").pop()?.toLowerCase();
      if (ext === "png") contentType = "image/png";
      else if (ext === "webp") contentType = "image/webp";
      else if (ext === "pdf") contentType = "application/pdf";
    }

    const file = await prisma.fileObject.create({
      data: {
        orgId,
        scope: dto.scope,
        refId: dto.refId,
        storageKey: dto.key,
        storageBucket: this.bucket,
        contentType,
        sizeBytes,
      },
    });

    return file;
  }

  async list(orgId: string, scope?: string, refId?: string, limit: number = 100) {
    const files = await prisma.fileObject.findMany({
      where: {
        orgId,
        scope: scope || undefined,
        refId: refId || undefined,
        deletedAt: null,
      },
      orderBy: { uploadedAt: "desc" },
      take: limit,
    });

    return files.map((f) => ({
      id: f.id,
      scope: f.scope,
      refId: f.refId,
      url: this.getPublicUrl(f.storageKey),
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      uploadedAt: f.uploadedAt,
    }));
  }

  private getPublicUrl(key: string): string {
    const endpoint = this.configService.get<string>("MINIO_PUBLIC_ENDPOINT") || this.configService.get<string>("MINIO_ENDPOINT") || "localhost";
    const port = this.configService.get<string>("MINIO_PORT") || "9000";
    const useSSL = this.configService.get<string>("MINIO_USE_SSL") === "true";
    const protocol = useSSL ? "https" : "http";
    return `${protocol}://${endpoint}:${port}/${this.bucket}/${key}`;
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

    // Access: only org members can access files in their org
    if (file.orgId !== orgId) {
      throw new ForbiddenException("Access denied");
    }

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

  async uploadImage(orgId: string, file: Express.Multer.File, scope: string, refId: string): Promise<string> {
    try {
      // Validate file type
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(`File type ${file.mimetype} not allowed. Allowed types: ${allowedTypes.join(", ")}`);
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        throw new BadRequestException(`File size ${file.size} exceeds maximum allowed size of ${maxSize} bytes`);
      }

      // Generate storage key
      const fileId = uuidv4();
      const ext = file.originalname.split(".").pop() || file.mimetype.split("/")[1];
      const key = `org/${orgId}/${scope}/${refId}/${fileId}.${ext}`;

      try {
        // Ensure bucket exists
        const bucketExists = await this.minioClient.bucketExists(this.bucket);
        if (!bucketExists) {
          await this.minioClient.makeBucket(this.bucket);
        }

        // Upload to MinIO
        await this.minioClient.putObject(this.bucket, key, file.buffer, file.size, {
          "Content-Type": file.mimetype,
        });

        // Create file record
        const fileRecord = await prisma.fileObject.create({
          data: {
            orgId,
            scope,
            refId,
            storageKey: key,
            storageBucket: this.bucket,
            contentType: file.mimetype,
            sizeBytes: file.size,
          },
        });

        // Return signed URL (valid for 7 days - Max allowed by MinIO)
        const url = await this.minioClient.presignedGetObject(this.bucket, key, 7 * 24 * 60 * 60);

        return url;
      } catch (minioError: any) {
        // Fallback to local storage if MinIO is not available
        if (minioError.code === "ECONNREFUSED" || minioError.message?.includes("connect") || minioError.code === "ENOTFOUND") {
          console.warn("MinIO not available, using local file storage fallback");
          return this.uploadImageLocal(orgId, file, scope, refId, fileId, ext);
        }
        throw minioError;
      }
    } catch (error: any) {
      console.error("MinIO upload error:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        stack: error.stack,
      });
      
      // Provide more specific error messages
      if (error.code === "ECONNREFUSED" || error.message?.includes("connect") || error.message?.includes("ECONNREFUSED") || error.code === "ENOTFOUND") {
        throw new BadRequestException(
          "Cannot connect to storage server (MinIO). " +
          "Please ensure MinIO is running on localhost:9000 or configure MINIO_ENDPOINT in your environment variables. " +
          "You can start MinIO with: docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ':9001'"
        );
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMsg = error.message || error.toString();
      throw new BadRequestException(`Failed to upload image: ${errorMsg}`);
    }
  }

  private async uploadImageLocal(
    orgId: string,
    file: Express.Multer.File,
    scope: string,
    refId: string,
    fileId: string,
    ext: string
  ): Promise<string> {
    // Create uploads directory based on scope
    // UPLOAD_DIR env var lets Render persistent disk path be set explicitly
    const baseUploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    const uploadsDir = path.join(baseUploadDir, scope);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Save file locally
    const fileName = `${fileId}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    // Create file record with local path
    await prisma.fileObject.create({
      data: {
        orgId,
        scope,
        refId,
        storageKey: `local/${scope}/${fileName}`,
        storageBucket: "local",
        contentType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    // Return a URL that the API can serve. Prefer API_PUBLIC_URL so file URLs use the canonical domain (e.g. api.poolcare.africa) instead of Render host.
    const baseUrl = this.configService.get<string>("API_PUBLIC_URL")
      || this.configService.get<string>("RENDER_EXTERNAL_URL")
      || this.configService.get<string>("API_URL")
      || this.configService.get<string>("NEXT_PUBLIC_APP_URL")
      || "http://localhost:4000";
    return `${baseUrl}/api/files/local/${scope}/${fileName}`;
  }
}

