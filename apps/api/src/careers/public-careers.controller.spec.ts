import { BadRequestException } from "@nestjs/common";

jest.mock("@poolcare/db", () => ({ prisma: {} }));

import { PublicCareersController } from "./public-careers.controller";

describe("PublicCareersController.apply", () => {
  let controller: PublicCareersController;
  let careers: { apply: jest.Mock; resolveOrgId: jest.Mock };
  let files: { uploadDocument: jest.Mock };

  beforeEach(() => {
    careers = { apply: jest.fn().mockResolvedValue({ ok: true }), resolveOrgId: jest.fn().mockResolvedValue("org-1") };
    files = { uploadDocument: jest.fn().mockResolvedValue("http://files/cv.pdf") };
    controller = new PublicCareersController(careers as any, files as any);
  });

  it("silently drops honeypot submissions without touching the service", async () => {
    const res = await controller.apply("pool-technician", {
      name: "Spam Bot", email: "spam@bot.com", website: "http://spam.com",
    });
    expect(res).toEqual({ ok: true }); // fake success so bots don't adapt
    expect(careers.apply).not.toHaveBeenCalled();
    expect(files.uploadDocument).not.toHaveBeenCalled();
  });

  it("rejects an empty CV file", async () => {
    const cv = { size: 0, originalname: "cv.pdf" } as any;
    await expect(controller.apply("pool-technician", { name: "A", email: "a@b.com" }, cv)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("uploads the CV under the job_application_cv scope and passes metadata through", async () => {
    const cv = { size: 1234, originalname: "ama-cv.pdf" } as any;
    await controller.apply("pool-technician", { name: "Ama", email: "a@b.com" }, cv);

    expect(files.uploadDocument).toHaveBeenCalledWith("org-1", cv, "job_application_cv", "pool-technician");
    expect(careers.apply).toHaveBeenCalledWith(
      "pool-technician",
      expect.objectContaining({ name: "Ama" }),
      { url: "http://files/cv.pdf", fileName: "ama-cv.pdf" },
    );
  });

  it("applies without a CV when none is attached", async () => {
    await controller.apply("pool-technician", { name: "Ama", email: "a@b.com" });
    expect(files.uploadDocument).not.toHaveBeenCalled();
    expect(careers.apply).toHaveBeenCalledWith("pool-technician", expect.anything(), undefined);
  });
});
