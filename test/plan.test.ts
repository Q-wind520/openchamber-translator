import { describe, expect, it } from 'vitest';
import { getTargetLanguage } from '../src/translation/languages';
import {
  buildBatches,
  createTranslationPlan,
  runTranslation,
  splitLongText,
  splitParagraphs,
} from '../src/translation/plan';
import { TranslationError } from '../src/translation/errors';
import type { ProviderLimits } from '../src/translation/types';

const limits: ProviderLimits = {
  maxSegmentChars: 100,
  maxBatchChars: 280,
  maxBatchItems: 3,
  concurrency: 2,
};

const upperTranslator = async ({ segments }: { segments: readonly string[] }) => ({
  translations: segments.map((segment) => segment.toUpperCase()),
});

describe('text planning', () => {
  it('splits paragraphs on blank lines and normalizes CRLF', () => {
    expect(splitParagraphs('One\r\n\r\nTwo\n\n\nThree')).toEqual(['One', 'Two', 'Three']);
    expect(splitParagraphs('line one\nline two\n\nnext')).toEqual(['line one\nline two', 'next']);
  });

  it('splits long paragraphs without dropping text', () => {
    const source = 'First sentence. Second sentence! Third sentence? Fourth sentence.';
    const parts = splitLongText(source, 24);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 24)).toBe(true);
    expect(parts.join(' ')).toBe(source);
  });

  it('builds a paragraph-to-segment map', () => {
    const plan = createTranslationPlan('Short paragraph.\n\n' + 'x'.repeat(230), {
      ...limits,
      maxSegmentChars: 80,
    });

    expect(plan.paragraphs).toHaveLength(2);
    expect(plan.paragraphs[0]?.parts).toHaveLength(1);
    expect(plan.paragraphs[1]?.parts.length).toBeGreaterThan(1);
    expect(plan.segments).toHaveLength(
      plan.paragraphs.reduce((total, paragraph) => total + paragraph.parts.length, 0),
    );
    expect(plan.segments[0]?.paragraphIndex).toBe(0);
  });

  it('respects batch char and item limits', () => {
    const plan = createTranslationPlan(
      Array.from({ length: 6 }, (_, index) => `Paragraph ${index} ${'y'.repeat(60)}`).join(
        '\n\n',
      ),
      { ...limits, maxSegmentChars: 100, maxBatchChars: 200, maxBatchItems: 2 },
    );
    const batches = buildBatches(plan.segments, {
      ...limits,
      maxBatchChars: 200,
      maxBatchItems: 2,
    });

    expect(batches.flat()).toEqual(plan.segments.map((_, index) => index));
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(2);
      const chars = batch.reduce(
        (total, index) => total + (plan.segments[index]?.text.length ?? 0),
        0,
      );
      expect(chars).toBeLessThanOrEqual(200);
    }
  });
});

describe('translation run', () => {
  it('translates every segment, joins CJK parts, and reports progress', async () => {
    const plan = createTranslationPlan('ABCDEFGH\n\nSecond', {
      ...limits,
      maxSegmentChars: 4,
    });
    const progress: number[] = [];
    const result = await runTranslation(plan, {
      translate: upperTranslator,
      limits: { ...limits, maxSegmentChars: 4 },
      target: getTargetLanguage('zh-Hans'),
      signal: new AbortController().signal,
      onProgress: ({ completed }) => progress.push(completed),
    });

    expect(result.paragraphs).toEqual([
      { source: 'ABCDEFGH', translation: 'ABCDEFGH' },
      { source: 'Second', translation: 'SECOND' },
    ]);
    expect(progress.at(-1)).toBe(plan.segments.length);
  });

  it('keeps spaces between parts for non-CJK targets', async () => {
    const plan = createTranslationPlan('ABCDEFGH', { ...limits, maxSegmentChars: 4 });
    const result = await runTranslation(plan, {
      translate: async ({ segments }) => ({
        translations: segments.map((segment) => segment.toLowerCase()),
      }),
      limits: { ...limits, maxSegmentChars: 4 },
      target: getTargetLanguage('en'),
      signal: new AbortController().signal,
    });

    expect(result.paragraphs[0]?.translation).toBe('abcd efgh');
  });

  it('runs batches with the configured concurrency', async () => {
    const plan = createTranslationPlan(
      Array.from({ length: 6 }, (_, index) => `Paragraph ${index}`).join('\n\n'),
      limits,
    );
    let active = 0;
    let maximum = 0;

    await runTranslation(plan, {
      limits: { ...limits, maxBatchItems: 1, concurrency: 3 },
      target: getTargetLanguage('en'),
      signal: new AbortController().signal,
      translate: async ({ segments }) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 4));
        active -= 1;
        return { translations: segments.map((segment) => segment) };
      },
    });

    expect(maximum).toBe(3);
  });

  it('stops before calling a provider when already aborted', async () => {
    const plan = createTranslationPlan('Hello', limits);
    const controller = new AbortController();
    controller.abort();
    let called = false;

    await expect(
      runTranslation(plan, {
          limits,
        target: getTargetLanguage('zh-Hans'),
        signal: controller.signal,
        translate: async () => {
          called = true;
          return { translations: ['你好'] };
        },
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(called).toBe(false);
  });

  it('rejects a provider response with the wrong number of segments', async () => {
    const plan = createTranslationPlan('One\n\nTwo', limits);
    await expect(
      runTranslation(plan, {
          limits,
        target: getTargetLanguage('zh-Hans'),
        signal: new AbortController().signal,
        translate: async () => ({ translations: ['only one'] }),
      }),
    ).rejects.toBeInstanceOf(TranslationError);
  });
});
