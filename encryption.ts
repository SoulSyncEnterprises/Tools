/**
 * AES-256-GCM Encryption Module (Standalone)
 *
 * ABOUT:
 *   This is a zero-dependency encryption module that uses AES-256-GCM — one of
 *   the strongest and most widely trusted encryption standards available. It
 *   encrypts sensitive data (API keys, tokens, secrets) so they can be safely
 *   stored in a database, and decrypts them only when needed in memory. GCM mode
 *   provides "authenticated encryption," meaning it detects if encrypted data has
 *   been tampered with. It also includes PBKDF2 password hashing for secure user
 *   authentication. No external packages needed — it uses Node.js built-in crypto.
 *
 * USE CASES:
 *   - Encrypt API keys before storing in a database
 *   - Decrypt credentials on-the-fly when making API calls
 *   - Hash and verify user passwords securely
 *   - Protect any sensitive data at rest
 *   - Generate cryptographically secure random keys
 *
 * DEPENDENCIES:
 *   None - uses Node.js built-in `crypto` module
 *
 * ENVIRONMENT VARIABLES:
 *   ENCRYPTION_KEY  - A secret key for encryption (any length, will be derived to 32 bytes)
 */

import crypto from 'crypto';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface EncryptionConfig {
  /** Secret key for encryption (any length, will be derived to 32 bytes) */
  secretKey: string;
  /** Optional AAD (Additional Authenticated Data) for GCM mode */
  aad?: string;
}

const ALGORITHM = 'aes-256-gcm';

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Create an encryptor/decryptor instance with your secret key
 */
export function createEncryptor(config: EncryptionConfig) {
  const key = crypto.scryptSync(config.secretKey, 'salt', 32);
  const aad = config.aad ? Buffer.from(config.aad) : undefined;

  return {
    /**
     * Encrypt a plaintext string
     * @returns Encrypted string in format: iv:authTag:ciphertext (hex encoded)
     */
    encrypt(plaintext: string): string {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      if (aad) cipher.setAAD(aad);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    },

    /**
     * Decrypt an encrypted string
     * @param encryptedData - String in format: iv:authTag:ciphertext
     * @returns Original plaintext
     */
    decrypt(encryptedData: string): string {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format (expected iv:authTag:ciphertext)');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      if (aad) decipher.setAAD(aad);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    },

    /**
     * Hash a password using PBKDF2 (for storage, NOT for encryption)
     */
    hashPassword(password: string): string {
      return crypto.pbkdf2Sync(password, config.secretKey, 10000, 64, 'sha512').toString('hex');
    },

    /**
     * Verify a password against a stored hash
     */
    verifyPassword(password: string, hash: string): boolean {
      const hashToVerify = crypto.pbkdf2Sync(password, config.secretKey, 10000, 64, 'sha512').toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hashToVerify), Buffer.from(hash));
    },
  };
}

// ─── Standalone Functions (simpler API) ──────────────────────────────────────

/**
 * Quick encrypt with a secret key (creates encryptor each time)
 */
export function encrypt(plaintext: string, secretKey: string, aad?: string): string {
  return createEncryptor({ secretKey, aad }).encrypt(plaintext);
}

/**
 * Quick decrypt with a secret key (creates encryptor each time)
 */
export function decrypt(encryptedData: string, secretKey: string, aad?: string): string {
  return createEncryptor({ secretKey, aad }).decrypt(encryptedData);
}

/**
 * Generate a cryptographically secure random key
 */
export function generateKey(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
// Option 1: Create a reusable encryptor
const encryptor = createEncryptor({
  secretKey: process.env.ENCRYPTION_KEY!,
  aad: 'MyApp', // optional: additional authenticated data
});

const encrypted = encryptor.encrypt('my-secret-api-key-123');
console.log('Encrypted:', encrypted);
// => "a1b2c3...:d4e5f6...:789abc..."

const decrypted = encryptor.decrypt(encrypted);
console.log('Decrypted:', decrypted);
// => "my-secret-api-key-123"

// Password hashing
const hash = encryptor.hashPassword('user-password');
const isValid = encryptor.verifyPassword('user-password', hash); // true

// Option 2: Quick one-off encrypt/decrypt
const enc = encrypt('secret', 'my-key');
const dec = decrypt(enc, 'my-key');

// Generate a new encryption key
const newKey = generateKey();
console.log('New key:', newKey);
*/
