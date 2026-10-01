import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './Order';
import { Product } from './Product';
import { CustomProduct } from './CustomProduct';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn({ name: 'order_item_id' })
  order_item_id: number;

  @Column({ name: 'order_id' })
  order_id: number;

  @ManyToOne(() => Order, (order) => order.order_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'product_id', nullable: true })
  product_id: number | null;

  @ManyToOne(() => Product, (product) => product.order_items, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'custom_product_id', nullable: true })
  custom_product_id: number | null;

  @ManyToOne(() => CustomProduct, (custom) => custom.order_items, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'custom_product_id' })
  custom_product: CustomProduct | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unit_price: number;
}
