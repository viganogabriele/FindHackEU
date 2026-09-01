"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/** The shadcn Sonner wrapper used by the authenticated admin surface. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      richColors
      {...props}
    />
  );
}
