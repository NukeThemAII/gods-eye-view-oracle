import { createEonetLayer } from '../../layers/eonet/index.js';
/** Wire the NASA EONET hazard source to an application layer instance. */
export function createApplicationEonet(options) {
  return createEonetLayer(options);
}
