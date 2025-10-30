import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, ValidateNested, IsInt, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Product identifier', example: 'prod_123' })
  @IsString()
  product_id: string;

  @ApiProperty({ description: 'Quantity of the product', example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  qty: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description: 'Items to include in the order',
    type: [CreateOrderItemDto],
    example: [{ product_id: 'prod_123', qty: 2 }],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}


