import { listWooProductsTool } from "./list-products.tool.js";
import { searchWooProductsTool } from "./search-products.tool.js";
import { getOrderTool } from "./get-order.tool.js";
import { createOrderTool } from "./create-order.tool.js";
import { WooTool } from "../types.js";

export const tools: WooTool[] = [
  listWooProductsTool,
  searchWooProductsTool,
  getOrderTool,
  createOrderTool
];