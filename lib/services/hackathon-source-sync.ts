/**
 * Source updates are disabled once an administrator has manually edited a
 * published row. The timestamp is intentionally row-level: the edit form
 * submits the complete editable record, so tracking individual fields would
 * require a separate field-level audit model and could still let a source
 * update overwrite a correction the form did not change.
 */
export function getSourceUpdateFields(
  manuallyEditedAt: string | null,
  incomingFields: Record<string, unknown>,
  updatedAt: string,
): Record<string, unknown> | null {
  if (manuallyEditedAt !== null) {
    return null;
  }

  return { ...incomingFields, updated_at: updatedAt };
}
