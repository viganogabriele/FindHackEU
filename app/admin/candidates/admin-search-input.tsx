"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

/**
 * Debounced, URL-backed admin search. The page remains server-rendered: each
 * URL update asks the existing Server Component queries for fresh results.
 */
export function AdminSearchInput({
  status,
  query,
}: {
  status: string;
  query: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(query);

  useEffect(() => {
    setValue(query);
  }, [query]);

  useEffect(() => {
    if (value.trim() === query) return;

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("status", status);

      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [pathname, query, router, searchParams, status, value]);

  return (
    <Input
      type="search"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder="Search name, city, country, or query…"
      aria-label="Search candidates and hackathons"
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      className="h-8 min-w-0 flex-1 sm:max-w-sm"
    />
  );
}
