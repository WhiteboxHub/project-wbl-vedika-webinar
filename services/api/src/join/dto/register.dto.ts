import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const BLOCKED_EMAIL_DOMAINS = new Set([
  'attendee.local',
  'localhost',
  'example.com',
  'test.com',
]);

@ValidatorConstraint({ name: 'isRealEmail', async: false })
export class IsRealEmailConstraint implements ValidatorConstraintInterface {
  validate(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const normalized = email.trim().toLowerCase();
    const parts = normalized.split('@');
    if (parts.length !== 2) return false;
    const [, domain] = parts;
    if (!domain || !domain.includes('.')) return false;
    if (BLOCKED_EMAIL_DOMAINS.has(domain)) return false;
    return true;
  }

  defaultMessage(): string {
    return 'Please enter a valid email address (no placeholder or local-only domains)';
  }
}

export function IsRealEmail(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsRealEmailConstraint,
    });
  };
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsEmail()
  @IsNotEmpty()
  @IsRealEmail()
  email: string;
}
