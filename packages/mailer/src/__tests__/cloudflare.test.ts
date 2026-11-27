import { afterEach, describe, expect, it } from 'bun:test';
import {
  hasEmailProvider,
  sendEmail,
  setCloudflareEmail,
  type CloudflareEmailBinding,
  type EmailConfig,
} from '../index';

const message = { to: 'ada@example.com', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' };

function config(overrides: Partial<EmailConfig> = {}): EmailConfig {
  return {
    smtp: {
      enabled: false,
      host: '',
      port: null,
      encryption: 'none',
      username: '',
      password: '',
      timeout: null,
    },
    resend: { enabled: false, apiKey: '' },
    from: "It's a Plan <noreply@plan.example>",
    ...overrides,
  };
}

function binding(send: CloudflareEmailBinding['send']) {
  const sent: Parameters<CloudflareEmailBinding['send']>[0][] = [];
  return {
    sent,
    binding: {
      send: async (input) => {
        sent.push(input);
        return send(input);
      },
    } satisfies CloudflareEmailBinding,
  };
}

afterEach(() => setCloudflareEmail(undefined));

describe('Cloudflare Email Service', () => {
  it('counts as a provider only while the binding is set', () => {
    expect(hasEmailProvider(config())).toBe(false);
    setCloudflareEmail(binding(async () => ({ messageId: 'm1' })).binding);
    expect(hasEmailProvider(config())).toBe(true);
  });

  it('sends through the binding with the named From address', async () => {
    const mail = binding(async () => ({ messageId: 'm1' }));
    setCloudflareEmail(mail.binding);
    expect(await sendEmail(config(), message)).toEqual({ ok: true });
    expect(mail.sent).toEqual([
      { ...message, from: { name: "It's a Plan", email: 'noreply@plan.example' } },
    ]);
  });

  it('leaves a configured Resend provider in charge', async () => {
    const mail = binding(async () => ({ messageId: 'm1' }));
    setCloudflareEmail(mail.binding);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    try {
      const result = await sendEmail(
        config({ resend: { enabled: true, apiKey: 're_1' } }),
        message,
      );
      expect(result).toEqual({ ok: true });
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(mail.sent).toEqual([]);
  });

  it('refuses to send without a From address', async () => {
    setCloudflareEmail(binding(async () => ({ messageId: 'm1' })).binding);
    const previous = process.env.EMAIL_FROM;
    delete process.env.EMAIL_FROM;
    try {
      expect(await sendEmail(config({ from: '' }), message)).toMatchObject({
        ok: false,
        retryable: false,
      });
    } finally {
      if (previous !== undefined) process.env.EMAIL_FROM = previous;
    }
  });

  it('reports a failed send as worth retrying', async () => {
    setCloudflareEmail(
      binding(async () => {
        throw new Error('rate limited');
      }).binding,
    );
    expect(await sendEmail(config(), message)).toEqual({
      ok: false,
      retryable: true,
      error: 'rate limited',
    });
  });
});
