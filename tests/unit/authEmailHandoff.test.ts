// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { saveAuthEmail,takeAuthEmail } from '../../lib/authEmailHandoff';
beforeEach(()=>sessionStorage.clear());
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('temporary email recovery',()=>{
 it('consumes only the email once',()=>{saveAuthEmail(' player@example.com ');expect(takeAuthEmail()).toBe('player@example.com');expect(takeAuthEmail()).toBe('');});
 it('expires after fifteen minutes',()=>{vi.useFakeTimers();saveAuthEmail('player@example.com');vi.advanceTimersByTime(15*60_000);expect(takeAuthEmail()).toBe('');});
 it('does not block authentication if storage is unavailable',()=>{vi.stubGlobal('sessionStorage',{setItem(){throw Error('blocked');},getItem(){throw Error('blocked');}});expect(()=>saveAuthEmail('player@example.com')).not.toThrow();expect(takeAuthEmail()).toBe('');});
});
