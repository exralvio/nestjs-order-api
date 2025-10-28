export class ProductResponseDto {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
}

