import { config } from '../../config';
import { logger } from '../../util/logger';

export interface OtpDelivery {
  /** Provider identifier used for delivery. */
  provider: string;
  /** Human readable description of where the code was sent. */
  channel: string;
}

/**
 * OTP delivery abstraction.
 *
 * A real WhatsApp OTP integration can be implemented by providing a new
 * OtpProvider (e.g. Twilio WhatsApp, Meta Cloud API) and selecting it via
 * the OTP_PROVIDER environment variable. No other part of the system needs
 * to change.
 */
export interface OtpProvider {
  name: string;
  send(phone: string, code: string): Promise<OtpDelivery>;
}

/**
 * Console provider - prints the code to the server log.
 * Suitable for local development and demonstrations.
 */
class ConsoleProvider implements OtpProvider {
  name = 'console';

  async send(phone: string, code: string): Promise<OtpDelivery> {
    logger.info(`[OTP-CONSOLE] Code for ${phone}: ${code}`);
    return { provider: this.name, channel: 'console' };
  }
}

/**
 * Mock provider - silently accepts delivery (used in automated tests).
 */
class MockProvider implements OtpProvider {
  name = 'mock';

  async send(phone: string, code: string): Promise<OtpDelivery> {
    void phone;
    void code;
    return { provider: this.name, channel: 'mock' };
  }
}

const providers = new Map<string, OtpProvider>([
  ['console', new ConsoleProvider()],
  ['mock', new MockProvider()],
]);

let cached: OtpProvider | null = null;

export function getOtpProvider(): OtpProvider {
  if (cached) return cached;
  const provider = providers.get(config.otpProvider) ?? new ConsoleProvider();
  cached = provider;
  return provider;
}

/** Dev-only: whether the generated OTP code may be returned by the API. */
export function isOtpRevealEnabled(): boolean {
  return config.enableOtpReveal && !config.isProd;
}
