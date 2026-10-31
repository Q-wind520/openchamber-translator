import type { HostClient } from '@openchamber/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultPreferences,
  loadPreferences,
  normalizePreferences,
  savePreferences,
} from '../src/panel/preferences';

describe('preferences', () => {
  it('drops unknown fields, including a legacy interface language, without losing saved values', () => {
    for (const extra of [{}, { uiLanguage: 'ru' }, { uiLanguage: 'auto' }]) {
      expect(normalizePreferences({ ...extra, targetLanguage: 'ja', displayMode: 'translation', autoSelection: false }, 'ru-RU'))
        .toEqual({ targetLanguage: 'ja', displayMode: 'translation', autoSelection: false });
    }
  });

  it('preserves valid choices without writing on load', async () => {
    const saved = { targetLanguage: 'ja', displayMode: 'translation', autoSelection: false };
    const host = { storage: { get: vi.fn(async () => saved), set: vi.fn() } } as unknown as Pick<HostClient, 'storage'>;
    await expect(loadPreferences(host, 'en-US')).resolves.toEqual(saved);
    expect(host.storage.set).not.toHaveBeenCalled();
    await savePreferences(host, normalizePreferences(saved, 'en-US'));
    expect(host.storage.set).toHaveBeenCalledWith('preferences-v2', saved);
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
    ).toEqual({ targetLanguage: 'ja', displayMode: 'translation', autoSelection: false });

    expect(
      normalizePreferences(
        { targetLanguage: 'klingon', displayMode: 'sideways', provider: 'deepseek' },
        'zh-CN',
      ),
    ).toEqual({ targetLanguage: 'zh-Hans', displayMode: 'bilingual', autoSelection: true });
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
      targetLanguage: 'zh-Hant',
      displayMode: 'source',
      autoSelection: false,
    });

    await expect(loadPreferences(host, 'en-US')).resolves.toEqual({
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
