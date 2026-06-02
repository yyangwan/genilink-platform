import { importPKCS8, importSPKI } from 'jose';
import { execSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';

const KEYS_DIR = path.join(process.cwd(), '.keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

function generateKeyPairPEM(): { privateKey: string; publicKey: string } {
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });

  execSync(
    `openssl genpkey -algorithm RSA -out "${PRIVATE_KEY_PATH}" -pkeyopt rsa_keygen_bits:2048`,
    { stdio: 'pipe' }
  );
  execSync(
    `openssl rsa -in "${PRIVATE_KEY_PATH}" -pubout -out "${PUBLIC_KEY_PATH}"`,
    { stdio: 'pipe' }
  );

  return {
    privateKey: fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8'),
    publicKey: fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8'),
  };
}

function loadOrGenerateKeys(): { privateKey: string; publicKey: string } {
  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    return {
      privateKey: fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8'),
      publicKey: fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8'),
    };
  }
  return generateKeyPairPEM();
}

const keys = loadOrGenerateKeys();

export async function getPrivateKey() {
  return await importPKCS8(keys.privateKey, 'RS256');
}

export async function getPublicKey() {
  return await importSPKI(keys.publicKey, 'RS256');
}

export function getPublicKeyPEM(): string {
  return keys.publicKey;
}
