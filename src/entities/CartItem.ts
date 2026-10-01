import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ShoppingCart } from './ShoppingCart';
import { Product } from './Product';
import { CustomProduct } from './CustomProduct';

@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn({ name: 'cart_item_id' })
  cart_item_id: number;

  @Column({ name: 'cart_id' })
  cart_id: number;

  @ManyToOne(() => ShoppingCart, (cart) => cart.cart_items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  shopping_cart: ShoppingCart;

  @Column({ name: 'product_id', nullable: true })
  product_id: number | null;

  @ManyToOne(() => Product, (product) => product.cart_items, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'custom_product_id', nullable: true })
  custom_product_id: number | null;

  @ManyToOne(() => CustomProduct, (custom) => custom.cart_items, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'custom_product_id' })
  custom_product: CustomProduct | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unit_price: number;
}
