import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { OrderItem } from './OrderItem';
import { Payment } from './Payment';
import { Shipping } from './Shipping';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn({ name: 'order_id' })
  order_id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_amount: number;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  order_status: string; // 'pending', 'processing', 'shipped', 'delivered', 'cancelled'

  @Column({ type: 'varchar', length: 50, default: 'unpaid' })
  payment_status: string; // 'unpaid', 'paid', 'refunded'

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  order_items: OrderItem[];

  @OneToOne(() => Payment, (payment) => payment.order)
  payment: Payment;

  @OneToOne(() => Shipping, (shipping) => shipping.order)
  shipping: Shipping;
}
