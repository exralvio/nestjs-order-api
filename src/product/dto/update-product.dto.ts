import { IsString, IsOptional, IsNumber, IsPositive, Min } from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @IsPositive()
  price?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;
}

