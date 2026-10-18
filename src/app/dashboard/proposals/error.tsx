"use client";

import { ProposalsError } from "@/modules/proposals/components/proposals-error";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ProposalsError reset={reset} />;
}
