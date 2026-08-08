import { lazy, Suspense, useEffect, useState } from 'react';
import { PermissionScreen } from './screens/PermissionScreen';
import { CityScreen } from './screens/CityScreen';
import { DistrictScreen } from './screens/DistrictScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { useGeolocation } from './lib/useGeolocation';

// Panel ayrı chunk — genel kullanıcı bu kodu hiç indirmez.
const AdminRoot = lazy(() => import('./admin/AdminRoot'));

export function App() {
  // Basit yol eşlemesi: /admin panel, gerisi genel uygulama.
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

  return <PublicApp />;
}

const TITLES = {
  permission: 'Nöbetçi Eczane',
  cities: 'Nöbetçi Eczane — il seç',
  districts: 'Nöbetçi Eczane — ilçe seç',
  results: 'Nöbetçi Eczane — yakınındakiler',
} as const;

type CityPick = { code: number; name: string };

/** Elle seçilen il hatırlanır; kullanıcı her açılışta aynı seçimi yapmasın. */
const CITY_KEY = 'city';

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
    /* bozuk kayıt — yok say, konumdan çözülür */
  }
  return null;
}

function PublicApp() {
  const { state, request, decline } = useGeolocation();

  // İl seçilmediyse `null` kalır ve sunucu ili KONUMDAN çözer (ADR-006).
  const [city, setCity] = useState<CityPick | null>(readStoredCity);
  const [district, setDistrict] = useState<{ code: string; name: string } | null>(null);
  const [browsing, setBrowsing] = useState<'none' | 'cities' | 'districts'>('none');

  // Görünüm RENDER SIRASINDA türetilir, efektle set edilmez. Konum durumu ve
  // seçimler zaten görünümü tek başına belirliyor; ayrı bir state tutmak
  // aynı bilgiyi ikinci kez saklamak olurdu.
  const view: keyof typeof TITLES =
    browsing === 'cities'
      ? 'cities'
      : browsing === 'districts'
        ? 'districts'
        : district || city || state.status === 'granted'
          ? 'results'
          : state.status === 'denied' || state.status === 'unavailable'
            ? 'cities'
            : 'permission';

  useEffect(() => {
    document.title = district ? `Nöbetçi Eczane — ${district.name}` : TITLES[view];
  }, [view, district]);

  const pickCity = (code: number, name: string) => {
    const next = { code, name };
    setCity(next);
    // İlçe önceki ile ait olabilir; il değişince düşer.
    setDistrict(null);
    localStorage.setItem(CITY_KEY, JSON.stringify(next));
    setBrowsing('districts');
  };

  if (view === 'permission') {
    return (
      <PermissionScreen
        onAllow={request}
        onDecline={decline}
        busy={state.status === 'requesting'}
      />
    );
  }

  if (view === 'cities') {
    return (
      <CityScreen
        title={city ? 'Hangi ile bakalım?' : 'Nerede olduğunu bulamadım, ilini seçer misin?'}
        onPick={pickCity}
        {...(city || state.status === 'granted'
          ? { onBack: () => setBrowsing('none'), backLabel: 'Vazgeç' }
          : {})}
      />
    );
  }

  if (view === 'districts') {
    return (
      <DistrictScreen
        city={city ?? { code: 7, name: 'Antalya' }}
        onPick={(code, name) => {
          setDistrict({ code, name });
          setBrowsing('none');
        }}
        onChangeCity={() => setBrowsing('cities')}
        onRetryLocation={() => {
          setDistrict(null);
          setBrowsing('none');
          request();
        }}
      />
    );
  }

  return (
    <ResultsScreen
      {...(state.status === 'granted' && !district
        ? { user: { lat: state.lat, lng: state.lng } }
        : {})}
      {...(city ? { city } : {})}
      {...(district ? { district } : {})}
      onChangeDistrict={() => setBrowsing('districts')}
      onChangeCity={() => setBrowsing('cities')}
    />
  );
}
