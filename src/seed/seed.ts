import { AppDataSource } from '../config/data-source';
import { Product } from '../entities/Product';
import { Category } from '../entities/Category';
import { Inventory } from '../entities/Inventory';

export const runSeed = async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  console.log('🌱 Inicializando datos de muestra en la base de datos...');

  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);
  const inventoryRepo = AppDataSource.getRepository(Inventory);

  // Categorías iniciales (Buscar o crear para evitar duplicados)
  const categoryNames = ['Rock', 'Pop', 'Electronica', 'Latin'];
  const categoriesMap: Record<string, Category> = {};

  for (const name of categoryNames) {
    let cat = await categoryRepo.findOne({ where: { category_name: name } });
    if (!cat) {
      cat = categoryRepo.create({ category_name: name });
      cat = await categoryRepo.save(cat);
    }
    categoriesMap[name] = cat;
  }

  // Catálogo completo de productos de muestra
  const sampleProducts = [
    {
      name: 'Thriller',
      artist: 'Michael Jackson',
      format: 'Vinyl',
      price: 699.0,
      description: 'Edición en vinilo del álbum más vendido de la historia. Incluye los clásicos que definieron el pop de los 80.',
      image_url: 'https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=600&q=80',
      category: categoriesMap['Pop'],
      stock: 15,
    },
    {
      name: '30',
      artist: 'Adele',
      format: 'CD',
      price: 199.0,
      description: 'El cuarto álbum de Adele, íntimo y cinematográfico. Edición en CD con libreto especial.',
      image_url: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=600&q=80',
      category: categoriesMap['Pop'],
      stock: 25,
    },
    {
      name: 'Back in Black',
      artist: 'AC/DC',
      format: 'Vinyl',
      price: 749.0,
      description: 'Hard rock de referencia mundial. Vinilo pesado de 180g, arte clásico y riffs legendarios.',
      image_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
      category: categoriesMap['Rock'],
      stock: 3, // Low stock para probar estado en UI
    },
    {
      name: 'Abbey Road',
      artist: 'The Beatles',
      format: 'Vinyl',
      price: 799.0,
      description: 'El legendario álbum del cruce peatonal de Abbey Road. Remasterizado en vinilo estéreo.',
      image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
      category: categoriesMap['Rock'],
      stock: 10,
    },
    {
      name: 'The Dark Side of the Moon',
      artist: 'Pink Floyd',
      format: 'Vinyl',
      price: 829.0,
      description: 'Prisma, psicodelia y rock progresivo. Edición especial en vinilo para audiófilos.',
      image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
      category: categoriesMap['Rock'],
      stock: 8,
    },
    {
      name: 'Un Verano Sin Ti',
      artist: 'Bad Bunny',
      format: 'CD',
      price: 249.0,
      description: 'El verano eterno en CD. Éxitos globales con ritmos caribeños y colaboraciones estelares.',
      image_url: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
      category: categoriesMap['Latin'],
      stock: 18,
    },
    {
      name: 'Random Access Memories',
      artist: 'Daft Punk',
      format: 'Vinyl',
      price: 899.0,
      description: 'Doble vinilo gatefold de una de las mayores obras de la música electrónica moderna.',
      image_url: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=600&q=80',
      category: categoriesMap['Electronica'],
      stock: 4, // Low stock
    },
    {
      name: 'Sour',
      artist: 'Olivia Rodrigo',
      format: 'CD',
      price: 229.0,
      description: 'Álbum debut en formato CD estándar: pop-punk, baladas emotivas y grandes hits.',
      image_url: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?auto=format&fit=crop&w=600&q=80',
      category: categoriesMap['Pop'],
      stock: 20,
    },
  ];

  for (const item of sampleProducts) {
    let p = await productRepo.findOne({ where: { name: item.name } });

    if (!p) {
      p = productRepo.create({
        name: item.name,
        artist: item.artist,
        format: item.format,
        price: item.price,
        description: item.description,
        image_url: item.image_url,
        category: item.category,
      });
      p = await productRepo.save(p);

      const inv = inventoryRepo.create({
        product_id: p.product_id,
        quantity_available: item.stock,
        quantity_reserved: 0,
      });
      await inventoryRepo.save(inv);
    } else {
      // Actualizar datos de inventario e imagen si ya existía
      p.price = item.price;
      p.image_url = item.image_url;
      p.description = item.description;
      p.category = item.category;
      await productRepo.save(p);

      let inv = await inventoryRepo.findOne({ where: { product_id: p.product_id } });
      if (!inv) {
        inv = inventoryRepo.create({
          product_id: p.product_id,
          quantity_available: item.stock,
          quantity_reserved: 0,
        });
      } else {
        inv.quantity_available = item.stock;
      }
      await inventoryRepo.save(inv);
    }
  }

  console.log(`✅ Catálogo inicial sincronizado: ${sampleProducts.length} productos listos en PostgreSQL.`);
  await AppDataSource.destroy();
};

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('Error durante el seed:', err);
    process.exit(1);
  });
}
