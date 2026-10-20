/** Opt-in Stripe TEST mode only. Uses CLI authentication, no production env files. */
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
if (process.env.CREDIT_UPGRADE_STRIPE_TEST !== '1') throw Error('Set CREDIT_UPGRADE_STRIPE_TEST=1 explicitly.');
function cli(path, params = {}, method = 'post') {
  const args = [method, path, '--stripe-version', '2024-06-20'];
  if(method === 'delete') args.push('--confirm');
  function add(key, value) {
    if (value !== null && typeof value === 'object') Object.entries(value).forEach(([k,v]) => add(`${key}[${k}]`,v));
    else args.push('-d', `${key}=${value}`);
  }
  Object.entries(params).forEach(([k,v])=>add(k,v));
  const result=JSON.parse(execFileSync('stripe',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}));
  if(result.error) throw Error(`${path}: ${result.error.message}`);
  if(result.livemode === true) throw Error('Live object forbidden');
  return result;
}
async function main() {
  const clock=cli('/v1/test_helpers/test_clocks',{frozen_time:Math.floor(Date.now()/1000),name:'Note2Tabs credit upgrade verification'});
  try {
    const customer=cli('/v1/customers',{email:'credit-upgrade-verification@example.test',test_clock:clock.id});
    const pm=cli('/v1/payment_methods/pm_card_visa/attach',{customer:customer.id});
    const setMethod=id=>cli(`/v1/customers/${customer.id}`,{invoice_settings:{default_payment_method:id}});
    setMethod(pm.id);
    const price=(amount,name)=>cli('/v1/prices',{currency:'usd',unit_amount:amount,recurring:{interval:'month'},product_data:{name}});
    const premium=price(599,'TEST Premium credit upgrade'),pro=price(1499,'TEST Pro credit upgrade');
    const sub=cli('/v1/subscriptions',{customer:customer.id,items:[{price:premium.id}]});
    const coupon=cli('/v1/coupons',{currency:'usd',amount_off:1198,duration:'once'});
    const declined=cli('/v1/payment_methods/pm_card_chargeCustomerFail/attach',{customer:customer.id});
    setMethod(declined.id);
    const update=cli(`/v1/subscriptions/${sub.id}`,{items:[{id:sub.items.data[0].id,price:pro.id}],billing_cycle_anchor:'now',proration_behavior:'none',payment_behavior:'pending_if_incomplete',discounts:[{coupon:coupon.id}],expand:['latest_invoice']});
    assert.ok(update.pending_update);
    assert.equal(update.items.data[0].price.id,premium.id);
    assert.equal(update.latest_invoice.total,301);
    assert.equal(update.latest_invoice.status,'open');
    setMethod(pm.id);
    const paid=cli(`/v1/invoices/${update.latest_invoice.id}/pay`,{payment_method:pm.id});
    assert.equal(paid.status,'paid'); assert.equal(paid.amount_paid,301);
    const active=cli(`/v1/subscriptions/${sub.id}`,{},'get');
    assert.equal(active.pending_update,null);assert.equal(active.items.data[0].price.id,pro.id);
    cli(`/v1/test_helpers/test_clocks/${clock.id}/advance`,{frozen_time:active.current_period_end+3600});
    let ready=false;
    for(let n=0;n<45;n++) {
      const state=cli(`/v1/test_helpers/test_clocks/${clock.id}`,{},'get');
      if(state.status==='ready'){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.ok(ready,'Test clock did not settle');
    const renewed=cli(`/v1/subscriptions/${sub.id}`,{},'get');
    const renewal=cli(`/v1/invoices/${renewed.latest_invoice}`,{},'get');
    assert.equal(renewal.billing_reason,'subscription_cycle');assert.equal(renewal.total,1499);assert.equal(renewal.status,'paid');
    console.log(JSON.stringify({testMode:true,initialTotal:301,declineRetainedPremium:true,recoveredPayment:true,nextMonthTotal:1499,nextMonthPaid:true}));
    cli(`/v1/products/${premium.product}`,{active:false});cli(`/v1/products/${pro.product}`,{active:false});
  } finally { cli(`/v1/test_helpers/test_clocks/${clock.id}`,{},'delete'); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
