# Serverless deployment boundary

The API exports a local Lambda-compatible handler, but deployment configuration is intentionally deferred. This directory contains no executable deployment definition and must not trigger credential lookup, AWS resource provisioning, or deployment until the real-integration gate has explicit user approval.
