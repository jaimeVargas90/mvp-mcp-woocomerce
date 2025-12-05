import { z } from "zod";
import { WooTool } from "../types.js";

// --- DICCIONARIO DEPARTAMENTOS ---
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

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce. IMPORTANTE: Los items deben enviarse como una cadena de texto JSON.",

    // 🔥 ESQUEMA SIMPLIFICADO PARA EVITAR EL ERROR 424
    inputSchema: z.object({
        paymentMethod: z.enum(["online", "cod"]).describe("online o cod"),

        // Aquí está el cambio: Pedimos STRING explícitamente para que la conexión no falle.
        items: z.string().describe("JSON String de productos. Ejemplo exacto: '[{\"productId\": 10282, \"quantity\": 1}]'"),

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
            console.log("🚨 1. INPUT RECIBIDO:", JSON.stringify(args));

            // =========================================================
            // PARSEO MANUAL DE ITEMS (Aquí arreglamos el pedido vacío)
            // =========================================================
            let finalItems: any[] = [];

            // Limpieza agresiva de strings (quita comillas extra si el LLM se equivoca)
            let rawItems = args.items.trim();
            if (rawItems.startsWith('"') && rawItems.endsWith('"')) {
                rawItems = rawItems.slice(1, -1);
            }
            rawItems = rawItems.replace(/\\"/g, '"'); // Arregla comillas escapadas

            try {
                finalItems = JSON.parse(rawItems);
            } catch (e) {
                console.error("Error parseando JSON items:", e);
                // Intento de salvación: si falla, miramos si llegó como objeto (raro con z.string, pero posible en runtime)
                if (Array.isArray(args.items)) finalItems = args.items;
            }

            if (!finalItems || finalItems.length === 0) {
                throw new Error("❌ Error: No se pudieron leer los productos. Revisa el formato JSON.");
            }

            // Mapeo seguro a números
            const lineItems = finalItems.map((item: any) => ({
                product_id: Number(item.productId || item.product_id),
                quantity: Number(item.quantity || 1),
                variation_id: item.variationId ? Number(item.variationId) : undefined
            }));

            // Validación rápida de que tenemos números
            if (isNaN(lineItems[0].product_id)) {
                throw new Error(`❌ Error: El ID del producto no es un número válido. Recibido: ${JSON.stringify(lineItems)}`);
            }

            // =========================================================
            // CONFIGURACIÓN RESTO DEL PEDIDO
            // =========================================================
            const cleanState = getStateCode(args.state || "");

            const data = {
                payment_method: args.paymentMethod === 'cod' ? "cod" : "bacs",
                payment_method_title: args.paymentMethod === 'cod' ? "Contraentrega" : "Pago en Línea",
                set_paid: false,
                status: args.paymentMethod === 'cod' ? "processing" : "pending",
                customer_note: args.note,
                billing: {
                    first_name: args.firstName, last_name: args.lastName,
                    address_1: args.address, city: args.city,
                    state: cleanState, country: args.country,
                    email: args.email, phone: args.phone
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

            console.log("📦 ENVIANDO A WOO:", JSON.stringify(data.line_items));

            const response = await api.post("orders", data);
            const order = response.data;

            // RESPUESTA
            let link = null;
            if (args.paymentMethod === 'online') {
                link = `https://tiendamedicalospinos.com/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
            }

            const result = {
                success: true,
                order_id: order.id,
                total: order.total,
                payment_link: link,
                message: link ? "Pedido creado. Paga aquí." : "Pedido creado exitosamente."
            };

            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
            };

        } catch (error: any) {
            console.error("❌ ERROR:", error.message);
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }],
                isError: true
            };
        }
    }
};