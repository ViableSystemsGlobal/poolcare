import { BadRequestException } from "@nestjs/common";

jest.mock("@poolcare/db", () => ({
  prisma: {
    organization: { findFirst: jest.fn(), findUnique: jest.fn() },
    jobPosting: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    jobApplication: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
    jobApplicationNote: { create: jest.fn() },
    jobApplicationReview: { findUnique: jest.fn(), upsert: jest.fn() },
    orgMember: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    carer: { findUnique: jest.fn() },
  },
}));

import { prisma } from "@poolcare/db";
import { CareersService } from "./careers.service";

const p = prisma as any;
const ORG = "org-1";
const flushAsync = () => new Promise(setImmediate);

describe("CareersService", () => {
  let service: CareersService;
  let carers: { create: jest.Mock };
  let push: { sendToUser: jest.Mock };
  let email: { send: jest.Mock };

  beforeEach(() => {
    carers = { create: jest.fn().mockResolvedValue({ id: "carer-1", name: "Ama" }) };
    push = { sendToUser: jest.fn().mockResolvedValue("ref") };
    email = { send: jest.fn().mockResolvedValue("ref") };
    service = new CareersService(carers as any, push as any, email as any);
    p.organization.findFirst.mockResolvedValue({ id: ORG });
    p.user.findUnique.mockResolvedValue({ name: "Admin User", email: "admin@x.com" });
    p.jobApplicationNote.create.mockResolvedValue({});
  });

  /* -------------------------------- apply -------------------------------- */
  describe("apply", () => {
    const posting = { id: "post-1", title: "Pool Technician" };
    beforeEach(() => {
      p.jobPosting.findFirst.mockResolvedValue(posting);
      p.orgMember.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    });

    it("rejects a missing name", async () => {
      await expect(service.apply("pool-technician", { email: "a@b.com" })).rejects.toThrow(BadRequestException);
    });

    it("rejects an invalid email", async () => {
      await expect(service.apply("pool-technician", { name: "Ama", email: "not-an-email" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("creates an application, logs a system note, notifies admins and emails the candidate", async () => {
      p.jobApplication.findFirst.mockResolvedValue(null);
      p.jobApplication.create.mockResolvedValue({ id: "app-1" });

      const res = await service.apply("pool-technician", { name: "Ama Mensah", email: "ama@example.com" });
      await flushAsync();

      expect(res).toEqual({ ok: true });
      expect(p.jobApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ orgId: ORG, postingId: "post-1", name: "Ama Mensah" }) }),
      );
      expect(p.jobApplicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ kind: "system", body: "Applied via the website careers page" }) }),
      );
      // one push per admin/manager
      expect(push.sendToUser).toHaveBeenCalledTimes(2);
      // acknowledgement email to the candidate
      expect(email.send).toHaveBeenCalledWith(
        "ama@example.com",
        expect.stringContaining("Pool Technician"),
        expect.stringContaining("Hi Ama"),
        undefined,
        ORG,
      );
    });

    it("updates the existing application when the same email re-applies (case-insensitive)", async () => {
      p.jobApplication.findFirst.mockResolvedValue({ id: "app-1" });

      const res = await service.apply("pool-technician", { name: "Ama", email: "AMA@Example.com" });

      expect(res).toEqual({ ok: true, updated: true });
      expect(p.jobApplication.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "app-1" } }));
      expect(p.jobApplication.create).not.toHaveBeenCalled();
    });

    it("attaches CV metadata when provided", async () => {
      p.jobApplication.findFirst.mockResolvedValue(null);
      p.jobApplication.create.mockResolvedValue({ id: "app-1" });

      await service.apply("pool-technician", { name: "Ama", email: "a@b.com" }, { url: "http://cv", fileName: "cv.pdf" });

      expect(p.jobApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cvUrl: "http://cv", cvFileName: "cv.pdf" }) }),
      );
    });
  });

  /* ------------------------------- setReview ------------------------------ */
  describe("setReview", () => {
    beforeEach(() => {
      p.jobApplication.findFirst.mockResolvedValue({ id: "app-1" });
      p.jobApplicationReview.upsert.mockResolvedValue({ id: "rev-1" });
    });

    it("rejects an unknown verdict", async () => {
      await expect(service.setReview("app-1", "u1", { verdict: "maybe" })).rejects.toThrow(BadRequestException);
    });

    it("clamps rating to 1..5 and cleans scores", async () => {
      p.jobApplicationReview.findUnique.mockResolvedValue(null);

      await service.setReview("app-1", "u1", {
        verdict: "advance",
        rating: 9,
        scores: { Skill: 7, Vibe: 0.2, Junk: "x" as any },
      });

      const args = p.jobApplicationReview.upsert.mock.calls[0][0];
      expect(args.create.rating).toBe(5);
      expect(args.create.scores).toEqual({ Skill: 5, Vibe: 1 }); // clamped; non-numeric dropped
    });

    it("logs a system note on a new or changed verdict, but not on an unchanged one", async () => {
      p.jobApplicationReview.findUnique.mockResolvedValue(null);
      await service.setReview("app-1", "u1", { verdict: "hold" });
      expect(p.jobApplicationNote.create).toHaveBeenCalledTimes(1);

      p.jobApplicationNote.create.mockClear();
      p.jobApplicationReview.findUnique.mockResolvedValue({ verdict: "hold" });
      await service.setReview("app-1", "u1", { verdict: "hold", rating: 3 });
      expect(p.jobApplicationNote.create).not.toHaveBeenCalled();

      p.jobApplicationReview.findUnique.mockResolvedValue({ verdict: "hold" });
      await service.setReview("app-1", "u1", { verdict: "advance" });
      expect(p.jobApplicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: expect.stringContaining("Advance") }) }),
      );
    });
  });

  /* --------------------------- updateApplication -------------------------- */
  describe("updateApplication", () => {
    beforeEach(() => {
      p.jobApplication.update.mockResolvedValue({ id: "app-1" });
    });

    it("rejects an invalid status", async () => {
      p.jobApplication.findFirst.mockResolvedValue({ id: "app-1", status: "new" });
      await expect(service.updateApplication("app-1", { status: "banana" })).rejects.toThrow(BadRequestException);
    });

    it("logs stage moves with the actor's name", async () => {
      p.jobApplication.findFirst.mockResolvedValue({ id: "app-1", status: "new" });
      await service.updateApplication("app-1", { status: "interview" }, "u1");
      expect(p.jobApplicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: "Moved to interview by Admin User" }) }),
      );
    });

    it("labels reject and reinstate transitions", async () => {
      p.jobApplication.findFirst.mockResolvedValue({ id: "app-1", status: "new" });
      await service.updateApplication("app-1", { status: "rejected" }, "u1");
      expect(p.jobApplicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: "Rejected by Admin User" }) }),
      );

      p.jobApplicationNote.create.mockClear();
      p.jobApplication.findFirst.mockResolvedValue({ id: "app-1", status: "rejected" });
      await service.updateApplication("app-1", { status: "new" }, "u1");
      expect(p.jobApplicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: "Reinstated by Admin User" }) }),
      );
    });

    it("does not log when the status is unchanged", async () => {
      p.jobApplication.findFirst.mockResolvedValue({ id: "app-1", status: "new" });
      await service.updateApplication("app-1", { status: "new" }, "u1");
      expect(p.jobApplicationNote.create).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------ hireToCarer ----------------------------- */
  describe("hireToCarer", () => {
    it("is idempotent when the applicant was already converted", async () => {
      p.jobApplication.findFirst.mockResolvedValue({ id: "app-1", carerId: "carer-9", posting: { title: "Tech" } });
      p.carer.findUnique.mockResolvedValue({ id: "carer-9", name: "Ama" });

      const res = await service.hireToCarer("app-1", "u1");

      expect(res.alreadyConverted).toBe(true);
      expect(carers.create).not.toHaveBeenCalled();
    });

    it("creates a carer, marks the application hired and logs it", async () => {
      p.jobApplication.findFirst.mockResolvedValue({
        id: "app-1", carerId: null, name: "Ama Mensah", email: "ama@x.com", phone: "+233", posting: { title: "Tech" },
      });

      const res = await service.hireToCarer("app-1", "u1");

      expect(res.alreadyConverted).toBe(false);
      expect(carers.create).toHaveBeenCalledWith(ORG, expect.objectContaining({ name: "Ama Mensah", email: "ama@x.com" }));
      expect(p.jobApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { carerId: "carer-1", status: "hired" } }),
      );
      expect(p.jobApplicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: expect.stringContaining("Hired") }) }),
      );
    });
  });

  /* ------------------------------ createPosting --------------------------- */
  describe("createPosting", () => {
    beforeEach(() => {
      p.jobPosting.findFirst.mockResolvedValue(null); // no slug clash
      p.jobPosting.create.mockImplementation(({ data }: any) => Promise.resolve({ id: "post-1", ...data }));
    });

    it("requires title and description", async () => {
      await expect(service.createPosting({ description: "x" })).rejects.toThrow(BadRequestException);
      await expect(service.createPosting({ title: "x" })).rejects.toThrow(BadRequestException);
    });

    it("trims, dedupes and caps scorecard criteria at 8", async () => {
      const posting = await service.createPosting({
        title: "Tech", description: "d",
        criteria: [" A ", "A", "B", "", "C", "D", "E", "F", "G", "H", "I"],
      });
      expect(posting.criteria).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    });

    it("stamps postedAt only when created open, and falls back to draft on bad status", async () => {
      const open = await service.createPosting({ title: "T", description: "d", status: "open" });
      expect(open.status).toBe("open");
      expect(open.postedAt).toBeInstanceOf(Date);

      const bad = await service.createPosting({ title: "T", description: "d", status: "sideways" });
      expect(bad.status).toBe("draft");
      expect(bad.postedAt).toBeNull();
    });

    it("suffixes the slug when it clashes", async () => {
      p.jobPosting.findFirst.mockResolvedValueOnce({ id: "existing" }).mockResolvedValueOnce(null);
      const posting = await service.createPosting({ title: "Pool Technician", description: "d" });
      expect(posting.slug).toBe("pool-technician-2");
    });
  });
});
