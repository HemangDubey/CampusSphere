// For simple content pages that only need the shared nav, footer and reveal behaviour.
import { renderNav, renderFooter, initReveal } from './layout.js';

renderNav('/' + location.pathname.split('/').filter(Boolean)[0]);
renderFooter();
initReveal();
