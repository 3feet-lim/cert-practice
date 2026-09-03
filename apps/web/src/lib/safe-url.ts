const SAME_ORIGIN_BASE = "https://certquiz.invalid";

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

export function isSafeUrl(value: string | undefined): value is string {
  if (!value) return false;

  const candidate = value.trim();
  if (!candidate || containsControlCharacter(candidate) || candidate.startsWith("//")) {
    return false;
  }

  try {
    const parsed = new URL(candidate, SAME_ORIGIN_BASE);
    return parsed.protocol === "https:" || parsed.origin === SAME_ORIGIN_BASE;
  } catch {
    return false;
  }
}
