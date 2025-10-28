import { OrderStatus } from '@prisma/client';

export class OrderItemResponseDto {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  product?: {
    id: string;
    name: string;
    description: string | null;
    price: number;
  };
}

export class OrderResponseDto {
  id: string;
  userId: string;
  status: OrderStatus;
  total: number;
  items: OrderItemResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}

