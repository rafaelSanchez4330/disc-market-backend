import { AppDataSource } from '../config/data-source';
import { Product } from '../entities/Product';
import { Category } from '../entities/Category';
import { Inventory } from '../entities/Inventory';

export const runSeed = async () => {
  await AppDataSource.initialize();
  console.log('🌱 Inicializando datos de muestra en la base de datos...');

  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);
  const inventoryRepo = AppDataSource.getRepository(Inventory);

  // Categorías iniciales
  const rock = categoryRepo.create({ category_name: 'Rock' });
  const pop = categoryRepo.create({ category_name: 'Pop' });
  await categoryRepo.save([rock, pop]);

  // Productos de muestra basados en la propuesta (pág. 7-8 del PDF)
  const sampleProducts = [
    {
      name: 'Thriller',
      artist: 'Michael Jackson',
      format: 'Vinyl',
      price: 699.00,
      description: 'Edición especial en vinilo del legendario álbum Thriller.',
      image_url: 'https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=600&q=80',
      category: pop,
      stock: 15,
    },
    {
      name: '30',
      artist: 'Adele',
      format: 'CD',
      price: 199.00,
      description: 'Álbum de estudio en formato CD estándar.',
      image_url: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=600&q=80',
      category: pop,
      stock: 25,
    },
    {
      name: 'Back in Black',
      artist: 'AC/DC',
      format: 'Vinyl',
      price: 749.00,
      description: 'Álbum clásico de hard rock en vinilo de 180 gramos.',
      image_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
      category: rock,
      stock: 3, // Low Stock como en el PDF
    },
  ];

  for (const item of sampleProducts) {
    const p = productRepo.create({
      name: item.name,
      artist: item.artist,
      format: item.format,
      price: item.price,
      description: item.description,
      image_url: item.image_url,
      category: item.category,
    });
    const saved = await productRepo.save(p);

    const inv = inventoryRepo.create({
      product_id: saved.product_id,
      quantity_available: item.stock,
      quantity_reserved: 0,
    });
    await inventoryRepo.save(inv);
  }

  console.log('✅ Datos iniciales cargados correctamente.');
  await AppDataSource.destroy();
};

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('Error durante el seed:', err);
    process.exit(1);
  });
}
