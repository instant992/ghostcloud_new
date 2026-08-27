/** Режим приватности: включается автоматически при детекте скриншота —
 *  конфиденциальные подписи (LTE, обход) размываются прямо на экране. */
let blurred = false;
const listeners = new Set<() => void>();

export function isPrivacyBlur(): boolean {
  return blurred;
}

export function setPrivacyBlur(v: boolean) {
  if (blurred === v) return;
  blurred = v;
  listeners.forEach((l) => l());
}

export function subscribePrivacy(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
