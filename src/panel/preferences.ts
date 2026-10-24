import type { HostClient } from '@openchamber/sdk';
import {
  defaultTargetForLocale,
  isTargetLanguageCode,
} from '../translation/languages';
import type { DisplayMode } from '../translation/types';

export interface Preferences {
  targetLanguage: string;
  displayMode: DisplayMode;
}

const STORAGE_KEY = 'preferences-v2';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function defaultPreferences(locale: string | undefined): Preferences {
  return {
    targetLanguage: defaultTargetForLocale(locale),
    displayMode: 'bilingual',
  };
}

export function normalizePreferences(
  raw: unknown,
  locale: string | undefined,
): Preferences {
  const defaults = defaultPreferences(locale);
  if (!isRecord(raw)) return defaults;

  const targetLanguage =
    typeof raw.targetLanguage === 'string' && isTargetLanguageCode(raw.targetLanguage)
      ? raw.targetLanguage
      : defaults.targetLanguage;
  const displayMode: DisplayMode =
    raw.displayMode === 'translation' || raw.displayMode === 'source'
      ? raw.displayMode
      : 'bilingual';

  return { targetLanguage, displayMode };
}

export async function loadPreferences(
  host: Pick<HostClient, 'storage'>,
  locale: string | undefined,
): Promise<Preferences> {
  try {
    const saved = await host.storage.get(STORAGE_KEY);
    return normalizePreferences(saved, locale);
  } catch {
    return defaultPreferences(locale);
  }
}

export async function savePreferences(
  host: Pick<HostClient, 'storage'>,
  preferences: Preferences,
): Promise<void> {
  await host.storage.set(STORAGE_KEY, {
    targetLanguage: preferences.targetLanguage,
    displayMode: preferences.displayMode,
  });
}
