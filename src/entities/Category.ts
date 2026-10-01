import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { Product } from './Product';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn({ name: 'category_id' })
  category_id: number;

  @Column({ type: 'varchar', length: 100 })
  category_name: string;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
