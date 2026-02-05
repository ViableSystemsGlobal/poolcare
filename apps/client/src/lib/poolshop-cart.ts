/**
 * In-memory cart for PoolShop checkout. Set before navigating to /poolshop/checkout.
 */
export interface CartProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category: string;
  inStock: boolean;
  brand?: string;
}

export interface CartItem extends CartProduct {
  quantity: number;
}

let cart: CartItem[] = [];

export function getPoolShopCart(): CartItem[] {
  return [...cart];
}

export function setPoolShopCart(items: CartItem[]): void {
  cart = items ? [...items] : [];
}

export function clearPoolShopCart(): void {
  cart = [];
}
