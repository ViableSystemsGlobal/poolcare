import { Controller, Get, NotFoundException, Param, Query, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@poolcare/db";
import { escapeHtml } from "./email-template.util";

/** Images used by the email layout. Files live in apps/api/assets/email. */
const ASSETS = new Set(["logo.png", "mascot.png", "hero-decor.png"]);
const cache = new Map<string, Buffer>();

/** Client-app screens an email may link to: "<screen>/<uuid>" or a bare screen. */
const OPEN_PATH = /^(?:(visits|invoices|quotes|pay|agreements|pools|reports)\/[0-9a-f-]{36}(?:\?period=\d{4}-\d{2})?|visits|billing|pools|notifications|my-subscriptions)$/i;
const CLIENT_SCHEME = "poolcare-client://";

/**
 * Public, unauthenticated: images for emails, and the hand-off page that opens
 * the client app from an email link (mail apps often drop custom-scheme links).
 */
@SkipThrottle()
@Controller("email-assets")
export class EmailAssetsController {
  @Get("open")
  async open(@Query("to") to: string, @Res() res: Response) {
    const path = String(to || "").replace(/^\/+/, "");
    if (!OPEN_PATH.test(path)) throw new NotFoundException();

    // Store links come from the org profile (single-tenant in practice; first one with links wins).
    let apple = "";
    let google = "";
    try {
      const settings = await prisma.orgSetting.findMany({ select: { profile: true }, take: 20 });
      for (const s of settings) {
        const p = (s.profile as any) || {};
        apple = apple || p.appStoreUrl || p.appDownloadUrl || "";
        google = google || p.googlePlayUrl || p.appDownloadUrl || "";
      }
    } catch {
      /* page still works without store links */
    }

    const deep = CLIENT_SCHEME + path;
    const link = (href: string, label: string, primary = false) =>
      `<a href="${escapeHtml(href)}" style="display:block;margin:0 0 10px 0;padding:14px 20px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;${
        primary ? "background:#387c52;color:#fff;" : "background:#f3f4f6;color:#111827;"
      }">${label}</a>`;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open PoolCare</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:420px;margin:48px auto;padding:0 16px;text-align:center;">
  <div style="background:#fff;border-radius:20px;padding:28px 24px;box-shadow:0 3px 10px rgba(17,24,39,.07);">
    <img src="/api/email-assets/logo.png" alt="PoolCare" style="height:56px;margin:0 auto 18px;display:block;">
    <p style="margin:0 0 6px;font-size:20px;font-weight:800;color:#111827;">Opening the PoolCare app…</p>
    <p style="margin:0 0 22px;font-size:14px;line-height:21px;color:#6b7280;">If nothing happens, tap the button below. Don't have the app yet? Get it from your app store.</p>
    ${link(deep, "Open in the app", true)}
    ${apple ? link(apple, "App Store") : ""}
    ${google ? link(google, "Google Play") : ""}
  </div>
</div>
<script>setTimeout(function(){location.href=${JSON.stringify(deep)};},150);</script>
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    // helmet's default CSP blocks the inline styles/script this tiny page needs.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );
    res.send(html);
  }

  @Get(":file")
  asset(@Param("file") file: string, @Res() res: Response) {
    if (!ASSETS.has(file)) throw new NotFoundException();
    let buf = cache.get(file);
    if (!buf) {
      try {
        buf = readFileSync(join(process.cwd(), "assets", "email", file));
      } catch {
        throw new NotFoundException();
      }
      cache.set(file, buf);
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.send(buf);
  }
}
