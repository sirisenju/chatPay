/** The backend returns integer stroops; one XLM is 10,000,000 stroops. */
export function formatFeeStroops(value: string): string | null {
  if (!/^\d+$/.test(value)) return null;
  const digits = value.replace(/^0+(?=\d)/, '').padStart(8, '0');
  return `${digits.slice(0, -7)}.${digits.slice(-7)}`.replace(/\.?0+$/, '');
}
