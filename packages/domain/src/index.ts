/**
 * Pure business-rule boundary.
 *
 * Domain primitives intentionally have no framework, persistence, or cloud
 * dependency. HTTP and cryptographic adapters remain at the application edge.
 */
export * from "./errors.js";
export * from "./fraction.js";
export * from "./random.js";
export * from "./scoring.js";
export * from "./snapshot-projector.js";
export * from "./time.js";
