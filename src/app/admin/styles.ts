import type { CSSProperties } from 'react';

/** Panel form alanlarının ortak görünümü. Değerler design/DESIGN-TOKENS.md'den. */
export const inputStyle: CSSProperties = {
  height: 56,
  width: '100%',
  border: '1px solid var(--border-3)',
  borderRadius: 'var(--r-field)',
  background: 'var(--surface-2)',
  padding: '0 var(--s-16)',
  fontSize: 15,
};
