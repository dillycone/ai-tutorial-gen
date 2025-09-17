"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { SchemaType } from "@/lib/types";

interface DSPyCacheControlProps {
  schemaType: SchemaType;
  promptMeta?: {
    cacheHit?: boolean;
    cacheAgeMs?: number;
  } | null;
}

type CacheStats = { entries: number; sizeBytes: number; ttlSeconds: number; maxEntries: number };

export default function DSPyCacheControl({ schemaType, promptMeta }: DSPyCacheControlProps) {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gemini/cache", { method: "GET" });
      const json = (await res.json()) as Partial<CacheStats>;
      setStats({
        entries: typeof json.entries === "number" ? json.entries : 0,
        sizeBytes: typeof json.sizeBytes === "number" ? json.sizeBytes : 0,
        ttlSeconds: typeof json.ttlSeconds === "number" ? json.ttlSeconds : 86400,
        maxEntries: typeof json.maxEntries === "number" ? json.maxEntries : 100,
      });
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [schemaType]);

  const clearCache = async () => {
    setClearing(true);
    try {
      await fetch("/api/gemini/cache", { method: "DELETE" });
      await fetchStats();
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  };

  const formatBytes = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-1 pr-4">
          <p className="text-sm font-medium text-gray-800">DSPy cache</p>
          <p className="text-xs text-gray-500">
            Reuse optimization results for identical parameters. Entries expire after 24 hours and the cache keeps the most recent 100.
          </p>
          {promptMeta && typeof promptMeta.cacheHit === "boolean" && (
            <div className="text-[11px] text-gray-500">
              Last run: {promptMeta.cacheHit ? "cache hit" : "cache miss"}
              {typeof promptMeta.cacheAgeMs === "number" ? ` • age ${Math.max(0, Math.round(promptMeta.cacheAgeMs / 1000))}s` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-gray-300 text-gray-700">
            {loading ? "…" : `${stats?.entries ?? 0} entries`}
          </Badge>
          <Badge variant="outline" className="border-gray-300 text-gray-700">
            {loading ? "…" : formatBytes(stats?.sizeBytes ?? 0)}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={clearCache}
            disabled={clearing}
            className="border-gray-300 text-gray-700"
          >
            {clearing ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Clearing
              </>
            ) : (
              <>Clear cache</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}