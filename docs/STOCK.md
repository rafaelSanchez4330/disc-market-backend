# Inventario y pagos

Actualizado el 6 de noviembre de 2026. Describe el código local; no implica un
despliegue en Hostinger ni un cobro real verificado.

## Qué significan las cantidades

- `quantity_available`: unidades libres que aún se pueden reservar/comprar.
- `quantity_reserved`: unidades comprometidas en pagos todavía abiertos.
- Existencia física pendiente de vender: disponible + reservado.

Ejemplo con cinco discos:

| Acción | Disponible | Reservado |
|---|---:|---:|
| Antes del pago | 5 | 0 |
| Iniciar pago por dos discos | 3 | 2 |
| Confirmar pago | 3 | 0 |
| O cancelar el pago, en lugar de confirmarlo | 5 | 0 |

No se descuenta otra vez `quantity_available` al confirmar: esas unidades ya
salieron de las existencias libres al reservarlas. El panel permite entradas de
stock y muestra ambas cantidades. No se reinician existencias con este cambio.

## Carrito y validaciones

El carrito no reserva unidades. El backend valida al añadir y al cambiar la
cantidad: solo enteros, cantidades positivas, productos existentes y stock
suficiente para la suma de las líneas. Actualizar una línea a cero la elimina.
Las operaciones de un mismo carrito se serializan para evitar incrementos
simultáneos que excedan el stock. Un producto sin inventario tiene cero unidades;
la interfaz ya no supone diez unidades por defecto.

Los precios se consultan en el catálogo. Los personalizados consumen la plantilla
`Custom CD`/`CD Personalizado` o `Custom Vinyl`/`Vinilo Personalizado`, según el
formato. Debe existir la plantilla con su inventario; no se crean existencias
automáticamente si falta. Se valida que el diseño pertenezca al comprador.

## Reserva y cobro

1. Al iniciar el pago, una transacción bloquea el carrito y los inventarios en
   orden de ID, vuelve a validar cantidades y guarda una instantánea inmutable
   de productos, precios, cantidades, total y envío en `checkout_reservations`.
2. Las unidades pasan de disponibles a reservadas. Solo puede haber una reserva
   activa por carrito. Mientras exista, no se permite editar o vaciar ese carrito.
3. Se crea el PaymentIntent con una clave de idempotencia basada en la reserva.
   Un reintento recupera el mismo intento de pago y no vuelve a reservar unidades.
4. Al verificar un pago `succeeded`, una transacción bloquea la reserva, consume
   las unidades reservadas, crea pedido/detalles/pago/envío y cierra el carrito.
   La confirmación del navegador y los webhooks usan el mismo servicio.
5. Una notificación repetida devuelve el pedido existente, sin duplicar la venta
   ni el descuento. Un fallo de base de datos revierte toda la operación; el
   webhook responde 500 para permitir reintentos.

Los importes se calculan en centavos USD y se comprueban contra el PaymentIntent.
Las direcciones de envío se conservan en la reserva, además del método de envío.
La interfaz ya no ofrece los cobros simulados SPEI/PayPal. El antiguo endpoint
`POST /api/orders/checkout` responde 410 para evitar pedidos pagados sin verificar.

## Cancelación, vencimiento y recuperación

`POST /api/payments/cancel` cancela el pago abierto del usuario; puede recibir
`paymentIntentId`. Si Stripe ya confirmó el pago, se consolida el pedido en lugar
de devolver las unidades al stock. En el carrito se puede retomar un pago abierto
o cancelarlo antes de editar productos, incluso después de recargar la página.

Las reservas vencen a los 15 minutos. El backend revisa reservas vencidas al
arrancar y cada minuto cuando hay una clave de Stripe configurada. Primero
cancela/verifica el PaymentIntent; solo después libera las unidades. Un pago
`processing` o una caída de Stripe mantienen la reserva hasta aclarar el estado:
el vencimiento por sí solo no demuestra que ya no pueda cobrar. Un fallo de pago
también intenta cancelar el intento antes de devolver existencias.

Las reservas son persistentes y sobreviven reinicios. Si se pierde la respuesta
de creación del PaymentIntent, el siguiente intento usa la misma clave. Una
creación ambigua de más de 23 horas sin ID guardado requiere revisión manual;
no se crea otro intento fuera de la ventana mínima de idempotencia de Stripe.
Los pagos históricos ya registrados se reconocen sin descontar stock retroactivo.
Pagos antiguos sin reserva ni registro requieren revisión; al desplegar, deben
cerrarse los intentos pendientes creados con la versión anterior.

## Ejecutar normalmente

No hay que ejecutar el seed ni cargar datos de prueba para usarlo. Reinicia el
backend local con `npm.cmd run dev`; el modo desarrollo sincroniza la nueva tabla
y la restricción de inventario no negativo. Se usa la misma base del `.env`.
Reinicia también el frontend si ya estaba abierto.

En producción, antes de activar la nueva versión, respalda la base y ejecuta
`scripts/deployment/stock-reservations.sql` sobre la base destino usando `psql`
con `ON_ERROR_STOP=1`. Es una migración aditiva, repetible y transaccional; no se
ha ejecutado en Hostinger. Si hay inventarios negativos, la restricción abortará
la migración para que se revisen sin borrar datos. El esquema de las funciones
nuevas de main (perfil/OTP/recuperación) debe migrarse también si aún no existe.

## Verificación

```powershell
cd disc-market-backend
npm.cmd run test:stock
npm.cmd run test:admin
```

Las pruebas usan esquemas temporales de PostgreSQL local y simulan únicamente la
red de Stripe: no realizan cobros. Cubren cantidades inválidas, inventario
inexistente, sobreventa, reservas simultáneas, personalización, cancelaciones,
vencimiento, firmas de webhook, reintentos, rollback y migración repetida. Las
tablas habituales no se sincronizan ni se modifican en esas pruebas.

Sigue pendiente una compra completa en modo test de Stripe en la instalación
destino. Cancelar/reembolsar pedidos ya vendidos y reponer devoluciones físicas
requiere un flujo adicional; no se devuelve stock solo por recibir un reembolso.

Referencias: [cancelación de PaymentIntents](https://docs.stripe.com/api/payment_intents/cancel),
[idempotencia](https://docs.stripe.com/api/idempotent_requests) y
[estados de pago](https://docs.stripe.com/payments/payment-intents/verifying-status).
