"use client";

import { useActionState, useEffect, useRef } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NO_AUTOFILL_PROPS } from "@/lib/form-utils";
import { addAdminFormAction, removeAdminAction } from "./actions";

/**
 * "Add admin" form for the Manage Admins tab (issue #18). Any currently
 * authorized admin can add another - see `addAdminFormAction`'s doc
 * comment for why there's no separate super-admin tier here.
 */
export function AddAdminForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, formAction, isPending] = useActionState(
    addAdminFormAction,
    null,
  );

  useEffect(() => {
    if (!result) return;

    if (result.outcome === "added") {
      toast.success("Admin added");
      formRef.current?.reset();
    } else if (result.outcome === "already_exists") {
      toast.message("That email is already an admin");
      formRef.current?.reset();
    } else if (result.outcome === "invalid") {
      toast.error(result.message ?? "Enter a valid email address.");
    } else {
      toast.error(result.message ?? "Failed to add admin");
    }
  }, [result]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="add-admin-email">Add admin by email</Label>
        <Input
          id="add-admin-email"
          name="email"
          type="email"
          required
          placeholder="teammate@example.com"
          {...NO_AUTOFILL_PROPS}
        />
      </div>
      <Button type="submit" disabled={isPending} className="sm:mb-0">
        <UserPlus aria-hidden="true" />
        {isPending ? "Adding…" : "Add admin"}
      </Button>
    </form>
  );
}

/**
 * Remove-admin action button for one row of the admin list. Disabled
 * entirely for the currently signed-in admin's own row - self-removal is
 * blocked server-side too (`removeAdminUser`'s doc comment explains why),
 * this just avoids a round trip that would only come back as an error.
 */
export function RemoveAdminButton({
  email,
  isSelf,
}: {
  email: string;
  isSelf: boolean;
}) {
  const [result, formAction, isPending] = useActionState(
    removeAdminAction.bind(null, email),
    null,
  );

  useEffect(() => {
    if (!result) return;

    if (result.outcome === "removed") {
      toast.success("Admin removed");
    } else if (result.outcome === "not_found") {
      toast.message("That admin was already removed");
    } else if (result.outcome === "self_removal_blocked") {
      toast.error(result.message ?? "You can't remove your own admin access.");
    } else {
      toast.error(result.message ?? "Failed to remove admin");
    }
  }, [result]);

  return (
    <form action={formAction}>
      <Button
        type="submit"
        variant="destructive"
        size="icon"
        title={
          isSelf ? "You can't remove your own admin access" : "Remove admin"
        }
        aria-label={
          isSelf ? "You can't remove your own admin access" : "Remove admin"
        }
        disabled={isSelf || isPending}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </form>
  );
}
