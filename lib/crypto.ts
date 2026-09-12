import bcrypt from "bcryptjs"
import crypto from "node:crypto"

const BCRYPT_COST = 12
const BCRYPT_RE = /^\$2[aby]\$/
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST)
}

/**
 * True when `hash` is a legacy unsalted SHA-256 hex digest (the scheme
 * used before this API moved to bcrypt) rather than a bcrypt hash.
 * Accounts created under the old scheme still have these stored.
 */
export function isLegacyHash(hash: string | null | undefined): boolean {
  return !!hash && SHA256_HEX_RE.test(hash) && !BCRYPT_RE.test(hash)
}

/**
 * Verify a password against either hashing scheme:
 *   - bcrypt (`$2a$`/`$2b$`/`$2y$`) — the current scheme
 *   - legacy unsalted SHA-256 hex — compared in constant time
 *
 * On a legacy match the caller should re-hash with {@link hashPassword}
 * and persist it (see the login route). Never throws.
 */
export async function verifyPassword(
  password: string,
  hashedPassword: string | null | undefined
): Promise<boolean> {
  if (!hashedPassword) return false

  if (isLegacyHash(hashedPassword)) {
    const digest = crypto.createHash("sha256").update(password).digest("hex")
    const a = Buffer.from(digest, "utf8")
    const b = Buffer.from(hashedPassword.toLowerCase(), "utf8")
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  try {
    return await bcrypt.compare(password, hashedPassword)
  } catch {
    return false
  }
}

/**
 * True when a password that just verified successfully is still stored
 * under the legacy scheme and should be transparently upgraded to bcrypt.
 */
export function passwordNeedsUpgrade(hash: string | null | undefined): boolean {
  return isLegacyHash(hash)
}
