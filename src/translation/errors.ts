export type TranslationErrorCode =
  | 'cancelled'
  | 'no-model'
  | 'model-failed'
  | 'timeout'
  | 'invalid-response'
  | 'provider';

export type TranslationErrorReason =
  | 'no-model'
  | 'permission-denied'
  | 'provider-unavailable'
  | 'model-failed'
  | 'timeout'
  | 'response-too-large'
  | 'invalid-response-shape'
  | 'empty-response'
  | 'count-mismatch'
  | 'incomplete-result'
  | 'cancelled'
  | 'unknown';

export class TranslationError extends Error {
  readonly code: TranslationErrorCode;
  readonly reason: TranslationErrorReason;

  constructor(message: string, code: TranslationErrorCode, reason?: TranslationErrorReason) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    this.reason =
      reason ??
      (code === 'cancelled' ||
      code === 'no-model' ||
      code === 'model-failed' ||
      code === 'timeout'
        ? code
        : 'unknown');
  }
}

export class TranslationLimitError extends RangeError {
  readonly limit: number;
  readonly reason = 'text-too-long';

  constructor(message: string, limit: number) {
    super(message);
    this.name = 'TranslationLimitError';
    this.limit = limit;
  }
}

export function cancellationError(): TranslationError {
  return new TranslationError('翻译已取消。', 'cancelled');
}

export function isCancellation(error: unknown): boolean {
  return error instanceof TranslationError && error.code === 'cancelled';
}
