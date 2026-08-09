/**
 * Tanı sekmesi (ADR-007).
 *
 * Testler kullanıcının GÖRDÜĞÜ metni sorgular, CSS sınıfını değil.
 *
 * En kritik iddia "hedefin 403'ü hata değildir": bu ekranın tüm değeri, bir
 * kaynağın bizi engellediğini kırmızı bir hata gibi değil, ölçüm olarak
 * göstermesinde. Yanlış tarafa düşerse ekran işe yaramaz hale gelir.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type * as ApiModule from '@app/lib/api';
import { ProbeTab } from './ProbeTab';
import { adminProbe, ApiClientError, type ProbeResult } from '@app/lib/api';

vi.mock('@app/lib/api', async () => {
  // Yalnızca `adminProbe` taklit edilir; `ApiClientError` gerçek sınıf kalmalı
  // ki komponentteki `instanceof` kontrolü testte de doğru çalışsın.
  const actual = await vi.importActual<typeof ApiModule>('@app/lib/api');
  return { ...actual, adminProbe: vi.fn() };
});

const mockProbe = vi.mocked(adminProbe);

const result = (over: Partial<ProbeResult> = {}): ProbeResult => ({
  status: 200,
  statusText: 'OK',
  durationMs: 412,
  headers: [{ name: 'content-type', value: 'text/html; charset=UTF-8' }],
  body: '<html>merhaba</html>',
  bodyBytes: 20,
  truncated: false,
  ...over,
});

beforeEach(() => {
  mockProbe.mockReset();
});

describe('ProbeTab', () => {
  it('istek göndermeden önce boş durumu anlatır', () => {
    render(<ProbeTab />);
    expect(screen.getByText(/henüz istek göndermedin/i)).toBeInTheDocument();
  });

  it('istek sürerken bekleme durumunu gösterir', async () => {
    // Sonuçlanmayan söz: buton basılı kalır, iskelet görünür.
    mockProbe.mockReturnValue(new Promise<ProbeResult>(() => {}));
    const user = userEvent.setup();

    render(<ProbeTab />);
    await user.click(screen.getByRole('button', { name: 'İsteği gönder' }));

    expect(await screen.findByText(/yanıt bekleniyor/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gönderiliyor/i })).toBeDisabled();
  });

  it('mutlu yolda durum, süre ve gövdeyi gösterir', async () => {
    mockProbe.mockResolvedValue(result());
    const user = userEvent.setup();

    render(<ProbeTab />);
    await user.click(screen.getByRole('button', { name: 'İsteği gönder' }));

    expect(await screen.findByText('200 OK')).toBeInTheDocument();
    expect(screen.getByText(/412 ms/)).toBeInTheDocument();
    expect(screen.getByText('<html>merhaba</html>')).toBeInTheDocument();
    expect(screen.getByText('content-type')).toBeInTheDocument();
  });

  it('hedefin 403’ü HATA DEĞİLDİR — ölçüm olarak gösterilir', async () => {
    mockProbe.mockResolvedValue(
      result({ status: 403, statusText: 'Forbidden', body: 'Just a moment...' }),
    );
    const user = userEvent.setup();

    render(<ProbeTab />);
    await user.click(screen.getByRole('button', { name: 'İsteği gönder' }));

    expect(await screen.findByText('403 Forbidden')).toBeInTheDocument();
    // Sonucu yorumlar: kullanıcı "kod mu bozuk" diye düşünmesin.
    expect(screen.getByText(/veri merkezi ip/i)).toBeInTheDocument();
    // Kırmızı hata kutusu ÇIKMAZ.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('isteğin hiç yapılamadığı durumda hata kutusu çıkar', async () => {
    mockProbe.mockRejectedValue(
      new ApiClientError(502, 'source_unavailable', 'Hedefe ulaşılamadı (bağlantı yok).'),
    );
    const user = userEvent.setup();

    render(<ProbeTab />);
    await user.click(screen.getByRole('button', { name: 'İsteği gönder' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Hedefe ulaşılamadı (bağlantı yok).');
  });

  it('alan hatasını ilgili girdinin altında gösterir', async () => {
    mockProbe.mockRejectedValue(
      new ApiClientError(400, 'bad_request', 'Kendi adresimize tanı isteği atılamaz.', [
        { path: 'url', message: 'Dış bir adres ver.' },
      ]),
    );
    const user = userEvent.setup();

    render(<ProbeTab />);
    await user.click(screen.getByRole('button', { name: 'İsteği gönder' }));

    expect(await screen.findByText('Dış bir adres ver.')).toBeInTheDocument();
  });

  it('kırpılan gövdeyi bildirir', async () => {
    mockProbe.mockResolvedValue(result({ truncated: true, bodyBytes: 71680 }));
    const user = userEvent.setup();

    render(<ProbeTab />);
    await user.click(screen.getByRole('button', { name: 'İsteği gönder' }));

    expect(await screen.findByText(/kırpıldı/)).toBeInTheDocument();
  });

  it('GET seçiliyken gövde alanı yoktur ve gövde gönderilmez', async () => {
    mockProbe.mockResolvedValue(result());
    const user = userEvent.setup();

    render(<ProbeTab />);
    expect(screen.queryByLabelText('Gövde')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'İsteği gönder' }));

    await waitFor(() => expect(mockProbe).toHaveBeenCalled());
    expect(mockProbe.mock.calls[0]?.[0]).toMatchObject({ method: 'GET', body: null });
  });

  it('hazır deneme seçilince adres değişir', async () => {
    const user = userEvent.setup();
    render(<ProbeTab />);

    await user.click(screen.getByRole('button', { name: 'e-Devlet' }));

    expect(screen.getByPlaceholderText('https://...')).toHaveValue(
      'https://www.turkiye.gov.tr/saglik-titck-nobetci-eczane-sorgulama',
    );
  });
});
