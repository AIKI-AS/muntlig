"use client";
import { usePathname } from "next/navigation";
import { Loading } from "@/features/workspace/ui";

export default function PageLoading() {
  const path = usePathname();
  const layout = path.startsWith("/practice/") ? "practice"
    : path.startsWith("/review/") ? "review"
    : path === "/sessions" ? "history" : "workspace";
  return <main className="app-sheet"><Loading label="Henter Muntlig …" layout={layout} /></main>;
}
