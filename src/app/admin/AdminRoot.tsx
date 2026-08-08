import { useEffect, useState } from 'react';
import { adminMe } from '@app/lib/api';
import { AdminLogin } from './AdminLogin';
import { AdminPanel } from './AdminPanel';

/**
 * Panel kökü — oturum var mı diye sorar, yoksa giriş ekranını gösterir.
 * Oturum çerezi HttpOnly olduğu için JS onu okuyamaz; doğrulama sunucuya sorulur.
 */
export default function AdminRoot() {
  const [user, setUser] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const check = () => {
    adminMe()
      .then((me) => setUser(me.username))
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  };

  useEffect(() => {
    document.title = 'Nöbetçi Eczane — panel';
    check();
  }, []);

  if (!checked) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 220, height: 24 }} />
      </div>
    );
  }

  if (!user) return <AdminLogin onSuccess={check} />;

  return <AdminPanel username={user} onLogout={() => setUser(null)} />;
}
