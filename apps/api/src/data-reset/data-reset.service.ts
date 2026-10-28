import { Injectable, Logger, BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { SmsAdapter } from "../notifications/adapters/sms.adapter";
import { EmailAdapter } from "../notifications/adapters/email.adapter";
import { DATA_AREAS, AREA_ORDER, DataArea, expandAreas, isDataArea } from "./data-reset.areas";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const PURPOSE = "data_reset";

@Injectable()
export class DataResetService {
  private readonly logger = new Logger(DataResetService.name);

  constructor(
    private readonly sms: SmsAdapter,
    private readonly email: EmailAdapter
  ) {}

  async overview(orgId: string) {
    const db = prisma as any;
    return Promise.all(
      AREA_ORDER.map(async (id) => {
        const def = DATA_AREAS[id];
        const counts = await Promise.all(
          def.models
            .filter((m) => m.counted)
            .map(async (m) => ({ label: m.label, count: await db[m.model].count({ where: { orgId } }) }))
        );
        return {
          id,
          label: def.label,
          description: def.description,
          alsoRemoves: def.alsoRemoves || null,
          implies: def.implies || [],
          counts,
          total: counts.reduce((s, c) => s + c.count, 0),
        };
      })
    );
  }

  // Sends one code to the admin's email and phone, bound to exactly these areas
  async requestCode(orgId: string, userId: string, rawAreas: any) {
    const areas = this.parseAreas(rawAreas);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true, name: true } });
    if (!user?.email && !user?.phone) {
      throw new BadRequestException("Your account has no email or phone number to send a confirmation code to.");
    }

    const target = this.target(orgId, userId, areas);
    const recent = await prisma.otpRequest.findFirst({
      where: { target, purpose: PURPOSE, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (recent?.cooldownAt && recent.cooldownAt > new Date()) {
      const wait = Math.ceil((recent.cooldownAt.getTime() - Date.now()) / 1000);
      throw new BadRequestException(`A code was just sent. You can request another in ${wait}s.`);
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await prisma.otpRequest.create({
      data: {
        channel: "email+phone",
        target,
        codeHash: await bcrypt.hash(code, 10),
        purpose: PURPOSE,
        expiresAt,
        cooldownAt: new Date(Date.now() + RESEND_COOLDOWN_MS),
        userId,
      },
    });

    const areaNames = expandAreas(areas).map((a) => DATA_AREAS[a].label);
    const sentTo: string[] = [];
    const failures: string[] = [];

    if (user.email) {
      const subject = "Confirm data deletion in PoolCare";
      const list = areaNames.join(", ");
      const text = `Your PoolCare data deletion code is: ${code}\n\nIt will permanently delete: ${list}.\n\nThe code expires in 10 minutes. If you didn't request this, don't share the code and change your password.`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #b91c1c; margin-bottom: 8px;">Confirm data deletion</h2>
          <p>Use this code to confirm deleting data in PoolCare:</p>
          <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #b91c1c; font-size: 32px; margin: 0; letter-spacing: 6px;">${code}</h1>
          </div>
          <p>This will permanently delete: <strong>${list}</strong>.</p>
          <p>The code expires in <strong>10 minutes</strong>.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">If you didn't request this, don't share the code with anyone.</p>
        </div>`;
      try {
        await this.email.send(user.email, subject, text, html, orgId);
        sentTo.push(this.maskEmail(user.email));
      } catch (e: any) {
        failures.push(`email (${e?.message || "failed"})`);
      }
    }
    if (user.phone) {
      try {
        await this.sms.send(user.phone, `PoolCare data deletion code: ${code}. Expires in 10 minutes. Do not share it.`, orgId);
        sentTo.push(this.maskPhone(user.phone));
      } catch (e: any) {
        failures.push(`SMS (${e?.message || "failed"})`);
      }
    }

    if (process.env.NODE_ENV !== "production") {
      // Same as login codes: local dev has no working email/SMS
      console.log(`🔐 [DEV] DATA RESET CODE for ${userId} → ${code}`);
      if (!sentTo.length) sentTo.push("the API log (dev only)");
    }
    if (!sentTo.length) {
      throw new BadRequestException(`Couldn't send the confirmation code: ${failures.join(", ")}`);
    }
    this.logger.warn(`Data deletion code requested by user ${userId} in org ${orgId} for: ${areaNames.join(", ")}`);
    return { sentTo, expiresAt, failed: failures };
  }

  async confirm(orgId: string, userId: string, rawAreas: any, code: string) {
    const areas = this.parseAreas(rawAreas);
    if (!/^\d{6}$/.test((code || "").trim())) throw new BadRequestException("Enter the 6-digit code.");

    const target = this.target(orgId, userId, areas);
    const otp = await prisma.otpRequest.findFirst({
      where: { target, purpose: PURPOSE, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) throw new BadRequestException("The code has expired or the selection changed. Request a new code.");
    if (otp.attempts >= MAX_ATTEMPTS) throw new ForbiddenException("Too many wrong codes. Request a new code.");

    const ok = await bcrypt.compare(code.trim(), otp.codeHash);
    if (!ok) {
      await prisma.otpRequest.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      const left = MAX_ATTEMPTS - otp.attempts - 1;
      throw new BadRequestException(left > 0 ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong codes. Request a new code.");
    }
    // Single use, even if deletion fails below
    await prisma.otpRequest.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

    const expanded = expandAreas(areas);
    const models = this.modelsFor(expanded);
    const snapshotFile = await this.snapshot(orgId, models);

    const deleted: Record<string, number> = {};
    await prisma.$transaction(
      async (tx) => {
        const t = tx as any;
        // Count first: cascades remove child rows before their own delete runs
        for (const { model, label } of models) {
          const count = await t[model].count({ where: { orgId } });
          if (count) deleted[label] = (deleted[label] || 0) + count;
        }
        for (const { model } of models) {
          await t[model].deleteMany({ where: { orgId } });
        }
        if (expanded.includes("jobs")) {
          await t.fileObject.deleteMany({ where: { orgId, scope: "visit_photo" } });
        }
        if (expanded.includes("clients")) {
          // Clients' app access to this org; the people's logins elsewhere are untouched
          const res = await t.orgMember.deleteMany({ where: { orgId, role: "CLIENT", userId: { not: userId } } });
          if (res.count) deleted["Client app access"] = res.count;
        }
      },
      { timeout: 120_000, maxWait: 10_000 }
    );

    this.logger.warn(
      `Data deleted by user ${userId} in org ${orgId}: ${expanded.join(", ")} — ${JSON.stringify(deleted)}; snapshot ${snapshotFile || "none"}`
    );
    return { areas: expanded, deleted, snapshot: snapshotFile ? path.basename(snapshotFile) : null };
  }

  // ----------------------------------------------------------------- helpers

  private parseAreas(raw: any): DataArea[] {
    const list = Array.isArray(raw) ? raw : [];
    const areas = [...new Set(list.filter(isDataArea))] as DataArea[];
    if (!areas.length) throw new BadRequestException("Choose at least one area to delete.");
    return AREA_ORDER.filter((a) => areas.includes(a));
  }

  // The code only confirms the exact selection it was sent for
  private target(orgId: string, userId: string, areas: DataArea[]) {
    return `data_reset:${orgId}:${userId}:${expandAreas(areas).join(",")}`;
  }

  private modelsFor(areas: DataArea[]) {
    const seen = new Set<string>();
    const out: { model: string; label: string }[] = [];
    for (const a of areas) {
      for (const m of DATA_AREAS[a].models) {
        if (seen.has(m.model)) continue;
        seen.add(m.model);
        out.push(m);
      }
    }
    return out;
  }

  // Gzipped JSON copy of every row about to be deleted, kept on the uploads
  // volume so a mistake can be recovered by hand
  private async snapshot(orgId: string, models: { model: string }[]): Promise<string | null> {
    try {
      const db = prisma as any;
      const data: Record<string, any[]> = {};
      for (const { model } of models) data[model] = await db[model].findMany({ where: { orgId } });
      const base = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
      const dir = path.join(base, "data-deletions", orgId);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json.gz`);
      const json = JSON.stringify({ orgId, createdAt: new Date().toISOString(), data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
      fs.writeFileSync(file, zlib.gzipSync(json));
      return file;
    } catch (e: any) {
      // Never delete without the safety copy
      this.logger.error(`Data deletion snapshot failed for org ${orgId}: ${e?.message}`);
      throw new BadRequestException("Couldn't save a safety copy of the data, so nothing was deleted. Request a new code and try again.");
    }
  }

  private maskEmail(email: string) {
    const [name, domain] = email.split("@");
    return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
  }

  private maskPhone(phone: string) {
    return `${"•".repeat(Math.max(0, phone.length - 3))}${phone.slice(-3)}`;
  }
}
