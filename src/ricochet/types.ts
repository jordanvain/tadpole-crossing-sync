export interface RicochetSale {
  id: string;
  date: string;           // ISO date string
  transactionNumber: string;
  items: RicochetSaleItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod: string;
}

export interface RicochetSaleItem {
  itemId: string;
  description: string;
  consignerId: string;
  consignerName: string;
  salePrice: number;
  consignerPayout: number;
  storeFee: number;
  category: string;
}

export interface RicochetConsignerPayout {
  id: string;
  date: string;
  consignerId: string;
  consignerName: string;
  amount: number;
  checkNumber?: string;
  items: RicochetSaleItem[];
}

export interface RicochetInventoryItem {
  itemId: string;
  description: string;
  consignerId: string;
  consignerName: string;
  listPrice: number;
  dateAdded: string;
  category: string;
  status: 'active' | 'sold' | 'returned' | 'expired';
}

export interface RicochetDateRange {
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
}
