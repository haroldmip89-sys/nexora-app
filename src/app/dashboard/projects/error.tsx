"use client";

import { ProjectsError } from "@/modules/projects/components/projects-error";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ProjectsError reset={reset} />;
}
