# Panel de administración: arranque y validación

El frontend y backend deben usar la rama `yazmin` con los cambios de administración
e inventario. El panel trabaja con la base configurada en el `.env` del backend;
no necesita datos temporales ni ejecutar el seed.

## Arrancar localmente

Requiere Node.js 22 y PostgreSQL activo. Configura las variables de cada proyecto
a partir de su `.env.example`. Los secretos del `.env` no se suben a GitHub.
El frontend debe usar `VITE_API_URL=http://localhost:5000/api`.

En una terminal desde la carpeta del backend:

```powershell
npm.cmd ci
npm.cmd run dev
```

En otra terminal desde la carpeta del frontend:

```powershell
npm.cmd ci
npm.cmd run dev
```

El frontend abre en `http://localhost:5173` y la API en `http://localhost:5000/api`.
En desarrollo, el backend incorpora las entidades nuevas mediante sincronización
de esquema. En producción usa migraciones explícitas; no actives sincronización.

## Habilitar tu cuenta

Registra una cuenta normal en `http://localhost:5173/registro`. Después, quien
administra la instalación ejecuta una sola vez desde el backend, sustituyendo
el correo del ejemplo por el correo exacto de esa cuenta:

```powershell
npm.cmd run admin:grant -- tu-correo@ejemplo.com
```

El comando solo cambia el rol de una cuenta existente en la base del `.env`.
No crea usuarios ni cambia sus contraseñas o el stock. Cierra sesión, vuelve a
iniciarla y abre `http://localhost:5173/admin`, o usa el enlace Administración.
Una cuenta cliente no tiene acceso. El backend comprueba el rol actual en la base.

## Qué validar antes de compartir o desplegar

1. Inventario: añadir unidades, actualizar datos y comprobar que persisten.
2. Usuarios: buscar por nombre/correo y revisar pedidos y compras pagadas.
3. Ventas: consultar detalles de pedidos y filtrar por fechas (días UTC).
4. Carrito: rechazar cantidades inválidas y superiores a las existencias.
5. Pago: reservar unidades al abrirlo y devolverlas al cancelar.
6. Compra completa en Stripe **modo test**: registrar un pedido y consumir stock
   una sola vez; recargar/recibir webhooks repetidos no duplica la venta.
7. Comprobar que un cliente recibe acceso restringido al abrir `/admin`.

No ejecutes el seed sobre existencias que quieras conservar: restablece stock
del catálogo de ejemplo. Los pedidos aparecerán cuando existan en esa base.

## Pruebas automáticas

Desde el backend:

```powershell
npm.cmd run test:admin
npm.cmd run test:stock
```

Desde el frontend:

```powershell
npm.cmd run build
```

Las pruebas del backend usan esquemas temporales en PostgreSQL local; la cuenta
necesita permiso para crearlos/eliminarlos. Las pruebas de stock simulan la red
de Stripe, sin hacer cobros. No sustituyen una compra completa en modo test.

Consulta [inventario y reservas](STOCK.md) para la migración de producción,
cancelaciones, vencimientos y recuperación. Hacer push/pull no despliega Hostinger.
