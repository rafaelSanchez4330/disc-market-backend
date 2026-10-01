import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './User';
import { CustomTrack } from './CustomTrack';
import { CartItem } from './CartItem';
import { OrderItem } from './OrderItem';

@Entity('custom_products')
export class CustomProduct {
  @PrimaryGeneratedColumn({ name: 'custom_product_id' })
  custom_product_id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User, (user) => user.custom_products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  format: string; // 'CD' o 'Vinyl'

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cover_image: string; // Ruta al archivo almacenado localmente con Multer

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  packaging_option: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @OneToMany(() => CustomTrack, (track) => track.custom_product, { cascade: true })
  custom_tracks: CustomTrack[];

  @OneToMany(() => CartItem, (item) => item.custom_product)
  cart_items: CartItem[];

  @OneToMany(() => OrderItem, (item) => item.custom_product)
  order_items: OrderItem[];
}
