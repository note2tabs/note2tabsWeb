import type {SubscriptionPlan} from './subscriptionPlans';
export const LOW_PAID_CREDIT_THRESHOLD=10;
export function shouldOfferCreditPurchase(plan:SubscriptionPlan,remaining:unknown,required?:number){
 if(typeof remaining!=='number'||!Number.isFinite(remaining)||remaining<0)return false;
 const shortfall=typeof required==='number'&&Number.isFinite(required)&&required>remaining;
 return shortfall || (plan!=='FREE'&&remaining<=LOW_PAID_CREDIT_THRESHOLD);
}
