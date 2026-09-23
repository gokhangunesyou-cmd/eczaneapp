import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Harita ayrı chunk ve MapLibre jsdom'da koşmaz; testin konusu da harita değil.
vi.mock('@app/components/MapView', () => ({
  default: () => null,
}));

vi.mock('@app/lib/api', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  getCities: vi.fn(() =>
    Promise.resolve({
      items: [{ code: 7, name: 'Antalya', slug: 'antalya', districtCount: 19 }],
    }),
  ),
  getDistricts: vi.fn(() =>
    Promise.resolve({
      items: [
        { code: '0710', name: 'Kemer' },
        { code: '0715', name: 'Muratpaşa' },
      ],
    }),
  ),
  getOnDuty: vi.fn(() =>
    Promise.resolve({
      items: [],
      nextRotationAt: '2026-08-11T08:00:00Z',
      dataAsOf: '2026-08-10T08:15:00Z',
      stale: false,
    }),
  ),
}));

const { App } = await import('./App');

beforeEach(() => {
  // Mobil düzen: ResultsScreen ve üstündeki "il ilçe düzenle" düğmesi burada.
  window.innerWidth = 390;
  window.history.replaceState(null, '', '/antalya-kemer-nobetci-eczane');
});

describe('il/ilçe düzenleme', () => {
  it('ilçe rotasındayken düzenlemeye basınca ilçe ekranı açılır ve AÇIK KALIR', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Rota çözülsün: başlık seçili il/ilçeyi göstersin.
    expect(await screen.findByRole('button', { name: 'İl ilçe düzenle' })).toBeInTheDocument();
    await screen.findByText('Antalya · Kemer');

    await user.click(screen.getByRole('button', { name: 'İl ilçe düzenle' }));

    // İlçe ekranı geldi.
    expect(await screen.findByText('Kemer')).toBeInTheDocument();
    expect(await screen.findByText('Muratpaşa')).toBeInTheDocument();

    // Asıl hata buydu: rota senkronu efekti yeniden koşup gezinme kipini
    // 'none'a çeviriyor, ekran anında sonuçlara dönüyordu.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Muratpaşa')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'İl ilçe düzenle' })).not.toBeInTheDocument();
  });

  it('ilçe seçilince sonuç ekranına dönülür ve adres güncellenir', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'İl ilçe düzenle' }));
    await user.click(await screen.findByText('Muratpaşa'));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/antalya-muratpasa-nobetci-eczane');
    });
    expect(await screen.findByRole('button', { name: 'İl ilçe düzenle' })).toBeInTheDocument();
  });
});
