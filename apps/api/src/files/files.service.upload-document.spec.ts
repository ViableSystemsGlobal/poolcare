import { BadRequestException } from "@nestjs/common";

jest.mock("@poolcare/db", () => ({ prisma: {} }));

import { FilesService } from "./files.service";

const stubConfig = { get: jest.fn().mockReturnValue(undefined) } as any;

const file = (mimetype: string, size = 1024): any => ({
  mimetype, size, originalname: "cv.pdf", buffer: Buffer.from("x"),
});

describe("FilesService.uploadDocument", () => {
  let service: FilesService;

  beforeEach(() => {
    service = new FilesService(stubConfig);
    // Don't hit MinIO/disk — validation is what's under test.
    (service as any)._storeFile = jest.fn().mockResolvedValue("http://stored/doc");
  });

  it("accepts PDF and Word documents", async () => {
    for (const type of [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]) {
      await expect(service.uploadDocument("org-1", file(type), "job_application_cv", "ref")).resolves.toBe(
        "http://stored/doc",
      );
    }
  });

  it("rejects executables and images", async () => {
    for (const type of ["application/x-msdownload", "image/png", "text/html"]) {
      await expect(service.uploadDocument("org-1", file(type), "job_application_cv", "ref")).rejects.toThrow(
        BadRequestException,
      );
    }
    expect((service as any)._storeFile).not.toHaveBeenCalled();
  });

  it("rejects files over 5MB", async () => {
    await expect(
      service.uploadDocument("org-1", file("application/pdf", 5 * 1024 * 1024 + 1), "job_application_cv", "ref"),
    ).rejects.toThrow(BadRequestException);
  });
});
