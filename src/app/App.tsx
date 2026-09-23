import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useGeolocation } from './lib/useGeolocation';
import {
  getCities,
  getDistricts,
  getOnDuty,
  type City,
  type District,
  type Pharmacy,
  type PharmacyList,
} from './lib/api';
import { slugify } from '@shared/slug';
import { SeoHead } from './components/SeoHead';
import { parseRouteSlugs } from './lib/routes';
import { Navbar } from './components/Navbar';
import { MapPanel } from './components/MapPanel';
import { CityDistrictGrid } from './components/CityDistrictGrid';
import { PharmacyCard } from './components/PharmacyCard';
import { PharmacyList as ListView } from './components/PharmacyList';
import { PharmacyProfileScreen } from './screens/PharmacyProfileScreen';
import { CityScreen } from './screens/CityScreen';
import { DistrictScreen } from './screens/DistrictScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { Footer } from './components/Footer';
import { formatTrDate } from '@shared/duty';

// Admin paneli lazy chunk
const AdminRoot = lazy(() => import('./admin/AdminRoot'));

export function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (path.startsWith('/admin')) {
    return (
      <Suspense fallback={<div className="screen" />}>
        <AdminRoot />
      </Suspense>
    );
  }

  return <PublicApp pathname={path} onNavigate={(p) => setPath(p)} />;
}

type CityPick = {
  code: number;
  name: string;
  // Kaynak ili koordinatsız verebilir; alan hem yok hem null olabilir.
  lat?: number | null | undefined;
  lng?: number | null | undefined;
};
type DistrictPick = { code: string; name: string };

const CITY_KEY = 'city';
const BASE_URL = 'https://nobetcieczane.becayisler.com';

function readStoredCity(): CityPick | null {
  try {
    const raw = localStorage.getItem(CITY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CityPick).code === 'number' &&
      typeof (parsed as CityPick).name === 'string'
    ) {
      return parsed as CityPick;
    }
  } catch {
    /* Bozuk veri atlanır */
  }
  return null;
}

function PublicApp({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: (path: string) => void;
}) {
  const { state, request } = useGeolocation();

  const [city, setCity] = useState<CityPick | null>(readStoredCity);
  const [district, setDistrict] = useState<DistrictPick | null>(null);
  const [pharmacyKey, setPharmacyKey] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState<'none' | 'cities' | 'districts' | 'all-cities'>('none');

  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [pharmaciesData, setPharmaciesData] = useState<PharmacyList | null>(null);
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);
  const [settledDutyKey, setSettledDutyKey] = useState<string | null>(null);

  // Ana sayfaya girildiğinde henüz konum istenmediyse tarayıcıdan otomatik izin iste
  useEffect(() => {
    if (pathname === '/' && state.status === 'idle') {
      request();
    }
  }, [pathname, state.status, request]);

  // Rota senkronu, adres değişince gezinme kipini kapatır. Ama il seçildiğinde
  // hem adres değişir HEM de ilçe seçim ekranı açık kalmalıdır; o tek durumda
  // senkrona "kipe dokunma" denir.
  const keepBrowsingRef = useRef(false);

  const navigateTo = useCallback(
    (targetUrl: string) => {
      if (window.location.pathname !== targetUrl) {
        window.history.pushState(null, '', targetUrl);
      }
      onNavigate(targetUrl);
    },
    [onNavigate],
  );

  // 1. İller listesini yükle
  useEffect(() => {
    let alive = true;
    getCities()
      .then((res) => {
        if (alive) setCities(res.items);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 2. Rota analizi ve şehir/ilçe çözümlemesi
  useEffect(() => {
    let alive = true;

    // Bu koşuda gezinme kipi korunacak mı? Bayrak koşu başında tüketilir.
    const keepBrowsing = keepBrowsingRef.current;
    keepBrowsingRef.current = false;

    async function syncRoute() {
      if (pathname === '/') {
        setPharmacyKey(null);
        setBrowsing((b) => (b === 'cities' || b === 'districts' ? b : 'none'));
        return;
      }

      if (pathname === '/iller' || pathname === '/tum-iller') {
        setBrowsing('all-cities');
        setPharmacyKey(null);
        return;
      }

      try {
        const cityList = cities.length > 0 ? cities : (await getCities()).items;
        if (!alive) return;
        if (cities.length === 0) setCities(cityList);

        const {
          view,
          citySlug,
          districtSlug,
          pharmacyKey: pKey,
        } = parseRouteSlugs(pathname, cityList);

        if (view === 'all-cities') {
          setBrowsing('all-cities');
          setPharmacyKey(null);
          return;
        }

        if (!citySlug) return;

        const matchedCity = cityList.find(
          (c) => c.slug === citySlug || slugify(c.name) === citySlug,
        );

        if (matchedCity && alive) {
          const nextCity = {
            code: matchedCity.code,
            name: matchedCity.name,
            lat: matchedCity.lat,
            lng: matchedCity.lng,
          };
          setCity(nextCity);
          localStorage.setItem(CITY_KEY, JSON.stringify(nextCity));

          if (districtSlug) {
            const districtList = await getDistricts(matchedCity.code);
            if (!alive) return;
            setDistricts(districtList.items);

            const matchedDistrict = districtList.items.find(
              (d) => slugify(d.name) === districtSlug,
            );
            if (matchedDistrict && alive) {
              setDistrict({ code: matchedDistrict.code, name: matchedDistrict.name });
            }
          } else {
            setDistrict(null);
          }

          setPharmacyKey(pKey);
          if (!keepBrowsing) setBrowsing('none');
        }
      } catch {
        /* Varsayılan state korunur */
      }
    }

    void syncRoute();

    return () => {
      alive = false;
    };
    // `browsing` KASITLI olarak bağımlılık değil (bu yüzden okunmuyor da,
    // güncellemeler fonksiyonel): bağımlılık olsaydı kullanıcı il/ilçe
    // düzenlemeye bastığı an bu efekt yeniden koşup kipi 'none'a çevirirdi.
  }, [pathname, cities]);

  // 3. Seçili il değişince ilçeleri yükle
  useEffect(() => {
    let alive = true;
    if (city) {
      getDistricts(city.code)
        .then((res) => {
          if (alive) setDistricts(res.items);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [city]);

  // 4. Nöbetçi eczaneleri yükle
  //
  // "Yükleniyor" ayrı bir state DEĞİL, türetilmiş bir değer: sonucu gelmiş
  // sorgunun kimliği güncel sorgununkinden farklıysa yükleniyoruzdur. Efekt
  // gövdesinde senkron setState yapmadan aynı sonucu verir.
  const isGps = state.status === 'granted' && (pathname === '/' || !district);
  const dutyQueryKey = JSON.stringify([
    isGps ? [state.lat, state.lng] : null,
    city?.code ?? null,
    district?.code ?? null,
  ]);
  const loadingPharmacies = settledDutyKey !== dutyQueryKey;

  // GPS ile gelen yanıttan kullanıcının çözümlenen ilini eşle
  useEffect(() => {
    if (isGps && pharmaciesData?.cityCode && cities.length > 0) {
      const detected = cities.find((c) => c.code === pharmaciesData.cityCode);
      if (detected && detected.code !== city?.code) {
        setCity({
          code: detected.code,
          name: detected.name,
          lat: detected.lat,
          lng: detected.lng,
        });
      }
    }
  }, [isGps, pharmaciesData?.cityCode, cities, city?.code]);

  useEffect(() => {
    let alive = true;

    getOnDuty({
      ...(isGps ? { lat: state.lat, lng: state.lng } : {}),
      ...(city ? { city: city.code } : {}),
      ...(district ? { district: district.code } : {}),
      includeExpired: true,
      limit: 40,
    })
      .then((d) => {
        if (!alive) return;
        setPharmaciesData(d);
        const open = d.items.filter((p) => p.status !== 'closed');
        setSelectedPharmacy(open[0] ?? d.items[0] ?? null);
        setSettledDutyKey(dutyQueryKey);
      })
      .catch(() => {
        if (!alive) return;
        setSettledDutyKey(dutyQueryKey);
      });

    return () => {
      alive = false;
    };
  }, [state, city, district, isGps, dutyQueryKey]);

  const handlePickCity = (code: number, name: string) => {
    const matched = cities.find((c) => c.code === code);
    const next: CityPick = { code, name, lat: matched?.lat, lng: matched?.lng };
    setCity(next);
    setDistrict(null);
    setPharmacyKey(null);
    setBrowsing('districts');
    localStorage.setItem(CITY_KEY, JSON.stringify(next));

    // İl seçildi → adres il sayfasına döner ama ilçe seçimi açık kalmalı.
    keepBrowsingRef.current = true;

    const cSlug = slugify(name);
    navigateTo(`/${cSlug}-nobetci-eczane`);
  };

  const handlePickDistrict = (code: string, name: string) => {
    const currentCity = city ?? { code: 7, name: 'Antalya' };
    const cSlug = slugify(currentCity.name);

    if (!code || code === '') {
      setDistrict(null);
      setPharmacyKey(null);
      setBrowsing('none');
      navigateTo(`/${cSlug}-nobetci-eczane`);
      return;
    }

    setDistrict({ code, name });
    setPharmacyKey(null);
    setBrowsing('none');

    const dSlug = slugify(name);
    navigateTo(`/${cSlug}-${dSlug}-nobetci-eczane`);
  };

  const handleUseLocation = () => {
    setCity(null);
    setDistrict(null);
    setPharmacyKey(null);
    localStorage.removeItem(CITY_KEY);
    setBrowsing('none');
    navigateTo('/');
    request();
  };

  const handleOpenPharmacyProfile = (pharmacy: Pharmacy) => {
    const currentCity = city ?? { code: 7, name: 'Antalya' };
    const cSlug = slugify(currentCity.name);
    const dSlug = slugify(pharmacy.districtName);
    const pKey = slugify(pharmacy.name).replace(/-eczane(si)?$/, '');

    setPharmacyKey(pKey);
    setBrowsing('none');
    navigateTo(`/${cSlug}-${dSlug}-${pKey}-eczanesi`);
  };

  const activePharmacies = pharmaciesData?.items.filter((p) => p.status !== 'closed') ?? [];

  // SEO Bilgileri
  const currentCitySlug = city ? slugify(city.name) : '';
  const currentDistrictSlug = district ? slugify(district.name) : '';

  let seoTitle = 'Nöbetçi Eczane — Türkiye Geneli Açık Eczaneler ve Canlı Harita';
  let seoDesc =
    'Konumunuza en yakın nöbetçi eczaneyi haritada görün. İstanbul, Ankara, İzmir, Antalya ve 81 il için güncel nöbetçi eczane listesi, adres ve telefon rehberi.';
  let seoCanon = BASE_URL + '/';
  const breadcrumbs: { name: string; url: string }[] = [{ name: 'Ana Sayfa', url: BASE_URL + '/' }];

  if (browsing === 'all-cities' || pathname === '/iller') {
    seoTitle = 'Tüm İller Nöbetçi Eczaneler — 81 İl Nöbetçi İlan Link Rehberi';
    seoDesc =
      'Türkiye genelindeki 81 il için güncel nöbetçi eczane rehberi. İstanbul, Ankara, İzmir ve tüm illerin ilçelerine göre nöbetçi eczaneleri inceleyin.';
    seoCanon = `${BASE_URL}/iller`;
    breadcrumbs.push({ name: 'Tüm İller Nöbetçi Eczaneler', url: seoCanon });
  } else if (district && city) {
    seoTitle = `${city.name} ${district.name} Nöbetçi Eczaneleri — Bugün Açık Eczaneler`;
    seoDesc = `${city.name} ${district.name} nöbetçi eczaneleri güncel nöbet listesi, haritadaki konumu, telefon numarası ve yol tarifi.`;
    seoCanon = `${BASE_URL}/${currentCitySlug}-${currentDistrictSlug}-nobetci-eczane`;
    breadcrumbs.push({
      name: `${city.name} Nöbetçi Eczaneleri`,
      url: `${BASE_URL}/${currentCitySlug}-nobetci-eczane`,
    });
    breadcrumbs.push({ name: `${district.name} Nöbetçi Eczaneleri`, url: seoCanon });
  } else if (city) {
    seoTitle = `${city.name} Nöbetçi Eczaneleri — Bugün Açık Eczaneler`;
    seoDesc = `${city.name} nöbetçi eczaneleri güncel listesi, ilçelerdeki nöbetçiler, telefon numaraları ve yol tarifi haritası.`;
    seoCanon = `${BASE_URL}/${currentCitySlug}-nobetci-eczane`;
    breadcrumbs.push({ name: `${city.name} Nöbetçi Eczaneleri`, url: seoCanon });
  }

  const mobileViewKind: 'cities' | 'districts' | 'profile' | 'results' = pharmacyKey
    ? 'profile'
    : browsing === 'cities' || browsing === 'all-cities'
      ? 'cities'
      : browsing === 'districts'
        ? 'districts'
        : 'results';

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (isMobile) {
    let mobileViewNode;
    if (mobileViewKind === 'cities') {
      mobileViewNode = (
        <CityScreen
          title={
            browsing === 'all-cities'
              ? '81 İl Nöbetçi Eczaneleri Rehberi'
              : city
                ? 'Hangi ile bakalım?'
                : 'Nerede olduğunu bulamadım, ilini seçer misin?'
          }
          onPick={handlePickCity}
          onUseLocation={handleUseLocation}
          {...(city || state.status === 'granted'
            ? { onBack: () => setBrowsing('none'), backLabel: 'Vazgeç' }
            : {})}
        />
      );
    } else if (mobileViewKind === 'districts') {
      mobileViewNode = (
        <DistrictScreen
          city={city ?? { code: 7, name: 'Antalya' }}
          onPick={handlePickDistrict}
          onChangeCity={() => setBrowsing('cities')}
          onUseLocation={handleUseLocation}
          onRetryLocation={handleUseLocation}
          onBack={() => setBrowsing('none')}
        />
      );
    } else if (mobileViewKind === 'profile' && pharmacyKey) {
      mobileViewNode = (
        <PharmacyProfileScreen
          citySlug={currentCitySlug}
          districtSlug={currentDistrictSlug}
          pharmacyKey={pharmacyKey}
          onBack={() => {
            setPharmacyKey(null);
            const currentCity = city ?? { code: 7, name: 'Antalya' };
            const cSlug = slugify(currentCity.name);
            if (district) {
              const dSlug = slugify(district.name);
              navigateTo(`/${cSlug}-${dSlug}-nobetci-eczane`);
            } else if (city) {
              navigateTo(`/${cSlug}-nobetci-eczane`);
            } else {
              navigateTo('/');
            }
          }}
        />
      );
    } else {
      mobileViewNode = (
        <ResultsScreen
          {...(state.status === 'granted' && !city && !district
            ? { user: { lat: state.lat, lng: state.lng } }
            : {})}
          {...(city ? { city } : {})}
          {...(district ? { district } : {})}
          onChangeDistrict={() => setBrowsing('districts')}
          onChangeCity={() => setBrowsing('cities')}
          onUseLocation={handleUseLocation}
          onOpenPharmacyProfile={handleOpenPharmacyProfile}
        />
      );
    }

    return (
      <>
        {mobileViewKind !== 'profile' && (
          <SeoHead
            title={seoTitle}
            description={seoDesc}
            canonicalUrl={seoCanon}
            pharmacies={pharmaciesData?.items}
            breadcrumbs={breadcrumbs}
          />
        )}
        {mobileViewNode}
      </>
    );
  }

  return (
    <div className="web-app-layout">
      {pharmacyKey === null && (
        <SeoHead
          title={seoTitle}
          description={seoDesc}
          canonicalUrl={seoCanon}
          pharmacies={pharmaciesData?.items}
          breadcrumbs={breadcrumbs}
        />
      )}

      {/* Modern Header Navbar */}
      <Navbar
        city={city}
        district={district}
        onChangeLocation={() => setBrowsing('cities')}
        onUseLocation={handleUseLocation}
        onNavigate={navigateTo}
      />

      {/* Main Content & Persistent Map Area */}
      <main className="web-main-container">
        {/* Left Side: Main Page Content & Directory Links */}
        <section className="web-content-col">
          {/* Breadcrumb Navigation */}
          {breadcrumbs.length > 0 && (
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              {breadcrumbs.map((b, idx) => (
                <span key={b.url} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {idx > 0 && <span className="breadcrumb-sep">/</span>}
                  {idx === breadcrumbs.length - 1 ? (
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{b.name}</span>
                  ) : (
                    <a
                      href={b.url}
                      className="breadcrumb-item"
                      onClick={(e) => {
                        e.preventDefault();
                        const rel = b.url.replace(BASE_URL, '');
                        navigateTo(rel || '/');
                      }}
                    >
                      {b.name}
                    </a>
                  )}
                </span>
              ))}
            </nav>
          )}

          {/* Page Header Box */}
          <div className="page-header-box">
            <div className="page-title-row">
              <div>
                <h1 className="page-main-title">
                  {browsing === 'all-cities'
                    ? '81 İl Nöbetçi Eczaneleri Rehberi'
                    : district
                      ? `${city?.name ?? ''} ${district.name} Nöbetçi Eczaneleri`
                      : city
                        ? `${city.name} Nöbetçi Eczaneleri`
                        : 'En Yakın Nöbetçi Eczaneler'}
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-3)' }}>
                  {district
                    ? `${city?.name} ilinin ${district.name} ilçesindeki bugün açık eczanelerin adres ve telefonu.`
                    : city
                      ? `${city.name} ili genelindeki nöbetçi eczaneler ve ilçeler listesi.`
                      : 'Konumunuza göre veya seçtiğiniz il/ilçedeki açık nöbetçi eczaneler.'}
                </p>
              </div>

              {pharmaciesData?.nextRotationAt && (
                <span className="page-meta-date tnum">
                  Nöbet Sonu: {formatTrDate(pharmaciesData.nextRotationAt)}
                </span>
              )}
            </div>
          </div>

          {/* 1. Browsing Cities mode (İl seçimi ekranı) */}
          {browsing === 'cities' && (
            <CityScreen
              title="Hangi ilin nöbetçi eczanelerine bakalım?"
              onPick={handlePickCity}
              onUseLocation={handleUseLocation}
              onBack={() => setBrowsing('none')}
              backLabel="Geri Dön"
            />
          )}

          {/* 2. Browsing Districts mode (İlçe seçimi ekranı) */}
          {browsing === 'districts' && (
            <DistrictScreen
              city={city ?? { code: 7, name: 'Antalya' }}
              onPick={handlePickDistrict}
              onChangeCity={() => setBrowsing('cities')}
              onUseLocation={handleUseLocation}
              onRetryLocation={handleUseLocation}
            />
          )}

          {/* 3. Pharmacy Profile view */}
          {pharmacyKey && (
            <PharmacyProfileScreen
              citySlug={currentCitySlug}
              districtSlug={currentDistrictSlug}
              pharmacyKey={pharmacyKey}
              onBack={() => {
                setPharmacyKey(null);
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  navigateTo('/');
                }
              }}
            />
          )}

          {/* 4. On-Duty Pharmacies List */}
          {!pharmacyKey && browsing === 'none' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {selectedPharmacy && (
                <div className="selected-pharmacy-wrapper">
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 16,
                      fontWeight: 800,
                      color: 'var(--brand-soft-fg)',
                      margin: '0 0 8px 0',
                    }}
                  >
                    Seçili Eczane Detayı
                  </h3>
                  <PharmacyCard
                    item={selectedPharmacy}
                    offline={pharmaciesData?.stale}
                    onOpenProfile={handleOpenPharmacyProfile}
                    citySlug={currentCitySlug}
                  />
                </div>
              )}

              {activePharmacies.length > 1 && (
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 16,
                      fontWeight: 800,
                      margin: '16px 0 12px 0',
                      color: 'var(--text-2)',
                    }}
                  >
                    Diğer Açık Nöbetçi Eczaneler ({activePharmacies.length})
                  </h3>
                  <ListView
                    items={activePharmacies.filter((p) => p.id !== selectedPharmacy?.id)}
                    selectedId={selectedPharmacy?.id ?? undefined}
                    onSelect={(p) => setSelectedPharmacy(p)}
                  />
                </div>
              )}
            </div>
          )}

          {/* 5. Directory Section: 81 Province & District Link Pages */}
          <CityDistrictGrid
            currentCity={city}
            currentDistrict={district}
            allCities={cities}
            districts={districts}
            onPickCity={handlePickCity}
            onPickDistrict={handlePickDistrict}
            onNavigate={navigateTo}
          />
        </section>

        {/* Right Side: Resizable Interactive Map Panel (Always present) */}
        <aside className="web-map-col">
          <MapPanel
            items={activePharmacies}
            {...(state.status === 'granted' && !city && !district
              ? { user: { lat: state.lat, lng: state.lng } }
              : {})}
            {...(selectedPharmacy ? { selectedId: selectedPharmacy.id } : {})}
            onSelect={(p) => setSelectedPharmacy(p)}
            onFocusUser={handleUseLocation}
            loading={loadingPharmacies}
          />
        </aside>
      </main>

      {/* Footer */}
      <Footer cities={cities} onPickCity={handlePickCity} onNavigate={navigateTo} />
    </div>
  );
}
