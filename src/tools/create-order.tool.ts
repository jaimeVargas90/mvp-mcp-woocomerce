import { z } from "zod";
import { WooTool } from "../types.js";
import axios from "axios";

// --- HELPER: DICCIONARIO DE DEPARTAMENTOS DE COLOMBIA ---
// Convierte lo que manda la IA ("Antioquia") a lo que quiere Woo ("ANT")
function normalizeStateCO(input: string): string {
    if (!input) return "";

    // Normalizamos: quitamos tildes y pasamos a mayúsculas
    const clean = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

    const map: Record<string, string> = {
        "AMAZONAS": "AMA",
        "ANTIOQUIA": "ANT",
        "ARAUCA": "ARA",
        "ATLANTICO": "ATL",
        "BOLIVAR": "BOL",
        "BOYACA": "BOY",
        "CALDAS": "CAL",
        "CAQUETA": "CAQ",
        "CASANARE": "CAS",
        "CAUCA": "CAU",
        "CESAR": "CES",
        "CHOCO": "CHO",
        "CORDOBA": "COR",
        "CUNDINAMARCA": "CUN",
        "BOGOTA": "DC",      // Ojo: En algunos Woo es 'CUN', en la mayoría es 'DC'
        "BOGOTA D.C.": "DC",
        "BOGOTA DC": "DC",
        "D.C.": "DC",
        "GUAINIA": "GUA",
        "GUAVIARE": "GUV",
        "HUILA": "HUI",
        "LA GUAJIRA": "LAG",
        "GUAJIRA": "LAG",
        "MAGDALENA": "MAG",
        "META": "MET",
        "NARINO": "NAR",
        "NORTE DE SANTANDER": "NSA",
        "PUTUMAYO": "PUT",
        "QUINDIO": "QUI",
        "RISARALDA": "RIS",
        "SAN ANDRES": "SAP",
        "SANTANDER": "SAN",
        "SUCRE": "SUC",
        "TOLIMA": "TOL",
        "VALLE": "VAC",
        "VALLE DEL CAUCA": "VAC",
        "VAUPES": "VAU",
        "VICHADA": "VID"
    };

    // Si no está en la lista (ej: ya mandaron el código), devolvemos el original limpio
    return map[clean] || (clean.length <= 3 ? clean : input);
}

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en la tienda. No requiere construir JSON complejo, solo pasar los datos del cliente y los productos.",

    inputSchema: z.object({
        // 1. Datos del Cliente (Simplificados)
        firstName: z.string().describe("Nombre del cliente"),
        lastName: z.string().describe("Apellido del cliente"),
        email: z.string().email().describe("Email del cliente"),
        phone: z.string().describe("Teléfono"),
        address: z.string().describe("Dirección completa"),
        city: z.string().describe("Ciudad"),
        state: z.string().describe("Departamento o Estado (ej: Antioquia, Bogotá, Valle)"), // La IA puede mandar el nombre completo
        country: z.string().default("CO").describe("Código de país (Default: CO)"),

        // 2. Productos (Array simple)
        line_items: z.array(z.object({
            product_id: z.number().describe("ID del producto a comprar"),
            variation_id: z.number().optional().describe("ID de la variación si aplica (talla/color)"),
            quantity: z.number().default(1).describe("Cantidad")
        })).describe("Lista de productos a comprar"),

        // 3. Método de pago (Opcional)
        paymentMethod: z.enum(["bacs", "cod"]).default("bacs").describe("bacs (Transferencia) o cod (Contra entrega)"),
        paymentTitle: z.string().optional().describe("Título del pago (ej: Transferencia Bancaria)")
    }),

    handler: async (api, args) => {
        try {
            console.log(`🛒 Procesando pedido para: ${args.firstName} ${args.lastName}`);

            // ✨ PASO CLAVE: Convertimos "Antioquia" -> "ANT" aquí mismo
            const stateCode = normalizeStateCO(args.state);
            console.log(`🗺️ Normalizando estado: "${args.state}" -> "${stateCode}"`);

            // --- 1. CONSTRUCCIÓN DEL JSON "DIFÍCIL" ---
            const billingData = {
                first_name: args.firstName,
                last_name: args.lastName,
                address_1: args.address,
                city: args.city,
                state: stateCode, // <--- Usamos el código ya convertido
                country: args.country,
                email: args.email,
                phone: args.phone
            };

            // Por defecto, envío = facturación
            const shippingData = { ...billingData };

            const orderPayload = {
                payment_method: args.paymentMethod,
                payment_method_title: args.paymentTitle || (args.paymentMethod === 'cod' ? 'Contra Entrega' : 'Transferencia'),
                set_paid: false,
                status: "pending",
                billing: billingData,
                shipping: shippingData,
                line_items: args.line_items
            };

            // --- 2. LOGICA DE CONEXIÓN ---
            const client = api as any;
            let url = client.url || client._url || "";
            const key = client.consumerKey || client._consumerKey || "";
            const secret = client.consumerSecret || client._consumerSecret || "";

            if (!url.startsWith("http")) url = "https://" + url;
            if (url.endsWith("/")) url = url.slice(0, -1);

            const response = await axios.post(
                `${url}/wp-json/wc/v3/orders`,
                orderPayload,
                {
                    params: { consumer_key: key, consumer_secret: secret },
                    headers: { "Content-Type": "application/json" }
                }
            );

            const order = response.data;

            // --- 3. RESPUESTA ---
            let paymentLink = null;
            if (order.payment_method !== 'cod' && order.status !== 'completed') {
                paymentLink = `${url}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
            }

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        success: true,
                        order_id: order.id,
                        status: order.status,
                        total: order.total,
                        payment_link: paymentLink,
                        message: "Pedido creado exitosamente."
                    }, null, 2)
                }]
            };

        } catch (error: any) {
            const msg = error.response?.data?.message || error.message;
            console.error("❌ Error creando pedido:", msg);
            return {
                content: [{ type: "text", text: `Error al crear el pedido: ${msg}` }],
                isError: true
            };
        }
    }
};