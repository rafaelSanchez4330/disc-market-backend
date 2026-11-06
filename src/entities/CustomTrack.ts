import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CustomProduct } from './CustomProduct';

@Entity('custom_tracks')
export class CustomTrack {
  @PrimaryGeneratedColumn({ name: 'track_id' })
  track_id: number;

  @Column({ name: 'custom_product_id' })
  custom_product_id: number;

  @ManyToOne(() => CustomProduct, (product) => product.custom_tracks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'custom_product_id' })
  custom_product: CustomProduct;

  @Column({ type: 'varchar', length: 200 })
  track_name: string;

  @Column({ type: 'varchar', length: 500 })
  file_path: string; // Ruta al archivo de audio almacenado localmente con Multer

  @Column({ type: 'int', default: 1 })
  track_order: number;

  @Column({ type: 'int', default: 0 })
  duration: number; // Duración en segundos

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  copyright_status: string; // 'VERIFIED' | 'PENDING' | 'FLAGGED'

  @Column({ type: 'varchar', length: 200, nullable: true })
  copyright_match_title: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  copyright_match_artist: string | null;

  @Column({ type: 'bigint', default: 0 })
  file_size_bytes: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  audio_fingerprint: string | null;
}
