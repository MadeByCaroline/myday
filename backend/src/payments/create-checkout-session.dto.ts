import { IsIn } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsIn(['monthly', 'annual'])
  planType: 'monthly' | 'annual';
}
