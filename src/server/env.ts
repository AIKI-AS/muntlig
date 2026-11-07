// Server-side configuration. Everything fails closed: a missing or odd value disables the feature.
import type { Integrations } from '../lib/contracts';
import { AppError } from './errors';
import { mediaAvailability } from './media/config';

// OpenAI endpoints we are willing to send the key to (US and EU data residency). Nothing else.
export const OPENAI_BASE_URLS = ['https://api.openai.com/v1', 'https://eu.api.openai.com/v1'];
const DEFAULT_MODEL = 'gpt-4.1-mini';
const MODEL_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Providers cost money: keys alone are never enough. */
export const providersEnabled = (): boolean => process.env.PROVIDER_CALLS_ENABLED === 'true';

export function supabaseConfig(): { url: string; anonKey: string; writeKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  const writeKey = process.env.MUNTLIG_DATABASE_WRITE_KEY?.trim();
  if (!url || !anonKey || !writeKey || !/^[a-f0-9]{64}$/.test(writeKey)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname))) return { url, anonKey, writeKey };
  } catch {
    // falls through to null
  }
  return null;
}

export function openaiBaseUrl(raw = process.env.OPENAI_BASE_URL): string | null {
  const value = raw?.trim().replace(/\/+$/, '');
  if (!value) return OPENAI_BASE_URLS[0];
  return OPENAI_BASE_URLS.includes(value) ? value : null;
}

export function openaiConfig(): { apiKey: string; model: string; baseURL: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseURL = openaiBaseUrl();
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  if (!providersEnabled() || !apiKey || !baseURL || !MODEL_PATTERN.test(model)) {
    throw new AppError(503, 'KI-tjenesten er ikke aktivert i dette miljøet.');
  }
  return { apiKey, model, baseURL };
}

export function integrations(): Integrations {
  const on = providersEnabled();
  return {
    database: supabaseConfig() !== null,
    llm: on && Boolean(process.env.OPENAI_API_KEY?.trim()) && openaiBaseUrl() !== null,
    ...mediaAvailability(),
  };
}

/** Call before spending quota: provider off means a clear 503 and nothing consumed. */
export const requireLlm = (): void => {
  openaiConfig();
};
