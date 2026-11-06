# 🛒 Documentación Técnica: Fase 2 - Tarifas Dinámicas y Sincronización del Carrito Dual
## Proyecto: Disc Market (Backend & Frontend)
> **Rama de trabajo:** `fix/general-bugs`  
> **Fecha:** Noviembre 2026  
> **Estado:** ✅ Completado y Verificado  
> **Referencia:** [`PENDING_FEATURES.md`](../../disc-market-frontend/PENDING_FEATURES.md) (Módulo 5: Bugs 5.2 y 5.4)

---

## 1. 🎯 Funcionalidad y Alcance de la Fase 2

La **Fase 2** aborda la integridad de precios en productos bajo pedido y la consistencia del carrito entre el estado local de la SPA y la base de datos de PostgreSQL:

1. **Desacoplamiento de Tarifas Base en Creación Personalizada (Bug 5.2):**
   * Previamente, los precios base de los discos personalizados estaban "quemados" en el código fuente (`$799.00` para Vinilos y `$99.00` para CDs). Si se actualizaba el catálogo, la interfaz y el cobro quedaban desfasados o vulnerables a manipulación por parte del cliente.
   * Se habilitó un endpoint oficial que lee los precios vigentes de la tabla `products` en PostgreSQL y se sincronizó la vista [`CreatePage.tsx`](../../disc-market-frontend/src/features/custom/CreatePage.tsx) para reflejar las tarifas en tiempo real.
   * El controlador del backend valida y asigna de forma autoritativa el precio oficial sin aceptar precios arbitrarios enviados en el payload.

2. **Resiliencia y Sincronización del Carrito Dual (Bug 5.4):**
   * Previamente, ante una falla de conexión o micro-cortes de red, las operaciones optimistas del carrito se quedaban solo en el navegador (`localStorage`), mientras que la orden de Stripe se cobra basándose en el carrito guardado en PostgreSQL, generando discrepancias o fallos al crear el `PaymentIntent`.
   * Se creó una cola de reintentos automáticos, soporte para reconexión de red (evento `'online'`) y un banner interactivo de advertencia en [`CartPage.tsx`](../../disc-market-frontend/src/features/cart/CartPage.tsx) que bloquea el checkout si hay ítems locales pendientes de confirmar en el servidor.

---

## 2. 📁 Lista de Archivos Modificados

| Archivo | Repositorio | Propósito Principal |
| :--- | :---: | :--- |
| [`src/routes/customProduct.routes.ts`](../src/routes/customProduct.routes.ts) | Backend | Registro del endpoint `GET /api/custom-products/pricing` (ubicado antes de `/:id`). |
| [`src/controllers/customProduct.controller.ts`](../src/controllers/customProduct.controller.ts) | Backend | Implementación de `getCustomProductPricing` y cálculo autoritativo del precio en `createCustomProduct`. |
| [`src/seed/seed.ts`](../src/seed/seed.ts) | Backend | Alta de la categoría `"Custom"` y los productos plantilla `"Custom CD"` y `"Custom Vinyl"` en la BD. |
| [`src/shared/api/services/customProductService.ts`](../../disc-market-frontend/src/shared/api/services/customProductService.ts) | Frontend | Interfaces `CustomPricingResponse` y método `getPricing()` para consultar tarifas remotas. |
| [`src/features/custom/CreatePage.tsx`](../../disc-market-frontend/src/features/custom/CreatePage.tsx) | Frontend | Carga dinámica de tarifas en selector de formato (Paso 0), resumen (Paso 4) y despacho al carrito. |
| [`src/context/CartContext.tsx`](../../disc-market-frontend/src/context/CartContext.tsx) | Frontend | Cola de sincronización, auto-reintento con listener `online` / interval, y estados `isPendingSync`, `syncError`, `retrySync`. |
| [`src/features/cart/CartPage.tsx`](../../disc-market-frontend/src/features/cart/CartPage.tsx) | Frontend | Banner visual de alerta de sincronización pendiente, botón "Sincronizar ahora" y validación previa al checkout. |
| [`PENDING_FEATURES.md`](../../disc-market-frontend/PENDING_FEATURES.md) | Frontend | Actualización del seguimiento de bugs 5.2 y 5.4 a completados. |

---

## 3. 🔍 Detalle Técnico de los Cambios Realizados

### 3.1. Endpoint de Tarifas y Precios Autoritativos (Backend)

* **Archivo:** [`disc-market-backend/src/routes/customProduct.routes.ts`](../src/routes/customProduct.routes.ts)
  ```typescript
  // Consultar tarifas base vigentes de personalización (antes de la ruta dinámica /:id)
  router.get('/pricing', getCustomProductPricing);
  ```

* **Archivo:** [`disc-market-backend/src/controllers/customProduct.controller.ts`](../src/controllers/customProduct.controller.ts)
  Se implementó `getCustomProductPricing` para consultar los productos plantilla en PostgreSQL (`Custom CD` y `Custom Vinyl`), con fallback a valores estándar si la BD aún no ha sido poblada:
  ```typescript
  export const getCustomProductPricing = async (_req: Request, res: Response): Promise<void> => {
    try {
      const cdProduct = await productRepo.findOne({
        where: [{ name: 'Custom CD' }, { name: 'CD Personalizado' }],
      });
      const vinylProduct = await productRepo.findOne({
        where: [{ name: 'Custom Vinyl' }, { name: 'Vinilo Personalizado' }],
      });

      const cdPrice = cdProduct ? Number(cdProduct.price) : 99.0;
      const vinylPrice = vinylProduct ? Number(vinylProduct.price) : 799.0;

      res.json({
        CD: {
          format: 'CD',
          name: cdProduct?.name || 'Custom CD',
          base_price: cdPrice,
          description: cdProduct?.description || 'CD personalizado con pistas y portada estándar.',
        },
        VINYL: {
          format: 'VINYL',
          name: vinylProduct?.name || 'Custom Vinyl',
          base_price: vinylPrice,
          description: vinylProduct?.description || 'Vinilo personalizado cortado bajo pedido.',
        },
      });
    } catch (error: any) {
      res.status(500).json({
        message: 'Error al consultar tarifas de personalización',
        error: error.message,
      });
    }
  };
  ```

  Y en `createCustomProduct`, se elimina la vulnerabilidad de confiar ciegamente en `req.body.price`:
  ```typescript
  // Consultar precio base oficial desde PostgreSQL para evitar desincronización y manipulación
  const isVinyl = (format || '').toUpperCase() === 'VINYL';
  const templateProduct = await productRepo.findOne({
    where: isVinyl
      ? [{ name: 'Custom Vinyl' }, { name: 'Vinilo Personalizado' }]
      : [{ name: 'Custom CD' }, { name: 'CD Personalizado' }],
  });

  const officialBasePrice = templateProduct
    ? Number(templateProduct.price)
    : isVinyl
      ? 799.0
      : 99.0;

  const normalizedPrice = officialBasePrice;
  ```

---

### 3.2. Consumo Dinámico de Precios en el Creador (Frontend)

* **Archivo:** [`disc-market-frontend/src/shared/api/services/customProductService.ts`](../../disc-market-frontend/src/shared/api/services/customProductService.ts)
  ```typescript
  export interface CustomPricingItem {
    format: "CD" | "VINYL";
    name: string;
    base_price: number;
    description: string;
  }

  export interface CustomPricingResponse {
    CD: CustomPricingItem;
    VINYL: CustomPricingItem;
  }

  // Servicio
  getPricing: async (): Promise<CustomPricingResponse> => {
    return apiClient.get<CustomPricingResponse>("/custom-products/pricing");
  }
  ```

* **Archivo:** [`disc-market-frontend/src/features/custom/CreatePage.tsx`](../../disc-market-frontend/src/features/custom/CreatePage.tsx)
  * Se carga la información de tarifas al montar el componente:
    ```typescript
    useEffect(() => {
      customProductService
        .getPricing()
        .then((data) => setPricing(data))
        .catch((err) => {
          console.warn("No se pudo obtener tarifas remotas, usando valores por defecto:", err);
        });
    }, []);
    ```
  * Se calcula el precio activo mediante `currentPrice`:
    ```typescript
    const currentPrice = useMemo(() => {
      if (pricing && pricing[draft.format]) {
        return pricing[draft.format].base_price;
      }
      return template.price;
    }, [pricing, draft.format, template.price]);
    ```
  * Tanto los botones de selección en el Paso 0 como el resumen en el Paso 4 y la función `addToCart` reflejan el precio dinámico recuperado desde la base de datos.

---

### 3.3. Sincronización Dual y Cola de Reintentos en el Carrito (Frontend)

* **Archivo:** [`disc-market-frontend/src/context/CartContext.tsx`](../../disc-market-frontend/src/context/CartContext.tsx)
  * Se definieron los nuevos estados en el contexto:
    ```typescript
    type CartContextValue = {
      // ... anteriores
      isPendingSync: boolean;
      syncError: string | null;
      retrySync: () => Promise<void>;
    };
    ```
  * Detección de ítems locales no confirmados:
    ```typescript
    const isPendingSync = useMemo(() => {
      if (!userId) return false;
      const hasUnsyncedItems = items.some((item) => !item.cartItemId);
      return hasUnsyncedItems || syncError !== null;
    }, [userId, items, syncError]);
    ```
  * Escucha reactiva al recuperar conexión a internet:
    ```typescript
    useEffect(() => {
      const handleOnline = () => {
        if (userId) {
          console.log("[CartContext] Conexión restaurada: ejecutando sincronización automática...");
          syncWithBackend(userId);
        }
      };
      window.addEventListener("online", handleOnline);
      return () => window.removeEventListener("online", handleOnline);
    }, [userId]);
    ```
  * Reintento periódico en segundo plano (cada 15 segundos) mientras existan productos sin persistir:
    ```typescript
    useEffect(() => {
      if (!userId || !isPendingSync) return;
      const interval = setInterval(() => {
        if (!isSyncingRef.current && navigator.onLine) {
          syncWithBackend(userId);
        }
      }, 15000);
      return () => clearInterval(interval);
    }, [userId, isPendingSync]);
    ```

* **Archivo:** [`disc-market-frontend/src/features/cart/CartPage.tsx`](../../disc-market-frontend/src/features/cart/CartPage.tsx)
  * Se añadió un banner de alerta con llamada de acción interactiva:
    ```tsx
    {user && (isPendingSync || syncError) && (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-semibold text-sm">Cambios pendientes de sincronizar</p>
              <p className="text-xs text-amber-300/80">
                {syncError || "Hay modificaciones en tu carrito local pendientes de confirmarse en la base de datos."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={retrySync}
            disabled={loading}
            className="border-amber-400/50 text-amber-300 hover:bg-amber-500/20 text-xs px-3 py-1.5 shrink-0"
          >
            {loading ? "Sincronizando..." : "Sincronizar ahora"}
          </Button>
        </div>
      </div>
    )}
    ```
  * Y en `handleCheckout`:
    ```typescript
    if (isPendingSync) {
      push("Sincronizando los cambios del carrito con el servidor...");
      try {
        await retrySync();
      } catch {
        push("No se pudo sincronizar el carrito con la base de datos. Revisa tu conexión.");
        return;
      }
    }
    ```

---

## 4. 📊 Matriz de Cumplimiento de la Fase 2

| Código de Bug | Estado | Mecanismo de Verificación |
| :--- | :---: | :--- |
| **5.2 - Precios Hardcodeados** | ✅ Resuelto | Endpoint `GET /api/custom-products/pricing`, verificación autoritativa en `customProduct.controller.ts` y consumo dinámico en `CreatePage.tsx`. |
| **5.4 - Carrito Dual y Modo Offline** | ✅ Resuelto | `isPendingSync`, `syncError`, listener `online`, intervalo de reintento automático cada 15s y banner de aviso en `CartPage.tsx`. |

---

## 5. 🏁 Estado Global del Módulo 5 (Bugs de la Aplicación)

Con la culminación de la Fase 1 y Fase 2, **todos los bugs documentados en el Módulo 5 han sido resueltos satisfactoriamente**:
* [x] **5.1:** Seguridad y autenticación obligatoria JWT en endpoints críticos.
* [x] **5.2:** Precios desacoplados y tarifas dinámicas en PostgreSQL.
* [x] **5.3:** Rollback automático de archivos huérfanos en Multer.
* [x] **5.4:** Cola de sincronización, banner offline y consistencia dual del carrito.
* [x] **5.5:** Conexión con backoff exponencial a PostgreSQL en TypeORM.
* [x] **5.6:** Validación estricta de Magic Bytes en subida de portadas y pistas.

