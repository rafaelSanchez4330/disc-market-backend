import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { Product } from './Product';

@Entity('inventory')
@Check('CHK_inventory_nonnegative', '"quantity_available" >= 0 AND "quantity_reserved" >= 0')
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
