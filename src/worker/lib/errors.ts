/**
 * Tipli hatalar ve `Error` şemasına dönüştürme.
 *
 * Ham hata istemciye SIZMAZ. Mesajlar Türkçe ve kullanıcıya gösterilebilir
 * olmalıdır — arayüz bunları doğrudan ekrana basar.
 */

import type { components } from '@shared/api-types';

export type ErrorCode = components['schemas']['Error']['error']['code'];
export type ErrorBody = components['schemas']['Error'];
export type ErrorDetail = NonNullable<components['schemas']['Error']['error']['details']>[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  city_not_supported: 404,
  rate_limited: 429,
  source_unavailable: 502,
  dispatch_failed: 502,
  not_configured: 503,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[], statusOverride?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = statusOverride ?? STATUS_BY_CODE[code];
    if (details) this.details = details;
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const badRequest = (message: string, details?: ErrorDetail[]) =>
  new ApiError('bad_request', message, details);

export const unauthorized = (message = 'Oturum açman gerekiyor.') =>
  new ApiError('unauthorized', message);

export const notFound = (message = 'Kayıt bulunamadı.') => new ApiError('not_found', message);

/** Sözleşmede 409 için ayrı bir kod yok; `bad_request` gövdesiyle 409 döner. */
export const conflict = (message: string) => new ApiError('bad_request', message, undefined, 409);

export const rateLimited = (message = 'Çok fazla deneme yaptın. Biraz bekle.') =>
  new ApiError('rate_limited', message);

export const internal = (message = 'Bir şeyler ters gitti. Tekrar dener misin?') =>
  new ApiError('internal', message);

/** Çekim iş akışı tetiklenemedi — GitHub tarafı hata döndü ya da ulaşılamadı. */
export const dispatchFailed = (message = 'Çekim başlatılamadı. Biraz sonra tekrar dene.') =>
  new ApiError('dispatch_failed', message);

/** Özellik bu ortamda yapılandırılmamış; kullanıcı hatası değil, kurulum eksiği. */
export const notConfigured = (message: string) => new ApiError('not_configured', message);
