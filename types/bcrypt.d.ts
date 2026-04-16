declare module 'bcrypt' {
  export function hash(data: string, saltRounds: number): Promise<string>;
  export function compare(data: string, encrypted: string): Promise<boolean>;
  export const SALT_ROUNDS: number;
}
