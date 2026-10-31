import { describe, expect, it } from 'vitest';
import {
  UI_LOCALES, dictionaries, localeDirection,
  resolveUiLocale, message, formatCount, formatDuration, describeError, formatError,
} from '../src/panel/i18n';
import { TranslationError, TranslationLimitError, type TranslationErrorReason } from '../src/translation/errors';

describe('interface localization', () => {
  it.each([
    ['ru-RU', 'ru'], ['RU_ru', 'ru'], ['en-US', 'en'],
    ['zh-CN', 'zh-CN'], ['zh-Hans', 'zh-CN'], ['zh-Hans-CN', 'zh-CN'],
    ['zh-TW', 'zh-TW'], ['zh-Hant', 'zh-TW'], ['zh-Hant-HK', 'zh-TW'],
    ['zh-HK', 'zh-TW'], ['fr-FR', 'fr'], ['de-DE', 'de'],
    ['nl-NL', 'nl'], ['uk-UA', 'uk'], ['es-ES', 'es'],
    ['pt', 'pt-BR'], ['pt-BR', 'pt-BR'], ['ko-KR', 'ko'],
    ['pl-PL', 'pl'], ['ja-JP', 'ja'], ['tr-TR', 'tr'],
    ['ar-SA', 'ar'], ['he-IL', 'he'], ['iw-IL', 'he'],
    ['', 'en'], [undefined, 'en'], ['ru-invalid-tag!', 'en'],
    ['xx-YY', 'en'],
  ] as const)('resolves %s to %s', (host, expected) => {
    expect(resolveUiLocale(host)).toBe(expected);
  });

  it('ships every OpenChamber locale', () => {
    expect([...UI_LOCALES]).toEqual([
      'en', 'de', 'fr', 'nl', 'zh-CN', 'zh-TW', 'uk', 'ru', 'es', 'pt-BR', 'ko', 'pl', 'ja', 'tr', 'ar', 'he',
    ]);
  });

  it('mirrors the layout for right-to-left locales', () => {
    expect(localeDirection('ar')).toBe('rtl');
    expect(localeDirection('he')).toBe('rtl');
    for (const locale of UI_LOCALES.filter((value) => value !== 'ar' && value !== 'he')) {
      expect(localeDirection(locale)).toBe('ltr');
    }
  });

  it('has complete nonempty dictionaries with the same interpolation parameters', () => {
    for (const locale of UI_LOCALES) {
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

  it('renders every known cause distinctly in every language', () => {
    const reasons: TranslationErrorReason[] = ['no-model', 'permission-denied', 'provider-unavailable', 'model-failed', 'timeout', 'response-too-large', 'invalid-response-shape', 'empty-response', 'count-mismatch', 'incomplete-result', 'cancelled'];
    for (const locale of UI_LOCALES) {
      const texts = reasons.map((reason) => formatError(locale, describeError(new TranslationError('diagnostic', 'provider', reason))));
      expect(new Set(texts).size).toBe(reasons.length);
      expect(texts.every((text) => text.length > 0 && !text.includes('diagnostic'))).toBe(true);
      expect(formatError(locale, describeError(new TranslationLimitError('limit', 50000))))
        .toContain(new Intl.NumberFormat(locale).format(50000));
    }
  });

  it('formats counts and durations in every language', () => {
    for (const locale of UI_LOCALES) {
      const number = new Intl.NumberFormat(locale).format(2);
      expect(formatCount(locale, 2, 'characters')).toContain(number);
      expect(formatCount(locale, 5, 'paragraphs')).toContain(new Intl.NumberFormat(locale).format(5));
      expect(formatDuration(locale, 1250)).toContain(new Intl.NumberFormat(locale).format(1.3));
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
