import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ShoppingCart } from './ShoppingCart';
import { CustomProduct } from './CustomProduct';
import { Order } from './Order';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ name: 'user_id' })
  user_id: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  password_hash: string;

  @Column({ type: 'varchar', length: 50, default: 'customer' })
  role: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @OneToMany(() => ShoppingCart, (cart) => cart.user)
  shopping_carts: ShoppingCart[];

  @OneToMany(() => CustomProduct, (custom) => custom.user)
  custom_products: CustomProduct[];

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];
}
