import type { TargetLanguage } from './languages';

export type DisplayMode = 'bilingual' | 'translation' | 'source';

export interface ProviderLimits {
  maxSegmentChars: number;
  maxBatchChars: number;
  maxBatchItems: number;
  concurrency: number;
}

export interface ProviderRequest {
  segments: readonly string[];
  target: TargetLanguage;
  signal: AbortSignal;
}

export interface ProviderResponse {
  translations: string[];
}

export type ProviderTranslate = (request: ProviderRequest) => Promise<ProviderResponse>;

export interface TranslationProgress {
  completed: number;
  total: number;
}
