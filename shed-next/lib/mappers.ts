import type { CardProduct } from '@/components/ProductCard';
import type { MarketProduct, Product, Store } from './types';
import { realImage } from './format';

export const fromMarket = (p: MarketProduct): CardProduct => ({
  id: p.id,
  name: p.name,
  price: p.price,
  stock: p.stock,
  image: realImage(p.image),
  category: p.category,
  storeUsername: p.store.username,
  storeName: p.store.name,
  currency: p.store.currency || '₦',
});

export const fromStore = (store: Store) => (p: Product): CardProduct => ({
  id: String(p._id),
  name: p.name,
  price: p.cost,
  stock: p.stock,
  image: realImage(p.images?.[0]),
  category: p.category,
  storeUsername: store.username,
  storeName: store.businessName,
  currency: store.currency || '₦',
});
