// Mock express-rate-limit for test environment
const rateLimit = (_options?: any) => (_req: any, _res: any, next: () => void) => next();

export default rateLimit;