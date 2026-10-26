// @oktis-works/auth - Password Hashing (bcrypt only)

import { hash, compare } from 'bcryptjs';

/** Cost factor for bcrypt (12 = secure default). */
const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return compare(password, hash);
}
