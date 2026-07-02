// Mock helmet for test environment
const helmet = () => (_req: any, _res: any, next: () => void) => next();

export default helmet;
export const contentSecurityPolicy = () => helmet;
export const crossOriginEmbedderPolicy = () => helmet;
export const crossOriginOpenerPolicy = () => helmet;
export const crossOriginResourcePolicy = () => helmet;
export const dnsPrefetchControl = () => helmet;
export const frameguard = () => helmet;
export const hidePoweredBy = () => helmet;
export const hsts = () => helmet;
export const ieNoOpen = () => helmet;
export const noSniff = () => helmet;
export const originAgentCluster = () => helmet;
export const permittedCrossDomainPolicies = () => helmet;
export const referrerPolicy = () => helmet;
export const xssFilter = () => helmet;