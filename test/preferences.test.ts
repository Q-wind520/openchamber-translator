import type { HostClient } from '@openchamber/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultPreferences,
  loadPreferences,
  normalizePreferences,
  savePreferences,
} from '../src/panel/preferences';

describe('preferences', () => {
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
        { targetLanguage: 'ja', displayMode: 'translation' },
        'zh-CN',
      ),
    ).toEqual({ targetLanguage: 'ja', displayMode: 'translation' });

    expect(
      normalizePreferences(
        { targetLanguage: 'klingon', displayMode: 'sideways', provider: 'deepseek' },
        'zh-CN',
      ),
    ).toEqual({ targetLanguage: 'zh-Hans', displayMode: 'bilingual' });
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

    await savePreferences(host, { targetLanguage: 'zh-Hant', displayMode: 'source' });

    await expect(loadPreferences(host, 'en-US')).resolves.toEqual({
      targetLanguage: 'zh-Hant',
      displayMode: 'source',
    });

    get.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(loadPreferences(host, 'zh-CN')).resolves.toEqual(
      defaultPreferences('zh-CN'),
    );
  });
});
