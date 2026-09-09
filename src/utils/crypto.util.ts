import crypto from "crypto";
import config from "../config";

/**
 * Reversible encryption for third-party credentials held in the database.
 *
 * Payment keys have to be DECRYPTED to be used — unlike a password, hashing
 * them is not an option. So they are encrypted at rest with AES-256-GCM,
 * which also authenticates the ciphertext: a tampered value fails to decrypt
 * rather than silently yielding rubbish that would be sent to the gateway.
 *
 * The key is derived from CONFIG_ENCRYPTION_KEY when set, else from JWTSECRET
 * so existing deployments keep working without a new secret. Rotating either
 * makes previously stored credentials undecryptable — they must be re-entered,
 * which the admin screen handles by simply asking for them again.
 */

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

const keyOf = (): Buffer =>
  crypto
    .createHash("sha256")
    .update(process.env.CONFIG_ENCRYPTION_KEY || config.auth.jwtSecret || "healwin")
    .digest();

/** Encrypt a secret for storage. Empty input stays empty. */
export const encryptSecret = (plain: string): string => {
  if (!plain) return "";
  // Already encrypted — re-encrypting would double-wrap it.
  if (plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyOf(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
};

/**
 * Decrypt a stored secret.
 *
 * A value without the prefix is returned as-is: credentials saved before
 * encryption existed are still plaintext, and refusing them would break a
 * working gateway on deploy.
 */
export const decryptSecret = (stored: string): string => {
  if (!stored) return "";
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const [, , ivB64, tagB64, dataB64] = stored.split(":");
    const decipher = crypto.createDecipheriv(
      ALGO,
      keyOf(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key or tampered data. Returning "" makes the gateway report
    // "not configured" rather than authenticating with garbage.
    console.error("[crypto] could not decrypt a stored secret — was the key rotated?");
    return "";
  }
};

/** "rzp_live_AbCdEf123456" → "rzp_***3456", for display. */
export const maskSecret = (value: string, keepEnd = 4): string => {
  if (!value) return "";
  if (value.length <= keepEnd + 3) return "***";
  return `${value.slice(0, 4)}***${value.slice(-keepEnd)}`;
};

export default { encryptSecret, decryptSecret, maskSecret };
