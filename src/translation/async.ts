import { cancellationError } from './errors';

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw cancellationError();
}
