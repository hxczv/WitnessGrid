import type { MetadataRoute } from "next";
import { listIncidents, serverApiBaseUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

const STATIC_PAGES = [
  { path: "/", priority: 1 },
  { path: "/map", priority: 0.9 },
  { path: "/about", priority: 0.6 },
  { path: "/stats", priority: 0.5 },
  { path: "/terms", priority: 0.3 },
  { path: "/content-policy", priority: 0.3 },
  { path: "/privacy", priority: 0.3 },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const now = new Date();

  const pages: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: p.priority,
  }));

  try {
    const first = await listIncidents({ limit: 50 }, { baseUrl: serverApiBaseUrl() });
    for (const item of first.items) {
      pages.push({
        url: `${base}/incident/${item.id}`,
        lastModified: new Date(item.created_at),
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  } catch {
    // API unavailable — static pages only.
  }

  return pages;
}