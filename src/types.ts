export type Role = 'customer' | 'operator' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  avatar_url?: string;
  firebase_uid?: string;
  created_at?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  name: string;
  category_id: string;
  category_name?: string;
  category_slug?: string;
  description: string;
  price: number;
  discount_percent: number;
  rating: number;
  rating_count: number;
  image_url: string;
  warehouse_rack_location: string;
  weight_grams: number;
  stock_quantity: number;
  low_stock_threshold?: number;
}

export interface Review {
  id: string;
  product_id: string;
  customer_id: string;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface CartItem extends Product {
  cart_item_id: string;
  quantity: number;
}

export interface Address {
  id: string;
  customer_id: string;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  is_default: number;
}

export type OrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PICKING'
  | 'PICKED'
  | 'PACKING'
  | 'PACKED'
  | 'ON_CONVEYOR'
  | 'DETECTED'
  | 'SORTING'
  | 'SORTED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURN_APPROVED'
  | 'RETURN_REJECTED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface Order {
  id: string;
  customer_id: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  address_id: string;
  destination_city: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  assigned_bin?: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
  primary_item_name?: string;
  primary_item_image?: string;
  recipient_name?: string;
  recipient_phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  invoice_id?: string;
  primary_rack_location?: string;
  picking_status?: string;
  packing_status?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
  warehouse_rack_location?: string;
  weight_grams?: number;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: OrderStatus;
  note?: string;
  changed_at: string;
}

export interface Invoice {
  id: string;
  order_id: string;
  gstin: string;
  issued_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  destination_city: string;
  total_amount: number;
  subtotal: number;
  gst_amount: number;
  payment_status: PaymentStatus;
  payment_method: string;
  order_date: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface PickingTask {
  id: string;
  order_id: string;
  status: 'PENDING' | 'PICKING' | 'PICKED';
  assigned_operator_id?: string;
  picked_at?: string;
}

export interface PackingTask {
  id: string;
  order_id: string;
  status: 'PENDING' | 'PACKING' | 'PACKED';
  weight_grams?: number;
  dimensions?: string;
  packed_at?: string;
}

export interface Destination {
  id: string;
  city: string;
  bin_label: string;
  servo_deflection_angle?: number;
  pin_mapping?: number;
  countToday?: number;
}

export interface SortingLog {
  id: string;
  order_id: string;
  detected_at: string;
  destination_city: string;
  assigned_bin: string;
  sort_result: 'SUCCESS' | 'FAILED' | 'MANUAL_OVERRIDE';
  duration_ms: number;
}

export interface MachineState {
  esp32: 'ONLINE' | 'OFFLINE';
  wifi: 'CONNECTED' | 'DISCONNECTED';
  sensor: 'ACTIVE' | 'IDLE';
  conveyor: 'RUNNING' | 'STOPPED' | 'PAUSED' | 'EMERGENCY_STOPPED';
  robot: 'READY' | 'BUSY' | 'IDLE' | 'FAULT';
  motorRpm: number;
  activeOrderId: string | null;
  activeOrderCity: string | null;
  activeOrderBin: string | null;
  cameraFps: number;
  cameraResolution: string;
}

export interface AlertItem {
  id: string;
  type: 'LOW_STOCK' | 'MACHINE_OFFLINE' | 'SORT_FAILED';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  resolved: number;
  created_at: string;
}

export interface ExpenseItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
}

export interface WarehouseQueue {
  newOrders: Order[];
  picking: Order[];
  packing: Order[];
  ready: Order[];
  conveyor: Order[];
  dispatched: Order[];
}

export interface DashboardData {
  kpis: {
    totalOrders: number;
    totalOrdersDelta: string;
    totalRevenue: number;
    totalRevenueDelta: string;
    totalCustomers: number;
    totalCustomersDelta: string;
    pendingPayments: number;
    totalInventoryUnits: number;
    deliveredCount: number;
  };
  revenueByDay: { date: string; revenue: number; orders: number }[];
  statusCounts: { status: string; count: number }[];
  topProducts: {
    id: string;
    name: string;
    price: number;
    image_url: string;
    units_sold: number;
    total_sales: number;
    stock_quantity: number;
  }[];
  warehouseMetrics: {
    totalSorts: number;
    sortSuccessRate: number;
    avgSortTimeMs: number;
    machineUptime: string;
  };
}
