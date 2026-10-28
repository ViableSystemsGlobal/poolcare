// The areas an admin can clear from Settings → Delete data. Each area lists the
// Prisma models it empties (all rows for the org), children first. Database
// foreign keys cascade or set null, so related rows in other areas are cleaned
// up by the database; `alsoRemoves` spells that out for the confirmation screen.

export type DataArea = "clients" | "jobs" | "invoices" | "quotes" | "crm" | "inventory" | "messages";

export interface AreaModel {
  model: string; // prisma delegate name
  label: string;
  counted?: boolean; // shown in the record counts
}

export interface AreaDef {
  label: string;
  description: string;
  models: AreaModel[];
  implies?: DataArea[]; // other areas that are always cleared with this one
  alsoRemoves?: string;
}

export const DATA_AREAS: Record<DataArea, AreaDef> = {
  clients: {
    label: "Clients & pools",
    description: "Clients, households, pools, service plans and agreements, and clients' app access.",
    implies: ["jobs", "invoices", "quotes"],
    alsoRemoves: "Also deletes all jobs & visits, invoices & payments, quotes and shop orders, since they belong to clients.",
    models: [
      { model: "clientChemicalMovement", label: "Client chemical movements" },
      { model: "clientChemicalStock", label: "Client chemical stock" },
      { model: "serviceAgreement", label: "Service agreements" },
      { model: "servicePlanWindowOverride", label: "Plan schedule overrides" },
      { model: "servicePlan", label: "Service plans", counted: true },
      { model: "shopOrder", label: "Shop orders" },
      { model: "pool", label: "Pools", counted: true },
      { model: "client", label: "Clients", counted: true },
      { model: "household", label: "Households" },
    ],
  },
  jobs: {
    label: "Jobs & visits",
    description: "Jobs, visits, readings, chemicals used, visit photos and issues.",
    models: [
      { model: "photo", label: "Photos" },
      { model: "reading", label: "Readings" },
      { model: "chemicalsUsed", label: "Chemicals used" },
      { model: "issue", label: "Issues", counted: true },
      { model: "visitEntry", label: "Visits", counted: true },
      { model: "job", label: "Jobs", counted: true },
    ],
  },
  invoices: {
    label: "Invoices & payments",
    description: "Invoices, payments, receipts, credit notes, refunds and subscription billing.",
    alsoRemoves: "Invoice numbering starts again from 0001. Payments made online stay in your Paystack account.",
    models: [
      { model: "refund", label: "Refunds" },
      { model: "receipt", label: "Receipts", counted: true },
      { model: "payment", label: "Payments", counted: true },
      { model: "creditNote", label: "Credit notes" },
      { model: "subscriptionBilling", label: "Subscription billing" },
      { model: "invoice", label: "Invoices", counted: true },
    ],
  },
  quotes: {
    label: "Quotes",
    description: "Quotes and their history.",
    models: [
      { model: "quoteAudit", label: "Quote history" },
      { model: "quote", label: "Quotes", counted: true },
    ],
  },
  crm: {
    label: "CRM",
    description: "Leads, prospects, contacts, opportunities, assessments, tasks, meetings and communications.",
    models: [
      { model: "activity", label: "Activities", counted: true },
      { model: "assessmentReport", label: "Assessments" },
      { model: "opportunity", label: "Opportunities", counted: true },
      { model: "contact", label: "Contacts", counted: true },
      { model: "account", label: "Prospects", counted: true },
      { model: "lead", label: "Leads", counted: true },
    ],
  },
  inventory: {
    label: "Inventory & shop orders",
    description: "Products, warehouses, stock, suppliers, stocktakes, supply requests and shop orders.",
    models: [
      { model: "supplyRequest", label: "Supply requests" },
      { model: "stocktakeItem", label: "Stocktake items" },
      { model: "stocktakeSession", label: "Stocktakes" },
      { model: "stockMovement", label: "Stock movements" },
      { model: "stockItem", label: "Stock items" },
      { model: "productSupplier", label: "Product suppliers" },
      { model: "supplier", label: "Suppliers", counted: true },
      { model: "product", label: "Products", counted: true },
      { model: "warehouse", label: "Warehouses" },
      { model: "shopOrder", label: "Shop orders", counted: true },
    ],
  },
  messages: {
    label: "Messages & notifications",
    description: "Client message threads, notification history and AI chat history. Connected mailboxes and their email are not affected.",
    models: [
      { model: "message", label: "Messages", counted: true },
      { model: "participant", label: "Thread participants" },
      { model: "threadLink", label: "Thread links" },
      { model: "thread", label: "Threads", counted: true },
      { model: "notification", label: "Notifications", counted: true },
      { model: "channelWebhookLog", label: "Webhook logs" },
      { model: "clientChat", label: "Client AI chats" },
      { model: "businessPartnerChat", label: "AI Partner chats" },
    ],
  },
};

export const AREA_ORDER: DataArea[] = ["clients", "jobs", "invoices", "quotes", "crm", "inventory", "messages"];

export function isDataArea(v: any): v is DataArea {
  return typeof v === "string" && v in DATA_AREAS;
}

// Selected areas plus everything they imply, in a stable order
export function expandAreas(areas: DataArea[]): DataArea[] {
  const set = new Set<DataArea>();
  for (const a of areas) {
    set.add(a);
    for (const i of DATA_AREAS[a].implies || []) set.add(i);
  }
  return AREA_ORDER.filter((a) => set.has(a));
}
