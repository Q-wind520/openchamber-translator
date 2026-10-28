import type { HostClient } from '@openchamber/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultPreferences,
  loadPreferences,
  normalizePreferences,
  savePreferences,
} from '../src/panel/preferences';

describe('preferences', () => {
  it('defaults missing or invalid interface preference to auto without losing saved fields', () => {
    for (const uiLanguage of [undefined, 'fr', null]) {
      expect(normalizePreferences({ uiLanguage, targetLanguage: 'ja', displayMode: 'translation', autoSelection: false }, 'ru-RU'))
        .toEqual({ uiLanguage: 'auto', targetLanguage: 'ja', displayMode: 'translation', autoSelection: false });
    }
  });

  it('preserves manual and auto choices without writing on load', async () => {
    for (const uiLanguage of ['ru', 'en', 'zh-CN', 'auto']) {
      const saved = { uiLanguage, targetLanguage: 'ja', displayMode: 'translation', autoSelection: false };
      const host = { storage: { get: vi.fn(async () => saved), set: vi.fn() } } as unknown as Pick<HostClient, 'storage'>;
      await expect(loadPreferences(host, 'en-US')).resolves.toEqual(saved);
      expect(host.storage.set).not.toHaveBeenCalled();
      await savePreferences(host, normalizePreferences(saved, 'en-US'));
      expect(host.storage.set).toHaveBeenCalledWith('preferences-v2', saved);
    }
  });
  it('derives a sensible target language from the host locale', () => {
    expect(defaultPreferences('zh-CN').targetLanguage).toBe('zh-Hans');
    expect(defaultPreferences('zh-TW').targetLanguage).toBe('zh-Hant');
    expect(defaultPreferences('ja-JP').targetLanguage).toBe('ja');
    expect(defaultPreferences('fr-FR').targetLanguage).toBe('fr');
    expect(defaultPreferences('en-US').targetLanguage).toBe('en');
  });

  it('drops invalid saved fields and keeps valid ones', () => {
    expect(
      normalizePreferences(
        { targetLanguage: 'ja', displayMode: 'translation', autoSelection: false },
        'zh-CN',
      ),
    ).toEqual({ uiLanguage: 'auto', targetLanguage: 'ja', displayMode: 'translation', autoSelection: false });

    expect(
      normalizePreferences(
        { targetLanguage: 'klingon', displayMode: 'sideways', provider: 'deepseek' },
        'zh-CN',
      ),
    ).toEqual({ uiLanguage: 'auto', targetLanguage: 'zh-Hans', displayMode: 'bilingual', autoSelection: true });
  });

  it('loads, validates, saves, and falls back cleanly', async () => {
    const values = new Map<string, unknown>();
    const get = vi.fn(async (key: string) => values.get(key));
    const host = {
      storage: {
        get,
        set: vi.fn(async (key: string, value: unknown) => {
          values.set(key, value);
        }),
        delete: vi.fn(),
        keys: vi.fn(),
      },
    } as unknown as Pick<HostClient, 'storage'>;

    const initial = await loadPreferences(host, 'en-US');
    expect(initial.targetLanguage).toBe('en');
    expect(initial.displayMode).toBe('bilingual');
    expect(initial.autoSelection).toBe(true);

    await savePreferences(host, {
      uiLanguage: 'auto',
      targetLanguage: 'zh-Hant',
      displayMode: 'source',
      autoSelection: false,
    });

    await expect(loadPreferences(host, 'en-US')).resolves.toEqual({
      uiLanguage: 'auto',
      targetLanguage: 'zh-Hant',
      displayMode: 'source',
      autoSelection: false,
    });

    get.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(loadPreferences(host, 'zh-CN')).resolves.toEqual(
      defaultPreferences('zh-CN'),
    );
  });
});
