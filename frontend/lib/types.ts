export interface Store {
  _id: string;
  username: string;
  businessName?: string;
  logo?: string;
  currency?: string;
  country?: string;
  description?: string;
  whatsappNumber?: string;
  paymentInstructions?: string;
  social?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    website?: string;
  };
}

export interface Product {
  _id: string;
  name: string;
  cost: number;
  stock: number;
  images?: string[];
  description?: string;
  category?: string;
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
}
