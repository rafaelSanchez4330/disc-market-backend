# Disc Market - Backend API

API REST para la plataforma de comercio electrónico de CDs y Vinilos convencionales y personalizados, desarrollada con **Node.js**, **Express**, **TypeScript**, **TypeORM** y **PostgreSQL**, con almacenamiento local de archivos mediante **Multer**.

---

## 🗄️ Modelo de Datos (12 Entidades)

Basado en la especificación técnica de la propuesta:
- `users`: Usuarios y administradores.
- `categories`: Clasificación de productos.
- `products`: Catálogo de CDs y vinilos regulares.
- `inventory`: Stock disponible y reservado.
- `custom_products`: Discos personalizados creados por clientes.
- `custom_tracks`: Pistas de audio subidas para los discos personalizados.
- `shopping_carts`: Carrito activo de compras.
- `cart_items`: Ítems del carrito (soporta productos regulares o personalizados).
- `orders`: Registro de órdenes de compra.
- `order_items`: Detalle de productos por orden.
- `payments`: Transacciones y métodos de pago.
- `shipping`: Envíos, métodos de entrega y número de guía.

---

## 📁 Estructura del Proyecto

```text
disc-market-backend/
├── src/
│   ├── config/             # Configuración de TypeORM DataSource y PostgreSQL
│   ├── controllers/        # Controladores (Auth, Products, CustomProducts, Cart, Orders)
│   ├── entities/           # 12 Entidades ORM con TypeORM
│   ├── middlewares/        # Multer (almacenamiento de audios y portadas)
│   ├── routes/             # Enrutamiento modular para Express
│   ├── seed/               # Script para poblar datos iniciales
│   ├── app.ts              # Configuración de Express, CORS y estáticos
│   └── index.ts            # Arranque del servidor y conexión a BD
├── uploads/                # Archivos locales subidos (portadas y tracks)
├── docker-compose.yml      # Base de datos PostgreSQL en contenedor
├── package.json            # Dependencias y scripts
├── tsconfig.json           # Configuración de TypeScript y decoradores
└── .env.example            # Plantilla de variables de entorno
```

---

## 🚀 Puesta en Marcha (Cuando tengas Node.js instalado)

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   Copia el archivo `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

3. **Iniciar base de datos PostgreSQL:**
   Si cuentas con Docker:
   ```bash
   docker compose up -d
   ```
   *(O configura tu instancia local de PostgreSQL con la base de datos `disc_market_db`).*

4. **Cargar datos de prueba (Seed):**
   ```bash
   npm run seed
   ```

5. **Iniciar en modo desarrollo:**
   ```bash
   npm run dev
   ```
   El servidor estará disponible en: `http://localhost:5000`  
   Endpoint de verificación: `http://localhost:5000/api/health`