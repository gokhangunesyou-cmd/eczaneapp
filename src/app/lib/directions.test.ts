import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openDirections } from './directions';

describe('directions module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers geo: URI intent on Android devices to let OS show native app picker', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 10)' });
    vi.stubGlobal('location', { href: '' });

    openDirections(36.89, 30.71, 'Test Eczanesi');
    expect(window.location.href).toBe('geo:36.89,30.71?q=36.89,30.71(Test%20Eczanesi)');
  });

  it('triggers maps:// URI scheme on iOS devices', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
    });
    vi.stubGlobal('location', { href: '' });

    openDirections(36.89, 30.71, 'Test Eczanesi');
    expect(window.location.href).toBe('maps://?daddr=36.89,30.71&dirflg=d&q=Test%20Eczanesi');
  });

  it('opens Google Maps in a new tab on Desktop', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    openDirections(36.89, 30.71, 'Test Eczanesi');
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('google.com/maps/dir/'),
      '_blank',
      'noopener,noreferrer',
    );
  });
});
