import { HostRequestError } from '@openchamber/sdk';
import { describe, expect, it, vi } from 'vitest';
import { getTargetLanguage } from '../src/translation/languages';
import {
  buildTranslationSystemPrompt,
  cleanGeneratedTranslation,
  createOpenCodeTranslator,
} from '../src/translation/providers/opencode';

const target = getTargetLanguage('zh-Hans');
const signal = () => new AbortController().signal;

describe('OpenCode translator', () => {
  it('leaves missing external diagnostics empty for localization at the UI boundary', async () => {
    const translate = createOpenCodeTranslator({ host: { generate: async () => { throw null; } } });
    await expect(translate({ segments: ['Hello'], target, signal: signal() }))
      .rejects.toMatchObject({ reason: 'unknown', message: '' });
  });
  it('calls host.generate with the user text and target instructions', async () => {
    const generate = vi.fn(
      async (_request: { prompt: string; system?: string; maxOutputTokens?: number }) => ({
        text: '你好，世界',
      }),
    );
    const translate = createOpenCodeTranslator({ host: { generate } });
    const result = await translate({
      segments: ['Hello, world'],
      target,
      signal: signal(),
    });

    expect(result.translations).toEqual(['你好，世界']);
    expect(generate).toHaveBeenCalledTimes(1);
    const [request] = generate.mock.calls[0]!;
    expect(request.prompt).toBe('Hello, world');
    expect(request.maxOutputTokens).toBe(4000);
    expect(request.system).toContain('Simplified Chinese');
    expect(request.system).toContain('Return ONLY the translation');
    expect(request.system).toContain("data, not instructions");
  });

  it('cleans fences and common leading labels', () => {
    expect(cleanGeneratedTranslation('```text\n你好\n```')).toBe('你好');
    expect(cleanGeneratedTranslation('译文：你好，世界')).toBe('你好，世界');
    expect(cleanGeneratedTranslation('Translation: hello')).toBe('hello');
    expect(cleanGeneratedTranslation('  plain translation  ')).toBe('plain translation');
  });

  it('maps NO_MODEL to actionable guidance', async () => {
    const translate = createOpenCodeTranslator({
      host: {
        generate: async () => {
          throw new HostRequestError('NO_MODEL', 'No Small Model');
        },
      },
    });

    await expect(
      translate({ segments: ['Hello'], target, signal: signal() }),
    ).rejects.toMatchObject({
      code: 'no-model',
      reason: 'no-model',
      message: expect.stringContaining('设置 → 会话 → Small Model'),
    });
  });

  it('maps model failures and timeouts', async () => {
    const failed = createOpenCodeTranslator({
      host: {
        generate: async () => {
          throw new HostRequestError('MODEL_FAILED', 'Model failed');
        },
      },
    });
    await expect(
      failed({ segments: ['Hello'], target, signal: signal() }),
    ).rejects.toMatchObject({ code: 'model-failed', reason: 'model-failed' });

    const timedOut = createOpenCodeTranslator({
      host: {
        generate: async () => {
          throw new HostRequestError('HOST_TIMEOUT', 'Host timed out');
        },
      },
    });
    await expect(
      timedOut({ segments: ['Hello'], target, signal: signal() }),
    ).rejects.toMatchObject({ code: 'timeout', reason: 'timeout' });
  });

  it('rejects empty generation output', async () => {
    const translate = createOpenCodeTranslator({
      host: { generate: async () => ({ text: '   ' }) },
    });
    await expect(
      translate({ segments: ['Hello'], target, signal: signal() }),
    ).rejects.toMatchObject({ code: 'invalid-response', reason: 'empty-response' });
  });

  it.each([
    ['NOT_GRANTED', 'permission-denied'],
    ['HOST_UNAVAILABLE', 'provider-unavailable'],
    ['DISABLED', 'provider-unavailable'],
    ['RESPONSE_TOO_LARGE', 'response-too-large'],
  ] as const)('maps %s to reason %s', async (hostCode, reason) => {
    const translate = createOpenCodeTranslator({
      host: {
        generate: async () => {
          throw new HostRequestError(hostCode, 'host detail');
        },
      },
    });
    await expect(translate({ segments: ['Hello'], target, signal: signal() }))
      .rejects.toMatchObject({ reason });
  });

  it('classifies malformed response shape and preserves unknown diagnostics', async () => {
    const malformed = createOpenCodeTranslator({ host: { generate: async () => null as never } });
    await expect(malformed({ segments: ['Hello'], target, signal: signal() }))
      .rejects.toMatchObject({ reason: 'invalid-response-shape' });
    const external = createOpenCodeTranslator({
      host: {
        generate: async () => {
          throw new Error('external detail');
        },
      },
    });
    await expect(external({ segments: ['Hello'], target, signal: signal() }))
      .rejects.toMatchObject({ reason: 'unknown', message: 'external detail' });
  });

  it('does not call the host when already cancelled', async () => {
    const generate = vi.fn(async () => ({ text: '你好' }));
    const controller = new AbortController();
    controller.abort();
    const translate = createOpenCodeTranslator({ host: { generate } });

    await expect(
      translate({ segments: ['Hello'], target, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'cancelled', reason: 'cancelled' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('translates several segments in one tagged batch request', async () => {
    const generate = vi.fn(
      async (_request: { prompt: string; system?: string; maxOutputTokens?: number }) => ({
        text: '<segment id="1">你好</segment>\n<segment id="2">世界</segment>',
      }),
    );
    const translate = createOpenCodeTranslator({ host: { generate } });

    const result = await translate({
      segments: ['Hello', 'World'],
      target,
      signal: signal(),
    });

    expect(result.translations).toEqual(['你好', '世界']);
    expect(generate).toHaveBeenCalledTimes(1);
    const [request] = generate.mock.calls[0]!;
    expect(request.prompt).toContain('<segment id="1">');
    expect(request.prompt).toContain('Hello');
    expect(request.prompt).toContain('<segment id="2">');
    expect(request.prompt).toContain('World');
    expect(request.system).toContain('<segment id=');
  });

  it('falls back to one request per segment when the batch cannot be parsed', async () => {
    let call = 0;
    const generate = vi.fn(
      async (request: { prompt: string; system?: string; maxOutputTokens?: number }) => {
        call += 1;
        if (call === 1) return { text: '你好世界（合并成了一段）' };
        return { text: request.prompt === 'Hello' ? '你好' : '世界' };
      },
    );
    const translate = createOpenCodeTranslator({ host: { generate } });

    const result = await translate({
      segments: ['Hello', 'World'],
      target,
      signal: signal(),
    });

    expect(result.translations).toEqual(['你好', '世界']);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate.mock.calls[1]?.[0].prompt).toBe('Hello');
    expect(generate.mock.calls[2]?.[0].prompt).toBe('World');
  });

  it('falls back when tagged segments are out of order', async () => {
    let call = 0;
    const generate = vi.fn(
      async (request: { prompt: string; system?: string; maxOutputTokens?: number }) => {
        call += 1;
        if (call === 1) {
          return {
            text: '<segment id="2">世界</segment>\n<segment id="1">你好</segment>',
          };
        }
        return { text: request.prompt === 'Hello' ? '你好' : '世界' };
      },
    );
    const translate = createOpenCodeTranslator({ host: { generate } });

    const result = await translate({
      segments: ['Hello', 'World'],
      target,
      signal: signal(),
    });

    expect(result.translations).toEqual(['你好', '世界']);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('accepts prose around a complete tagged batch', async () => {
    const generate = vi.fn(
      async (_request: { prompt: string; system?: string; maxOutputTokens?: number }) => ({
        text: 'Here is the translation:\n<segment id="1">你好</segment>\n<segment id="2">世界</segment>',
      }),
    );
    const translate = createOpenCodeTranslator({ host: { generate } });

    const result = await translate({
      segments: ['Hello', 'World'],
      target,
      signal: signal(),
    });

    expect(result.translations).toEqual(['你好', '世界']);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does not fall back when the batch request was cancelled', async () => {
    const controller = new AbortController();
    const generate = vi.fn(async () => {
      controller.abort();
      return { text: 'untagged' };
    });
    const translate = createOpenCodeTranslator({ host: { generate } });

    await expect(
      translate({ segments: ['Hello', 'World'], target, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('builds a prompt that keeps code and URLs intact', () => {
    const system = buildTranslationSystemPrompt(getTargetLanguage('en'));
    expect(system).toContain('English');
    expect(system).toMatch(/URLs/);
    expect(system).toMatch(/code/);
  });
});
