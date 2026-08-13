import {
  pool as defaultPool,
  db as defaultDb,
  EnrichmentProviderRegistry,
} from "@workspace/db";
import { CompetitorEnrichmentService } from "./competitor-enrichment-service.js";
import { AiEdgeVisibilityProvider } from "./competitor-ai-visibility-provider.js";
import { EdgeAuthorityProvider } from "./competitor-authority-provider.js";

type Pool = typeof defaultPool;
type Db = typeof defaultDb;

/**
 * Production registry for Competitor Intelligence.
 *
 * Only evidence-backed/non-mock providers are allowed here. Development and
 * test fixtures remain available through createEnrichmentService(), but the
 * live API route must use this factory so DEMO observations can never be mixed
 * into a production client card.
 */
export function createProductionEnrichmentProviderRegistry(
  activePool: Pool = defaultPool,
): EnrichmentProviderRegistry {
  const registry = new EnrichmentProviderRegistry();

  registry.register(new AiEdgeVisibilityProvider(activePool));
  registry.register(new EdgeAuthorityProvider());

  return registry;
}

export function createProductionEnrichmentService(
  overridePool?: Pool,
  overrideDb?: Db,
): CompetitorEnrichmentService {
  const activePool = overridePool ?? defaultPool;
  const activeDb = overrideDb ?? defaultDb;
  const registry = createProductionEnrichmentProviderRegistry(activePool);

  return new CompetitorEnrichmentService(registry, activePool, activeDb);
}
