import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';

@Entity('user_preferences')
export class UserPreference {
  @PrimaryGeneratedColumn({ name: 'preference_id' })
  preference_id: number;

  @Column({ name: 'user_id', unique: true })
  user_id: number;

  @OneToOne(() => User, (user) => user.preferences, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 10, default: 'ALL' })
  preferred_format: string; // 'VINYL', 'CD', 'ALL'

  @Column({ type: 'varchar', length: 20, default: 'dark' })
  theme: string; // 'dark', 'light', 'high-contrast'

  @Column({ type: 'boolean', default: true })
  notify_order_status: boolean;

  @Column({ type: 'boolean', default: false })
  notify_newsletter: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  default_address_line1: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  default_address_line2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  default_city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  default_state: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  default_postal_code: string | null;

  @Column({ type: 'varchar', length: 100, default: 'México' })
  default_country: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatar_url: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
