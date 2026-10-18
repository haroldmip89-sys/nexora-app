"use client";

import { PaymentsError } from "@/modules/payments/components/payments-error";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <PaymentsError reset={reset} title="No pudimos cargar tus cobros de prueba" />;
}
