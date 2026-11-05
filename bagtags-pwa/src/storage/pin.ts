/** PIN de supervisor: se guarda como SHA-256(sal + PIN), nunca en claro. */
import { DEFAULT_PIN, type AppConfig } from '../domain/config';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt: string) {
  return sha256(`${salt}:${pin}`);
}

export async function makePin(pin: string): Promise<{ pinSalt: string; pinHash: string }> {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { pinSalt: salt, pinHash: await hashPin(pin, salt) };
}

/** Si no hay PIN configurado se usa el PIN por defecto (la app avisa de que debe cambiarse). */
export async function checkPin(pin: string, cfg: AppConfig): Promise<boolean> {
  if (!cfg.pinHash) return pin === DEFAULT_PIN;
  return (await hashPin(pin, cfg.pinSalt)) === cfg.pinHash;
}

export function usesDefaultPin(cfg: AppConfig) {
  return !cfg.pinHash;
}
