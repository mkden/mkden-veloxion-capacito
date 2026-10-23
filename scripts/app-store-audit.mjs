// Strict read-only audit: a missing integration is a failure, not a successful check.
import { main } from './app-store-setup.mjs';

await main([]);
