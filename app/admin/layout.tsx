import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

/**
 * Admin pages intentionally do not inherit the public site's selectable
 * theme. A fixed dark token scope keeps moderation actions and their severity
 * colors predictable for every admin route.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="admin"
      data-testid="admin-theme-shell"
      className="admin-theme dark min-h-screen"
    >
      {children}
      <Toaster theme="dark" />
    </div>
  );
}
