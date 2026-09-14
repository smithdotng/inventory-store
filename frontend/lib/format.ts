export function formatCurrency(amount: number | string | undefined | null, currency = '₦'): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (n == null || Number.isNaN(n)) return `${currency}0.00`;
  return `${currency}${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
