import { Module } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import {
  ProductsController,
  WarehousesController,
  SuppliersController,
  StockController,
  StockMovementsController,
  StocktakeController,
} from "./inventory.controller";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [
    ProductsController,
    WarehousesController,
    SuppliersController,
    StockController,
    StockMovementsController,
    StocktakeController,
  ],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
