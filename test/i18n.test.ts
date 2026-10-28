import { describe, expect, it } from 'vitest';
import { dictionaries, resolveUiLocale, message, formatCount, formatDuration, describeError, formatError } from '../src/panel/i18n';
import { TranslationError, TranslationLimitError, type TranslationErrorReason } from '../src/translation/errors';

describe('interface localization', () => {
  it.each([
    ['auto', 'ru-RU', 'ru'], ['auto', 'RU_ru', 'ru'], ['auto', 'en-US', 'en'],
    ['auto', 'zh-CN', 'zh-CN'], ['auto', 'zh-TW', 'zh-CN'],
    ['auto', 'fr-FR', 'en'], ['auto', '', 'en'], ['auto', undefined, 'en'],
    ['auto', 'ru-invalid-tag!', 'en'], ['ru', 'en-US', 'ru'], ['en', 'ru', 'en'],
  ] as const)('resolves %s with %s to %s', (choice, host, expected) => {
    expect(resolveUiLocale(choice, host)).toBe(expected);
  });

  it('has complete nonempty dictionaries with the same interpolation parameters', () => {
    for (const locale of ['zh-CN', 'en', 'ru'] as const) {
      expect(Object.keys(dictionaries[locale]).sort()).toEqual(Object.keys(dictionaries.en).sort());
      for (const key of Object.keys(dictionaries.en) as (keyof typeof dictionaries.en)[]) {
        expect(dictionaries[locale][key].trim()).not.toBe('');
        const params = (text: string) => text.match(/\{\w+\}/g)?.sort() ?? [];
        expect(params(dictionaries[locale][key])).toEqual(params(dictionaries.en[key]));
      }
    }
  });

  it.each([[1, '1 символ'], [2, '2 символа'], [5, '5 символов'], [11, '11 символов'], [21, '21 символ']])(
    'uses Russian plural forms for %i', (count, expected) => {
      expect(formatCount('ru', Number(count), 'characters')).toBe(expected);
    },
  );

  it('formats paragraphs and durations in the selected locale', () => {
    expect(formatCount('ru', 2, 'paragraphs')).toBe('2 абзаца');
    expect(formatCount('en', 1, 'paragraphs')).toBe('1 paragraph');
    expect(formatDuration('ru', 1250)).toBe('1,3 с');
    expect(formatDuration('en', 0)).toBe('0.1 s');
    expect(message('en', 'maxChars', { limit: 50000 })).toContain('50,000');
  });

  it('renders every known cause distinctly in all three languages', () => {
    const reasons: TranslationErrorReason[] = ['no-model', 'permission-denied', 'provider-unavailable', 'model-failed', 'timeout', 'response-too-large', 'invalid-response-shape', 'empty-response', 'count-mismatch', 'incomplete-result', 'cancelled'];
    for (const locale of ['zh-CN', 'en', 'ru'] as const) {
      const texts = reasons.map((reason) => formatError(locale, describeError(new TranslationError('diagnostic', 'provider', reason))));
      expect(new Set(texts).size).toBe(reasons.length);
      expect(texts.every((text) => text.length > 0 && !text.includes('diagnostic'))).toBe(true);
      expect(formatError(locale, describeError(new TranslationLimitError('limit', 50000))))
        .toContain(new Intl.NumberFormat(locale).format(50000));
    }
  });

  it('keeps external diagnostics and rejects missing message parameters', () => {
    const detail = '<img src=x onerror=alert(1)>';
    expect(formatError('ru', describeError(new Error(detail)))).toContain(detail);
    expect(formatError('en', describeError(new TranslationError(detail, 'provider')))).toContain(detail);
    expect(formatError('en', describeError(null))).toBe('Translation did not complete. Try again.');
    expect(() => message('en', 'maxChars')).toThrow('Missing message parameter');
  });
});
