export type DailySaveState = 'idle' | 'saving' | 'saved' | 'failed';

export type AttachmentAttempt<T> = {
  file: T;
  cloudConfirmed: boolean;
};

/**
 * Keeps the exact in-memory file objects that still need user action. This is
 * intentionally not an offline queue: the files disappear on page reload and
 * are never presented as uploaded until the existing storage path confirms it.
 */
export function attachmentsNeedingRetry<T>(attempts: AttachmentAttempt<T>[]): T[] {
  return attempts.filter(attempt => !attempt.cloudConfirmed).map(attempt => attempt.file);
}

export function saveFailureMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'The update could not be saved. Check your connection and retry.';
}
