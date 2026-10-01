import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Order } from './Order';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn({ name: 'payment_id' })
  payment_id: number;

  @Column({ name: 'order_id' })
  order_id: number;

  @OneToOne(() => Order, (order) => order.payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'varchar', length: 50 })
  payment_method: string; // 'credit_card', 'paypal', 'transfer', etc.

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  payment_status: string; // 'pending', 'completed', 'failed'

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
