/** Match the word shown by the current UI language, including IME/full-width input. */
export function matchesAccountDeletionConfirmation(input: string, word: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
  return Boolean(word.trim()) && normalize(input) === normalize(word);
}
