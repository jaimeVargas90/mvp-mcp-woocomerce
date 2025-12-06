import { z } from "zod";
import { WooTool } from "../types.js";

/**
 * Herramienta para verificar la validez de un cupón y obtener sus detalles.
 */
export const checkCouponTool: WooTool = {
    name: "checkCoupon",
    description: "Verifica si un código de cupón es válido y devuelve sus detalles, restricciones y descuento.",

    inputSchema: z.object({
        code: z.string().describe("El código del cupón a verificar (ej: 'VERANO2025')"),
    }),

    handler: async (api, args) => {
        try {
            console.log(`🎟️ Verificando cupón: ${args.code}`);

            // Buscar el cupón por código exacto
            const response = await api.get("coupons", {
                code: args.code
            });

            if (response.data.length === 0) {
                return {
                    content: [{ type: "text", text: `El cupón '${args.code}' no existe.` }],
                };
            }

            const coupon = response.data[0];

            // 1. Verificar caducidad
            const now = new Date();
            let isExpired = false;
            if (coupon.date_expires) {
                const expiryDate = new Date(coupon.date_expires);
                // Ajuste simple de zona horaria si es necesario, aquí usamos UTC/Local del server
                if (now > expiryDate) {
                    isExpired = true;
                }
            }

            if (isExpired) {
                return {
                    content: [{ type: "text", text: `El cupón '${args.code}' existe pero EXPIRÓ el ${coupon.date_expires}.` }],
                };
            }

            // 2. Compilar restricciones para el contexto de la IA
            const restrictions: string[] = [];

            // Gasto Mínimo/Máximo
            if (parseFloat(coupon.minimum_amount) > 0) {
                restrictions.push(`Compra mínima requerida: $${coupon.minimum_amount}`);
            }
            if (parseFloat(coupon.maximum_amount) > 0) {
                restrictions.push(`Compra máxima permitida: $${coupon.maximum_amount}`);
            }

            // Uso individual
            if (coupon.individual_use) {
                restrictions.push("No se puede combinar con otros cupones.");
            }
            if (coupon.exclude_sale_items) {
                restrictions.push("No aplica a productos que ya están en oferta.");
            }

            // Restricciones de productos/categorías
            if (coupon.product_ids.length > 0) {
                restrictions.push("Solo válido para productos específicos.");
            }
            if (coupon.excluded_product_ids.length > 0) {
                restrictions.push("No válido para ciertos productos excluidos.");
            }
            if (coupon.product_categories.length > 0) {
                restrictions.push("Limitado a ciertas categorías.");
            }

            // 3. Estructurar respuesta limpia
            const couponInfo = {
                valid: true,
                code: coupon.code,
                discount_type: coupon.discount_type, // 'percent', 'fixed_cart', 'fixed_product'
                amount: parseFloat(coupon.amount),
                description: coupon.description || "Sin descripción",
                restrictions: restrictions, // La IA usará esto para advertir al usuario
                usage_limit: coupon.usage_limit,
                usage_count: coupon.usage_count,
                expires_at: coupon.date_expires || "Nunca"
            };

            return {
                content: [{ type: "text", text: JSON.stringify(couponInfo, null, 2) }],
            };

        } catch (error: any) {
            console.error("Error checkCoupon:", error.message);
            return {
                content: [{ type: "text", text: `Error verificando cupón: ${error.message}` }],
                isError: true,
            };
        }
    },
};