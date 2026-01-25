import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import {
  CreateProductDto,
  UpdateProductDto,
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateSupplierDto,
  UpdateSupplierDto,
  CreateStockMovementDto,
  CreateStocktakeDto,
  UpdateStocktakeItemDto,
  ListProductsQuery,
  ListStockQuery,
  ListMovementsQuery,
} from "./dto";
import { FilesService } from "../files/files.service";
import * as XLSX from "xlsx";
import AdmZip from "adm-zip";
import * as fs from "fs/promises";
import * as path from "path";

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly filesService: FilesService) {}

  // =====================
  // PRODUCTS
  // =====================

  async listProducts(orgId: string, query: ListProductsQuery) {
    const page = parseInt(query.page || "1");
    const limit = parseInt(query.limit || "20");
    const skip = (page - 1) * limit;

    const where: any = { orgId };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { sku: { contains: query.search, mode: "insensitive" } },
        { barcode: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === "true";
    }

    const orderBy: any = {};
    if (query.sortBy) {
      orderBy[query.sortBy] = query.sortOrder || "asc";
    } else {
      orderBy.name = "asc";
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          stockItems: {
            include: {
              warehouse: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      items: products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getProduct(orgId: string, id: string) {
    const product = await prisma.product.findFirst({
      where: { id, orgId },
      include: {
        stockItems: {
          include: {
            warehouse: true,
          },
        },
        productSuppliers: {
          include: {
            supplier: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return product;
  }

  async createProduct(orgId: string, dto: CreateProductDto) {
    // Check for duplicate SKU
    if (dto.sku) {
      const existing = await prisma.product.findFirst({
        where: { orgId, sku: dto.sku },
      });
      if (existing) {
        throw new BadRequestException("Product with this SKU already exists");
      }
    }

    // Check for duplicate barcode
    if (dto.barcode) {
      const existing = await prisma.product.findFirst({
        where: { orgId, barcode: dto.barcode },
      });
      if (existing) {
        throw new BadRequestException("Product with this barcode already exists");
      }
    }

    return prisma.product.create({
      data: {
        orgId,
        ...dto,
      },
    });
  }

  async updateProduct(orgId: string, id: string, dto: UpdateProductDto) {
    const product = await prisma.product.findFirst({
      where: { id, orgId },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    // Check for duplicate SKU
    if (dto.sku && dto.sku !== product.sku) {
      const existing = await prisma.product.findFirst({
        where: { orgId, sku: dto.sku, NOT: { id } },
      });
      if (existing) {
        throw new BadRequestException("Product with this SKU already exists");
      }
    }

    return prisma.product.update({
      where: { id },
      data: dto,
    });
  }

  async deleteProduct(orgId: string, id: string) {
    const product = await prisma.product.findFirst({
      where: { id, orgId },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    // Check if product has stock
    const stockItems = await prisma.stockItem.findMany({
      where: { productId: id, quantity: { gt: 0 } },
    });

    if (stockItems.length > 0) {
      throw new BadRequestException(
        "Cannot delete product with existing stock. Please adjust stock to 0 first."
      );
    }

    return prisma.product.delete({
      where: { id },
    });
  }

  // =====================
  // WAREHOUSES
  // =====================

  async listWarehouses(orgId: string, query: { search?: string; isActive?: string }) {
    const where: any = { orgId };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === "true";
    }

    const warehouses = await prisma.warehouse.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return { items: warehouses };
  }

  async getWarehouse(orgId: string, id: string) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { id, orgId },
      include: {
        stockItems: {
          include: {
            product: true,
          },
        },
        _count: {
          select: {
            stockItems: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException("Warehouse not found");
    }

    return warehouse;
  }

  async createWarehouse(orgId: string, dto: CreateWarehouseDto) {
    // Check for duplicate code
    const existing = await prisma.warehouse.findFirst({
      where: { orgId, code: dto.code },
    });

    if (existing) {
      throw new BadRequestException("Warehouse with this code already exists");
    }

    // If this is set as default, unset other defaults
    if (dto.isDefault) {
      await prisma.warehouse.updateMany({
        where: { orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return prisma.warehouse.create({
      data: {
        orgId,
        ...dto,
      },
    });
  }

  async updateWarehouse(orgId: string, id: string, dto: UpdateWarehouseDto) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { id, orgId },
    });

    if (!warehouse) {
      throw new NotFoundException("Warehouse not found");
    }

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await prisma.warehouse.updateMany({
        where: { orgId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    return prisma.warehouse.update({
      where: { id },
      data: dto,
    });
  }

  async deleteWarehouse(orgId: string, id: string) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { id, orgId },
    });

    if (!warehouse) {
      throw new NotFoundException("Warehouse not found");
    }

    // Check if warehouse has stock
    const stockItems = await prisma.stockItem.findMany({
      where: { warehouseId: id, quantity: { gt: 0 } },
    });

    if (stockItems.length > 0) {
      throw new BadRequestException(
        "Cannot delete warehouse with existing stock. Please transfer stock first."
      );
    }

    return prisma.warehouse.delete({
      where: { id },
    });
  }

  // =====================
  // SUPPLIERS
  // =====================

  async listSuppliers(orgId: string, query: { search?: string; status?: string }) {
    const where: any = { orgId };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return { items: suppliers };
  }

  async getSupplier(orgId: string, id: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, orgId },
      include: {
        productSuppliers: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException("Supplier not found");
    }

    return supplier;
  }

  async createSupplier(orgId: string, dto: CreateSupplierDto) {
    return prisma.supplier.create({
      data: {
        orgId,
        ...dto,
      },
    });
  }

  async updateSupplier(orgId: string, id: string, dto: UpdateSupplierDto) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, orgId },
    });

    if (!supplier) {
      throw new NotFoundException("Supplier not found");
    }

    return prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async deleteSupplier(orgId: string, id: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, orgId },
    });

    if (!supplier) {
      throw new NotFoundException("Supplier not found");
    }

    return prisma.supplier.delete({
      where: { id },
    });
  }

  // =====================
  // STOCK & MOVEMENTS
  // =====================

  async listStock(orgId: string, query: ListStockQuery) {
    const page = parseInt(query.page || "1");
    const limit = parseInt(query.limit || "20");
    const skip = (page - 1) * limit;

    const productWhere: any = { orgId };

    if (query.search) {
      productWhere.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { sku: { contains: query.search, mode: "insensitive" } },
      ];
    }

    if (query.category) {
      productWhere.category = query.category;
    }

    // Get all products with stock items
    const products = await prisma.product.findMany({
      where: productWhere,
      include: {
        stockItems: {
          where: query.warehouseId ? { warehouseId: query.warehouseId } : {},
          include: {
            warehouse: true,
          },
        },
      },
    });

    // Process products to calculate stock metrics
    let processedProducts = products.map((product) => {
      const totalQuantity = product.stockItems.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      );
      const totalAvailable = product.stockItems.reduce(
        (sum, item) => sum + (item.available || 0),
        0
      );
      const totalValue = product.stockItems.reduce(
        (sum, item) => sum + (item.totalValue || 0),
        0
      );

      let stockStatus: "in-stock" | "low-stock" | "out-of-stock" = "out-of-stock";
      if (totalAvailable > product.reorderPoint) {
        stockStatus = "in-stock";
      } else if (totalAvailable > 0) {
        stockStatus = "low-stock";
      }

      return {
        ...product,
        totalQuantity,
        totalAvailable,
        totalValue,
        stockStatus,
      };
    });

    // Filter by stock status if provided
    if (query.stockStatus) {
      processedProducts = processedProducts.filter(
        (p) => p.stockStatus === query.stockStatus
      );
    }

    // Calculate metrics
    const metrics = {
      totalProducts: processedProducts.length,
      inStockProducts: processedProducts.filter((p) => p.stockStatus === "in-stock")
        .length,
      lowStockProducts: processedProducts.filter((p) => p.stockStatus === "low-stock")
        .length,
      outOfStockProducts: processedProducts.filter(
        (p) => p.stockStatus === "out-of-stock"
      ).length,
      totalInventoryValue: processedProducts.reduce(
        (sum, p) => sum + p.totalValue,
        0
      ),
    };

    // Paginate
    const total = processedProducts.length;
    const paginatedProducts = processedProducts.slice(skip, skip + limit);

    return {
      items: paginatedProducts,
      metrics,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async createStockMovement(orgId: string, userId: string, dto: CreateStockMovementDto) {
    // Verify product exists
    const product = await prisma.product.findFirst({
      where: { id: dto.productId, orgId },
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    // Get or create stock item for the warehouse
    let stockItem = await prisma.stockItem.findFirst({
      where: {
        productId: dto.productId,
        warehouseId: dto.warehouseId || null,
      },
    });

    if (!stockItem) {
      stockItem = await prisma.stockItem.create({
        data: {
          orgId,
          productId: dto.productId,
          warehouseId: dto.warehouseId || null,
          quantity: 0,
          reserved: 0,
          available: 0,
          averageCost: 0,
          totalValue: 0,
          reorderPoint: product.reorderPoint,
        },
      });
    }

    // Calculate new quantities
    const newQuantity = stockItem.quantity + dto.quantity;
    const newAvailable = Math.max(0, newQuantity - stockItem.reserved);

    // Calculate weighted average cost for receipts
    let newAverageCost = stockItem.averageCost;
    if (dto.quantity > 0 && dto.unitCost && dto.unitCost > 0) {
      const currentTotalCost = stockItem.quantity * stockItem.averageCost;
      const newTotalCost = dto.quantity * dto.unitCost;
      newAverageCost =
        newQuantity > 0 ? (currentTotalCost + newTotalCost) / newQuantity : 0;
    }

    const newTotalValue = newQuantity * newAverageCost;

    // Create the movement
    const movement = await prisma.stockMovement.create({
      data: {
        orgId,
        productId: dto.productId,
        stockItemId: stockItem.id,
        type: dto.type,
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        totalCost: dto.unitCost ? dto.quantity * dto.unitCost : null,
        warehouseId: dto.warehouseId,
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        supplierId: dto.supplierId,
        visitId: dto.visitId,
        reference: dto.reference,
        reason: dto.reason,
        notes: dto.notes,
        userId,
      },
      include: {
        product: true,
        warehouse: true,
        supplier: true,
      },
    });

    // Update stock item
    await prisma.stockItem.update({
      where: { id: stockItem.id },
      data: {
        quantity: newQuantity,
        available: newAvailable,
        averageCost: newAverageCost,
        totalValue: newTotalValue,
      },
    });

    // Handle transfers - create corresponding movement in destination warehouse
    if (dto.type === "TRANSFER_OUT" && dto.toWarehouseId) {
      await this.createStockMovement(orgId, userId, {
        productId: dto.productId,
        warehouseId: dto.toWarehouseId,
        type: "TRANSFER_IN",
        quantity: Math.abs(dto.quantity),
        unitCost: dto.unitCost,
        fromWarehouseId: dto.warehouseId,
        reference: dto.reference,
        reason: dto.reason,
        notes: `Transfer from warehouse: ${dto.warehouseId}`,
      });
    }

    return movement;
  }

  async listStockMovements(orgId: string, query: ListMovementsQuery) {
    const page = parseInt(query.page || "1");
    const limit = parseInt(query.limit || "50");
    const skip = (page - 1) * limit;

    const where: any = { orgId };

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.createdAt.lte = new Date(query.to);
      }
    }

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          product: true,
          warehouse: true,
          fromWarehouse: true,
          toWarehouse: true,
          supplier: true,
          stockItem: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return {
      items: movements,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // =====================
  // STOCKTAKE
  // =====================

  async listStocktakes(orgId: string, query: { status?: string; warehouseId?: string }) {
    const where: any = { orgId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }

    const stocktakes = await prisma.stocktakeSession.findMany({
      where,
      include: {
        warehouse: true,
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { items: stocktakes };
  }

  async createStocktake(orgId: string, userId: string, dto: CreateStocktakeDto) {
    // Verify warehouse exists
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, orgId },
    });

    if (!warehouse) {
      throw new NotFoundException("Warehouse not found");
    }

    // Generate session number
    const count = await prisma.stocktakeSession.count({ where: { orgId } });
    const sessionNumber = `ST-${String(count + 1).padStart(6, "0")}`;

    // Create stocktake session
    const stocktake = await prisma.stocktakeSession.create({
      data: {
        orgId,
        warehouseId: dto.warehouseId,
        sessionNumber,
        name: dto.name || `Stocktake ${new Date().toLocaleDateString()}`,
        notes: dto.notes,
        createdBy: userId,
        startedAt: new Date(),
      },
      include: {
        warehouse: true,
      },
    });

    // Create stocktake items for all products in the warehouse
    const stockItems = await prisma.stockItem.findMany({
      where: { warehouseId: dto.warehouseId },
      include: { product: true },
    });

    await prisma.stocktakeItem.createMany({
      data: stockItems.map((item) => ({
        orgId,
        stocktakeId: stocktake.id,
        productId: item.productId,
        stockItemId: item.id,
        expectedQty: item.quantity,
      })),
    });

    return stocktake;
  }

  async getStocktake(orgId: string, id: string) {
    const stocktake = await prisma.stocktakeSession.findFirst({
      where: { id, orgId },
      include: {
        warehouse: true,
        items: {
          include: {
            product: true,
            stockItem: true,
          },
        },
      },
    });

    if (!stocktake) {
      throw new NotFoundException("Stocktake session not found");
    }

    return stocktake;
  }

  async updateStocktakeItem(
    orgId: string,
    stocktakeId: string,
    itemId: string,
    userId: string,
    dto: UpdateStocktakeItemDto
  ) {
    const item = await prisma.stocktakeItem.findFirst({
      where: { id: itemId, stocktakeId, orgId },
    });

    if (!item) {
      throw new NotFoundException("Stocktake item not found");
    }

    const variance = dto.countedQty - item.expectedQty;

    return prisma.stocktakeItem.update({
      where: { id: itemId },
      data: {
        countedQty: dto.countedQty,
        variance,
        notes: dto.notes,
        countedBy: userId,
        countedAt: new Date(),
      },
    });
  }

  async completeStocktake(orgId: string, id: string, userId: string) {
    const stocktake = await prisma.stocktakeSession.findFirst({
      where: { id, orgId },
      include: {
        items: {
          include: {
            stockItem: true,
          },
        },
      },
    });

    if (!stocktake) {
      throw new NotFoundException("Stocktake session not found");
    }

    if (stocktake.status !== "IN_PROGRESS") {
      throw new BadRequestException("Stocktake is not in progress");
    }

    // Check if all items have been counted
    const uncountedItems = stocktake.items.filter((item) => item.countedQty === null);
    if (uncountedItems.length > 0) {
      throw new BadRequestException(
        `${uncountedItems.length} items have not been counted yet`
      );
    }

    // Create adjustment movements for variances
    for (const item of stocktake.items) {
      if (item.variance && item.variance !== 0 && item.stockItem) {
        await this.createStockMovement(orgId, userId, {
          productId: item.productId,
          warehouseId: stocktake.warehouseId,
          type: "ADJUSTMENT",
          quantity: item.variance,
          reason: "Stocktake adjustment",
          reference: stocktake.sessionNumber,
          notes: item.notes || `Variance from stocktake ${stocktake.sessionNumber}`,
        });
      }
    }

    // Update stocktake status
    return prisma.stocktakeSession.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
  }

  // =====================
  // BULK OPERATIONS
  // =====================

  /**
   * Parse number from CSV/Excel (handles commas, spaces, currency symbols)
   */
  private parseNumber(value: any): number {
    if (value === null || value === undefined || value === "") {
      return 0;
    }
    if (typeof value === "number") {
      return isNaN(value) ? 0 : value;
    }
    let cleaned = String(value).trim();
    cleaned = cleaned.replace(/[^\d.-]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = parts[0] + "." + parts.slice(1).join("");
    }
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Column mapping for flexible header names
   */
  private columnMap: { [key: string]: string } = {
    SKU: "sku",
    sku: "sku",
    product_sku: "sku",
    "Product SKU": "sku",
    Name: "name",
    name: "name",
    product_name: "name",
    "Product Name": "name",
    Product: "name",
    Description: "description",
    description: "description",
    Brand: "brand",
    brand: "brand",
    Price: "price",
    price: "price",
    selling_price: "price",
    Cost: "cost",
    cost: "cost",
    cost_price: "cost",
    Quantity: "quantity",
    quantity: "quantity",
    stock_quantity: "quantity",
    "Reorder Point": "reorder_point",
    reorder_point: "reorder_point",
    "Import Currency": "import_currency",
    import_currency: "import_currency",
    currency: "import_currency",
    "UOM Base": "uom_base",
    uom_base: "uom_base",
    "UOM Sell": "uom_sell",
    uom_sell: "uom_sell",
    Active: "active",
    active: "active",
    Category: "category",
    category: "category",
  };

  /**
   * Normalize a row using column mapping
   */
  private normalizeRow(row: any): any {
    const normalized: any = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = this.columnMap[key] || key.toLowerCase().replace(/\s+/g, "_");
      normalized[normalizedKey] = value;
    }
    return normalized;
  }

  /**
   * Parse Excel file
   */
  private parseExcel(buffer: Buffer): any[] {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      return jsonData.map((row) => this.normalizeRow(row));
    } catch (error) {
      this.logger.error("Error parsing Excel:", error);
      throw new BadRequestException(
        `Failed to parse Excel file: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Parse CSV content
   */
  private parseCSV(content: string): any[] {
    try {
      const lines = content.split("\n").filter((line) => line.trim());
      if (lines.length < 2) {
        return [];
      }

      const originalHeaders = lines[0].split(",").map((h) => h.trim().replace(/['"]/g, ""));
      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values: string[] = [];
        let current = "";
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === "," && !inQuotes) {
            values.push(current.trim().replace(/['"]/g, ""));
            current = "";
          } else {
            current += char;
          }
        }
        values.push(current.trim().replace(/['"]/g, ""));

        const row: any = {};
        originalHeaders.forEach((header, index) => {
          const normalizedKey = this.columnMap[header] || header.toLowerCase();
          row[normalizedKey] = values[index] || "";
        });
        rows.push(row);
      }

      return rows;
    } catch (error) {
      this.logger.error("Error parsing CSV:", error);
      throw new BadRequestException(
        `Failed to parse CSV file: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Bulk import products from CSV/Excel file
   */
  async bulkImportProducts(orgId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("No file provided");
    }

    const fileName = file.originalname.toLowerCase();
    const isExcel =
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls") ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel";

    let parsedData: any[];

    if (isExcel) {
      parsedData = this.parseExcel(file.buffer);
    } else {
      parsedData = this.parseCSV(file.buffer.toString("utf-8"));
    }

    if (parsedData.length === 0) {
      throw new BadRequestException("No valid data found in the file");
    }

    // Get default warehouse
    const defaultWarehouse = await prisma.warehouse.findFirst({
      where: { orgId, isActive: true },
    });

    if (!defaultWarehouse) {
      throw new BadRequestException("No warehouses found. Please create a warehouse first.");
    }

    const result = {
      success: 0,
      errors: [] as string[],
      warnings: [] as string[],
    };

    for (const row of parsedData) {
      try {
        // Validate required fields
        if (!row.sku || !row.name) {
          result.errors.push(`Missing required fields: SKU and Name are required`);
          continue;
        }

        // Check for duplicate SKU (case-insensitive)
        const existingProduct = await prisma.product.findFirst({
          where: {
            orgId,
            sku: {
              equals: row.sku,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
            sku: true,
            name: true,
            isActive: true,
          },
        });

        if (existingProduct) {
          result.errors.push(
            `SKU '${row.sku}' already exists (Product: "${existingProduct.name}", ID: ${existingProduct.id}, Active: ${existingProduct.isActive}). Skipping: ${row.name}`
          );
          continue;
        }

        // Handle category (stored as string, not relation)
        const category = row.category?.trim() || null;

        // Parse active status
        const isActive = (() => {
          if (typeof row.active === "boolean") return row.active;
          if (typeof row.active === "number") return row.active === 1 || row.active > 0;
          const activeValue = String(row.active || "").trim().toLowerCase();
          if (!row.active || activeValue === "" || activeValue === "undefined" || activeValue === "null") {
            return true;
          }
          return (
            activeValue === "true" ||
            activeValue === "1" ||
            activeValue === "yes" ||
            activeValue === "y" ||
            activeValue === "active" ||
            activeValue === "enabled"
          );
        })();

        const productData = {
          orgId,
          sku: row.sku,
          name: row.name,
          description: row.description || null,
          category: category,
          brand: row.brand?.trim() || null,
          price: this.parseNumber(row.price) || null,
          cost: this.parseNumber(row.cost) || null,
          currency: row.import_currency?.trim() || "GHS",
          uom: row.uom_base || row.uom_sell || "pcs",
          reorderPoint: Math.round(this.parseNumber(row.reorder_point)),
          isActive: isActive,
        };

        const product = await prisma.product.create({
          data: productData,
        });

        // Create stock item if quantity is provided
        const initialQuantity = this.parseNumber(row.quantity);
        if (initialQuantity > 0 && defaultWarehouse) {
          await prisma.stockItem.create({
            data: {
              orgId,
              productId: product.id,
              warehouseId: defaultWarehouse.id,
              quantity: initialQuantity,
              reserved: 0,
              available: initialQuantity,
              averageCostCents: Math.round((productData.cost || 0) * 100),
              totalValueCents: Math.round(initialQuantity * (productData.cost || 0) * 100),
              reorderPoint: productData.reorderPoint,
            },
          });
        }

        result.success++;
      } catch (rowError) {
        this.logger.error("Error processing row:", row, rowError);
        result.errors.push(
          `Error processing product: ${row.name || "Unknown"} - ${
            rowError instanceof Error ? rowError.message : "Unknown error"
          }`
        );
      }
    }

    return result;
  }

  /**
   * Bulk upload product images from ZIP file
   */
  async bulkUploadImages(orgId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("No ZIP file provided");
    }

    if (!file.originalname.endsWith(".zip") && file.mimetype !== "application/zip") {
      throw new BadRequestException("Invalid file type. Please upload a ZIP file.");
    }

    if (file.size > 50 * 1024 * 1024) {
      throw new BadRequestException("ZIP file size must be less than 50MB");
    }

    // Create temp directory for extraction
    const tempDir = path.join(process.cwd(), "temp", "bulk-images", Date.now().toString());
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Extract ZIP
      const zip = new AdmZip(file.buffer);
      const extractPath = path.join(tempDir, "extracted");
      zip.extractAllTo(extractPath, true);

      // Get all extracted files
      const extractedFiles = await fs.readdir(extractPath, { recursive: true });
      const imageFiles = extractedFiles.filter((file) => {
        const fileName = String(file);
        if (fileName.startsWith(".") || fileName.includes("__MACOSX") || fileName.includes(".DS_Store")) {
          return false;
        }
        const ext = fileName.split(".").pop()?.toLowerCase();
        return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext || "");
      });

      // Fetch all products for matching
      const allProducts = await prisma.product.findMany({
        where: { orgId },
        select: { id: true, sku: true, name: true },
      });

      // Create lookup maps (lowercase for case-insensitive matching)
      const skuToProduct: { [key: string]: (typeof allProducts)[0] } = {};
      const nameToProduct: { [key: string]: (typeof allProducts)[0] } = {};

      for (const product of allProducts) {
        if (product.sku) {
          skuToProduct[product.sku.toLowerCase()] = product;
        }
        if (product.name) {
          nameToProduct[product.name.toLowerCase()] = product;
          const nameBeforeComma = product.name.split(",")[0].trim().toLowerCase();
          if (nameBeforeComma && !nameToProduct[nameBeforeComma]) {
            nameToProduct[nameBeforeComma] = product;
          }
        }
      }

      // Group images by product
      const imagesByProduct: { [key: string]: string[] } = {};
      const notFoundSkus: string[] = [];

      for (const imageFile of imageFiles) {
        const fileName = String(imageFile).split("/").pop() || String(imageFile);
        const nameWithoutExt = fileName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, "");
        let baseName = nameWithoutExt
          .replace(/[-_](\d)$/, "")
          .replace(/\s*\(\d+\)$/, "")
          .replace(/\s*copy\s*\d*$/i, "")
          .trim();

        const baseNameLower = baseName.toLowerCase();
        let product = skuToProduct[baseNameLower] || nameToProduct[baseNameLower];

        if (!product) {
          if (!notFoundSkus.includes(baseName)) {
            notFoundSkus.push(baseName);
          }
          continue;
        }

        // Read image file
        const imagePath = path.join(extractPath, String(imageFile));
        const imageBuffer = await fs.readFile(imagePath);

        // Upload image using FilesService
        const mockFile: Express.Multer.File = {
          fieldname: "image",
          originalname: fileName,
          encoding: "7bit",
          mimetype: `image/${fileName.split(".").pop()?.toLowerCase() || "jpeg"}`,
          buffer: imageBuffer,
          size: imageBuffer.length,
          destination: "",
          filename: fileName,
          path: imagePath,
          stream: null as any,
        };

        try {
          const imageUrl = await this.filesService.uploadImage(orgId, mockFile, "product_image", product.id);

          if (!imagesByProduct[product.id]) {
            imagesByProduct[product.id] = [];
          }
          imagesByProduct[product.id].push(imageUrl);
        } catch (uploadError) {
          this.logger.error(`Failed to upload image ${fileName}:`, uploadError);
        }
      }

      // Update products with images
      const results = {
        totalImages: imageFiles.length,
        matchedProducts: Object.keys(imagesByProduct).length,
        updated: 0,
        failed: 0,
        notFound: notFoundSkus.length,
        updatedProducts: [] as Array<{ sku: string | null; name: string; imageCount: number }>,
        errors: [] as string[],
      };

      for (const [productId, imageUrls] of Object.entries(imagesByProduct)) {
        try {
          const product = await prisma.product.findUnique({
            where: { id: productId },
          });

          if (!product) {
            results.failed++;
            continue;
          }

          // Update product with first image URL (our schema has imageUrl as single string)
          await prisma.product.update({
            where: { id: productId },
            data: {
              imageUrl: imageUrls[0] || null,
            },
          });

          results.updated++;
          results.updatedProducts.push({
            sku: product.sku,
            name: product.name,
            imageCount: imageUrls.length,
          });
        } catch (error) {
          results.failed++;
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          results.errors.push(`Failed to update product ${productId}: ${errorMsg}`);
        }
      }

      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      return results;
    } catch (error) {
      // Cleanup on error
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      this.logger.error("Error processing bulk image upload:", error);
      throw new BadRequestException(
        `Failed to process bulk image upload: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
