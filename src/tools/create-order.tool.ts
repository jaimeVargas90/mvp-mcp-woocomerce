import { z } from "zod";
import { WooTool } from "../types.js";

// =========================================================
// 1. DICCIONARIO Y HELPERS (Departamentos Colombia)
// =========================================================
const COLOMBIA_STATES: Record<string, string> = {
    "AMAZONAS": "AMA", "ANTIOQUIA": "ANT", "ARAUCA": "ARA", "ATLÁNTICO": "ATL", "ATLANTICO": "ATL",
    "BOGOTÁ": "CUN", "BOGOTA": "CUN", "DC": "CUN", "BOLÍVAR": "BOL", "BOLIVAR": "BOL",
    "BOYACÁ": "BOY", "BOYACA": "BOY", "CALDAS": "CAL", "CAQUETÁ": "CAQ", "CAQUETA": "CAQ",
    "CASANARE": "CAS", "CAUCA": "CAU", "CESAR": "CES", "CHOCÓ": "CHO", "CHOCO": "CHO",
    "CÓRDOBA": "COR", "CORDOBA": "COR", "CUNDINAMARCA": "CUN", "GUAINÍA": "GUA", "GUAINIA": "GUA",
    "GUAVIARE": "GUV", "HUILA": "HUI", "LA GUAJIRA": "LAG", "MAGDALENA": "MAG", "META": "MET",
    "NARIÑO": "NAR", "NORTE DE SANTANDER": "NSA", "PUTUMAYO": "PUT", "QUINDÍO": "QUI", "QUINDIO": "QUI",
    "RISARALDA": "RIS", "SAN ANDRÉS": "SAP", "SANTANDER": "SAN", "SUCRE": "SUC", "TOLIMA": "TOL",
    "VALLE": "VAC", "VALLE DEL CAUCA": "VAC", "VAUPÉS": "VAU", "VAUPES": "VAU", "VICHADA": "VID"
};

function getStateCode(stateName: string): string {
    if (!stateName || stateName.length <= 3) return stateName || "";
    const clean = stateName.toUpperCase().trim();
    return COLOMBIA_STATES[clean] || stateName;
}

// =========================================================
// 2. DEFINICIÓN DE LA HERRAMIENTA
// =========================================================
export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce. IMPORTANTE: Requiere items, nombre separado (first/last) y email.",

    inputSchema: z.object({
        paymentMethod: z.enum(["online", "cod"]).describe("online = Link de Pago | cod = Contraentrega"),

        // 🔥 MEJORA CRÍTICA: Preprocesador para leer JSON stringificado si el LLM se confunde
        items: z.preprocess(
            (val) => {
                if (typeof val === 'string') {
                    try { return JSON.parse(val); } catch (e) { return []; }
                }
                return val;
            },
            z.array(z.object({
                productId: z.coerce.number().describe("ID del producto (Padre)"),
                quantity: z.coerce.number().default(1).describe("Cantidad"),
                variationId: z.any().optional().describe("ID de variación (Hijo) si aplica")
            }))
        ).describe("Lista de productos. Ejemplo: [{'productId': 10282, 'quantity': 1, 'variationId': 10283}]"),

        firstName: z.string().describe("Primer nombre del cliente"),
        lastName: z.string().describe("Apellido del cliente (si no tiene, repetir nombre)"),
        email: z.string().email(),
        phone: z.string().optional(),
        address: z.string().describe("Dirección completa (Calle/Carrera #)"),
        city: z.string().describe("Ciudad"),
        state: z.string().optional().describe("Departamento"),
        country: z.string().default("CO"),
        note: z.string().optional(),
        shippingMethodId: z.string().optional(),
        couponCode: z.string().optional()
    }),

    handler: async (api, args) => {
        try {
            console.log(`🔍 INPUT RAW RECIBIDO:`, JSON.stringify(args, null, 2));

            // -----------------------------------------------------
            // 🔥 VALIDACIÓN DE SEGURIDAD (Para evitar pedidos vacíos)
            // -----------------------------------------------------
            if (!args.items || args.items.length === 0) {
                throw new Error("❌ ABORTANDO: La lista de productos (items) está vacía o no se pudo leer.");
            }
            if (!args.firstName || !args.lastName) {
                // Intento de corrección simple si faltan nombres
                if (!args.firstName && !args.lastName) throw new Error("❌ ABORTANDO: Falta el nombre del cliente.");
            }

            // -----------------------------------------------------
            // PASO A: Limpieza de Ítems
            // -----------------------------------------------------
            const lineItems = args.items.map((item: any) => {
                const line: any = {
                    product_id: Number(item.productId),
                    quantity: Number(item.quantity)
                };

                // Manejo robusto de Variation ID
                let vId = item.variationId || item.variation_id || 0;
                vId = Number(vId);

                if (vId > 0) {
                    line.variation_id = vId;
                }
                return line;
            });

            // -----------------------------------------------------
            // PASO B: Corrección del Departamento
            // -----------------------------------------------------
            const cleanState = getStateCode(args.state || "");

            // -----------------------------------------------------
            // PASO C: Configuración de Pago
            // -----------------------------------------------------
            let paymentConfig = {};
            if (args.paymentMethod === 'cod') {
                paymentConfig = {
                    payment_method: "cod", payment_method_title: "Pago Contra Entrega",
                    status: "processing", set_paid: false
                };
            } else {
                paymentConfig = {
                    payment_method: "bacs", payment_method_title: "Pago en Línea (Pendiente)",
                    status: "pending", set_paid: false
                };
            }

            // -----------------------------------------------------
            // PASO D: Payload Final a WooCommerce
            // -----------------------------------------------------
            const data = {
                ...paymentConfig,
                customer_note: args.note || "Pedido vía Chatbot IA",
                billing: {
                    first_name: args.firstName, last_name: args.lastName,
                    address_1: args.address, city: args.city,
                    state: cleanState, country: args.country,
                    email: args.email, phone: args.phone || ""
                },
                shipping: {
                    first_name: args.firstName, last_name: args.lastName,
                    address_1: args.address, city: args.city,
                    state: cleanState, country: args.country
                },
                line_items: lineItems,
                shipping_lines: args.shippingMethodId ? [{ method_id: args.shippingMethodId, method_title: "Envío" }] : [],
                coupon_lines: args.couponCode ? [{ code: args.couponCode }] : []
            };

            console.log("📦 Enviando Payload a Woo:", JSON.stringify(data));

            const response = await api.post("orders", data);
            const order = response.data;

            // -----------------------------------------------------
            // PASO E: Respuesta Final
            // -----------------------------------------------------
            let responseData: any = {
                success: true,
                order_id: order.id,
                total: order.total,
                status: order.status,
                message: ""
            };

            if (args.paymentMethod === 'online') {
                const domain = "https://tiendamedicalospinos.com";
                responseData.payment_link = `${domain}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
                responseData.message = `Orden creada. Por favor paga aquí: ${responseData.payment_link}`;
            } else {
                responseData.payment_link = null;
                responseData.message = "Orden Contraentrega creada exitosamente.";
            }

            console.log(`✅ Orden #${order.id} creada con éxito.`);

            return {
                content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }],
            };

        } catch (error: any) {
            console.error("❌ Error en createOrder:", error.response?.data?.message || error.message);
            // Retornamos el error formateado para que el chatbot sepa qué decir
            return {
                content: [{ type: "text", text: `Error creando pedido: ${error.response?.data?.message || error.message}` }],
                isError: true,
            };
        }
    },
};