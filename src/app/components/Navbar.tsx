import { useState } from 'react';

type Props = {
  city?: { code: number; name: string } | null;
  district?: { code: string; name: string } | null;
  onChangeLocation: () => void;
  onUseLocation: () => void;
  onNavigate: (path: string) => void;
};

export function Navbar({
  city,
  district,
  onChangeLocation,
  onUseLocation,
  onNavigate,
}: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const locationText = district
    ? `${city?.name ?? ''} · ${district.name}`
    : city
      ? `${city.name} (Tüm İlçeler)`
      : 'Konumuma Göre';

  const handleLinkClick = (path: string) => {
    setMobileMenuOpen(false);
    onNavigate(path);
  };

  return (
    <header className="site-header">
      <div className="header-inner">
        {/* Logo */}
        <a
          href="/"
          className="brand-logo"
          onClick={(e) => {
            e.preventDefault();
            handleLinkClick('/');
          }}
        >
          <span className="logo-cross" aria-hidden="true">
            <span className="cross-h" />
            <span className="cross-v" />
          </span>
          <div className="brand-text">
            <span className="brand-title">NÖBETÇİ ECZANE</span>
            <span className="brand-sub">Bugün Açık Eczaneler ve Harita</span>
          </div>
        </a>

        {/* Location Selector Badge */}
        <div className="location-badge-wrap">
          <button onClick={onChangeLocation} className="location-badge-btn" aria-label="Konum veya İl İlçe Seç">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="loc-name">{locationText}</span>
            <span className="loc-change-tag">Değiştir</span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="desktop-nav">
          <a
            href="/"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              handleLinkClick('/');
            }}
          >
            Ana Sayfa
          </a>
          <a
            href="/iller"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              handleLinkClick('/iller');
            }}
          >
            Tüm İller (81 İl)
          </a>
          <button onClick={onUseLocation} className="nav-btn-gps">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Yakınımdakiler
          </button>
        </nav>

        {/* Mobile menu toggle */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menü"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileMenuOpen ? (
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer">
          <a
            href="/"
            className="mobile-nav-link"
            onClick={(e) => {
              e.preventDefault();
              handleLinkClick('/');
            }}
          >
            Ana Sayfa
          </a>
          <a
            href="/iller"
            className="mobile-nav-link"
            onClick={(e) => {
              e.preventDefault();
              handleLinkClick('/iller');
            }}
          >
            Tüm İller (81 İl Rehberi)
          </a>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onChangeLocation();
            }}
            className="mobile-nav-link btn-link"
          >
            İl / İlçe Seç
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onUseLocation();
            }}
            className="mobile-nav-link btn-link highlight"
          >
            Konumumu Kullan (En Yakın)
          </button>
        </div>
      )}
    </header>
  );
}
