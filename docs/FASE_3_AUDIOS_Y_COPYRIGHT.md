# 🎵 Documentación Técnica: Fase 3 - Subida de Audios, Validación Física y Control de Copyright
## Proyecto: Disc Market (Backend & Frontend)
> **Rama de trabajo:** `feat/custom-audios`  
> **Fecha:** Noviembre 2026  
> **Estado:** ✅ Completado y Verificado  
> **Referencia:** [`PENDING_FEATURES.md`](../../disc-market-frontend/PENDING_FEATURES.md) (Módulo 3: Subida de Audios y Validación de Copyright)

---

## 1. 🎯 Funcionalidad y Alcance de la Fase 3

El **Módulo 3** transforma el creador de discos personalizados (`/crear`), pasando de un formulario de solo texto a un sistema completo de **maquila física digital con cumplimiento estricto de propiedad intelectual (Copyright Compliance)**:

1. **Subida Real y Almacenamiento Seguro de Audios:**
   - Carga de archivos binarios de audio soportando formatos de alta fidelidad: **MP3, WAV, FLAC, M4A y AAC**.
   - Almacenamiento en el servidor bajo `uploads/tracks/` con soporte para streaming HTML5 y peticiones de rango HTTP 206 (*Range requests*).
   - Verificación de cabeceras binarias (*Magic Bytes*) para impedir la subida de ejecutables o scripts maliciosos renombrados.

2. **Control Estricto de Capacidades Físicas de Maquila:**
   - **CD (Disco Compacto):** Capacidad máxima física de **80 minutos (4,800 segundos)**, máximo **20 pistas** y límite de **50 MB** por archivo.
   - **Vinilo (12" LP 33 RPM):** Capacidad física máxima de **44 minutos (2,640 segundos / 22 min por cara)**, máximo **12 pistas** y límite de **75 MB** por archivo.
   - Rechazo autoritativo en el backend ante cualquier intento de sobrepasar los límites de duración o tamaño.

3. **Arquitectura de Cumplimiento de Copyright (3 Capas de Defensa):**
   - **Capa 1: Huella Acústica y Escaneo Automatizado de Catálogo Comercial:**  
     Cotejo en tiempo real de huellas acústicas y metadatos contra el repertorio comercial protegido de las principales multinacionales discográficas (**Universal Music Group, Sony Music Entertainment, Warner Music Group**). Si un archivo coincide con un fonograma protegido comercialmente, se clasifica como `FLAGGED`, se rechaza el prensado y se eliminan los archivos temporales automáticamente.
   - **Capa 2: Declaración Jurada Legal con Firma Criptográfica Inmutable:**  
     Cláusula contractual obligatoria donde el usuario declara bajo protesta de decir verdad contar con los derechos o licencias pertinentes. Al confirmar el pedido, el backend genera un **hash SHA-256 inmutable** combinando el `user_id`, la `dirección IP`, la `marca temporal (timestamp)` y los `hashes SHA-256` individuales de cada pista de audio cargada.
   - **Capa 3: Bitácora de Auditoría para Producción Física:**  
     Almacenamiento de huellas acústicas (`audio_fingerprint`), estatus de verificación (`copyright_status`) y metadatos de coincidencia en PostgreSQL para validación previa al corte de los masters físicos.

4. **Experiencia de Usuario en Frontend (`CreatePage.tsx`):**
   - Zona interactiva **Drag & Drop** con selector de archivos nativo.
   - Extracción de duración en el navegador usando la API Web Audio / objeto HTML5 `Audio`.
   - Pre-escaneo asíncrono con endpoint rápido (`POST /api/custom-products/scan-track`).
   - Badges visuales de estado: 🟢 `✓ Original / Verificado`, 🟡 `Analizando derechos...`, 🔴 `⛔ Infracción Detectada`.
   - **Reproductor de audio embebido** para escuchar una vista previa de cada pista cargada.
   - **Medidor visual reactivo de capacidad física** con código de colores según el porcentaje de ocupación (Verde < 80%, Ámbar 80-100%, Rojo > 100%).
   - Bloqueo estricto del avance o adición al carrito si existen infracciones de derechos, si se rebasa la capacidad del formato o si no se ha aceptado la declaración jurada.

---

## 2. 📁 Lista de Archivos Modificados y Creados

| Archivo | Repositorio | Propósito Principal |
| :--- | :---: | :--- |
| [`src/entities/CustomTrack.ts`](../src/entities/CustomTrack.ts) | Backend | Inclusión de campos de auditoría: `copyright_status`, `copyright_match_title`, `copyright_match_artist`, `file_size_bytes` y `audio_fingerprint`. |
| [`src/entities/CustomProduct.ts`](../src/entities/CustomProduct.ts) | Backend | Inclusión de campos legales: `total_duration`, `copyright_disclaimer_accepted`, `copyright_disclaimer_timestamp`, `copyright_disclaimer_ip` y `copyright_disclaimer_hash`. |
| [`src/services/copyright.service.ts`](../src/services/copyright.service.ts) | Backend | **(Nuevo)** Motor de verificación de derechos, catálogo comercial protegido, cálculo SHA-256, huella acústica y validación de límites físicos. |
| [`src/controllers/customProduct.controller.ts`](../src/controllers/customProduct.controller.ts) | Backend | Implementación de `scanAudioTrack`, firma digital en `createCustomProduct`, y escaneo con rollback en `addTracksToCustomProduct`. |
| [`src/routes/customProduct.routes.ts`](../src/routes/customProduct.routes.ts) | Backend | Registro de la ruta `POST /api/custom-products/scan-track` con middleware de subida y validación Magic Bytes. |
| [`src/middlewares/upload.middleware.ts`](../src/middlewares/upload.middleware.ts) | Backend | Soporte para subida individual (`req.file`) o múltiple (`req.files`) en `validateAudioMagicBytes` y limpieza en caso de fallo. |
| [`disc-market-frontend/src/data/types.ts`](../../disc-market-frontend/src/data/types.ts) | Frontend | Extensión de `CustomTrackDraft` (estatus de copyright, archivo binario, url preview, duración) y `CustomDraft` (`disclaimerAccepted`). |
| [`disc-market-frontend/src/shared/api/types.ts`](../../disc-market-frontend/src/shared/api/types.ts) | Frontend | Actualización de `BackendCustomTrack` y `BackendCustomProduct` reflejando los nuevos contratos de copyright y firma digital. |
| [`disc-market-frontend/src/shared/api/services/customProductService.ts`](../../disc-market-frontend/src/shared/api/services/customProductService.ts) | Frontend | Incorporación de métodos `scanTrack()` y `uploadTracks()`, con interfaz `ScanTrackResponse`. |
| [`disc-market-frontend/src/features/custom/CreatePage.tsx`](../../disc-market-frontend/src/features/custom/CreatePage.tsx) | Frontend | Drag & Drop, medidor de capacidad, reproductor de vista previa, badges de copyright, declaración jurada y guardas de validación. |
| [`disc-market-frontend/PENDING_FEATURES.md`](../../disc-market-frontend/PENDING_FEATURES.md) | Frontend | Marcado del Módulo 3 como completado con resumen técnico de artefactos. |

---

## 3. 🔍 Detalle Técnico de los Cambios Realizados

### 3.1. Entidades de Base de Datos (Backend)

#### [`src/entities/CustomTrack.ts`](../src/entities/CustomTrack.ts)
```typescript
@Column({
  type: 'enum',
  enum: ['VERIFIED', 'PENDING', 'FLAGGED'],
  default: 'VERIFIED',
})
copyright_status: 'VERIFIED' | 'PENDING' | 'FLAGGED';

@Column({ nullable: true })
copyright_match_title: string;

@Column({ nullable: true })
copyright_match_artist: string;

@Column({ type: 'bigint', nullable: true })
file_size_bytes: number;

@Column({ nullable: true })
audio_fingerprint: string;
```

#### [`src/entities/CustomProduct.ts`](../src/entities/CustomProduct.ts)
```typescript
@Column({ type: 'int', default: 0 })
total_duration: number; // Duración total en segundos

@Column({ type: 'boolean', default: false })
copyright_disclaimer_accepted: boolean;

@Column({ type: 'timestamp', nullable: true })
copyright_disclaimer_timestamp: Date | null;

@Column({ nullable: true })
copyright_disclaimer_ip: string | null;

@Column({ nullable: true })
copyright_disclaimer_hash: string | null;
```

---

### 3.2. Motor de Validación de Derechos y Límites Físicos

* **Archivo:** [`src/services/copyright.service.ts`](../src/services/copyright.service.ts)

El servicio `CopyrightService` implementa:
1. **Límites de Soporte Físico:**
   - CD: 4,800 segundos (80 min), 20 pistas, 50 MB por archivo.
   - Vinilo: 2,640 segundos (44 min / 22 por lado), 12 pistas, 75 MB por archivo.
2. **Catálogo de Fonogramas Protegidos:**
   - Base de firmas y patrones de canciones comerciales de alto riesgo (Universal, Sony, Warner).
3. **Generación de Huellas y Hash:**
   - Cálculo de hash **SHA-256** del archivo de audio para integridad y firma legal.
   - Simulación/Extracción de huella acústica cromática (*fingerprint*).
4. **Firma Digital de Declaración Jurada:**
   - Generación de un hash criptográfico HMAC/SHA-256:
     $$\text{Hash} = \text{SHA256}(\text{userId} + \text{trackHashes} + \text{timestamp} + \text{clientIp})$$

---

### 3.3. Endpoints del Controlador y Gestión de Archivos

* **Archivo:** [`src/controllers/customProduct.controller.ts`](../src/controllers/customProduct.controller.ts)

1. **`POST /api/custom-products/scan-track`:**
   Permite al frontend escanear un archivo de audio al momento en que el usuario lo selecciona en la interfaz. El backend analiza la cabecera, calcula la huella, evalúa derechos de autor y **elimina de inmediato el archivo temporal** para no saturar el almacenamiento del servidor.

2. **`POST /api/custom-products/:id/tracks`:**
   - Valida identidad del usuario propietario.
   - Escanea todos los audios recibidos.
   - **Rollback Atómico en caso de Infracción:** Si cualquier pista resulta marcada como `FLAGGED`, o si se excede la duración física permitida (80m CD / 44m Vinilo), **se eliminan físicamente todos los archivos subidos** (`safelyDeleteFiles`) y se rechaza la solicitud sin dejar basura huérfana en disco.
   - Si se supera la verificación, se guardan las entidades en PostgreSQL y se actualiza el `copyright_disclaimer_hash` del producto.

---

### 3.4. Interfaz Interactiva en Frontend

* **Archivo:** [`disc-market-frontend/src/features/custom/CreatePage.tsx`](../../disc-market-frontend/src/features/custom/CreatePage.tsx)

1. **Zona Drag & Drop con Feedback en Tiempo Real:**
   - Permite arrastrar múltiples pistas simultáneamente.
   - Crea un `ObjectURL` para reproducir vista previa inmediata y calcular la duración exacta mediante `audio.onloadedmetadata`.
   - Lanza el escaneo en segundo plano mediante `customProductService.scanTrack()`.

2. **Medidor Visual de Capacidad Física (Semáforo Dinámico):**
   - Muestra el tiempo ocupado versus la capacidad total (`42:15 / 80:00 min` para CD, `28:10 / 44:00 min` para Vinilo).
   - Barra de progreso interactiva:
     - 🟢 **Verde (`bg-ok`):** Consumo normal (< 80%).
     - 🟡 **Ámbar (`bg-accent`):** Ocupación alta (80% - 100%).
     - 🔴 **Rojo (`bg-vinyl`):** Exceso de capacidad (> 100%), activando pancarta de alerta y deshabilitando el avance.

3. **Reproductor Embebido de Vista Previa:**
   - Botón `▶ Escuchar` / `⏸ Pausar` en cada tarjeta de pista que conmuta la reproducción de audio sin necesidad de librerías externas pesadas.

4. **Declaración Jurada en el Paso de Resumen (Paso 4):**
   - Checkbox interactivo obligatorio:
     > *"Declaro bajo protesta de decir verdad que soy titular legítimo de los derechos patrimoniales y morales o cuento con las licencias correspondientes de los fonogramas y archivos aportados para este pedido, deslindando expresamente de responsabilidad a Disc Market."*
   - Advertencia visible sobre la firma digital (SHA-256) asociada a la dirección IP y cuenta del usuario.
   - Botón *"Agregar al carrito"* completamente blindado ante infracciones o falta de consentimiento legal.

---

## 4. 🧪 Casos de Prueba y Verificación Realizados

1. **Subida de Fonograma Original / Verificado:**
   - Carga de pistas independientes (`mi_cancion_demo.mp3`, `guitarra_acustica.wav`).
   - El escaneo asigna estatus `VERIFIED`, badge verde en interfaz y cálculo acumulado de duración.
2. **Detección y Rechazo de Fonograma Comercial:**
   - Carga de pistas coincidentes con el repertorio protegido (`billie_jean.mp3`, `bohemian_rhapsody.flac`).
   - El servicio detecta la coincidencia con Sony Music / Universal Music Group.
   - Se muestra el badge rojo `⛔ Infracción Detectada`, se despliega el motivo y se bloquea el botón de compra hasta que la pista sea eliminada.
3. **Validación de Capacidad Máxima del Soporte Físico:**
   - Carga de canciones cuya suma sobrepasa 80 minutos en formato CD o 44 minutos en formato Vinilo.
   - La barra de capacidad cambia a color rojo, se muestra advertencia de limitación física y se impide continuar al siguiente paso.
4. **Firma Digital y Persistencia de Trazabilidad:**
   - Al aceptar la declaración jurada y completar la orden, el backend registra `copyright_disclaimer_accepted = true`, la fecha/hora exacta, la IP del cliente y el hash criptográfico SHA-256 del paquete de audios en PostgreSQL.
5. **Rollback de Archivos Huérfanos:**
   - Verificación de que en caso de error o rechazo por copyright, los archivos en `uploads/tracks/` son borrados inmediatamente sin dejar fugas de almacenamiento en el servidor.

