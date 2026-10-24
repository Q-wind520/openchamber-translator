export interface TargetLanguage {
  code: string;
  label: string;
  prompt: string;
}

export const TARGET_LANGUAGES = [
  { code: 'zh-Hans', label: '简体中文', prompt: 'Simplified Chinese' },
  { code: 'zh-Hant', label: '繁體中文', prompt: 'Traditional Chinese' },
  { code: 'en', label: 'English', prompt: 'English' },
  { code: 'ja', label: '日本語', prompt: 'Japanese' },
  { code: 'ko', label: '한국어', prompt: 'Korean' },
  { code: 'fr', label: 'Français', prompt: 'French' },
  { code: 'de', label: 'Deutsch', prompt: 'German' },
  { code: 'es', label: 'Español', prompt: 'Spanish' },
  { code: 'ru', label: 'Русский', prompt: 'Russian' },
  { code: 'pt', label: 'Português', prompt: 'Portuguese' },
  { code: 'it', label: 'Italiano', prompt: 'Italian' },
  { code: 'ar', label: 'العربية', prompt: 'Arabic' },
] as const satisfies readonly TargetLanguage[];

export type TargetLanguageCode = (typeof TARGET_LANGUAGES)[number]['code'];

const LANGUAGES_BY_CODE = new Map<string, TargetLanguage>(
  TARGET_LANGUAGES.map((language) => [language.code, language]),
);

const FALLBACK_TARGET: TargetLanguage = TARGET_LANGUAGES[0];

const LOCALE_LABELS: Record<string, string> = {
  zh: '中文',
  'zh-hans': '简体中文',
  'zh-hant': '繁體中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
  pt: '葡萄牙语',
  it: '意大利语',
  ar: '阿拉伯语',
};

export function isTargetLanguageCode(value: unknown): value is TargetLanguageCode {
  return typeof value === 'string' && LANGUAGES_BY_CODE.has(value);
}

export function getTargetLanguage(code: string | undefined): TargetLanguage {
  return (code ? LANGUAGES_BY_CODE.get(code) : undefined) ?? FALLBACK_TARGET;
}

export function defaultTargetForLocale(locale: string | undefined): TargetLanguageCode {
  const normalized = (locale ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) return 'zh-Hans';

  if (
    normalized.startsWith('zh-tw') ||
    normalized.startsWith('zh-hk') ||
    normalized.startsWith('zh-mo') ||
    normalized.startsWith('zh-hant')
  ) {
    return 'zh-Hant';
  }
  if (normalized.startsWith('zh')) return 'zh-Hans';

  const base = normalized.split('-')[0];
  return isTargetLanguageCode(base) && base !== 'zh-Hans' && base !== 'zh-Hant'
    ? base
    : 'en';
}

export function formatLanguageName(code: string, locale: string | undefined): string {
  if (!code) return '';
  try {
    const names = new Intl.DisplayNames(locale ? [locale, 'en'] : ['en'], {
      type: 'language',
      fallback: 'code',
    });
    const name = names.of(code);
    if (name && name !== code) return name;
  } catch {
    // Older runtimes and unusual locale tags fall back to the small table below.
  }

  const normalized = code.toLowerCase();
  return (
    LOCALE_LABELS[normalized] ||
    LOCALE_LABELS[normalized.split('-')[0] ?? ''] ||
    code
  );
}
