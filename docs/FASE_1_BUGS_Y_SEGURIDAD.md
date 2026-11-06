# 🛡️ Documentación Técnica: Fase 1 - Estabilización, Seguridad y Corrección de Bugs Críticos
## Proyecto: Disc Market (Backend & Frontend)
> **Rama de trabajo:** `fix/general-bugs`  
> **Fecha:** Noviembre 2026  
> **Estado:** ✅ Completado y Verificado  
> **Referencia:** [`PENDING_FEATURES.md`](../../disc-market-frontend/PENDING_FEATURES.md) (Módulo 5 & Módulo 1)

---

## 1. 🎯 Funcionalidad y Alcance de la Fase 1

La **Fase 1** se enfoca en resolver las fallas críticas de seguridad, resiliencia y manejo de archivos identificadas en el sistema. Los objetivos clave implementados son:

1. **Resiliencia en el arranque de la base de datos (Bug 5.5):** Evitar caídas inmediatas de la API cuando PostgreSQL (ej. en Docker) tarda en estar listo.
2. **Eliminación de suplantación de identidad y autenticación estricta (Bug 5.1):** Proteger todos los endpoints sensibles de compras, carritos, productos y pagos con JWT obligatorio, eliminando fallbacks inseguros que asignaban usuarios arbitrarios de la BD.
3. **Control de Acceso Basado en Roles - RBAC (Módulo 1):** Restringir la creación de productos de catálogo exclusivamente a usuarios con rol `admin` o `inventory_manager`.
4. **Protección y aislamiento de recursos propios:** Asegurar que cada usuario solo pueda consultar o alterar sus propias órdenes y carritos de compra.
5. **Rollback de archivos huérfanos en Multer (Bug 5.3):** Eliminar del disco de forma automática las imágenes o audios subidos cuando ocurre un error en la base de datos o en la validación.
6. **Sanitización e inspección de cabeceras binarias / Magic Bytes (Bug 5.6):** Validar la firma real del contenido de cada archivo en disco, impidiendo la subida de ejecutables o scripts maliciosos con extensiones falsificadas.

---

## 2. 📁 Lista de Archivos Creados y Modificados

| Archivo | Estado | Propósito Principal |
| :--- | :---: | :--- |
| [`src/index.ts`](../src/index.ts) | **Modificado** | Conexión con reintentos y retroceso exponencial (*exponential backoff*) hacia PostgreSQL. |
| [`src/utils/fileCleanup.ts`](../src/utils/fileCleanup.ts) | **Creado** | Utilidades `safelyDeleteFile` y `safelyDeleteFiles` para borrado seguro de archivos en disco. |
| [`src/middlewares/roles.middleware.ts`](../src/middlewares/roles.middleware.ts) | **Creado** | Middleware `requireRole(['admin', 'inventory_manager'])` para control de acceso RBAC. |
| [`src/middlewares/upload.middleware.ts`](../src/middlewares/upload.middleware.ts) | **Modificado** | Inspección de Magic Bytes binarios (`isValidImageMagicBytes`, `isValidAudioMagicBytes`) y middlewares de validación. |
| [`src/routes/product.routes.ts`](../src/routes/product.routes.ts) | **Modificado** | Protección de `POST /api/products` con `authenticateToken` y `requireRole`. |
| [`src/routes/customProduct.routes.ts`](../src/routes/customProduct.routes.ts) | **Modificado** | Protección obligatoria con `authenticateToken` y encadenamiento de validación de Magic Bytes. |
| [`src/controllers/customProduct.controller.ts`](../src/controllers/customProduct.controller.ts) | **Modificado** | Validación estricta de `req.user.user_id`, verificación de pertenencia al agregar pistas y rollback de archivos huérfanos ante excepciones. |
| [`src/routes/order.routes.ts`](../src/routes/order.routes.ts) | **Modificado** | Reemplazo de `optionalAuthenticateToken` por `authenticateToken` en `/checkout` y `/:id`. |
| [`src/controllers/order.controller.ts`](../src/controllers/order.controller.ts) | **Modificado** | Eliminación de fallback a `userRepo.findOne()`, uso estricto del ID del token JWT y validación de propiedad en `getOrderById`. |
| [`src/routes/cart.routes.ts`](../src/routes/cart.routes.ts) | **Modificado** | Reemplazo de `optionalAuthenticateToken` por `authenticateToken` en todas las rutas del carrito. |
| [`src/controllers/cart.controller.ts`](../src/controllers/cart.controller.ts) | **Modificado** | Validación estricta de identidad en `getUserCart`, `addToCart`, `updateCartItem`, `removeFromCart` y `clearCart`. Verificación de pertenencia del ítem/carrito. |
| [`src/routes/payment.routes.ts`](../src/routes/payment.routes.ts) | **Modificado** | Protección con `authenticateToken` para `/create-intent` y `/confirm`. |
| [`src/controllers/payment.controller.ts`](../src/controllers/payment.controller.ts) | **Modificado** | Extracción segura de `userId` del token en `createPaymentIntent` y validación de coincidencia de usuario en `confirmPayment`. |
| [`disc-market-frontend/PENDING_FEATURES.md`](../../disc-market-frontend/PENDING_FEATURES.md) | **Modificado** | Actualización de estatus de los bugs 5.1, 5.3, 5.5, 5.6 y cronograma de entrega. |

---

## 3. 🔍 Detalle Técnico de los Cambios Realizados

### 3.1. Reintentos con Retroceso Exponencial en PostgreSQL (Bug 5.5)
* **Archivo:** [`src/index.ts`](../src/index.ts)
* **Problema previo:** Si el contenedor o servicio de PostgreSQL no estaba listo al arrancar la API con `npm run dev` o en Docker, `AppDataSource.initialize()` fallaba de inmediato provocando `process.exit(1)`.
* **Cambio implementado:**
  Se introdujo `connectWithRetry` con un máximo de 5 intentos y delay progresivo (2s, 4s, 8s, 16s...):
  ```typescript
  const MAX_DB_RETRIES = 5;
  const INITIAL_RETRY_DELAY_MS = 2000;

  const connectWithRetry = async (retries = MAX_DB_RETRIES, delayMs = INITIAL_RETRY_DELAY_MS): Promise<void> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 [Intento ${attempt}/${retries}] Conectando a la base de datos PostgreSQL...`);
        await AppDataSource.initialize();
        console.log('✅ Base de datos PostgreSQL conectada con éxito y entidades sincronizadas.');
        return;
      } catch (error: any) {
        console.error(`⚠️ Error en intento ${attempt}/${retries} de conexión a PostgreSQL:`, error?.message || error);
        if (attempt === retries) {
          throw new Error(`Fallo definitivo al conectar con la base de datos tras ${retries} intentos: ${error?.message || error}`);
        }
        console.log(`⏳ Reintentando conexión en ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2; // Retroceso exponencial
      }
    }
  };
  ```

---

### 3.2. Módulo de Limpieza de Archivos Huérfanos (Bug 5.3)
* **Archivo:** [`src/utils/fileCleanup.ts`](../src/utils/fileCleanup.ts) *(Nuevo)*
* **Problema previo:** Multer almacena los archivos en disco (`uploads/covers/` o `uploads/tracks/`) en el momento en que se procesa la cabecera multipart, antes de que el controlador guarde en la BD. Si la base de datos arrojaba un error de validación o clave foránea, los archivos quedaban huérfanos en disco consumiendo almacenamiento indefinidamente.
* **Cambio implementado:**
  Se crearon funciones de borrado seguro con tolerancia a fallos:
  ```typescript
  export const safelyDeleteFile = async (filePath?: string | null): Promise<void> => {
    if (!filePath) return;
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`[fileCleanup] Archivo huérfano eliminado: ${filePath}`);
      }
    } catch (err: any) {
      console.warn(`[fileCleanup] Error al eliminar archivo huérfano ${filePath}:`, err?.message || err);
    }
  };

  export const safelyDeleteFiles = async (
    files?: Array<Express.Multer.File | { path: string }> | null
  ): Promise<void> => {
    if (!files || !Array.isArray(files) || files.length === 0) return;
    await Promise.all(files.map((file) => safelyDeleteFile(file.path)));
  };
  ```

---

### 3.3. Control de Acceso RBAC y Middleware de Roles (Módulo 1 & Bug 5.1)
* **Archivo:** [`src/middlewares/roles.middleware.ts`](../src/middlewares/roles.middleware.ts) *(Nuevo)*
* **Problema previo:** No existía un mecanismo para validar si un usuario autenticado poseía los privilegios requeridos para ejecutar operaciones privilegiadas.
* **Cambio implementado:**
  Función de orden superior que comprueba el rol contenido en el token JWT verificado:
  ```typescript
  export const requireRole = (allowedRoles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({ message: 'Acceso no autenticado: se requiere token válido' });
        return;
      }
      if (!allowedRoles.includes(req.user.role)) {
        res.status(403).json({
          message: 'Acceso denegado: no posees los privilegios requeridos para esta operación',
          requiredRoles: allowedRoles,
          userRole: req.user.role,
        });
        return;
      }
      next();
    };
  };
  ```
* **Aplicación en Catálogo:** [`src/routes/product.routes.ts`](../src/routes/product.routes.ts) ahora restringe el alta de productos:
  ```typescript
  router.post('/', authenticateToken, requireRole(['admin', 'inventory_manager']), createProduct);
  ```

---

### 3.4. Inspección Binaria de Archivos / Magic Bytes (Bug 5.6)
* **Archivo:** [`src/middlewares/upload.middleware.ts`](../src/middlewares/upload.middleware.ts)
* **Problema previo:** Multer evaluaba únicamente la extensión del archivo y el header `mimetype` enviado por el navegador cliente, permitiendo a un atacante renombrar un archivo ejecutable a `.png` o `.mp3` para burlar el filtro.
* **Cambio implementado:**
  1. **`isValidImageMagicBytes`:** Abre el archivo mediante `fs.promises.open`, lee los primeros 16 bytes y valida:
     * **JPEG:** `FF D8 FF`
     * **PNG:** `89 50 4E 47 0D 0A 1A 0A`
     * **WEBP:** `RIFF` (bytes 0-3) + `WEBP` (bytes 8-11)
  2. **`isValidAudioMagicBytes`:** Valida las cabeceras binarias de:
     * **MP3:** Marcador `ID3` o bits de sincronización de cuadro MPEG `FF` + máscara `0xE0`
     * **WAV:** `RIFF` (bytes 0-3) + `WAVE` (bytes 8-11)
     * **OGG:** `OggS`
     * **FLAC:** `fLaC`
     * **M4A / MP4:** Átomo `ftyp` en offset 4
  3. **Middlewares `validateImageMagicBytes` y `validateAudioMagicBytes`:** Si la inspección falla, borran automáticamente el archivo de disco con `safelyDeleteFile` / `safelyDeleteFiles` y responden con `400 Bad Request`.

---

### 3.5. Corrección de Endpoints Críticos y Eliminación de Fallbacks (Bug 5.1 & Bug 5.3)

#### Productos Personalizados
* **Archivos:** [`src/routes/customProduct.routes.ts`](../src/routes/customProduct.routes.ts) y [`src/controllers/customProduct.controller.ts`](../src/controllers/customProduct.controller.ts)
* **Cambios:**
  * Las rutas `POST /api/custom-products` y `POST /api/custom-products/:id/tracks` ahora requieren `authenticateToken`.
  * Se vinculó `validateImageMagicBytes` y `validateAudioMagicBytes`.
  * Se eliminó el código:
    ```typescript
    // ELIMINADO: Fallback inseguro
    const defaultUser = await userRepo.findOne({ order: { user_id: 'ASC' } });
    userId = defaultUser.user_id;
    ```
  * En su lugar, se valida estrictamente `req.user.user_id`.
  * En `addTracksToCustomProduct` se verifica que el disco personalizado pertenezca al usuario autenticado (o rol `admin`).
  * En caso de excepción, se ejecuta el rollback `await safelyDeleteFile(req.file?.path)` y `await safelyDeleteFiles(files)`.

#### Órdenes y Checkout
* **Archivos:** [`src/routes/order.routes.ts`](../src/routes/order.routes.ts) y [`src/controllers/order.controller.ts`](../src/controllers/order.controller.ts)
* **Cambios:**
  * `POST /api/orders/checkout` y `GET /api/orders/:id` ahora usan `authenticateToken`.
  * Se eliminó el fallback que buscaba el primer usuario de la base de datos si no había sesión.
  * En `getOrderById`, se incorporó validación de autorización: un usuario solo puede consultar sus propias órdenes a menos que cuente con rol de `admin`.

#### Carrito de Compras
* **Archivos:** [`src/routes/cart.routes.ts`](../src/routes/cart.routes.ts) y [`src/controllers/cart.controller.ts`](../src/controllers/cart.controller.ts)
* **Cambios:**
  * Todas las operaciones de carrito remoto (`/cart/user/:user_id`, `/cart/items`, `/cart/items/:item_id`, `/cart/user/:user_id/clear`) exigen `authenticateToken`.
  * En `getUserCart` y `clearCart` se verifica que el usuario autenticado coincida con el `user_id` de la ruta.
  * En `updateCartItem` y `removeFromCart`, se carga la relación con el carrito del usuario (`relations: ['cart']`) y se rechaza con `403 Forbidden` si el ítem pertenece al carrito de otro usuario.

#### Pagos con Stripe
* **Archivos:** [`src/routes/payment.routes.ts`](../src/routes/payment.routes.ts) y [`src/controllers/payment.controller.ts`](../src/controllers/payment.controller.ts)
* **Cambios:**
  * `POST /api/payments/create-intent` y `POST /api/payments/confirm` requieren `authenticateToken`.
  * `createPaymentIntent` toma obligatoriamente `req.user.user_id`, eliminando el fallback a `userRepo.findOne()`.
  * `confirmPayment` valida que los metadatos del `paymentIntent` de Stripe (`metadata.userId`) correspondan con el usuario autenticado (o `admin`).

---

## 4. 📊 Matriz de Cumplimiento de la Fase 1

| Código de Bug / Requisito | Estado | Mecanismo de Verificación |
| :--- | :---: | :--- |
| **5.5 - Pool y Reintentos TypeORM** | ✅ Resuelto | Función `connectWithRetry` con backoff exponencial en `index.ts`. |
| **5.1 - Seguridad y Autenticación** | ✅ Resuelto | `authenticateToken` obligatorio, inyección de `req.user.user_id`, validación de propiedad en carritos/órdenes. |
| **5.3 - Archivos Huérfanos en Multer** | ✅ Resuelto | `safelyDeleteFile` / `safelyDeleteFiles` en bloques de error de `customProduct.controller.ts`. |
| **5.6 - Validación de Magic Bytes** | ✅ Resuelto | Inspección binaria de imágenes y audios en `upload.middleware.ts` con rechazo y eliminación automática. |
| **Módulo 1 - RBAC Base** | ✅ Resuelto | Middleware `roles.middleware.ts` y restricción de `POST /api/products` a `admin` e `inventory_manager`. |

---

## 5. 🔜 Siguiente Etapa: Fase 2

Con la plataforma estabilizada y blindada en seguridad, la siguiente fase contempla:
* **Bug 5.2:** Endpoint de tarifas dinámicas `GET /api/custom-products/pricing` y desacoplamiento de precios hardcodeados en `CreatePage.tsx`.
* **Bug 5.4:** Cola de sincronización con reintentos automáticos y banner visual en el carrito dual (`CartContext.tsx` y `CartPage.tsx`).

