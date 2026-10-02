// @oktis-works/auth - Password Hashing

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  // Use Web Crypto API (available in Node 15+)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: 100000,
    },
    key,
    256
  );

  const hashArray = new Uint8Array(bits);
  const saltArray = new Uint8Array(salt);

  // Format: $algorithm$iterations$salt$hash
  return `$pbkdf2-sha256$100000$${Buffer.from(saltArray).toString('base64')}$${Buffer.from(hashArray).toString('base64')}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = hash.split('$');
  if (parts.length !== 5 || parts[1] !== 'pbkdf2-sha256') {
    throw new Error('Invalid hash format');
  }

  const iterations = parseInt(parts[2]!, 10);
  const salt = Buffer.from(parts[3]!, 'base64');
  const expectedHash = Buffer.from(parts[4]!, 'base64');

  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  const key = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    key,
    256
  );

  const computedHash = new Uint8Array(bits);

  // Constant-time comparison
  if (computedHash.length !== expectedHash.length) return false;

  for (let i = 0; i < computedHash.length; i++) {
    if (computedHash[i] !== expectedHash[i]) return false;
  }

  return true;
}
