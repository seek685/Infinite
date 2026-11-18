import { preloader } from './ui/preloader.js';

preloader.advance(8);
import('./main.js').catch(preloader.fail);
