import { z } from 'zod';

export const productPricingFields = {
  priceMode: z.enum(['none', 'percent', 'fixed']).default('none'),
  priceValue: z.coerce.number().min(0).max(1_000_000).default(0),
  highlightPromoPrice: z.boolean().default(true)
};

export function validateProductPricing(input, context) {
  if (input.priceMode !== 'none' && input.priceValue <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['priceValue'],
      message: 'Для старої ціни вкажіть значення більше нуля.'
    });
  }
}
