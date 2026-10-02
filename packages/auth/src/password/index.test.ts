import { describe, it, expect } from 'vitest';

describe('Password Hashing', () => {
  it('should hash a password', async () => {
    const { hashPassword } = await import('./index.js');
    const hash = await hashPassword('my-secret-password');
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash).not.toBe('my-secret-password');
  });

  it('should verify a correct password', async () => {
    const { hashPassword, verifyPassword } = await import('./index.js');
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('correct-password', hash);
    expect(result).toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const { hashPassword, verifyPassword } = await import('./index.js');
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });

  it('should produce different hashes for same input', async () => {
    const { hashPassword } = await import('./index.js');
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    // Different salt each time
    expect(hash1).not.toBe(hash2);
    // But both should verify
    const { verifyPassword } = await import('./index.js');
    expect(await verifyPassword('same-password', hash1)).toBe(true);
    expect(await verifyPassword('same-password', hash2)).toBe(true);
  });
});
