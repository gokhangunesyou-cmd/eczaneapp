import { slugify } from '@shared/slug';
import type { City } from '@app/lib/api';

type Props = {
  cities: City[];
  onPickCity: (code: number, name: string) => void;
  onNavigate: (path: string) => void;
};

export function Footer({ cities, onPickCity, onNavigate }: Props) {
  const topCities = cities.slice(0, 16);

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top-grid">
          <div className="footer-col brand-col">
            <div className="footer-logo">
              <span className="logo-cross-sm" aria-hidden="true" />
              <span className="footer-brand-name">Nöbetçi Eczane</span>
            </div>
            <p className="footer-desc">
              Türkiye genelindeki 81 il ve tüm ilçeler için güncel nöbetçi eczaneler listesi, canlı harita yol tarifi, telefon numarası ve adres bilgileri.
            </p>
            <div className="emergency-box">
              <span className="emerg-label">Acil Durum Numaraları:</span>
              <div className="emerg-tags">
                <a href="tel:112" className="emerg-tag">112 Acil Çağrı</a>
                <a href="tel:114" className="emerg-tag">114 Zehir Danışma</a>
              </div>
            </div>
          </div>

          <div className="footer-col">
            <h3 className="footer-heading">Öne Çıkan İller</h3>
            <ul className="footer-links">
              {topCities.map((c) => {
                const cSlug = c.slug || slugify(c.name);
                const path = `/${cSlug}-nobetci-eczane`;
                return (
                  <li key={c.code}>
                    <a
                      href={path}
                      onClick={(e) => {
                        e.preventDefault();
                        onPickCity(c.code, c.name);
                        onNavigate(path);
                      }}
                    >
                      {c.name} Nöbetçi Eczaneleri
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="footer-col">
            <h3 className="footer-heading">Tüm İller Dizin Rehberi</h3>
            <ul className="footer-links">
              <li>
                <a
                  href="/iller"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/iller');
                  }}
                >
                  81 İl Nöbetçi Eczaneler Listesi
                </a>
              </li>
              <li>
                <a
                  href="/istanbul-nobetci-eczane"
                  onClick={(e) => {
                    e.preventDefault();
                    onPickCity(34, 'İstanbul');
                    onNavigate('/istanbul-nobetci-eczane');
                  }}
                >
                  İstanbul Nöbetçi Eczane Link Sayfası
                </a>
              </li>
              <li>
                <a
                  href="/ankara-nobetci-eczane"
                  onClick={(e) => {
                    e.preventDefault();
                    onPickCity(6, 'Ankara');
                    onNavigate('/ankara-nobetci-eczane');
                  }}
                >
                  Ankara Nöbetçi Eczaneleri
                </a>
              </li>
              <li>
                <a
                  href="/izmir-nobetci-eczane"
                  onClick={(e) => {
                    e.preventDefault();
                    onPickCity(35, 'İzmir');
                    onNavigate('/izmir-nobetci-eczane');
                  }}
                >
                  İzmir Nöbetçi Eczaneleri
                </a>
              </li>
              <li>
                <a
                  href="/antalya-nobetci-eczane"
                  onClick={(e) => {
                    e.preventDefault();
                    onPickCity(7, 'Antalya');
                    onNavigate('/antalya-nobetci-eczane');
                  }}
                >
                  Antalya Nöbetçi Eczaneleri
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Nöbetçi Eczane Bulucu — Tüm hakları saklıdır.</p>
          <span className="footer-note">
            Nöbetçi eczane verileri günlük olarak güncellenmektedir. Yola çıkmadan önce telefonla teyit etmeniz tavsiye edilir.
          </span>
        </div>
      </div>
    </footer>
  );
}
