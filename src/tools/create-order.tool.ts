import { z } from "zod";
import { WooTool } from "../types.js";

// ---------------------------------------------------------
// 1. DICCIONARIO DE DEPARTAMENTOS (Corrección ISO para WooCommerce)
// ---------------------------------------------------------
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

// Función auxiliar para obtener el código limpio
function getStateCode(stateName: string): string {
    if (!stateName || stateName.length <= 3) return stateName || "";
    const clean = stateName.toUpperCase().trim();
    return COLOMBIA_STATES[clean] || stateName; // Retorna el código o el original si no encuentra
}

// ---------------------------------------------------------
// 2. DEFINICIÓN DE LA HERRAMIENTA
// ---------------------------------------------------------
export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce. Corrige departamentos y soporta Pago Online/Contraentrega.",

    inputSchema: z.object({
        paymentMethod: z.enum(["online", "cod"]).describe("online = Link de Pago | cod = Contraentrega"),

        // Procesamiento de items (conversión de String a JSON si es necesario)
        items: z.preprocess(
            (val) => {
                if (typeof val === 'string') {
                    try { return JSON.parse(val); } catch (e) { return val; }
                }
                return val;
            },
            z.array(z.object({
                productId: z.coerce.number().describe("ID del producto"),
                quantity: z.coerce.number().min(1).default(1).describe("Cantidad"),
                variationId: z.coerce.number().optional().describe("ID de variación")
            }))
        ).describe("Lista de productos"),

        firstName: z.string().describe("Nombre"),
        lastName: z.string().describe("Apellido"),
        email: z.string().email().describe("Email"),
        phone: z.string().optional().describe("Teléfono"),
        address: z.string().describe("Dirección"),
        city: z.string().describe("Ciudad"),
        state: z.string().optional().describe("Departamento"),
        country: z.string().length(2).default("CO").describe("País"),
        note: z.string().optional().describe("Nota"),
        shippingMethodId: z.string().optional().describe("ID envío"),
        couponCode: z.string().optional().describe("Cupón")
    }),

    handler: async (api, args) => {
        try {
            console.log(`🛒 Procesando Orden (${args.paymentMethod}) para: ${args.email}`);

            // -----------------------------------------------------
            // PASO A: Limpieza de Ítems (Vital para evitar orden vacía)
            // -----------------------------------------------------
            const lineItems = args.items.map(item => {
                const line: any = { product_id: item.productId, quantity: item.quantity };

                // Solo enviamos variation_id si es un número válido mayor a 0
                // Si enviamos "0", WooCommerce puede ignorar la línea completa
                if (item.variationId && item.variationId > 0) {
                    line.variation_id = item.variationId;
                }
                return line;
            });

            // -----------------------------------------------------
            // PASO B: Corrección del Departamento (Antioquia -> ANT)
            // -----------------------------------------------------
            const cleanState = getStateCode(args.state || "");

            // -----------------------------------------------------
            // PASO C: Configuración de Pago (Tu lógica unificada)
            // -----------------------------------------------------
            let paymentConfig = {};
            if (args.paymentMethod === 'cod') {
                paymentConfig = {
                    payment_method: "cod",
                    payment_method_title: "Pago Contra Entrega",
                    status: "processing",
                    set_paid: false
                };
            } else {
                paymentConfig = {
                    payment_method: "bacs",
                    payment_method_title: "Pago en Línea (Pendiente)",
                    status: "pending",
                    set_paid: false
                };
            }

            // -----------------------------------------------------
            // PASO D: Construcción del Payload
            // -----------------------------------------------------
            const data = {
                ...paymentConfig,
                customer_note: args.note || "Pedido vía Chatbot IA",
                billing: {
                    first_name: args.firstName,
                    last_name: args.lastName,
                    address_1: args.address,
                    city: args.city,
                    state: cleanState, // <--- AQUÍ USAMOS EL ESTADO CORREGIDO
                    country: args.country,
                    email: args.email,
                    phone: args.phone || ""
                },
                shipping: {
                    first_name: args.firstName,
                    last_name: args.lastName,
                    address_1: args.address,
                    city: args.city,
                    state: cleanState, // <--- AQUÍ TAMBIÉN
                    country: args.country
                },
                line_items: lineItems,
                shipping_lines: args.shippingMethodId ? [{ method_id: args.shippingMethodId, method_title: "Envío" }] : [],
                coupon_lines: args.couponCode ? [{ code: args.couponCode }] : []
            };

            // Log para depuración en Railway
            console.log("📦 Payload enviado a Woo:", JSON.stringify(data));

            const response = await api.post("orders", data);
            const order = response.data;

            // -----------------------------------------------------
            // PASO E: Respuesta Final con Link (si aplica)
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
                const payLink = `${domain}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;

                responseData.payment_link = payLink;
                responseData.message = "Orden Creada. Se requiere pago en el link.";
            } else {
                responseData.payment_link = null;
                responseData.message = "Orden Confirmada exitosamente. Se pagará al recibir.";
            }

            console.log(`✅ Order #${order.id} Created.`);

            return {
                content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }],
            };

        } catch (error: any) {
            console.error("❌ Error Woo:", error.response?.data?.message || error.message);
            return {
                content: [{ type: "text", text: `Error: ${error.response?.data?.message || error.message}` }],
                isError: true,
            };
        }
    },
};