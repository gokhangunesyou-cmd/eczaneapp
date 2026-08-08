import type { ReactNode } from 'react';

/** Panelin ortak form parçaları. Tasarım token'ları dışında değer kullanılmaz. */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

export function ErrorBox({ message, extra }: { message: string; extra?: string }) {
  return (
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
      {message}
      {extra && (
        <span style={{ display: 'block', marginTop: 4, color: 'var(--text-3)' }}>{extra}</span>
      )}
    </p>
  );
}

export function SkeletonRows({ n }: { n: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-12)' }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 56 }} />
      ))}
    </div>
  );
}
