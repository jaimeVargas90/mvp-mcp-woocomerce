import { z } from "zod";
import { WooTool } from "../types.js";

export const checkCouponTool: WooTool = {
    name: "checkCoupon",
    description: "Verifica si un código de cupón es válido y devuelve sus detalles (descuento, descripción).",

    inputSchema: z.object({
        code: z.string().describe("El código del cupón a verificar (ej: 'VERANO2025')"),
    }),

    handler: async (api, args) => {
        try {
            console.log(`🎟️ Verificando cupón: ${args.code}`);

            // Buscamos el cupón por su código exacto
            const response = await api.get("coupons", {
                code: args.code
            });

            if (response.data.length === 0) {
                return {
                    content: [{ type: "text", text: `El cupón '${args.code}' no existe o no es válido.` }],
                };
            }

            // Tomamos el primer resultado (los códigos son únicos en teoría)
            const coupon = response.data[0];

            // Verificar caducidad manualmente para ayudar a la IA
            const now = new Date();
            let isExpired = false;
            if (coupon.date_expires) {
                const expiryDate = new Date(coupon.date_expires);
                if (now > expiryDate) {
                    isExpired = true;
                }
            }

            const couponInfo = {
                code: coupon.code,
                amount: coupon.amount,
                discount_type: coupon.discount_type, // 'percent' o 'fixed_cart'
                description: coupon.description,
                is_expired: isExpired,
                expires_at: coupon.date_expires || "Nunca",
                usage_count: coupon.usage_count,
                minimum_amount: coupon.minimum_amount
            };

            if (isExpired) {
                return {
                    content: [{ type: "text", text: `El cupón '${args.code}' existe pero EXPIRÓ el ${coupon.date_expires}.` }],
                };
            }

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