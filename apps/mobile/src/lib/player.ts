// Запам'ятовуємо, яким гравцем є цей клієнт у конкретній кімнаті.
// На web використовуємо localStorage; на нативі (поки що) — лише в пам'яті.
const mem = new Map<string, string>();

function key(code: string) {
  return `shelter:player:${code.toUpperCase()}`;
}

export function setPlayerId(code: string, id: string): void {
  mem.set(key(code), id);
  try {
    globalThis.localStorage?.setItem(key(code), id);
  } catch {
    /* ignore (native / private mode) */
  }
}

export function getPlayerId(code: string): string | null {
  try {
    const v = globalThis.localStorage?.getItem(key(code));
    if (v) return v;
  } catch {
    /* ignore */
  }
  return mem.get(key(code)) ?? null;
}
