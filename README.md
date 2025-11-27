🚀 MCP WooCommerce Multi-Tenant Server

Un servidor Model Context Protocol (MCP) diseñado para dotar a chatbots de Inteligencia Artificial (UChat, 5ire, Claude, etc.) de capacidades completas de E-commerce, soportando múltiples tiendas simultáneamente.

📖 Descripción

Este proyecto actúa como un "puente inteligente" entre tus asistentes de IA y WooCommerce. A diferencia de una integración simple, este servidor:

Es Multi-Cliente: Una sola instancia del servidor puede gestionar cientos de tiendas diferentes.

Es Contextual: Las herramientas están diseñadas para que la IA entienda el contexto (ej: si busca zapatos, devuelve tallas disponibles; si el usuario quiere cancelar, cambia el estado del pedido).

Es Seguro: Valida datos antes de enviarlos a WooCommerce y protege acciones críticas.

✨ Características Clave

Arquitectura Multi-Tenant: Selección dinámica de tienda mediante el header x-client-id.

Optimización de Rendimiento: Sistema de caché en memoria para la configuración de clientes (evita lecturas de disco redundantes).

Validación Robusta: Uso de Zod para garantizar que la IA envíe los datos correctos.

Respuestas Limpias: Procesa las respuestas de WooCommerce (limpia HTML, resume datos) para ahorrar tokens y mejorar la comprensión de la IA.

🛠️ Catálogo de Herramientas (Tools)

El servidor expone las siguientes funciones a la IA:

1. 🔍 searchWooProducts (Buscador Maestro)

Herramienta todo en uno para descubrimiento de productos.

Funciones: Buscar por palabra clave, filtrar por rango de precios, paginación y ordenamiento (precio, novedad, relevancia).

Inteligencia:

Si no recibe búsqueda, lista el catálogo (novedades).

Devuelve IDs de variaciones y atributos (Talla, Color) para facilitar la venta precisa.

Limpia el HTML de las descripciones.

2. 🛒 createOrder (Ventas)

Generación de pedidos.

Capacidades:

Soporta productos simples y variables (usando variationId).

Admite notas del cliente ("Timbre dañado").

Configura pago "Contra Reembolso" por defecto.

Salida: Devuelve un JSON estructurado con ID de orden, total y estado.

3. 📦 getOrderStatus (Post-Venta)

Consulta de estado para soporte al cliente.

Info Devuelta: Estado actual, total, ítems y dirección de envío (útil para confirmar destino).

Seguridad: Maneja errores 404 amigablemente si el usuario da un ID incorrecto.

4. 📝 updateOrder (Gestión)

Modificación y cancelación de pedidos.

Usos:

Cancelar: Cambiando el status a cancelled.

Corregir: Modificar dirección, teléfono o email.

Restricciones: No permite editar pedidos que ya están "Completados" o "Enviados".

5. 🚚 getShippingMethods (Logística)

Calculadora de costos de envío.

Lógica: Recibe un código de país (ej: CO, MX), busca la Zona de Envío correspondiente en WooCommerce y devuelve los métodos y costos disponibles.

6. 🎟️ checkCoupon (Marketing)

Validación de descuentos.

Funciones: Verifica existencia, caducidad y monto de descuento de un código promocional.

⚙️ Instalación y Configuración

1. Requisitos Previos

Node.js (v18 o superior)

NPM

Una o varias tiendas WooCommerce con API Keys generadas (Permisos de Lectura/Escritura).

2. Configuración de Variables de Entorno

Crea un archivo .env en la raíz. La variable CLIENTS debe ser un JSON String que contenga el array de tiendas.

PORT=3000
# Ejemplo de configuración para 2 clientes
CLIENTS='[
  {
    "clientId": "cliente_alpha",
    "storeUrl": "[https://tienda-ropa.com](https://tienda-ropa.com)",
    "consumerKey": "ck_XXXXXXXXXXXXXXXX",
    "consumerSecret": "cs_XXXXXXXXXXXXXXXX"
  },
  {
    "clientId": "cliente_beta",
    "storeUrl": "[https://tienda-zapatos.com](https://tienda-zapatos.com)",
    "consumerKey": "ck_YYYYYYYYYYYYYYYY",
    "consumerSecret": "cs_YYYYYYYYYYYYYYYY"
  }
]'


3. Ejecución

# Instalar dependencias
npm install

# Modo Desarrollo (con recarga automática)
npm run dev

# Modo Producción
npm start


🔌 Integración con UChat / 5ire

Para conectar tu chatbot, configura tu HTTP Request o Action de la siguiente manera:

URL: https://tu-dominio-railway.app/mcp

Método: POST

Headers:

Content-Type: application/json

x-client-id: El ID que configuraste en el JSON (ej: cliente_alpha).

El cuerpo del mensaje (Body) será manejado automáticamente por el protocolo MCP.

📂 Estructura del Proyecto

src/
├── index.ts           # 🧠 Servidor Principal (Express + MCP + Lógica Multi-tenant)
├── types.ts           # 📄 Definiciones de Tipos (Interfaces TS)
└── tools/             # 🧰 Carpeta de Herramientas Modulares
    ├── index.ts             # Registro central de herramientas
    ├── search-products.tool.ts  # Búsqueda avanzada
    ├── create-order.tool.ts     # Creación de pedidos
    ├── get-order.tool.ts        # Consulta de estado
    ├── update-order.tool.ts     # Edición/Cancelación
    ├── get-shipping.tool.ts     # Cálculo de envíos
    └── check-coupon.tool.ts     # Validación de cupones
