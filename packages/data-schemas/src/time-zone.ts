const normalizeTimeZone = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

const isValidTimeZone = (value: string): boolean => normalizeTimeZone(value) !== null;

export { isValidTimeZone, normalizeTimeZone };
