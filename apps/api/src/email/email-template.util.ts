/**
 * Branded email layout shared by every email the system sends.
 *
 * Look (approved 2026-11-23): logo centred in a white band at the top of a
 * rounded white card, then an inset brand-colour "hero" card (eyebrow, title,
 * subtitle, decor circles and the mascot), then the body built from `emailUi`
 * blocks, then a centred footer with app links and why the reader got it.
 *
 * Emails are table-based with inline styles so they render in Gmail, Apple
 * Mail and Outlook. Images are hosted by the API (`/api/email-assets/*`); data
 * URIs are stripped by Gmail.
 */

import { prisma } from "@poolcare/db";

export interface EmailTemplateOptions {
  logoUrl?: string | null;
  organizationName?: string;
  primaryColor?: string;
  footerText?: string;
  appStoreUrl?: string | null;
  googlePlayUrl?: string | null;
  appDownloadUrl?: string | null;
}

/** What the email is about. With a title the email gets the brand hero card. */
export interface EmailLayout {
  /** Small uppercase line above the title, e.g. "Visit complete". */
  eyebrow?: string;
  /** Headline in the hero, e.g. "Your pool is serviced". */
  title?: string;
  /** Key facts under the title, e.g. "Mensah Residence · Sun 23 Nov". */
  subtitle?: string;
  /** Inbox preview line. Defaults to the subtitle or title. */
  preheader?: string;
  /** Footer line saying why the reader got this email. */
  reason?: string;
  /** Show the mascot in the hero (default true). */
  art?: boolean;
}

const DEFAULT_COLOR = "#387c52";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const escapeHtml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const esc = escapeHtml;

/** Public base of the API (no trailing slash, no /api). */
export function apiPublicBase(): string {
  const raw =
    process.env.API_PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.API_URL ||
    // Same chain FilesService uses for public file URLs, so emails and logos agree.
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:4000";
  return raw.replace(/\/+$/, "").replace(/\/api$/, "");
}

/** URL of an image in apps/api/assets/email, served by EmailAssetsController. */
export function emailAssetUrl(name: "logo.png" | "mascot.png" | "hero-decor.png"): string {
  return `${apiPublicBase()}/api/email-assets/${name}`;
}

/**
 * Link that opens a screen in the client app (e.g. "visits/<id>"). It goes via
 * a small API page that hands off to the app and offers the store links,
 * because many mail apps drop custom-scheme links.
 */
export function clientAppLink(path: string): string {
  return `${apiPublicBase()}/api/email-assets/open?to=${encodeURIComponent(path.replace(/^\/+/, ""))}`;
}

function isPublicUrl(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//.test(url) && !/\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url);
}

/** Make a stored logo URL absolute. */
function absoluteLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (/^https?:\/\//.test(logoUrl)) return logoUrl;
  return `${apiPublicBase()}${logoUrl.startsWith("/") ? "" : "/"}${logoUrl}`;
}

/** Org branding for emails: name, logo, brand colour and app links. */
export async function getOrgEmailSettings(orgId: string): Promise<EmailTemplateOptions> {
  try {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return { organizationName: "PoolCare", primaryColor: DEFAULT_COLOR };
    const orgSetting = await prisma.orgSetting.findUnique({ where: { orgId } });
    const profile = (orgSetting?.profile as any) || {};
    return {
      logoUrl: absoluteLogoUrl(profile.logoUrl || null),
      organizationName: profile.name || org.name || "PoolCare",
      // Same rule as the admin console and invoice PDFs: custom hex wins, then the named theme.
      primaryColor: resolveOrgPrimaryColor(profile),
      appStoreUrl: profile.appStoreUrl || null,
      googlePlayUrl: profile.googlePlayUrl || null,
      appDownloadUrl: profile.appDownloadUrl || null,
    };
  } catch (error) {
    console.error("Failed to get org email settings:", error);
    return { organizationName: "PoolCare", primaryColor: DEFAULT_COLOR };
  }
}

function getThemeColorHex(themeColor: string): string {
  const colorMap: { [key: string]: string } = {
    purple: "#9333ea",
    blue: "#2563eb",
    green: "#16a34a",
    orange: "#ea580c",
    red: "#dc2626",
    indigo: "#4f46e5",
    pink: "#db2777",
    teal: "#0d9488",
  };
  return colorMap[themeColor] || "#0d9488";
}

/**
 * Resolve an org's primary brand colour from its `OrgSetting.profile`, matching
 * what the admin console renders: an explicit `customColorHex` wins, then the
 * named theme, then teal. Use this anywhere org branding is drawn (emails,
 * invoice PDFs) so one setting drives them all.
 */
export function resolveOrgPrimaryColor(
  profile: { themeColor?: string; customColorHex?: string } | null | undefined
): string {
  const customHex = profile?.customColorHex && String(profile.customColorHex).trim();
  if (customHex) {
    return customHex.startsWith("#") ? customHex : `#${customHex}`;
  }
  return getThemeColorHex(profile?.themeColor || "");
}

/* ───────────────────────── Body blocks ───────────────────────── */

const P = "margin:0 0 16px 0;font-size:15px;line-height:24px;color:#374151;";

/**
 * Building blocks for email bodies. Values passed to these are escaped unless
 * the parameter name ends in `Html`.
 */
export const emailUi = {
  /** Paragraph. Takes HTML (use `<strong>` for emphasis); escape user data first. */
  p: (html: string, style = "") => `<p style="${P}${style}">${html}</p>`,
  /** Small grey paragraph. */
  small: (html: string) => `<p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#6b7280;">${html}</p>`,
  /** Section heading. */
  h: (text: string) =>
    `<p style="margin:28px 0 12px 0;font-size:17px;line-height:24px;font-weight:800;color:#111827;">${esc(text)}</p>`,
  /** Label/value rows with hairlines. Values may contain HTML when `valuesHtml` is true. */
  facts: (rows: Array<[string, string | number | null | undefined]>, valuesHtml = false) => {
    const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (!shown.length) return "";
    return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 8px 0;">${shown
      .map(
        ([k, v], i) =>
          `<tr><td style="padding:12px 12px 12px 0;${i ? "border-top:1px solid #f3f4f6;" : ""}font-size:14px;color:#6b7280;vertical-align:top;">${esc(k)}</td><td align="right" style="padding:12px 0;${i ? "border-top:1px solid #f3f4f6;" : ""}font-size:14px;font-weight:600;color:#111827;text-align:right;">${valuesHtml ? v : esc(v)}</td></tr>`
      )
      .join("")}</table>`;
  },
  /** Two-up tiles, e.g. water readings. `ok` true = "In range", false = "Adjusted", null = no tag. */
  tiles: (items: Array<{ label: string; value: string; ok?: boolean | null; tag?: string }>) => {
    if (!items.length) return "";
    const cell = (t: (typeof items)[number] | undefined, left: boolean) => {
      if (!t) return `<td width="50%"></td>`;
      const ok = t.ok;
      const tag =
        ok === undefined || ok === null
          ? ""
          : `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;${ok ? "background:#dcfce7;color:#15803d;" : "background:#fef3c7;color:#b45309;"}">${esc(t.tag || (ok ? "In range" : "Adjusted"))}</span>`;
      return `<td width="50%" style="padding:${left ? "0 5px 10px 0" : "0 0 10px 5px"};vertical-align:top;"><table role="presentation" width="100%" style="border-collapse:separate;background:#f9fafb;border-radius:14px;"><tr><td style="padding:14px 16px;">
        <p style="margin:0;font-size:11px;letter-spacing:0.6px;text-transform:uppercase;font-weight:700;color:#6b7280;">${esc(t.label)}</p>
        <p style="margin:4px 0 ${tag ? "8px" : "0"} 0;font-size:22px;line-height:28px;font-weight:800;color:#111827;">${esc(t.value)}</p>${tag}
      </td></tr></table></td>`;
    };
    let rows = "";
    for (let i = 0; i < items.length; i += 2) rows += `<tr>${cell(items[i], true)}${cell(items[i + 1], false)}</tr>`;
    return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0;">${rows}</table>`;
  },
  /** Ticked list (work done, what's included). */
  checks: (items: string[]) =>
    items.length
      ? `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 8px 0;">${items
          .map(
            (t) =>
              `<tr><td width="30" style="vertical-align:top;padding:6px 0;"><span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:10px;background:#dcfce7;color:#15803d;font-size:12px;font-weight:800;text-align:center;">&#10003;</span></td><td style="padding:6px 0;font-size:15px;line-height:22px;color:#374151;">${esc(t)}</td></tr>`
          )
          .join("")}</table>`
      : "",
  /** Plain bullet list. */
  bullets: (items: string[]) =>
    items.length
      ? `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 8px 0;">${items
          .map(
            (t) =>
              `<tr><td width="22" style="vertical-align:top;padding:5px 0;"><span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:#9ca3af;margin-top:9px;"></span></td><td style="padding:5px 0;font-size:15px;line-height:22px;color:#374151;">${esc(t)}</td></tr>`
          )
          .join("")}</table>`
      : "",
  /** Soft grey box for a summary, note or quote. Takes HTML. */
  note: (html: string) =>
    `<table role="presentation" width="100%" style="border-collapse:separate;background:#f9fafb;border-radius:14px;margin:0 0 16px 0;"><tr><td style="padding:16px 18px;font-size:15px;line-height:24px;color:#374151;">${html}</td></tr></table>`,
  /** Amber callout for something that needs attention. Takes HTML. */
  warn: (html: string) =>
    `<table role="presentation" width="100%" style="border-collapse:separate;background:#fffbeb;border-radius:14px;margin:0 0 16px 0;"><tr><td style="padding:16px 18px;font-size:15px;line-height:24px;color:#92400e;">${html}</td></tr></table>`,
  /** Big code, e.g. a sign-in code. */
  code: (code: string) =>
    `<table role="presentation" width="100%" style="border-collapse:separate;background:#f9fafb;border-radius:16px;margin:0 0 20px 0;"><tr><td align="center" style="padding:22px 16px;font-size:36px;line-height:40px;font-weight:800;letter-spacing:8px;color:#111827;font-family:${FONT};">${esc(code)}</td></tr></table>`,
  /** Line items with a total, like a receipt. */
  money: (rows: Array<{ label: string; detail?: string; amount: string }>, totalLabel?: string, total?: string) =>
    `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 8px 0;">${rows
      .map(
        (r) =>
          `<tr><td style="padding:12px 12px 12px 0;border-bottom:1px solid #f3f4f6;"><p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${esc(r.label)}</p>${r.detail ? `<p style="margin:2px 0 0 0;font-size:13px;color:#6b7280;">${esc(r.detail)}</p>` : ""}</td><td align="right" style="padding:12px 0;border-bottom:1px solid #f3f4f6;font-size:15px;font-weight:600;color:#111827;white-space:nowrap;vertical-align:top;">${esc(r.amount)}</td></tr>`
      )
      .join("")}${
      total
        ? `<tr><td style="padding:16px 12px 0 0;font-size:15px;font-weight:800;color:#111827;">${esc(totalLabel || "Total")}</td><td align="right" style="padding:16px 0 0 0;font-size:20px;font-weight:800;color:#111827;white-space:nowrap;">${esc(total)}</td></tr>`
        : ""
    }</table>`,
  /** Centred brand button with an optional grey note under it. */
  button: (label: string, href: string, color: string = DEFAULT_COLOR, noteHtml?: string) =>
    `<table role="presentation" align="center" style="border-collapse:separate;margin:28px auto 0 auto;"><tr><td align="center" bgcolor="${color}" style="background:${color};border-radius:12px;"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;font-family:${FONT};">${esc(label)}</a></td></tr></table>${
      noteHtml
        ? `<p style="margin:12px auto 0 auto;max-width:400px;text-align:center;font-size:13px;line-height:20px;color:#9ca3af;">${noteHtml}</p>`
        : ""
    }`,
  /** Centred grey note without a button. */
  centerNote: (html: string) =>
    `<p style="margin:24px auto 0 auto;max-width:420px;text-align:center;font-size:13px;line-height:20px;color:#9ca3af;">${html}</p>`,
  /** Sign-off line. */
  signoff: (orgName: string) =>
    `<p style="margin:24px 0 0 0;font-size:15px;line-height:24px;color:#374151;">The ${esc(orgName)} team</p>`,
};

/**
 * Give bare HTML (e.g. written by the AI: <h2>, <p>, <ul>, <li>, <strong>, <a>)
 * the email body styles. Tags that already carry a style are left alone.
 */
export function styleBareHtml(html: string, primaryColor: string = DEFAULT_COLOR): string {
  const styles: Record<string, string> = {
    h1: "margin:28px 0 12px 0;font-size:20px;line-height:26px;font-weight:800;color:#111827;",
    h2: "margin:28px 0 12px 0;font-size:17px;line-height:24px;font-weight:800;color:#111827;",
    h3: "margin:20px 0 8px 0;font-size:15px;line-height:22px;font-weight:800;color:#111827;",
    p: P,
    ul: "margin:0 0 16px 0;padding-left:20px;font-size:15px;line-height:24px;color:#374151;",
    ol: "margin:0 0 16px 0;padding-left:20px;font-size:15px;line-height:24px;color:#374151;",
    li: "margin:0 0 6px 0;",
    strong: "color:#111827;",
    a: `color:${primaryColor};font-weight:600;`,
  };
  return html.replace(/<(h1|h2|h3|p|ul|ol|li|strong|a)(\s[^>]*)?>/gi, (m, tag: string, attrs = "") => {
    if (/\sstyle\s*=/.test(attrs)) return m;
    return `<${tag}${attrs} style="${styles[tag.toLowerCase()]}">`;
  });
}

/* ───────────────────────── Layout ───────────────────────── */

/** Older callers put an <h2> first; lift it into the hero so they still look right. */
function liftLegacyHeading(content: string): { title?: string; rest: string } {
  const m = content.match(/^\s*<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (!m) return { rest: content };
  return { title: m[1].replace(/<[^>]+>/g, "").trim(), rest: content.slice(m[0].length) };
}

export function createEmailTemplate(content: string, options: EmailTemplateOptions & EmailLayout = {}): string {
  const organizationName = options.organizationName || "PoolCare";
  const color = options.primaryColor || DEFAULT_COLOR;

  let title = options.title;
  let body = content;
  if (!title) {
    const lifted = liftLegacyHeading(content);
    title = lifted.title;
    body = lifted.rest;
  }
  // Text-only titles in the hero; escape them.
  const titleText = title ? esc(title.replace(/&amp;/g, "&")) : "";
  const preheader = options.preheader || options.subtitle || title || "";

  const logoSrc = isPublicUrl(options.logoUrl) ? options.logoUrl : emailAssetUrl("logo.png");
  const decor = emailAssetUrl("hero-decor.png");
  const mascot = emailAssetUrl("mascot.png");
  const showArt = options.art !== false;

  const hero = titleText
    ? `<tr><td style="padding:0 20px;">
          <table role="presentation" width="100%" bgcolor="${color}" background="${decor}" style="border-collapse:separate;background-color:${color};background-image:url('${decor}');background-position:right top;background-size:cover;background-repeat:no-repeat;border-radius:18px;">
            <tr>
              <td style="padding:26px ${showArt ? "12px" : "26px"} 26px 26px;vertical-align:middle;">
                ${options.eyebrow ? `<p style="margin:0 0 8px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:rgba(255,255,255,0.78);">${esc(options.eyebrow)}</p>` : ""}
                <p style="margin:0;font-size:24px;line-height:30px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">${titleText}</p>
                ${options.subtitle ? `<p style="margin:8px 0 0 0;font-size:14px;line-height:21px;color:rgba(255,255,255,0.9);">${esc(options.subtitle)}</p>` : ""}
              </td>
              ${
                showArt
                  ? `<td width="112" align="right" style="padding:20px 22px 20px 0;vertical-align:middle;"><img src="${mascot}" alt="" width="88" height="88" style="display:block;width:88px;height:88px;border-radius:44px;border:3px solid #ffffff;" /></td>`
                  : ""
              }
            </tr>
          </table>
        </td></tr>`
    : "";

  const apple = options.appStoreUrl || options.appDownloadUrl;
  const google = options.googlePlayUrl || options.appDownloadUrl;
  const appLinks =
    apple || google
      ? `<p style="margin:0 0 12px 0;">Get the app: ${[
          apple ? `<a href="${esc(apple)}" style="color:${color};font-weight:600;text-decoration:none;">App Store</a>` : "",
          google ? `<a href="${esc(google)}" style="color:${color};font-weight:600;text-decoration:none;">Google Play</a>` : "",
        ]
          .filter(Boolean)
          .join(" · ")}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${titleText || esc(organizationName)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}</div>
<table role="presentation" width="100%" bgcolor="#f3f4f6" style="border-collapse:collapse;background:#f3f4f6;"><tr><td align="center" style="padding:32px 12px 40px 12px;">
  <table role="presentation" width="100%" style="border-collapse:collapse;max-width:560px;">
    <tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 3px 10px rgba(17,24,39,0.07);">
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        <tr><td align="center" style="padding:28px 32px ${hero ? "22px" : "8px"} 32px;">
          <img src="${esc(logoSrc)}" alt="${esc(organizationName)}" height="64" style="display:block;margin:0 auto;height:64px;width:auto;max-width:220px;border:0;" />
        </td></tr>
        ${hero}
        <tr><td style="padding:28px 32px 32px 32px;font-size:15px;line-height:24px;color:#374151;">${body}</td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:24px 8px 0 8px;text-align:center;font-size:13px;line-height:20px;color:#6b7280;">
      <p style="margin:0 0 6px 0;font-weight:700;color:#374151;">${esc(organizationName)}</p>
      ${appLinks}
      ${options.reason ? `<p style="margin:0;color:#9ca3af;">${esc(options.reason)}</p>` : ""}
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>`;
}

/** Welcome email for a new client account. */
export function createWelcomeEmailTemplate(
  clientName: string,
  organizationName: string,
  options: EmailTemplateOptions = {}
): string {
  const ui = emailUi;
  const color = options.primaryColor || DEFAULT_COLOR;
  const content =
    ui.p(`Hi ${esc((clientName || "there").trim().split(/\s+/)[0])}, your ${esc(organizationName)} account is ready.`) +
    ui.p("Sign in to the app with this email address or your phone number. In the app you can:") +
    ui.checks([
      "See your pool's water readings and visit reports",
      "Know when your next visit is and who's coming",
      "View and pay invoices by card or mobile money",
      "Order supplies and message us",
    ]) +
    (options.appDownloadUrl || options.appStoreUrl || options.googlePlayUrl
      ? ui.button("Get the app", (options.appDownloadUrl || options.appStoreUrl || options.googlePlayUrl)!, color, "Questions? Just reply to this email.")
      : ui.centerNote("Questions? Just reply to this email."));

  return createEmailTemplate(content, {
    ...options,
    organizationName,
    eyebrow: "Welcome",
    title: `Welcome to ${organizationName}`,
    subtitle: "Your pool, looked after",
    preheader: "Your account is ready. Here's what you can do in the app.",
    reason: `You're getting this because ${organizationName} set up an account for you.`,
  });
}

/**
 * Turn a plain-text message into email-safe HTML content: paragraphs on blank
 * lines, line breaks kept, "- " lines as a bullet list, and URLs made clickable.
 * Used when an email is sent without its own HTML so it still goes out branded.
 */
export function plainTextToEmailHtml(text: string, primaryColor = DEFAULT_COLOR): string {
  const linkify = (line: string) =>
    escapeHtml(line).replace(
      /(https?:\/\/[^\s<]+)/g,
      (url) => `<a href="${url}" style="color: ${primaryColor}; text-decoration: underline;">${url}</a>`
    );
  const blocks = text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim() !== "");
      if (lines.length > 0 && lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
        const items = lines.map((l) => `<li style="margin: 0 0 4px 0;">${linkify(l.replace(/^\s*[-•*]\s+/, ""))}</li>`).join("");
        return `<ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 15px; line-height: 24px; color: #374151;">${items}</ul>`;
      }
      // A heading line followed by bullets, e.g. "Items:\n- a\n- b"
      const firstBullet = lines.findIndex((l) => /^\s*[-•*]\s+/.test(l));
      if (firstBullet > 0 && lines.slice(firstBullet).every((l) => /^\s*[-•*]\s+/.test(l))) {
        const head = lines.slice(0, firstBullet).map(linkify).join("<br>");
        const items = lines.slice(firstBullet).map((l) => `<li style="margin: 0 0 4px 0;">${linkify(l.replace(/^\s*[-•*]\s+/, ""))}</li>`).join("");
        return `<p style="${P}margin-bottom:8px;">${head}</p><ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 15px; line-height: 24px; color: #374151;">${items}</ul>`;
      }
      return `<p style="${P}">${lines.map(linkify).join("<br>")}</p>`;
    })
    .join("\n");
}

/** Wrap a plain-text message in the org's branded email template (letter layout, no hero). */
export async function brandedHtmlFromText(text: string, orgId?: string): Promise<string> {
  const options: EmailTemplateOptions = orgId
    ? await getOrgEmailSettings(orgId)
    : { organizationName: "PoolCare", primaryColor: DEFAULT_COLOR };
  const firstLine = text.trim().split("\n")[0]?.slice(0, 140) || "";
  return createEmailTemplate(plainTextToEmailHtml(text, options.primaryColor), { ...options, preheader: firstLine });
}
