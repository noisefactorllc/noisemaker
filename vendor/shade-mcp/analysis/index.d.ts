import { B as BrowserSession } from '../browser-session-ZRj1tPM6.js';
import 'playwright';

declare function checkAlgEquiv(effectId: string): Promise<any>;

declare function analyzeBranching(effectId: string, backend: string): Promise<any>;

declare function describeEffectFrame(session: BrowserSession, effectId: string, prompt: string): Promise<any>;

export { analyzeBranching, checkAlgEquiv, describeEffectFrame };
