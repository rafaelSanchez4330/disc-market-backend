import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './Product';

@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn({ name: 'inventory_id' })
  inventory_id: number;

  @Column({ name: 'product_id' })
  product_id: number;

  @OneToOne(() => Product, (product) => product.inventory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'int', default: 0 })
  quantity_available: number;

  @Column({ type: 'int', default: 0 })
  quantity_reserved: number;
}
