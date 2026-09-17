import { createNewsLayer } from '../../layers/news/index.js';
/** Wire the GDELT news source to an application layer instance. */
export function createApplicationNews(options) {
  return createNewsLayer(options);
}
