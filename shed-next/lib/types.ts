export interface Store {
  _id: string;
  username: string;
  businessName: string;
  logo?: string | null;
  currency?: string;
  country?: string | null;
  category?: string | null;
  description?: string;
  whatsappNumber?: string;
  paymentInstructions?: string;
  social?: { instagram?: string | null; twitter?: string | null; facebook?: string | null; website?: string | null };
}

export interface Product {
  _id: string;
  name: string;
  cost: number;
  stock: number;
  images?: string[];
  description?: string;
  category?: string | null;
}

/** Shape returned by /api/products/search (marketplace-wide). */
export interface MarketProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  stock: number;
  category: string;
  store: { name: string; username: string; logo: string; location?: string; currency?: string };
}

/** Shape returned by /api/stores/search. */
export interface MarketStore {
  id: string;
  name: string;
  username: string;
  logo: string;
  description: string;
  location?: string;
  currency?: string;
  country?: string;
  productCount: number;
}

export interface Paged<T> {
  success: boolean;
  results: T[];
  total: number;
  page: number;
  pages: number;
}

export interface SaleItem {
  itemId?: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface Sale {
  _id: string;
  customerName: string;
  phoneNumber?: string;
  email?: string;
  items: SaleItem[];
  totalAmount: number;
  createdAt?: string;
}

export interface CartItem {
  id: string;
  name: string;
  cost: number;
  stock: number;
  image?: string;
  quantity: number;
  storeUsername: string;
  storeName: string;
  currency: string;
}
