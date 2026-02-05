import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@poolcare/db";
import { CreateOrderDto, UpdateOrderDto } from "./dto";

@Injectable()
export class OrdersService {
  /**
   * Resolve client for the current user (CLIENT role: userId must match Client.userId).
   * Throws if user is not linked to a client.
   */
  async resolveClientForUser(orgId: string, userId: string) {
    const client = await prisma.client.findFirst({
      where: { orgId, userId },
    });
    if (!client) {
      throw new ForbiddenException(
        "You must be linked to a client profile to place shop orders. Please contact support."
      );
    }
    return client;
  }

  async create(orgId: string, userId: string, dto: CreateOrderDto) {
    const client = await this.resolveClientForUser(orgId, userId);
    if (!dto.items?.length) {
      throw new BadRequestException("Order must contain at least one item");
    }

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, orgId, isActive: true },
      include: { stockItems: true },
    });
    type ProductType = typeof products[number];
    const productMap = new Map<string, ProductType>(products.map((p) => [p.id, p]));

    const orderItems: Array<{ productId: string; name: string; quantity: number; unitPrice: number; total: number }> = [];
    let totalCents = 0;
    const currency = products[0]?.currency || "GHS";

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Product not found or not available: ${item.productId}`);
      }
      const price = product.price ?? 0;
      const unitPrice = price;
      const total = unitPrice * item.quantity;
      totalCents += Math.round(total * 100); // store in cents
      orderItems.push({
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        unitPrice,
        total,
      });
    }

    const order = await prisma.shopOrder.create({
      data: {
        orgId,
        clientId: client.id,
        items: orderItems,
        totalCents,
        currency,
        status: "pending",
        notes: dto.notes ?? undefined,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return order;
  }

  async list(orgId: string, userId: string) {
    const client = await this.resolveClientForUser(orgId, userId);
    const orders = await prisma.shopOrder.findMany({
      where: { orgId, clientId: client.id },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
      },
    });
    return orders;
  }

  /** List all shop orders for the org (ADMIN/MANAGER). */
  async listForOrg(orgId: string) {
    const orders = await prisma.shopOrder.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    return orders;
  }

  async getOne(orgId: string, userId: string, orderId: string) {
    const client = await this.resolveClientForUser(orgId, userId);
    const order = await prisma.shopOrder.findFirst({
      where: { id: orderId, orgId, clientId: client.id },
      include: {
        client: { select: { id: true, name: true } },
      },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }

  /** Get any order by id for org (ADMIN/MANAGER). */
  async getOneForOrg(orgId: string, orderId: string) {
    const order = await prisma.shopOrder.findFirst({
      where: { id: orderId, orgId },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }

  /** Update order status (and optional notes) for org (ADMIN/MANAGER). */
  async updateForOrg(orgId: string, orderId: string, dto: UpdateOrderDto) {
    const order = await prisma.shopOrder.findFirst({
      where: { id: orderId, orgId },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return prisma.shopOrder.update({
      where: { id: orderId },
      data: {
        status: dto.status,
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
  }
}
