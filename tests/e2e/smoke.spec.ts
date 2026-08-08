import { test, expect } from '@playwright/test';

/**
 * Smoke testler — TOPLAM 3. Ayrıntı Vitest'in işi.
 * Yerel `npm run dev` sunucusuna karşı koşar; ağa çıkan istek yok.
 */

test('konum izni verilince en yakın nöbetçi eczane görünür', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 36.8862, longitude: 30.7056 }); // Muratpaşa

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Gece açık eczaneyi/ })).toBeVisible();

  await page.getByRole('button', { name: 'Konumumu kullan' }).click();

  // Kart geldi: ad, mesafe, durum rozeti ve iki aksiyon.
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Yol Tarifi', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ara', exact: true })).toBeVisible();
  await expect(page.getByText(/dk araçla/)).toBeVisible();
});

test('konum reddedilince il → ilçe seçimi çalışır', async ({ page, context }) => {
  await context.clearPermissions(); // izin yok

  await page.goto('/');
  await page.getByRole('button', { name: 'Yerimi kendim seçeyim' }).click();

  // Kapsam 81 il (ADR-006): önce il, sonra ilçe.
  await expect(page.getByRole('heading', { name: /ilini seçer misin/ })).toBeVisible();
  await page.getByRole('button', { name: 'Antalya', exact: true }).click();

  await expect(page.getByRole('heading', { name: /ilçeni seçer misin/ })).toBeVisible();

  // BELİRLİ bir ilçe seçilmez: merkez ilçelerde nöbet yalnızca akşam başlıyor
  // (ADR-005), gündüz koşan test boş liste görür ve haksız yere kırmızıya döner.
  // Nöbetçisi OLAN ilk ilçe seçilir — kullanıcının yapacağı şey de bu.
  const withDuty = page.getByRole('button', { name: /\d+ nöbetçi$/ }).first();
  await expect(withDuty).toBeVisible({ timeout: 10_000 });
  await withDuty.click();

  // İlçe görünümünde mesafe yok; ad ve aksiyonlar var.
  await expect(page.getByRole('button', { name: 'Yol Tarifi', exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

test('panel oturumsuz girilemez, admin/admin ile girilir', async ({ page }) => {
  await page.goto('/admin');

  // Oturum yokken giriş formu.
  await expect(page.getByRole('heading', { name: 'Panel girişi' })).toBeVisible();

  await page.getByLabel('Kullanıcı adı').fill('admin');
  await page.getByLabel('Parola').fill('admin');
  await page.getByRole('button', { name: 'Giriş yap' }).click();

  // Panel açıldı: takvim, eczane defteri, çekim (ADR-006).
  await expect(page.getByRole('button', { name: 'Takvim' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Eczaneler' }).click();
  await expect(page.getByRole('button', { name: 'Yeni eczane' })).toBeVisible();

  await page.getByRole('button', { name: 'Çekim' }).click();
  await expect(page.getByRole('button', { name: 'e-Devlet çekimini tetikle' })).toBeVisible();
});
