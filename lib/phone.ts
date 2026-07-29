/**
 * Display-only phone formatting. Storage stays whatever the user typed
 * (isValidPhone in lib/validation.ts is deliberately loose about format) —
 * this only affects how it's rendered back, matching the (555) 123-4567
 * shape the edit field's own placeholder promises.
 */
export function formatPhoneDisplay(phone: string): string {
  const digits = phone.trim().replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  // Not a standard 10-digit US number (short local number, other country
  // code, etc.) — show it as-typed rather than force a shape that's wrong.
  return phone.trim();
}
