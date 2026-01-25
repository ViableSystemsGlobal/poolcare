import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from "@nestjs/common/pipes";
import { BadRequestException } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { FilesService } from "../files/files.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
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

// =====================
// PRODUCTS CONTROLLER
// =====================

@Controller("products")
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string },
    @Query() query: ListProductsQuery
  ) {
    return this.inventoryService.listProducts(user.org_id, query);
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.inventoryService.getProduct(user.org_id, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string },
    @Body() dto: CreateProductDto
  ) {
    return this.inventoryService.createProduct(user.org_id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateProductDto
  ) {
    return this.inventoryService.updateProduct(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async delete(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.inventoryService.deleteProduct(user.org_id, id);
  }

  @Post("bulk-import")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("file"))
  async bulkImport(
    @CurrentUser() user: { org_id: string },
    @UploadedFile() file: Express.Multer.File
  ) {
    return this.inventoryService.bulkImportProducts(user.org_id, file);
  }

  @Post("bulk-upload-images")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("zipFile"))
  async bulkUploadImages(
    @CurrentUser() user: { org_id: string },
    @UploadedFile() file: Express.Multer.File
  ) {
    return this.inventoryService.bulkUploadImages(user.org_id, file);
  }
}

// =====================
// WAREHOUSES CONTROLLER
// =====================

@Controller("warehouses")
@UseGuards(JwtAuthGuard)
export class WarehousesController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly filesService: FilesService
  ) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string },
    @Query("search") search?: string,
    @Query("isActive") isActive?: string
  ) {
    return this.inventoryService.listWarehouses(user.org_id, { search, isActive });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.inventoryService.getWarehouse(user.org_id, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string },
    @Body() dto: CreateWarehouseDto
  ) {
    return this.inventoryService.createWarehouse(user.org_id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateWarehouseDto
  ) {
    return this.inventoryService.updateWarehouse(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async delete(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.inventoryService.deleteWarehouse(user.org_id, id);
  }

  @Post("upload-image")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @UseInterceptors(FileInterceptor("image"))
  async uploadImage(
    @CurrentUser() user: { org_id: string },
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp|gif)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }

    try {
      const imageUrl = await this.filesService.uploadImage(
        user.org_id,
        file,
        "warehouse_image",
        user.org_id
      );

      return { imageUrl };
    } catch (error: any) {
      console.error("Image upload error:", error);
      throw new BadRequestException(error.message || "Failed to upload image");
    }
  }
}

// =====================
// SUPPLIERS CONTROLLER
// =====================

@Controller("suppliers")
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string },
    @Query("search") search?: string,
    @Query("status") status?: string
  ) {
    return this.inventoryService.listSuppliers(user.org_id, { search, status });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.inventoryService.getSupplier(user.org_id, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string },
    @Body() dto: CreateSupplierDto
  ) {
    return this.inventoryService.createSupplier(user.org_id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async update(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string,
    @Body() dto: UpdateSupplierDto
  ) {
    return this.inventoryService.updateSupplier(user.org_id, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async delete(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.inventoryService.deleteSupplier(user.org_id, id);
  }
}

// =====================
// STOCK CONTROLLER
// =====================

@Controller("inventory/stock")
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string },
    @Query() query: ListStockQuery
  ) {
    return this.inventoryService.listStock(user.org_id, query);
  }
}

// =====================
// STOCK MOVEMENTS CONTROLLER
// =====================

@Controller("inventory/movements")
@UseGuards(JwtAuthGuard)
export class StockMovementsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string },
    @Query() query: ListMovementsQuery
  ) {
    return this.inventoryService.listStockMovements(user.org_id, query);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: CreateStockMovementDto
  ) {
    return this.inventoryService.createStockMovement(user.org_id, user.sub, dto);
  }
}

// =====================
// STOCKTAKE CONTROLLER
// =====================

@Controller("inventory/stocktake")
@UseGuards(JwtAuthGuard)
export class StocktakeController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  async list(
    @CurrentUser() user: { org_id: string },
    @Query("status") status?: string,
    @Query("warehouseId") warehouseId?: string
  ) {
    return this.inventoryService.listStocktakes(user.org_id, { status, warehouseId });
  }

  @Get(":id")
  async getOne(
    @CurrentUser() user: { org_id: string },
    @Param("id") id: string
  ) {
    return this.inventoryService.getStocktake(user.org_id, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async create(
    @CurrentUser() user: { org_id: string; sub: string },
    @Body() dto: CreateStocktakeDto
  ) {
    return this.inventoryService.createStocktake(user.org_id, user.sub, dto);
  }

  @Patch(":id/items/:itemId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async updateItem(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") stocktakeId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateStocktakeItemDto
  ) {
    return this.inventoryService.updateStocktakeItem(
      user.org_id,
      stocktakeId,
      itemId,
      user.sub,
      dto
    );
  }

  @Post(":id/complete")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  async complete(
    @CurrentUser() user: { org_id: string; sub: string },
    @Param("id") id: string
  ) {
    return this.inventoryService.completeStocktake(user.org_id, id, user.sub);
  }
}
