# Despliegue de Disc Market

Configuración realizada el 16 de octubre de 2026. Estado: demo pública con HTTPS;
faltan las correcciones de autorización indicadas al final antes de admitir clientes reales.

La actualización de Stripe se desplegó el 16 de octubre de 2026 a las 07:33 UTC
(01:33 en Ciudad de México), en modo test. Se aplicó la migración aditiva
`scripts/deployment/stripe-schema.sql` para `transaction_id` y `receipt_url`.
Las credenciales se transfirieron por SSH fuera de Git. Los secretos previamente
compartidos deben rotarse. Ver [guía de estudio](GUIA-ESTUDIO.md).

## Actualización Stripe: release 20261016T073316Z

- Release: `/opt/disc-market/releases/20261016T073316Z`.
- `/opt/disc-market/backend` enlaza al backend de la release; Nginx publica
  `/var/www/disc-market`, enlazado al `frontend/dist` de la misma release.
- El código de frontend de esta actualización está en esa release, no en la
  carpeta original `/opt/disc-market/frontend` de la instalación inicial.
- Backup previo: `/var/backups/disc-market/releases/20261016T073316Z/`;
  incluye base, uploads, backend anterior, frontend publicado y configuración Nginx.
- Versiones anteriores: `/opt/disc-market/backend-before-20261016T073316Z`
  y `/var/www/disc-market-before-20261016T073316Z`.
- El script `scripts/deployment/deploy-update.sh` compila antes de activar y
  restaura los enlaces anteriores si falla la comprobación inicial de salud.
- Se compararon los conteos de productos, usuarios y pedidos antes y después:
  no cambiaron durante el despliegue. Uploads permanecen en su directorio persistente.
- `create-intent` y `confirm` ahora exigen JWT; confirm comprueba el dueño del pago.
  Webhooks sin firma, con firma inválida o sin secreto son rechazados.
  Un fallo al consolidar el pedido por webhook devuelve 500 para permitir reintentos.
- Se verificaron builds, frontend y bundle HTTPS, catálogo de ocho productos,
  health OK, rechazo de peticiones anónimas y un webhook sintético firmado.
- Stripe tiene un endpoint habilitado para `https://vinylhrz.tech/api/payments/webhook`.
  La prueba sintética valida el secreto configurado, no demuestra una entrega
  real desde Stripe. Falta verificar un pago test completo y su evento en el VPS.
- No se realizó ningún cobro ni se activó modo live. La moneda del código sigue en USD.

## Repositorios y rama

- Backend: https://github.com/rafaelSanchez4330/disc-market-backend
- Frontend: https://github.com/rafaelSanchez4330/disc-market-frontend
- Ambos repositorios locales están en la rama `yazmin`.
- Son repositorios independientes: cada uno tiene sus propios commits y push.
- La carpeta superior `disc-market` y su workspace no son un tercer repositorio Git.
- Se desplegó una copia del código local de esa rama mediante SSH/SCP, sin `.git`,
  `.env`, `node_modules`, `dist` ni los archivos subidos locales.
- No se configuró CI/CD: hacer push a GitHub no actualiza el servidor.
- El servidor no tiene checkout Git ni credenciales de GitHub.

## Infraestructura

| Elemento | Configuración |
|---|---|
| Proveedor / plan | Hostinger VPS KVM 1 |
| Recursos | 1 vCPU, 4 GB RAM, 50 GB NVMe |
| Sistema | Ubuntu 24.04 LTS |
| Servidor | `srv2067482` |
| IPv4 | `217.15.168.151` |
| Node.js del VPS | 22.23.3 |
| Base de datos | PostgreSQL 16 |
| Servidor web | Nginx |
| Proceso de API | systemd: `disc-market.service` |
| Sitio | https://vinylhrz.tech |
| Alias | https://www.vinylhrz.tech |
| Health check | https://vinylhrz.tech/api/health |

Nginx sirve el frontend compilado, envía `/api/` a `127.0.0.1:5000`
y sirve `/uploads/` desde almacenamiento persistente.
El firewall UFW permite 22, 80 y 443; el puerto de API no está abierto al público.
PostgreSQL escucha en loopback.

## Dominio y certificado

El dominio registrado es **vinylhrz.tech**; las referencias anteriores a `.com`
fueron sustituidas por este dominio.

| Tipo DNS | Nombre | Contenido |
|---|---|---|
| A | `@` | `217.15.168.151` |
| CNAME | `www` | `vinylhrz.tech` |

Se conservan los nameservers de Hostinger `atlas.dns-parking.com` y
`hyperion.dns-parking.com`. Se eliminó el AAAA que apuntaba a
`2a02:4780:2d:f2c4::1` porque no correspondía al destino configurado.
Los demás registros no se modificaron.

Certbot con el plugin Nginx emitió el certificado para el dominio y `www`.
HTTP redirige a HTTPS. `certbot.timer` está activo y la simulación de renovación
terminó correctamente. Se registró la cuenta de Certbot sin correo electrónico.

```bash
certbot certificates
systemctl status certbot.timer
certbot renew --dry-run --no-random-sleep-on-renew
```

## Archivos y configuración

| Ruta del VPS | Uso |
|---|---|
| `/opt/disc-market/backend` | Código, dependencias y compilación de API |
| `/opt/disc-market/backend/.env` | Secretos del servidor, permisos restringidos |
| `/opt/disc-market/frontend` | Código y compilación de frontend |
| `/var/www/disc-market` | Frontend publicado |
| `/var/lib/disc-market/uploads` | Portadas y pistas persistentes |
| `/etc/systemd/system/disc-market.service` | Servicio de API |
| `/etc/nginx/sites-available/disc-market` | Configuración Nginx |
| `/etc/letsencrypt` | Certificados administrados por Certbot |

La API se ejecuta con el usuario de sistema `discmarket`, no con root.
systemd la inicia al arrancar el VPS y la reinicia si falla.

Variables del backend: `NODE_ENV=production`, `PORT=5000`,
`DB_HOST=127.0.0.1`, `DB_PORT=5432`, `DB_USERNAME=discmarket`,
`DB_NAME=disc_market_db`, `UPLOAD_DIR=/var/lib/disc-market/uploads`,
`FRONTEND_URL=https://vinylhrz.tech`.
Se generaron valores aleatorios para `DB_PASSWORD` y `JWT_SECRET` en el VPS.
No copiar esos secretos al repositorio ni sustituirlos por los ejemplos locales.

El frontend se compiló con `VITE_API_URL=/api` y
`VITE_UPLOADS_URL=https://vinylhrz.tech`. Estas variables se incorporan al build;
cambiarlas requiere recompilar.

## Base de datos y copias

Se creó una base independiente de la instalación local de Windows:
`disc_market_db`, propiedad del rol dedicado `discmarket`.
En la base inicialmente vacía se ejecutó el seed compilado con
`NODE_ENV=development` para crear las 12 tablas y los 8 productos de ejemplo.
El servicio normal usa `NODE_ENV=production`, que desactiva `synchronize`.
No hay todavía un flujo de migraciones preparado para cambios futuros de esquema.

La copia diaria local se ejecuta a las **04:00 UTC (22:00 del día anterior en
Ciudad de México)** mediante `/etc/cron.d/disc-market-backup`.
El script `/usr/local/sbin/disc-market-backup` guarda:

- `/var/backups/disc-market/AAAA-MM-DD/database.dump`
- `/var/backups/disc-market/AAAA-MM-DD/uploads.tar.gz`

Se verificó la existencia de la primera copia. Son copias en el mismo VPS:
faltan almacenamiento externo, política de retención y prueba de restauración.
No sustituyen una copia fuera del servidor.

## Administración

Desde una terminal local:

```powershell
ssh root@217.15.168.151
```

La contraseña root se conserva fuera del proyecto. Se autorizó una clave de
despliegue con comentario `disc-market-deploy`; su clave privada permanece fuera
de los repositorios, en una carpeta temporal local. Esa ubicación no garantiza
acceso duradero: si se pierde, usar el acceso de Hostinger para autorizar otra.
Para revocarla, retirar solo su línea de `/root/.ssh/authorized_keys`.

En el VPS:

```bash
systemctl status disc-market nginx postgresql
journalctl -u disc-market -n 50 --no-pager
systemctl restart disc-market
nginx -t
curl -fsS https://vinylhrz.tech/api/health
/usr/local/sbin/disc-market-backup
```

Para pgAdmin remoto, usar un túnel SSH hacia `127.0.0.1:5432`, con la base
`disc_market_db` y el usuario `discmarket`. La contraseña está en el `.env`
del VPS. No abrir el puerto 5432 a Internet. La base local usa credenciales distintas.

## Actualizaciones futuras

1. Revisar la rama y los cambios de cada repositorio; probar sus builds.
2. Crear una copia de la base y uploads antes de actualizar.
3. Transferir solo código, conservando `.env` y uploads del servidor.
4. Backend: `npm ci --no-audit --no-fund` y `npm run build`, con el usuario
   `discmarket`, en `/opt/disc-market/backend`; reiniciar `disc-market`.
5. Frontend: instalar dependencias y compilar con las variables de producción;
   publicar `dist/` en `/var/www/disc-market`.
6. Si cambia el esquema, preparar una migración explícita; no activar
   sincronización automática sobre datos existentes.
7. Verificar health, catálogo, rutas de React y logs tras el cambio.

Los scripts en `scripts/deployment/` registran la instalación inicial y HTTPS.
`setup.sh` contiene las URLs de la primera vista por IP: **no ejecutarlo como
actualización rutinaria sobre el sitio actual**, porque reemplaza Nginx y vuelve
a compilar usando esa IP. `https.sh` registra la adaptación al dominio.
Los paquetes `.tar.gz` originales no se incluyen en Git: se generan desde el código.

## Validación y pendientes

Se verificaron builds de ambos proyectos, HTTP 200 del frontend y `www`,
redirección HTTP a HTTPS, health `OK`, catálogo de 8 productos,
servicios habilitados al inicio y renovación simulada del certificado.
No se realizó una prueba completa de compra, pagos o restauración.

Antes de operar con clientes reales:

- Corregir registro: actualmente acepta `role` enviado por el cliente.
- Proteger `POST /api/products`: actualmente no exige autenticación.
- Revisar autorización de las demás rutas y dependencias con advertencias de seguridad.
- Preparar migraciones, copias externas y restauración probada.
- Validar el flujo completo de compra y la integración real de pagos.
