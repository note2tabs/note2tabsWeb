import {describe,it,expect} from 'vitest';
import {shouldOfferCreditPurchase} from '../../lib/creditPurchaseEligibility';
describe('contextual credit-purchase visibility',()=>{
 it.each(['PREMIUM','PRO'] as const)('shows %s only at low balance or a real shortfall',plan=>{expect(shouldOfferCreditPurchase(plan,10)).toBe(true);expect(shouldOfferCreditPurchase(plan,11)).toBe(false);expect(shouldOfferCreditPurchase(plan,50,51)).toBe(true);expect(shouldOfferCreditPurchase(plan,50,50)).toBe(false);});
 it('keeps Free offers hidden unless the requested transcription is unaffordable',()=>{expect(shouldOfferCreditPurchase('FREE',0)).toBe(false);expect(shouldOfferCreditPurchase('FREE',3)).toBe(false);expect(shouldOfferCreditPurchase('FREE',3,4)).toBe(true);});
 it.each([null,undefined,NaN,Infinity,-1])('does not guess eligibility from an invalid balance',remaining=>expect(shouldOfferCreditPurchase('PREMIUM',remaining,20)).toBe(false));
});
