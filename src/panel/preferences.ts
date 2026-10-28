import type { HostClient } from '@openchamber/sdk';
import {
  defaultTargetForLocale,
  isTargetLanguageCode,
} from '../translation/languages';
import type { DisplayMode } from '../translation/types';
import { isUiLanguage, type UiLanguage } from './i18n';

export interface Preferences {
  uiLanguage: UiLanguage;
  targetLanguage: string;
  displayMode: DisplayMode;
  autoSelection: boolean;
}

const STORAGE_KEY = 'preferences-v2';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function defaultPreferences(locale: string | undefined): Preferences {
  return {
    uiLanguage: 'auto',
    targetLanguage: defaultTargetForLocale(locale),
    displayMode: 'bilingual',
    autoSelection: true,
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

  const autoSelection =
    typeof raw.autoSelection === 'boolean' ? raw.autoSelection : true;

  const uiLanguage = isUiLanguage(raw.uiLanguage) ? raw.uiLanguage : 'auto';
  return { uiLanguage, targetLanguage, displayMode, autoSelection };
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
    uiLanguage: preferences.uiLanguage,
    targetLanguage: preferences.targetLanguage,
    displayMode: preferences.displayMode,
    autoSelection: preferences.autoSelection,
  });
}
