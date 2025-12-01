import { searchWooProductsTool } from "./search-products.tool.js";
import { getOrderTool } from "./get-order.tool.js";
import { createOrderTool } from "./create-order.tool.js";
import { WooTool } from "../types.js";
import { updateOrderTool } from "./update-order.tool.js";
import { checkCouponTool } from "./check-coupon.tool.js";
import { getShippingTool } from "./get-shipping.tool.js";
import { getCategoriesTool } from "./get-categories.tool.js";

export const tools: WooTool[] = [
  searchWooProductsTool,
  getOrderTool,
  createOrderTool,
  updateOrderTool,
  checkCouponTool,
  getShippingTool,
  getCategoriesTool

];