"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NO_AUTOFILL_PROPS } from "@/lib/form-utils";

/**
 * Debounced, URL-backed admin search. The page remains server-rendered: each
 * URL update asks the existing Server Component queries for fresh results.
 */
export function AdminSearchInput({
  status,
  query,
  reasonCodes = [],
}: {
  status: string;
  query: string;
  reasonCodes?: string[];
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
    <form method="get" action={pathname} className="flex min-w-0 flex-1 gap-2">
      <input type="hidden" name="status" value={status} />
      {reasonCodes.map((code) => (
        <input key={code} type="hidden" name="reason" value={code} />
      ))}
      <Input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search name, city, country, or query…"
        aria-label="Search candidates and hackathons"
        {...NO_AUTOFILL_PROPS}
        className="h-8 min-w-0 flex-1 sm:max-w-sm"
      />
      <Button type="submit" variant="outline" size="sm" className="h-8">
        Apply
      </Button>
    </form>
  );
}
