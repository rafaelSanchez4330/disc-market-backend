import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from './Order';

@Entity('shipping')
export class Shipping {
  @PrimaryGeneratedColumn({ name: 'shipping_id' })
  shipping_id: number;

  @Column({ name: 'order_id' })
  order_id: number;

  @OneToOne(() => Order, (order) => order.shipping, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'varchar', length: 100 })
  shipping_method: string; // Ej. 'Standard', 'Express'

  @Column({ type: 'varchar', length: 100, nullable: true })
  tracking_number: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  shipping_status: string; // 'pending', 'in_transit', 'delivered'

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
