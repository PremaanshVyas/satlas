// Alias for /api/catalog — same handler, different URL.
// The path "/api/catalog" matches ad-tracker filter rules in uBlock Origin
// (product catalog trackers use "catalog" in their URLs), causing NS_BINDING_ABORTED
// at 0ms for affected users. The frontend fetches /api/tles instead; /api/catalog
// remains live for backward compatibility with existing public API consumers.
export { default, config } from './catalog'
