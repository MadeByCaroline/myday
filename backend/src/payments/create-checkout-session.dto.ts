import { IsDefined, IsIn } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsDefined()
  @IsIn(['monthly', 'annual'])
  declare planType: 'monthly' | 'annual';
}
