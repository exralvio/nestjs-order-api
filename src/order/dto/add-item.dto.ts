import { IsString, IsNotEmpty, IsNumber, IsPositive, IsInt } from 'class-validator';

export class AddItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @IsInt()
  @IsPositive()
  quantity: number;
}

