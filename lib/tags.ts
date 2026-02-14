function parseCommaValues(raw: string, options?: { lowercase?: boolean }): string[] {
  const lowercase = options?.lowercase ?? false;
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of raw.split(",")) {
    const value = part.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(lowercase ? value.toLowerCase() : value);
  }

  return tags;
}

export function parseTags(raw: string): string[] {
  return parseCommaValues(raw, { lowercase: true });
}

export function parseList(raw: string): string[] {
  return parseCommaValues(raw, { lowercase: false });
}
