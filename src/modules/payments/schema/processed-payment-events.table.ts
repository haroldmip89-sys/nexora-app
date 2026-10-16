import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { paymentAttempts } from "./payment-attempts.table";

export const processedEventResultEnum = pgEnum("processed_event_result", [
  "applied",
  "ignored",
]);

export const processedPaymentEvents = pgTable("processed_payment_events", {
  stripeEventId: text("stripe_event_id").primaryKey(),
  type: text("type").notNull(),
  paymentAttemptId: uuid("payment_attempt_id").references(() => paymentAttempts.id, {
    onDelete: "restrict",
  }),
  result: processedEventResultEnum("result").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
