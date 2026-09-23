import { slugify } from '@shared/slug';
import type { City, District } from '@app/lib/api';

type Props = {
  currentCity?: { code: number; name: string } | null;
  currentDistrict?: { code: string; name: string } | null;
  allCities?: City[];
  districts?: District[];
  onPickCity: (code: number, name: string) => void;
  onPickDistrict: (code: string, name: string) => void;
  onNavigate: (path: string) => void;
};

export function CityDistrictGrid({
  currentCity,
  currentDistrict,
  allCities = [],
  districts = [],
  onPickCity,
  onPickDistrict,
  onNavigate,
}: Props) {
  const currentCitySlug = currentCity ? slugify(currentCity.name) : '';

  return (
    <section className="directory-section">
      {/* ─── Seçili İl İçin İlçeler Listesi ve Link İlan Sayfası ─────────────── */}
      {currentCity && districts.length > 0 && (
        <div className="directory-block">
          <div className="directory-header">
            <h2 className="directory-title">
              {currentCity.name} İlçeleri Nöbetçi Eczane Listesi
            </h2>
            <p className="directory-sub">
              Aşağıdaki ilçelere tıklayarak doğrudan o ilçedeki bugün açık nöbetçi eczaneleri görüntüleyebilirsiniz.
            </p>
          </div>

          <div className="district-grid">
            {districts.map((d) => {
              const dSlug = slugify(d.name);
              const targetUrl = `/${currentCitySlug}-${dSlug}-nobetci-eczane`;
              const isSelected = currentDistrict?.code === d.code;

              return (
                <a
                  key={d.code}
                  href={targetUrl}
                  className={`district-card ${isSelected ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onPickDistrict(d.code, d.name);
                    onNavigate(targetUrl);
                  }}
                >
                  <div className="district-info">
                    <span className="district-name">{d.name}</span>
                    <span className="district-badge">
                      {d.onDutyCount > 0 ? `${d.onDutyCount} Nöbetçi` : 'Detay Gör'}
                    </span>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="card-arrow"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── tüm illerin isimleri ilan link sayfası (81 İl Rehberi) ───────── */}
      <div className="directory-block">
        <div className="directory-header">
          <h2 className="directory-title">Türkiye Nöbetçi Eczane İlleri (81 İl)</h2>
          <p className="directory-sub">
            İstanbul, Ankara, İzmir, Antalya ve tüm 81 il için güncel nöbetçi eczaneler listesi ve haritası.
          </p>
        </div>

        <div className="city-grid">
          {allCities.map((c) => {
            const cSlug = c.slug || slugify(c.name);
            const targetUrl = `/${cSlug}-nobetci-eczane`;
            const isSelected = currentCity?.code === c.code;

            return (
              <a
                key={c.code}
                href={targetUrl}
                className={`city-card ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  onPickCity(c.code, c.name);
                  onNavigate(targetUrl);
                }}
              >
                <div className="city-card-main">
                  <span className="city-code">{c.code}</span>
                  <span className="city-name">{c.name} Nöbetçi Eczaneleri</span>
                </div>
                <span className="city-count-badge">
                  {c.districtCount > 0 ? `${c.districtCount} İlçe` : 'Dizin'}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
