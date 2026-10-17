"use client";

import { Suspense } from "react";
import { useProjectId } from "@/components/project/use-project-id";
import { OperationsContent } from "@/components/visibility/intelligence-operations";

function ProjectOperations() {
  const { projectId, loading } = useProjectId();
  if (loading) return <p role="status">正在读取项目…</p>;
  return projectId ? <OperationsContent key={projectId} projectId={projectId} /> : <p>请先选择项目。</p>;
}
export default function OperationsPage() { return <Suspense fallback={<p>正在读取项目…</p>}><ProjectOperations /></Suspense>; }
