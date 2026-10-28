import { throwIfAborted } from './async';
import { TranslationError, TranslationLimitError } from './errors';
import type { TargetLanguage } from './languages';
import type {
  ProviderLimits,
  ProviderTranslate,
  TranslationProgress,
} from './types';

export const MAX_TRANSLATION_CHARS = 50_000;

export interface PlanPart {
  text: string;
  segmentIndex: number;
}

export interface PlanParagraph {
  source: string;
  parts: PlanPart[];
}

export interface PlanSegment {
  text: string;
  paragraphIndex: number;
  partIndex: number;
}

export interface TranslationPlan {
  paragraphs: PlanParagraph[];
  segments: PlanSegment[];
  sourceText: string;
}

export interface TranslatedParagraph {
  source: string;
  translation: string;
}

export interface TranslationOutcome {
  paragraphs: TranslatedParagraph[];
  elapsedMs: number;
}

export interface RunTranslationOptions {
  translate: ProviderTranslate;
  limits: ProviderLimits;
  target: TargetLanguage;
  signal: AbortSignal;
  onProgress?: (progress: TranslationProgress) => void;
}

const SOFT_BREAKS = new Set(['。', '！', '？', '!', '?', '；', ';', '\n']);
const SECONDARY_BREAKS = new Set(['，', ',', '、', ':', '：']);

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
}

export function splitParagraphs(text: string): string[] {
  return normalizeText(text)
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function safeCutIndex(text: string, maxChars: number): number {
  let cut = Math.min(maxChars, text.length);
  if (cut <= 0) return 1;

  const last = text.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return Math.max(1, cut);
}

function findBreakIndex(text: string, maxChars: number): number {
  const windowEnd = Math.min(maxChars + 1, text.length);
  const minimum = Math.max(1, Math.floor(maxChars * 0.55));

  for (let index = windowEnd - 1; index >= minimum; index -= 1) {
    const char = text[index];
    if (!char) continue;
    if (SOFT_BREAKS.has(char)) return index + 1;
    if (char === '.' && (index + 1 >= text.length || /\s/.test(text[index + 1] ?? ''))) {
      return index + 1;
    }
  }

  for (let index = windowEnd - 1; index >= minimum; index -= 1) {
    const char = text[index];
    if (char && SECONDARY_BREAKS.has(char)) return index + 1;
  }

  return safeCutIndex(text, maxChars);
}

export function splitLongText(text: string, maxChars: number): string[] {
  const limit = Math.max(1, Math.floor(maxChars));
  let remaining = text.trim();
  const parts: string[] = [];

  while (remaining.length > limit) {
    const cut = findBreakIndex(remaining, limit);
    const part = remaining.slice(0, cut).trim();
    if (part) parts.push(part);
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.trim()) parts.push(remaining.trim());
  return parts;
}

export function createTranslationPlan(text: string, limits: ProviderLimits): TranslationPlan {
  const sourceText = normalizeText(text).trim();
  if (!sourceText) {
    return { paragraphs: [], segments: [], sourceText: '' };
  }
  if (sourceText.length > MAX_TRANSLATION_CHARS) {
    throw new TranslationLimitError(`单次最多翻译 ${MAX_TRANSLATION_CHARS.toLocaleString('zh-CN')} 个字符。`, MAX_TRANSLATION_CHARS);
  }

  const paragraphs: PlanParagraph[] = [];
  const segments: PlanSegment[] = [];

  for (const source of splitParagraphs(sourceText)) {
    const paragraphIndex = paragraphs.length;
    const parts = splitLongText(source, limits.maxSegmentChars).map((part, partIndex) => {
      const segmentIndex = segments.length;
      segments.push({ text: part, paragraphIndex, partIndex });
      return { text: part, segmentIndex };
    });
    paragraphs.push({ source, parts });
  }

  return { paragraphs, segments, sourceText };
}

export function buildBatches(segments: readonly PlanSegment[], limits: ProviderLimits): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let currentChars = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const length = segment.text.length;
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= limits.maxBatchItems || currentChars + length > limits.maxBatchChars);

    if (wouldOverflow) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(index);
    currentChars += length;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

function translatedParagraphText(
  paragraph: PlanParagraph,
  translations: readonly string[],
  targetCode: string,
): string {
  const joiner = /^zh|^ja|^ko/i.test(targetCode) ? '' : ' ';
  return paragraph.parts
    .map((part) => translations[part.segmentIndex]?.trim() ?? '')
    .filter(Boolean)
    .join(joiner)
    .trim();
}

export async function runTranslation(
  plan: TranslationPlan,
  options: RunTranslationOptions,
): Promise<TranslationOutcome> {
  const startedAt = Date.now();
  const total = plan.segments.length;
  throwIfAborted(options.signal);
  options.onProgress?.({ completed: 0, total });

  if (total === 0) {
    return { paragraphs: [], elapsedMs: 0 };
  }

  const batches = buildBatches(plan.segments, options.limits);
  const translations = new Array<string>(total);
  let completed = 0;
  let firstError: unknown;
  let cursor = 0;

  const internal = new AbortController();
  const forwardAbort = () => internal.abort();
  if (options.signal.aborted) internal.abort();
  else options.signal.addEventListener('abort', forwardAbort, { once: true });

  const worker = async (): Promise<void> => {
    while (!internal.signal.aborted) {
      const batchIndex = cursor;
      cursor += 1;
      const batch = batches[batchIndex];
      if (!batch) return;

      try {
        const response = await options.translate({
          segments: batch.map((index) => plan.segments[index]?.text ?? ''),
          target: options.target,
          signal: internal.signal,
        });

        if (internal.signal.aborted) return;
        if (
          !Array.isArray(response.translations) ||
          response.translations.length !== batch.length ||
          response.translations.some(
            (translation) => typeof translation !== 'string' || !translation.trim(),
          )
        ) {
          throw new TranslationError(
            '模型返回的结果数量不匹配，请重试。',
            'invalid-response',
            'count-mismatch',
          );
        }

        batch.forEach((segmentIndex, responseIndex) => {
          translations[segmentIndex] = response.translations[responseIndex]?.trim() ?? '';
        });
        completed += batch.length;
        options.onProgress?.({ completed, total });
      } catch (error) {
        if (!firstError) {
          firstError = error;
          internal.abort();
        }
        return;
      }
    }
  };

  const workerCount = Math.min(Math.max(1, options.limits.concurrency), batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  options.signal.removeEventListener('abort', forwardAbort);

  if (options.signal.aborted) throwIfAborted(options.signal);
  if (firstError) throw firstError;
  if (translations.some((translation) => typeof translation !== 'string')) {
    throw new TranslationError('翻译没有完成，请重试。', 'invalid-response', 'incomplete-result');
  }

  const paragraphs = plan.paragraphs.map((paragraph) => ({
    source: paragraph.source,
    translation: translatedParagraphText(paragraph, translations, options.target.code),
  }));

  return {
    paragraphs,
    elapsedMs: Date.now() - startedAt,
  };
}
