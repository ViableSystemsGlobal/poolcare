import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleDestroy } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { ImapFlow, FetchMessageObject, MessageStructureObject } from "imapflow";
import { simpleParser, AddressObject, ParsedMail } from "mailparser";
import * as nodemailer from "nodemailer";
import MailComposer = require("nodemailer/lib/mail-composer");
import { encryptSecret, decryptSecret } from "../utils/secret-crypto.util";
import { MailAccountDto, UpdateMailAccountDto, SendMailDto } from "./dto/mail.dto";

// Hostinger mailbox defaults; other providers can override hosts/ports.
const DEFAULTS = {
  imapHost: "imap.hostinger.com",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.hostinger.com",
  smtpPort: 465,
  smtpSecure: true,
};

const IDLE_CLOSE_MS = 5 * 60 * 1000;
const MAX_INLINE_IMAGE_BYTES = 3 * 1024 * 1024;

type Account = NonNullable<Awaited<ReturnType<typeof prisma.mailAccount.findFirst>>>;
type Conn = { client: ImapFlow; lastUsed: number; version: number };

export interface Address {
  name: string;
  address: string;
}

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly conns = new Map<string, Conn>();
  private readonly connecting = new Map<string, Promise<ImapFlow>>();
  private readonly sweeper = setInterval(() => this.closeIdle(), 60_000);

  onModuleDestroy() {
    clearInterval(this.sweeper);
    for (const { client } of this.conns.values()) client.logout().catch(() => client.close());
    this.conns.clear();
  }

  // ---------------------------------------------------------------- accounts

  async listAccounts(orgId: string) {
    const accounts = await prisma.mailAccount.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
    return accounts.map((a) => this.publicAccount(a));
  }

  async testConnection(dto: MailAccountDto) {
    const settings = this.settingsFrom(dto);
    await this.verify(settings);
    return { ok: true };
  }

  async createAccount(orgId: string, userId: string, dto: MailAccountDto) {
    const settings = this.settingsFrom(dto);
    const email = dto.email.trim().toLowerCase();
    const existing = await prisma.mailAccount.findFirst({ where: { orgId, email } });
    if (existing) throw new BadRequestException(`${email} is already connected`);

    await this.verify(settings);

    const account = await prisma.mailAccount.create({
      data: {
        orgId,
        email,
        displayName: dto.displayName?.trim() || null,
        username: settings.username,
        passwordEnc: encryptSecret(settings.password),
        imapHost: settings.imapHost,
        imapPort: settings.imapPort,
        imapSecure: settings.imapSecure,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpSecure: settings.smtpSecure,
        signature: dto.signature || null,
        createdById: userId,
      },
    });
    return this.publicAccount(account);
  }

  async updateAccount(orgId: string, id: string, dto: UpdateMailAccountDto) {
    const account = await this.getAccount(orgId, id);
    const data: any = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName.trim() || null;
    if (dto.signature !== undefined) data.signature = dto.signature || null;
    if (dto.password) {
      await this.verify({ ...this.settingsOf(account), password: dto.password });
      data.passwordEnc = encryptSecret(dto.password);
    }
    const updated = await prisma.mailAccount.update({ where: { id: account.id }, data });
    if (dto.password) this.drop(account.id);
    return this.publicAccount(updated);
  }

  async deleteAccount(orgId: string, id: string) {
    const account = await this.getAccount(orgId, id);
    this.drop(account.id);
    await prisma.mailAccount.delete({ where: { id: account.id } });
    return { ok: true };
  }

  // ----------------------------------------------------------------- folders

  async listFolders(orgId: string, accountId: string) {
    const account = await this.getAccount(orgId, accountId);
    const client = await this.imap(account);
    const folders = await client.list({ statusQuery: { messages: true, unseen: true } });
    const order = ["\\Inbox", "\\Drafts", "\\Sent", "\\Junk", "\\Trash", "\\Archive"];
    return folders
      .filter((f) => !f.flags?.has("\\Noselect"))
      .map((f) => ({
        path: f.path,
        name: f.path.toUpperCase() === "INBOX" ? "Inbox" : f.name,
        specialUse: f.path.toUpperCase() === "INBOX" ? "\\Inbox" : f.specialUse || null,
        total: f.status?.messages ?? 0,
        unseen: f.status?.unseen ?? 0,
      }))
      .sort((a, b) => {
        const ai = a.specialUse ? order.indexOf(a.specialUse) : -1;
        const bi = b.specialUse ? order.indexOf(b.specialUse) : -1;
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return a.path.localeCompare(b.path);
      });
  }

  // ---------------------------------------------------------------- messages

  async listMessages(
    orgId: string,
    accountId: string,
    opts: { folder: string; page: number; limit: number; query?: string; unread?: boolean }
  ) {
    const account = await this.getAccount(orgId, accountId);
    const client = await this.imap(account);
    const limit = Math.min(Math.max(opts.limit || 50, 1), 100);
    const page = Math.max(opts.page || 1, 1);

    const lock = await client.getMailboxLock(opts.folder || "INBOX", { readOnly: true });
    try {
      const mailbox = client.mailbox;
      const exists = mailbox && typeof mailbox !== "boolean" ? mailbox.exists : 0;
      const query = { uid: true, envelope: true, flags: true, internalDate: true, size: true, bodyStructure: true } as const;
      let fetched: FetchMessageObject[] = [];
      let total = exists;

      const q = opts.query?.trim();
      if (q || opts.unread) {
        const criteria: any = {};
        if (q) criteria.or = [{ subject: q }, { from: q }, { to: q }, { body: q }];
        if (opts.unread) criteria.seen = false;
        const uids = ((await client.search(criteria, { uid: true })) || []).sort((a, b) => b - a);
        total = uids.length;
        const slice = uids.slice((page - 1) * limit, page * limit);
        if (slice.length) fetched = await client.fetchAll(slice, query, { uid: true });
      } else if (exists > 0) {
        const end = exists - (page - 1) * limit;
        if (end >= 1) {
          const start = Math.max(1, end - limit + 1);
          fetched = await client.fetchAll(`${start}:${end}`, query);
        }
      }

      fetched.sort((a, b) => (b.internalDate ? +new Date(b.internalDate) : 0) - (a.internalDate ? +new Date(a.internalDate) : 0) || b.uid - a.uid);
      const items = fetched.map((m) => ({
        uid: m.uid,
        subject: m.envelope?.subject || "",
        from: this.addrs(m.envelope?.from)[0] || null,
        to: this.addrs(m.envelope?.to),
        date: (m.envelope?.date || m.internalDate || null) as Date | null,
        seen: m.flags?.has("\\Seen") ?? false,
        flagged: m.flags?.has("\\Flagged") ?? false,
        answered: m.flags?.has("\\Answered") ?? false,
        hasAttachments: this.hasAttachments(m.bodyStructure),
        size: m.size,
      }));

      const clients = await this.matchClients(orgId, items.flatMap((i) => (i.from ? [i.from.address] : [])));
      return {
        items: items.map((i) => ({ ...i, client: i.from ? clients.get(i.from.address.toLowerCase()) || null : null })),
        total,
        page,
        limit,
      };
    } finally {
      lock.release();
    }
  }

  async getMessage(orgId: string, accountId: string, folder: string, uid: number) {
    const account = await this.getAccount(orgId, accountId);
    const client = await this.imap(account);
    const { parsed, flags } = await this.fetchParsed(client, folder, uid);

    // Opening a message marks it read, like any mail client
    if (!flags.has("\\Seen")) {
      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageFlagsAdd([uid], ["\\Seen"], { uid: true });
      } finally {
        lock.release();
      }
    }

    const from = this.parsedAddrs(parsed.from)[0] || null;
    const clients = await this.matchClients(orgId, from ? [from.address] : []);

    return {
      uid,
      folder,
      messageId: parsed.messageId || null,
      subject: parsed.subject || "",
      from,
      to: this.parsedAddrs(parsed.to),
      cc: this.parsedAddrs(parsed.cc),
      replyTo: this.parsedAddrs(parsed.replyTo),
      date: parsed.date || null,
      flagged: flags.has("\\Flagged"),
      html: parsed.html ? this.inlineCidImages(parsed) : null,
      text: parsed.text || null,
      attachments: parsed.attachments
        .map((a, index) => ({ index, filename: a.filename || `attachment-${index + 1}`, contentType: a.contentType, size: a.size, inline: a.contentDisposition === "inline" && !!a.cid }))
        .filter((a) => !a.inline),
      client: from ? clients.get(from.address.toLowerCase()) || null : null,
    };
  }

  async getAttachment(orgId: string, accountId: string, folder: string, uid: number, index: number) {
    const account = await this.getAccount(orgId, accountId);
    const client = await this.imap(account);
    const { parsed } = await this.fetchParsed(client, folder, uid);
    const att = parsed.attachments[index];
    if (!att) throw new NotFoundException("Attachment not found");
    return { filename: att.filename || `attachment-${index + 1}`, contentType: att.contentType || "application/octet-stream", content: att.content };
  }

  async setFlags(orgId: string, accountId: string, uid: number, folder: string, flags: { seen?: boolean; flagged?: boolean }) {
    const account = await this.getAccount(orgId, accountId);
    const client = await this.imap(account);
    const lock = await client.getMailboxLock(folder);
    try {
      const add: string[] = [];
      const remove: string[] = [];
      if (flags.seen !== undefined) (flags.seen ? add : remove).push("\\Seen");
      if (flags.flagged !== undefined) (flags.flagged ? add : remove).push("\\Flagged");
      if (add.length) await client.messageFlagsAdd([uid], add, { uid: true });
      if (remove.length) await client.messageFlagsRemove([uid], remove, { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  }

  async moveMessage(orgId: string, accountId: string, uid: number, folder: string, to: string) {
    const account = await this.getAccount(orgId, accountId);
    const client = await this.imap(account);
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageMove([uid], to, { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  }

  // Moves to Trash; deletes permanently when already in Trash (or no Trash exists)
  async deleteMessage(orgId: string, accountId: string, uid: number, folder: string) {
    const account = await this.getAccount(orgId, accountId);
    const client = await this.imap(account);
    const trash = await this.specialFolder(client, "\\Trash");
    const lock = await client.getMailboxLock(folder);
    try {
      if (trash && trash !== folder) {
        await client.messageMove([uid], trash, { uid: true });
        return { ok: true, movedTo: trash };
      }
      await client.messageDelete([uid], { uid: true });
      return { ok: true, deleted: true };
    } finally {
      lock.release();
    }
  }

  // -------------------------------------------------------------------- send

  async send(orgId: string, accountId: string, dto: SendMailDto, files: Express.Multer.File[] = []) {
    const account = await this.getAccount(orgId, accountId);
    const to = this.splitAddrs(dto.to);
    const cc = this.splitAddrs(dto.cc);
    const bcc = this.splitAddrs(dto.bcc);
    if (!to.length && !cc.length && !bcc.length) throw new BadRequestException("Add at least one recipient");

    const mail: any = {
      from: account.displayName ? { name: account.displayName, address: account.email } : account.email,
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      subject: dto.subject || "",
      html: dto.html || undefined,
      text: dto.text || undefined,
      attachments: files.map((f) => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype })),
    };

    let client: ImapFlow | null = null;
    if (dto.mode && dto.refFolder && dto.refUid) {
      client = await this.imap(account);
      const { parsed } = await this.fetchParsed(client, dto.refFolder, dto.refUid);
      if (dto.mode === "reply" && parsed.messageId) {
        const refs = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
        mail.inReplyTo = parsed.messageId;
        mail.references = [...refs, parsed.messageId];
      }
      if (dto.mode === "forward") {
        for (const a of parsed.attachments) {
          if (a.contentDisposition === "inline" && a.cid) continue;
          mail.attachments.push({ filename: a.filename, content: a.content, contentType: a.contentType });
        }
      }
    }

    const transport = nodemailer.createTransport(this.smtpOptions(this.settingsOf(account)));
    let info: any;
    try {
      info = await transport.sendMail(mail);
    } catch (e: any) {
      throw new BadRequestException(`Could not send: ${e?.response || e?.message || "SMTP error"}`);
    } finally {
      transport.close();
    }

    // Hostinger doesn't keep a copy of SMTP-sent mail, so save one to Sent.
    // Best effort: the message has already gone out.
    let savedToSent = false;
    try {
      client = client || (await this.imap(account));
      const sent = await this.specialFolder(client, "\\Sent");
      if (sent) {
        const raw = await new MailComposer({ ...mail, messageId: info?.messageId, keepBcc: true } as any).compile().build();
        await client.append(sent, raw, ["\\Seen"]);
        savedToSent = true;
      }
      if (dto.mode === "reply" && dto.refFolder && dto.refUid) {
        const lock = await client.getMailboxLock(dto.refFolder);
        try {
          await client.messageFlagsAdd([dto.refUid], ["\\Answered"], { uid: true });
        } finally {
          lock.release();
        }
      }
    } catch (e: any) {
      this.logger.warn(`Sent mail for ${account.email} but could not save a copy: ${e?.message}`);
    }

    return { ok: true, messageId: info?.messageId || null, savedToSent };
  }

  // ----------------------------------------------------------------- helpers

  private async getAccount(orgId: string, id: string): Promise<Account> {
    const account = await prisma.mailAccount.findFirst({ where: { id, orgId } });
    if (!account) throw new NotFoundException("Mailbox not found");
    return account;
  }

  private publicAccount(a: Account) {
    const { passwordEnc, ...rest } = a;
    return rest;
  }

  private settingsFrom(dto: MailAccountDto) {
    const email = dto.email.trim().toLowerCase();
    return {
      username: dto.username?.trim() || email,
      password: dto.password,
      imapHost: dto.imapHost?.trim() || DEFAULTS.imapHost,
      imapPort: dto.imapPort || DEFAULTS.imapPort,
      imapSecure: dto.imapSecure ?? DEFAULTS.imapSecure,
      smtpHost: dto.smtpHost?.trim() || DEFAULTS.smtpHost,
      smtpPort: dto.smtpPort || DEFAULTS.smtpPort,
      smtpSecure: dto.smtpSecure ?? DEFAULTS.smtpSecure,
    };
  }

  private settingsOf(a: Account) {
    return {
      username: a.username,
      password: decryptSecret(a.passwordEnc),
      imapHost: a.imapHost,
      imapPort: a.imapPort,
      imapSecure: a.imapSecure,
      smtpHost: a.smtpHost,
      smtpPort: a.smtpPort,
      smtpSecure: a.smtpSecure,
    };
  }

  private imapOptions(s: ReturnType<MailService["settingsFrom"]>) {
    return {
      host: s.imapHost,
      port: s.imapPort,
      secure: s.imapSecure,
      auth: { user: s.username, pass: s.password },
      logger: false as const,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 5 * 60_000,
    };
  }

  private smtpOptions(s: ReturnType<MailService["settingsFrom"]>) {
    return {
      host: s.smtpHost,
      port: s.smtpPort,
      secure: s.smtpSecure,
      auth: { user: s.username, pass: s.password },
      connectionTimeout: 20_000,
    };
  }

  // Checks both receiving (IMAP) and sending (SMTP) before saving
  private async verify(s: ReturnType<MailService["settingsFrom"]>) {
    const client = new ImapFlow(this.imapOptions(s));
    client.on("error", () => undefined);
    try {
      await client.connect();
    } catch (e: any) {
      const auth = e?.authenticationFailed || /auth/i.test(e?.responseText || e?.message || "");
      throw new BadRequestException(
        auth
          ? "Could not sign in to the mailbox. Check the email address and password."
          : `Could not reach the incoming mail server (${s.imapHost}:${s.imapPort}): ${e?.message || "connection failed"}`
      );
    } finally {
      client.logout().catch(() => client.close());
    }

    const transport = nodemailer.createTransport(this.smtpOptions(s));
    try {
      await transport.verify();
    } catch (e: any) {
      throw new BadRequestException(`Signed in, but the outgoing mail server (${s.smtpHost}:${s.smtpPort}) refused: ${e?.response || e?.message}`);
    } finally {
      transport.close();
    }
  }

  // One cached IMAP connection per mailbox, closed after 5 idle minutes
  private async imap(account: Account): Promise<ImapFlow> {
    const version = account.updatedAt.getTime();
    const existing = this.conns.get(account.id);
    if (existing && existing.version === version && existing.client.usable) {
      existing.lastUsed = Date.now();
      return existing.client;
    }
    if (existing) this.drop(account.id);

    const pending = this.connecting.get(account.id);
    if (pending) return pending;

    const p = (async () => {
      const client = new ImapFlow(this.imapOptions(this.settingsOf(account)));
      client.on("error", (e: any) => this.logger.warn(`IMAP ${account.email}: ${e?.message}`));
      client.on("close", () => {
        if (this.conns.get(account.id)?.client === client) this.conns.delete(account.id);
      });
      try {
        await client.connect();
      } catch (e: any) {
        throw new BadRequestException(
          e?.authenticationFailed
            ? `Sign-in to ${account.email} failed. The password may have changed — update it in the mailbox settings.`
            : `Could not reach ${account.imapHost}: ${e?.message || "connection failed"}`
        );
      }
      this.conns.set(account.id, { client, lastUsed: Date.now(), version });
      return client;
    })();
    this.connecting.set(account.id, p);
    try {
      return await p;
    } finally {
      this.connecting.delete(account.id);
    }
  }

  private drop(accountId: string) {
    const conn = this.conns.get(accountId);
    this.conns.delete(accountId);
    if (conn) conn.client.logout().catch(() => conn.client.close());
  }

  private closeIdle() {
    const now = Date.now();
    for (const [id, conn] of this.conns) {
      if (now - conn.lastUsed > IDLE_CLOSE_MS) this.drop(id);
    }
  }

  private async fetchParsed(client: ImapFlow, folder: string, uid: number): Promise<{ parsed: ParsedMail; flags: Set<string> }> {
    const lock = await client.getMailboxLock(folder, { readOnly: true });
    let msg: FetchMessageObject | false;
    try {
      msg = await client.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
    } finally {
      lock.release();
    }
    if (!msg || !msg.source) throw new NotFoundException("Message not found");
    return { parsed: await simpleParser(msg.source), flags: msg.flags || new Set() };
  }

  private async specialFolder(client: ImapFlow, use: "\\Sent" | "\\Trash"): Promise<string | null> {
    const folders = await client.list();
    const hit = folders.find((f) => f.specialUse === use);
    if (hit) return hit.path;
    const names = use === "\\Sent" ? ["sent", "sent items", "sent messages", "inbox.sent"] : ["trash", "deleted", "deleted items", "inbox.trash"];
    return folders.find((f) => names.includes(f.path.toLowerCase()))?.path || null;
  }

  private addrs(list?: { name?: string; address?: string }[]): Address[] {
    return (list || []).filter((a) => a.address).map((a) => ({ name: a.name || "", address: a.address! }));
  }

  private parsedAddrs(field?: AddressObject | AddressObject[]): Address[] {
    if (!field) return [];
    const objs = Array.isArray(field) ? field : [field];
    const out: Address[] = [];
    const walk = (vals: any[]) => {
      for (const v of vals) {
        if (v.group) walk(v.group);
        else if (v.address) out.push({ name: v.name || "", address: v.address });
      }
    };
    for (const o of objs) walk(o.value || []);
    return out;
  }

  private splitAddrs(value?: string): string[] {
    return (value || "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private hasAttachments(node?: MessageStructureObject): boolean {
    if (!node) return false;
    if (node.disposition === "attachment") return true;
    return (node.childNodes || []).some((c) => this.hasAttachments(c));
  }

  // Embedded images (cid:) become data URIs so the HTML renders on its own
  private inlineCidImages(parsed: ParsedMail): string {
    let html = parsed.html as string;
    let budget = MAX_INLINE_IMAGE_BYTES;
    for (const a of parsed.attachments) {
      if (!a.cid || a.size > budget) continue;
      budget -= a.size;
      const uri = `data:${a.contentType};base64,${a.content.toString("base64")}`;
      html = html.split(`cid:${a.cid}`).join(uri);
    }
    return html;
  }

  private async matchClients(orgId: string, emails: string[]) {
    const unique = [...new Set(emails.map((e) => e.toLowerCase()))];
    const map = new Map<string, { id: string; name: string }>();
    if (!unique.length) return map;
    const clients = await prisma.client.findMany({
      where: { orgId, OR: unique.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })) },
      select: { id: true, name: true, email: true },
    });
    for (const c of clients) if (c.email) map.set(c.email.toLowerCase(), { id: c.id, name: c.name });
    return map;
  }
}
