import { listWooProductsTool } from "./list-products.tool.js";
import { searchWooProductsTool } from "./search-products.tool.js"; // 👈 Importar
import { WooTool } from "../types.js";

export const tools: WooTool[] = [
  listWooProductsTool,
  searchWooProductsTool, // 👈 Agregar a la lista
];