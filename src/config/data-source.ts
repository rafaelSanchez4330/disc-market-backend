import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import {
  User,
  Category,
  Product,
  Inventory,
  CustomProduct,
  CustomTrack,
  ShoppingCart,
  CartItem,
  Order,
  OrderItem,
  Payment,
  Shipping,
} from '../entities';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'disc_market_db',
  synchronize: process.env.NODE_ENV !== 'production', // Crea y actualiza tablas automáticamente en modo desarrollo
  logging: process.env.NODE_ENV === 'development',
  entities: [
    User,
    Category,
    Product,
    Inventory,
    CustomProduct,
    CustomTrack,
    ShoppingCart,
    CartItem,
    Order,
    OrderItem,
    Payment,
    Shipping,
  ],
  migrations: [],
  subscribers: [],
});
