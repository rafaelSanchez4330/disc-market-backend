import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './User';

@Entity('user_otps')
export class UserOtp {
  @PrimaryGeneratedColumn({ name: 'otp_id' })
  otp_id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  code_hash: string;

  @Column({ type: 'varchar', length: 20, default: 'login' })
  purpose: string; // 'login', 'verify_email', 'sensitive_action'

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', default: 3 })
  max_attempts: number;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'boolean', default: false })
  used: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
