/**
 * `zValidator`'ın sözleşmeye uyan sarmalayıcısı.
 *
 * Çıplak `zValidator` doğrulama hatasında kendi gövdesini döner
 * (`{success: false, error: {...zod...}}`). Sözleşme ise **her** 400 için
 * `Error` şemasını vaat ediyor. Aradaki fark arayüzde görünür: `ApiClientError`
 * mesajı okuyamaz, kullanıcı "Bir şeyler ters gitti" görür.
 *
 * Bu sarmalayıcı hatayı `badRequest`'e çevirir; `app.onError` tek çıkışta
 * `Error` gövdesine dönüştürür.
 */

import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { badRequest } from './errors';

export function validate<T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result) => {
    if (result.success) return;

    const details = result.error.issues.map((issue) => ({
      // Kök seviye hatada (ör. `.refine` gövde üzerinde) yol boş gelir;
      // arayüzün bir yere tutunabilmesi için hedefin adı yazılır.
      path: issue.path.map(String).join('.') || String(target),
      message: issue.message,
    }));

    throw badRequest('Gönderilen bilgi doğrulanamadı.', details);
  });
}
