import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { User } from './User';
import { ShoppingCart } from './ShoppingCart';
import { Order } from './Order';

export interface CheckoutLine {
  product_id: number | null;
  custom_product_id: number | null;
  stock_product_id: number;
  quantity: number;
  unit_price: number;
}

@Entity('checkout_reservations')
@Index('IDX_checkout_expiry', ['status', 'expires_at'])
@Index('UQ_checkout_active_cart', ['cart_id'], { unique: true, where: '"status" = \'reserved\'' })
export class CheckoutReservation {
  @PrimaryGeneratedColumn('uuid') reservation_id: string;
  @Column() user_id: number;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' }) user: User;
  @Column() cart_id: number;
  @ManyToOne(() => ShoppingCart, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cart_id' }) cart: ShoppingCart;
  @Column({ type: 'varchar', length: 20, default: 'reserved' }) status: string;
  @Column({ type: 'varchar', length: 150, unique: true, nullable: true }) stripe_intent_id: string | null;
  @Column({ type: 'jsonb' }) lines: CheckoutLine[];
  @Column({ type: 'int' }) amount_cents: number;
  @Column({ type: 'varchar', length: 100 }) shipping_method: string;
  @Column({ type: 'varchar', length: 500, default: '' }) shipping_address: string;
  @Column({ type: 'timestamptz' }) expires_at: Date;
  @CreateDateColumn() created_at: Date;
  @Column({ type: 'int', nullable: true, unique: true }) order_id: number | null;
  @ManyToOne(() => Order, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' }) order: Order | null;
}
