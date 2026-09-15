/** Normalizes text into lowercase words without diacritics, across writing systems. */
export function words(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

/** Checks whether a phrase occurs as consecutive words in the text. */
export function hasPhrase(text: string[], phrase: string[]): boolean {
  return (
    phrase.length > 0 &&
    text.some((_, start) =>
      phrase.every((word, offset) => text[start + offset] === word),
    )
  );
}
