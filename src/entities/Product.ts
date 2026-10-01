import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Category } from './Category';
import { Inventory } from './Inventory';
import { CartItem } from './CartItem';
import { OrderItem } from './OrderItem';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn({ name: 'product_id' })
  product_id: number;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 200 })
  artist: string;

  @Column({ type: 'varchar', length: 50 })
  format: string; // Ej. 'CD' o 'Vinyl'

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image_url: string;

  @ManyToOne(() => Category, (category) => category.products, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToOne(() => Inventory, (inventory) => inventory.product)
  inventory: Inventory;

  @OneToMany(() => CartItem, (item) => item.product)
  cart_items: CartItem[];

  @OneToMany(() => OrderItem, (item) => item.product)
  order_items: OrderItem[];
}
