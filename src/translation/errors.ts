export type TranslationErrorCode =
  | 'cancelled'
  | 'no-model'
  | 'model-failed'
  | 'timeout'
  | 'invalid-response'
  | 'provider';

export class TranslationError extends Error {
  readonly code: TranslationErrorCode;

  constructor(message: string, code: TranslationErrorCode) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
  }
}

export function cancellationError(): TranslationError {
  return new TranslationError('翻译已取消。', 'cancelled');
}

export function isCancellation(error: unknown): boolean {
  return error instanceof TranslationError && error.code === 'cancelled';
}
