/**
 * Normalizes an array of tags:
 * 1. lowercases
 * 2. trims whitespace
 * 3. removes empty strings
 * 4. deduplicates
 */
export const normalizeTags = (tags: string[]): string[] => {
  const normalized = tags
    .map((tag) => tag.toLowerCase().trim())
    .filter((tag) => tag.length > 0);
  
  return Array.from(new Set(normalized));
};
