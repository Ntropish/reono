/**
 * Utility Components (Sugar Elements)
 *
 * Convenience components built on top of the core `<use>` element
 * that provide clean APIs for common patterns.
 */

export { Guard } from "./Guard";
export type { GuardProps, GuardCondition, GuardFallback } from "./Guard";

export { CORS } from "./CORS";
export type { CORSProps } from "./CORS";

export { Transform } from "./Transform";
export type { TransformProps, TransformFunction } from "./Transform";

export { Static } from "./Static";
export type { StaticProps } from "./Static";

export { FileUpload } from "./FileUpload";
export type { FileUploadProps } from "./FileUpload";

export { RateLimit, clearRateLimitStore } from "./RateLimit";
export type { RateLimitProps, RateLimitKeyGenerator } from "./RateLimit";
