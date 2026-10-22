import bcrypt from 'bcrypt';
import { AppDataSource } from '../config/data-source';
import { Product } from '../entities/Product';
import { Category } from '../entities/Category';
import { Inventory } from '../entities/Inventory';
import { User } from '../entities/User';
import { UserPreference } from '../entities/UserPreference';
import { Order } from '../entities/Order';
import { OrderItem } from '../entities/OrderItem';
import { Payment } from '../entities/Payment';
import { Shipping } from '../entities/Shipping';

export const runSeed = async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  console.log('🌱 Inicializando datos de muestra en la base de datos...');

  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);
  const inventoryRepo = AppDataSource.getRepository(Inventory);
  const userRepo = AppDataSource.getRepository(User);
  const prefRepo = AppDataSource.getRepository(UserPreference);
  const orderRepo = AppDataSource.getRepository(Order);
  const orderItemRepo = AppDataSource.getRepository(OrderItem);
  const paymentRepo = AppDataSource.getRepository(Payment);
  const shippingRepo = AppDataSource.getRepository(Shipping);

  // =========================================================================
  // 1. CATEGORÍAS INICIALES
  // =========================================================================
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

  // =========================================================================
  // 2. CATÁLOGO DE PRODUCTOS E INVENTARIO
  // =========================================================================
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

  const savedProductsMap: Record<string, Product> = {};

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
      p.price = item.price;
      p.image_url = item.image_url;
      p.description = item.description;
      p.category = item.category;
      p = await productRepo.save(p);

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

    savedProductsMap[item.name] = p;
  }

  console.log(`✅ Catálogo inicial sincronizado: ${sampleProducts.length} productos listos en PostgreSQL.`);

  // =========================================================================
  // 3. USUARIOS DE PRUEBA Y PREFERENCIAS
  // =========================================================================
  console.log('👤 Creando/sincronizando usuarios demo...');

  // 3.1 Usuario Administrador
  const adminEmail = 'admin@discmarket.com';
  let adminUser = await userRepo.findOne({ where: { email: adminEmail } });
  if (!adminUser) {
    const adminPasswordHash = await bcrypt.hash('Admin123!', 10);
    adminUser = userRepo.create({
      name: 'Administrador Disc Market',
      email: adminEmail,
      password_hash: adminPasswordHash,
      role: 'admin',
    });
    adminUser = await userRepo.save(adminUser);
    console.log('  👑 Usuario administrador creado: admin@discmarket.com / Admin123!');
  }

  let adminPref = await prefRepo.findOne({ where: { user_id: adminUser.user_id } });
  if (!adminPref) {
    adminPref = prefRepo.create({
      user_id: adminUser.user_id,
      preferred_format: 'ALL',
      theme: 'dark',
      avatar_url: '📻',
      default_country: 'México',
    });
    await prefRepo.save(adminPref);
  }

  // 3.2 Usuario Cliente Demo
  const demoEmail = 'demo@discmarket.com';
  let demoUser = await userRepo.findOne({ where: { email: demoEmail } });
  if (!demoUser) {
    const demoPasswordHash = await bcrypt.hash('Demo123!', 10);
    demoUser = userRepo.create({
      name: 'Rafael Demo',
      email: demoEmail,
      password_hash: demoPasswordHash,
      role: 'customer',
    });
    demoUser = await userRepo.save(demoUser);
    console.log('  🎧 Usuario demo cliente creado: demo@discmarket.com / Demo123!');
  }

  // Preferencias precargadas para el cliente demo
  let demoPref = await prefRepo.findOne({ where: { user_id: demoUser.user_id } });
  if (!demoPref) {
    demoPref = prefRepo.create({
      user_id: demoUser.user_id,
      phone: '+52 55 1234 5678',
      preferred_format: 'VINYL',
      theme: 'dark',
      notify_order_status: true,
      notify_newsletter: true,
      default_address_line1: 'Av. Insurgentes Sur 1450, Depto 4B',
      default_address_line2: 'Col. Actipan, entre Río Mixcoac y Parroquia',
      default_city: 'Benito Juárez, CDMX',
      default_state: 'Ciudad de México',
      default_postal_code: '03230',
      default_country: 'México',
      avatar_url: '🎧',
    });
    await prefRepo.save(demoPref);
    console.log('  📍 Dirección y preferencias demo registradas para demo@discmarket.com');
  }

  // =========================================================================
  // 4. HISTORIAL DE PEDIDOS DE PRUEBA PARA demo@discmarket.com
  // =========================================================================
  const existingOrders = await orderRepo.find({ where: { user_id: demoUser.user_id } });

  if (existingOrders.length === 0) {
    console.log('📦 Generando órdenes de prueba en el historial del cliente demo...');

    // Pedido 1: Entregado (Daft Punk + Michael Jackson)
    const order1 = orderRepo.create({
      user_id: demoUser.user_id,
      total_amount: 1598.0,
      order_status: 'delivered',
      payment_status: 'paid',
    });
    const savedOrder1 = await orderRepo.save(order1);

    const daftPunkProduct = savedProductsMap['Random Access Memories'];
    const thrillerProduct = savedProductsMap['Thriller'];

    if (daftPunkProduct && thrillerProduct) {
      await orderItemRepo.save([
        orderItemRepo.create({
          order_id: savedOrder1.order_id,
          product_id: daftPunkProduct.product_id,
          quantity: 1,
          unit_price: daftPunkProduct.price,
        }),
        orderItemRepo.create({
          order_id: savedOrder1.order_id,
          product_id: thrillerProduct.product_id,
          quantity: 1,
          unit_price: thrillerProduct.price,
        }),
      ]);
    }

    await paymentRepo.save(
      paymentRepo.create({
        order_id: savedOrder1.order_id,
        payment_method: 'credit_card',
        payment_status: 'completed',
        amount: 1598.0,
      })
    );

    await shippingRepo.save(
      shippingRepo.create({
        order_id: savedOrder1.order_id,
        shipping_method: 'Envío Express Disc Market',
        tracking_number: 'TRK-892145-4120',
        shipping_status: 'delivered',
      })
    );

    // Pedido 2: En preparación (Abbey Road)
    const order2 = orderRepo.create({
      user_id: demoUser.user_id,
      total_amount: 799.0,
      order_status: 'processing',
      payment_status: 'paid',
    });
    const savedOrder2 = await orderRepo.save(order2);

    const abbeyRoadProduct = savedProductsMap['Abbey Road'];
    if (abbeyRoadProduct) {
      await orderItemRepo.save(
        orderItemRepo.create({
          order_id: savedOrder2.order_id,
          product_id: abbeyRoadProduct.product_id,
          quantity: 1,
          unit_price: abbeyRoadProduct.price,
        })
      );
    }

    await paymentRepo.save(
      paymentRepo.create({
        order_id: savedOrder2.order_id,
        payment_method: 'credit_card',
        payment_status: 'completed',
        amount: 799.0,
      })
    );

    await shippingRepo.save(
      shippingRepo.create({
        order_id: savedOrder2.order_id,
        shipping_method: 'Envío Estándar',
        tracking_number: 'TRK-904321-7845',
        shipping_status: 'in_preparation',
      })
    );

    console.log('  ✅ 2 órdenes de prueba asociadas a demo@discmarket.com');
  }

  console.log('✨ Seed completado con éxito.');
  await AppDataSource.destroy();
};

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('Error durante el seed:', err);
    process.exit(1);
  });
}
