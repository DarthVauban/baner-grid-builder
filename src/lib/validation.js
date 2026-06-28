import { AppError } from './app-error.js';

export function parseInput(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message
  }));
  throw new AppError(422, 'VALIDATION_ERROR', 'Перевірте заповнені поля.', details);
}
