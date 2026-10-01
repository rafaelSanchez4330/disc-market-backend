import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { CartItem } from './CartItem';

@Entity('shopping_carts')
export class ShoppingCart {
  @PrimaryGeneratedColumn({ name: 'cart_id' })
  cart_id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User, (user) => user.shopping_carts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @OneToMany(() => CartItem, (item) => item.shopping_cart, { cascade: true })
  cart_items: CartItem[];
}
