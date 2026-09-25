export function formatCurrency(amount: number | string | undefined | null, currency = '₦'): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  const v = n == null || Number.isNaN(n) ? 0 : n;
  // Whole amounts read cleaner on product cards (₦12,500 vs ₦12,500.00).
  const decimals = Number.isInteger(v) ? 0 : 2;
  return `${currency}${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}`;
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';
}

export function whatsappLink(number: string, text?: string): string {
  const n = number.replace(/\D/g, '');
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Backend placeholders (e.g. /images/default-product.png) count as "no image". */
export function realImage(src?: string | null): string | undefined {
  if (!src) return undefined;
  if (/default-product|\/images\/logo\.png$/.test(src)) return undefined;
  return src;
}
