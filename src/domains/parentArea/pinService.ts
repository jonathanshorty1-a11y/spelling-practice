// The Parent PIN is explicitly NOT real authentication (see spec section 7) —
// it is a local speed bump so a child doesn't wander into settings/billing.
// A SHA-256 hash via the browser's native SubtleCrypto is more than enough;
// it just needs to not be plaintext in storage.

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashPin(pin: string): Promise<string> {
  return sha256Hex(`spelling-practice-pin:${pin}`)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const candidate = await hashPin(pin)
  return candidate === hash
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}
