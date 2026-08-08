import { useState } from 'react';
import { adminLogin, ApiClientError } from '@app/lib/api';
import { Field } from './ui';
import { inputStyle } from './styles';

/**
 * Panel girişi.
 *
 * Kimlik bilgileri sunucuda `env`'den okunur; burada hiçbir varsayılan
 * kullanıcı adı/parola YOKTUR ve olmayacaktır.
 */
export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(username, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Giriş yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="screen"
      style={{ justifyContent: 'center', alignItems: 'center', padding: 'var(--s-22)' }}
    >
      <form
        onSubmit={(e) => void submit(e)}
        style={{
          width: '100%',
          maxWidth: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-16)',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.03em',
          }}
        >
          Panel girişi
        </h1>

        <Field label="Kullanıcı adı">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            style={inputStyle}
          />
        </Field>

        <Field label="Parola">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </Field>

        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              background: 'var(--warn-soft-bg)',
              border: '1px solid var(--warn-border)',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 14,
              color: 'var(--warn-fg)',
            }}
          >
            {error}
          </p>
        )}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
      </form>
    </div>
  );
}
