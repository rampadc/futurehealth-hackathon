/** Local replay fence for queued worker actions. This value is not a credential. */
export const ACCESS_GENERATION_KEY = 'hs-access-generation';
let memoryGeneration = crypto.randomUUID();

export function accessGeneration(): string {
  try {
    let value = localStorage.getItem(ACCESS_GENERATION_KEY);
    if (!value) { value = crypto.randomUUID(); localStorage.setItem(ACCESS_GENERATION_KEY, value); }
    return value;
  } catch { return memoryGeneration; }
}

export function renewAccessGeneration(): void {
  memoryGeneration = crypto.randomUUID();
  try { localStorage.setItem(ACCESS_GENERATION_KEY, memoryGeneration); } catch { /* Private storage mode. */ }
}

export function clearAccessGeneration(): void {
  memoryGeneration = crypto.randomUUID();
  try { localStorage.removeItem(ACCESS_GENERATION_KEY); } catch { /* Private storage mode. */ }
}
