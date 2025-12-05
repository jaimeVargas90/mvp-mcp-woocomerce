import { z } from "zod";
import { WooTool } from "../types.js";

// =========================================================
// 1. DICCIONARIO DE DEPARTAMENTOS
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
    description: "Crea un pedido en WooCommerce. Requiere JSON de items, nombre y apellido.",

    inputSchema: z.object({
        paymentMethod: z.enum(["online", "cod"]).describe("online = Link de Pago | cod = Contraentrega"),
        // Aceptamos string o array, lo arreglaremos en el handler
        items: z.union([z.string(), z.array(z.any())]).describe("JSON Array de productos: [{'productId': 123, 'quantity': 1}]"),
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().email(),
        phone: z.string().optional(),
        address: z.string(),
        city: z.string(),
        state: z.string().optional(),
        country: z.string().default("CO"),
        note: z.string().optional(),
        shippingMethodId: z.string().optional(),
        couponCode: z.string().optional()
    }),

    handler: async (api, args) => {
        try {
            console.log("🚨 1. INICIO HANDLER - Args crudos:", JSON.stringify(args));

            // =========================================================
            // 🔥 FASE DE SANEAMIENTO MANUAL (CRÍTICA)
            // =========================================================

            // 1. Arreglar ITEMS (Parsing forzado)
            let finalItems: any[] = [];
            if (typeof args.items === 'string') {
                try {
                    // Si viene como string "[{...}]", lo parseamos
                    finalItems = JSON.parse(args.items);
                } catch (e) {
                    console.error("Error parseando string items:", e);
                    finalItems = [];
                }
            } else if (Array.isArray(args.items)) {
                finalItems = args.items;
            }

            // 2. Verificar si el array quedó vacío
            if (!finalItems || finalItems.length === 0) {
                throw new Error("❌ Error: La lista de productos 'items' está vacía o mal formateada.");
            }

            // 3. Mapeo seguro de productos (Loggear qué claves vemos)
            console.log("🔍 Analizando estructura del primer item:", finalItems[0]);

            const lineItems = finalItems.map((item: any) => {
                // Soportar camelCase (productId) Y snake_case (product_id)
                const pId = item.productId || item.product_id;
                const qty = item.quantity || 1;
                const vId = item.variationId || item.variation_id || 0;

                if (!pId) console.warn("⚠️ ALERTA: Item sin productId detectado", item);

                const line: any = {
                    product_id: Number(pId),
                    quantity: Number(qty)
                };
                if (Number(vId) > 0) line.variation_id = Number(vId);

                return line;
            });

            // 4. Saneamiento de Estado/Depto
            const cleanState = getStateCode(args.state || "");

            // =========================================================
            // CONFIGURACIÓN DE PAGO Y PAYLOAD
            // =========================================================
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

            // Construcción del objeto Data para WooCommerce
            const data = {
                ...paymentConfig,
                customer_note: args.note || "Pedido vía Chatbot",
                billing: {
                    first_name: args.firstName,
                    last_name: args.lastName,
                    address_1: args.address,
                    city: args.city,
                    state: cleanState,
                    country: args.country || "CO",
                    email: args.email,
                    phone: args.phone || ""
                },
                shipping: {
                    first_name: args.firstName,
                    last_name: args.lastName,
                    address_1: args.address,
                    city: args.city,
                    state: cleanState,
                    country: args.country || "CO"
                },
                line_items: lineItems,
                shipping_lines: args.shippingMethodId ? [{ method_id: args.shippingMethodId, method_title: "Envío" }] : [],
                coupon_lines: args.couponCode ? [{ code: args.couponCode }] : []
            };

            // 🔥 LOG DE ORO: Ver exactamente qué enviamos a WooCommerce
            console.log("📦 PAYLOAD FINAL A WOO:", JSON.stringify(data, null, 2));

            // Validación final antes de enviar
            if (lineItems.some((i: any) => isNaN(i.product_id))) {
                throw new Error("❌ Error Fatal: Se intentó enviar un Product ID inválido (NaN). Revisa el mapeo de items.");
            }

            const response = await api.post("orders", data);
            const order = response.data;

            // =========================================================
            // RESPUESTA
            // =========================================================
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
                responseData.message = `Orden creada. Paga aquí: ${responseData.payment_link}`;
            } else {
                responseData.payment_link = null;
                responseData.message = "Orden Contraentrega creada exitosamente.";
            }

            console.log(`✅ Orden #${order.id} creada OK. Total: ${order.total}`);

            return {
                content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }],
            };

        } catch (error: any) {
            console.error("❌ ERROR CRÍTICO:", error.response?.data || error.message);
            return {
                content: [{ type: "text", text: `Error: ${error.message} - ${JSON.stringify(error.response?.data || "")}` }],
                isError: true,
            };
        }
    },
};