import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const auditExportsTable = pgTable("audit_exports", {
  id:             uuid("id").primaryKey().defaultRandom(),
  clientId:       text("client_id").notNull(),
  exportType:     text("export_type").notNull(),
  recipientEmail: text("recipient_email"),
  exportedAt:     timestamp("exported_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditExport = typeof auditExportsTable.$inferSelect;
export type InsertAuditExport = typeof auditExportsTable.$inferInsert;
