import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { v4 as uuidv4 } from "uuid";

export interface KnowledgeDocEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  fileUrl: string;
  contentSummary: string;
  sizeBytes: number;
  contentType: string;
  uploadedAt: string;
}

@Injectable()
export class KnowledgeService {
  constructor() {}

  /**
   * Upload a knowledge base document, store via FilesService, and save metadata
   * in the org settings JSON under integrations.knowledgeBase.
   */
  async uploadDocument(
    orgId: string,
    file: Express.Multer.File,
    metadata: { name: string; description?: string; category?: string },
  ): Promise<KnowledgeDocEntry> {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/csv",
      "text/markdown",
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} not allowed. Allowed: PDF, DOCX, TXT, CSV, Markdown.`,
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException(`File exceeds maximum size of 10MB.`);
    }

    // Store file locally with a file record (knowledge docs aren't limited to images/video)
    const docId = uuidv4();
    const fileUrl = await this.storeKnowledgeFile(orgId, file, docId);

    // Extract a content summary (first ~500 chars for text files)
    let contentSummary = "";
    if (file.mimetype === "text/plain" || file.mimetype === "text/csv" || file.mimetype === "text/markdown") {
      contentSummary = file.buffer.toString("utf-8").slice(0, 1000).trim();
    } else if (file.mimetype === "application/pdf") {
      contentSummary = `[PDF document: ${file.originalname}]`;
    } else {
      contentSummary = `[Document: ${file.originalname}]`;
    }

    const entry: KnowledgeDocEntry = {
      id: docId,
      name: metadata.name || file.originalname,
      description: metadata.description || "",
      category: metadata.category || "Other",
      fileUrl,
      contentSummary,
      sizeBytes: file.size,
      contentType: file.mimetype,
      uploadedAt: new Date().toISOString(),
    };

    // Save to org settings under integrations.knowledgeBase
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const knowledgeBase: KnowledgeDocEntry[] = integrations.knowledgeBase || [];
    knowledgeBase.push(entry);
    integrations.knowledgeBase = knowledgeBase;

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    return entry;
  }

  /**
   * Store knowledge file directly, bypassing mimetype restrictions on uploadMedia.
   */
  private async storeKnowledgeFile(
    orgId: string,
    file: Express.Multer.File,
    docId: string,
  ): Promise<string> {
    const fs = await import("fs");
    const path = await import("path");

    const baseUploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    const uploadsDir = path.join(baseUploadDir, "knowledge");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = file.originalname.split(".").pop() || "bin";
    const fileName = `${docId}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, file.buffer);

    // Create file record
    await prisma.fileObject.create({
      data: {
        orgId,
        scope: "knowledge",
        refId: docId,
        storageKey: `local/knowledge/${fileName}`,
        storageBucket: "local",
        contentType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    const baseUrl =
      process.env.API_PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:4000";
    return `${baseUrl}/api/files/local/knowledge/${fileName}`;
  }

  /**
   * List all knowledge base documents for an org.
   */
  async listDocuments(orgId: string): Promise<KnowledgeDocEntry[]> {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    return (integrations.knowledgeBase as KnowledgeDocEntry[]) || [];
  }

  /**
   * Get a single knowledge base document.
   */
  async getDocument(orgId: string, id: string): Promise<KnowledgeDocEntry> {
    const docs = await this.listDocuments(orgId);
    const doc = docs.find((d) => d.id === id);
    if (!doc) throw new NotFoundException("Knowledge document not found");
    return doc;
  }

  /**
   * Delete a knowledge base document.
   */
  async deleteDocument(orgId: string, id: string): Promise<{ success: true }> {
    const orgSetting = await this.getOrCreateOrgSetting(orgId);
    const integrations = (orgSetting.integrations as any) || {};
    const knowledgeBase: KnowledgeDocEntry[] = integrations.knowledgeBase || [];

    const index = knowledgeBase.findIndex((d) => d.id === id);
    if (index === -1) throw new NotFoundException("Knowledge document not found");

    knowledgeBase.splice(index, 1);
    integrations.knowledgeBase = knowledgeBase;

    await prisma.orgSetting.update({
      where: { orgId },
      data: { integrations },
    });

    // Also soft-delete the file record if it exists
    const fileRecord = await prisma.fileObject.findFirst({
      where: { orgId, scope: "knowledge", refId: id },
    });
    if (fileRecord) {
      await prisma.fileObject.update({
        where: { id: fileRecord.id },
        data: { deletedAt: new Date() },
      });
    }

    return { success: true };
  }

  /**
   * Returns a text summary of all knowledge base documents for inclusion in AI prompts.
   * Includes document names, descriptions, categories, and content snippets.
   */
  async getKnowledgeContext(orgId: string): Promise<string> {
    const docs = await this.listDocuments(orgId);
    if (docs.length === 0) return "";

    const lines: string[] = [
      "",
      "--- Knowledge Base Documents ---",
    ];

    for (const doc of docs) {
      lines.push(`- [${doc.category}] ${doc.name}: ${doc.description || "No description"}`);
      if (doc.contentSummary && !doc.contentSummary.startsWith("[")) {
        // Include first 300 chars of actual content
        const snippet = doc.contentSummary.slice(0, 300).trim();
        lines.push(`  Content: ${snippet}${doc.contentSummary.length > 300 ? "..." : ""}`);
      }
    }

    lines.push("--- End Knowledge Base ---");
    return lines.join("\n");
  }

  private async getOrCreateOrgSetting(orgId: string) {
    let orgSetting = await prisma.orgSetting.findUnique({
      where: { orgId },
    });

    if (!orgSetting) {
      orgSetting = await prisma.orgSetting.create({
        data: {
          orgId,
          integrations: {},
        },
      });
    }

    return orgSetting;
  }
}
