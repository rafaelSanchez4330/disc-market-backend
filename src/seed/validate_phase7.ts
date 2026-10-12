import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:5000/api';

async function runValidation() {
  console.log('🚀 Iniciando validación integral de Fase 7...\n');
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    totalCount++;
    if (condition) {
      passedCount++;
      console.log(`  ✅ [PASS] ${testName}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName}`, details ? details : '');
    }
  }

  // =========================================================================
  // 1. AUTENTICACIÓN (Registro, Login, /me)
  // =========================================================================
  console.log('--- 1. Validación de Autenticación ---');
  const uniqueId = Date.now().toString().slice(-6);
  const testEmail = `tester_${uniqueId}@example.com`;
  const testPassword = 'Password123!';

  // 1.1 Registro
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Tester ${uniqueId}`,
      email: testEmail,
      password: testPassword,
    }),
  });
  const regData: any = await regRes.json();
  assert(regRes.status === 201 && regData.token && regData.user?.email === testEmail, 'Registro de usuario exitoso');

  // 1.2 Login
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const loginData: any = await loginRes.json();
  const token = loginData.token;
  const userId = loginData.user?.user_id;
  assert(loginRes.status === 200 && Boolean(token) && userId > 0, 'Login y generación de JWT');

  // 1.3 /auth/me con Token
  const meRes = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meData: any = await meRes.json();
  assert(meRes.status === 200 && (meData.user_id === userId || meData.user?.user_id === userId), 'Validación de sesión en /api/auth/me');

  // =========================================================================
  // 2. CATÁLOGO Y FILTROS DINÁMICOS
  // =========================================================================
  console.log('\n--- 2. Validación de Catálogo y Filtros ---');

  // 2.1 Categorías
  const catRes = await fetch(`${API_BASE}/categories`);
  const categories: any = await catRes.json();
  assert(catRes.status === 200 && Array.isArray(categories) && categories.length > 0, 'Consulta de categorías activas');

  // 2.2 Catálogo general
  const prodRes = await fetch(`${API_BASE}/products`);
  const products: any = await prodRes.json();
  assert(prodRes.status === 200 && Array.isArray(products) && products.length > 0, 'Consulta de catálogo completo');

  // 2.3 Filtro por formato (VINYL)
  const vinylRes = await fetch(`${API_BASE}/products?format=VINYL`);
  const vinyls: any = await vinylRes.json();
  const allVinyls = vinyls.every((p: any) => p.format.toUpperCase().includes('VINYL') || p.format.toUpperCase().includes('VINIL'));
  assert(vinylRes.status === 200 && vinyls.length > 0 && allVinyls, 'Filtro por formato VINYL');

  // 2.4 Filtro por búsqueda
  const searchRes = await fetch(`${API_BASE}/products?search=Adele`);
  const searchItems: any = await searchRes.json();
  assert(searchRes.status === 200 && searchItems.length > 0 && searchItems[0].artist?.includes('Adele'), 'Búsqueda por nombre/artista');

  // 2.5 Detalle de producto individual
  const singleId = products[0].product_id;
  const singleRes = await fetch(`${API_BASE}/products/${singleId}`);
  const singleProduct: any = await singleRes.json();
  assert(singleRes.status === 200 && singleProduct.product_id === singleId && typeof singleProduct.price === 'number', 'Detalle de producto y precio numérico');

  // =========================================================================
  // 3. PRODUCTOS PERSONALIZADOS Y CARGA DE ARCHIVOS
  // =========================================================================
  console.log('\n--- 3. Validación de Personalización y Archivos ---');

  // Crear una imagen dummy para subir con FormData
  const dummyFilePath = path.join(__dirname, 'dummy_cover.png');
  fs.writeFileSync(dummyFilePath, Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082', 'hex'));

  const formData = new FormData();
  formData.append('user_id', userId.toString());
  formData.append('format', 'VINYL');
  formData.append('title', `Disco Personalizado #${uniqueId}`);
  formData.append('message', 'Dedicatoria de prueba para Fase 7');
  formData.append('packaging_option', 'collector');
  formData.append('price', '899');
  const fileBlob = new Blob([fs.readFileSync(dummyFilePath)], { type: 'image/png' });
  formData.append('cover', fileBlob, `cover_${uniqueId}.png`);

  const customRes = await fetch(`${API_BASE}/custom-products`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const customData: any = await customRes.json();
  const customId = customData.custom_product_id;
  assert(customRes.status === 201 && customId > 0 && Boolean(customData.cover_image), 'Creación de producto personalizado con portada');

  // Verificar que el archivo realmente existe en uploads/covers/
  let fileExists = false;
  if (customData.cover_image) {
    const relativeCoverPath = customData.cover_image.replace(/^\//, '');
    const absoluteCoverPath = path.resolve(__dirname, '../../', relativeCoverPath);
    fileExists = fs.existsSync(absoluteCoverPath);
  }
  assert(fileExists, 'Persistencia física de imagen en uploads/covers/');

  // Agregar tracks
  const trackRes = await fetch(`${API_BASE}/custom-products/${customId}/tracks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tracks_meta: JSON.stringify([
        { track_name: 'Intro Synth', track_order: 1, duration: 180 },
        { track_name: 'Midnight Echoes', track_order: 2, duration: 240 },
      ]),
    }),
  });
  const trackData: any = await trackRes.json();
  assert(
    (trackRes.status === 200 || trackRes.status === 201) &&
    Array.isArray(trackData.tracks) &&
    trackData.tracks.length === 2,
    'Asignación de pistas personalizadas'
  );

  // =========================================================================
  // 4. CARRITO, PERSISTENCIA Y CHECKOUT
  // =========================================================================
  console.log('\n--- 4. Validación de Carrito y Checkout ---');

  // 4.1 Agregar producto regular al carrito
  const addRegularRes = await fetch(`${API_BASE}/cart/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      product_id: singleId,
      quantity: 2,
    }),
  });
  const addRegularData: any = await addRegularRes.json();
  assert(addRegularRes.status === 201 && addRegularData.product_id === singleId, 'Agregar producto regular al carrito');

  // 4.2 Agregar producto personalizado al carrito
  const addCustomRes = await fetch(`${API_BASE}/cart/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      custom_product_id: customId,
      quantity: 1,
    }),
  });
  const addCustomData: any = await addCustomRes.json();
  assert(addCustomRes.status === 201 && addCustomData.custom_product_id === customId, 'Agregar producto personalizado al carrito');

  // 4.3 Obtener carrito completo del usuario
  const getCartRes = await fetch(`${API_BASE}/cart/user/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const getCartData: any = await getCartRes.json();
  assert(getCartRes.status === 200 && getCartData.cart_items.length >= 2, 'Consulta de carrito activo con relaciones');

  // 4.4 Actualizar cantidad de un ítem
  const itemToUpdate = getCartData.cart_items[0];
  const updateRes = await fetch(`${API_BASE}/cart/items/${itemToUpdate.cart_item_id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ quantity: 3 }),
  });
  const updateData: any = await updateRes.json();
  assert(updateRes.status === 200 && updateData.quantity === 3, 'Actualización de cantidad en carrito');

  // 4.5 Checkout
  const checkoutRes = await fetch(`${API_BASE}/orders/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      payment_method: 'credit_card',
      shipping_method: 'Envío Express Disc Market',
      shipping_address: 'Av. Paseo de la Reforma 222, CDMX',
    }),
  });
  const checkoutData: any = await checkoutRes.json();
  const orderId = checkoutData.order_id;
  const trackingNumber = checkoutData.tracking_number;
  assert(
    checkoutRes.status === 201 &&
    orderId > 0 &&
    Boolean(trackingNumber) &&
    checkoutData.total_amount > 0,
    'Checkout completado y orden generada'
  );

  // 4.6 Consultar la orden creada con relaciones (order_items, payment, shipping)
  const orderRes = await fetch(`${API_BASE}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const orderDetails: any = await orderRes.json();
  assert(
    orderRes.status === 200 &&
    orderDetails.order_id === orderId &&
    orderDetails.payment?.payment_status === 'completed' &&
    orderDetails.shipping?.tracking_number === trackingNumber &&
    orderDetails.order_items.length >= 2,
    'Persistencia relacional completa de Orden, Items, Pago y Envío'
  );

  // Limpieza del archivo dummy
  if (fs.existsSync(dummyFilePath)) {
    fs.unlinkSync(dummyFilePath);
  }

  console.log(`\n=========================================`);
  console.log(`📊 Resultado Final: ${passedCount}/${totalCount} pruebas superadas.`);
  console.log(`=========================================\n`);
}

runValidation().catch((err) => {
  console.error('Error fatal durante la validación:', err);
  process.exit(1);
});
