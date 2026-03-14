// AgentPark Site Configuration
const SUPABASE_URL = 'https://uvmfjdaqpsdbvokaynpi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_KZTPHLXQHfPGCdRfzYK76Q_yKx4nMCX';

// Payment Configuration
// Set to 'live' when ACBA VPOS credentials are ready
const PAYMENT_MODE = 'test';
// Edge Function URL (update when deployed to Supabase)
const SUPABASE_FUNCTIONS_URL = SUPABASE_URL + '/functions/v1';

// Test mode: create payment order locally (bypasses Edge Functions)
async function createPaymentOrder(eventId, name, email, event) {
  if (PAYMENT_MODE === 'test') {
    // In test mode, create registration directly and redirect to test payment page
    const orderId = 'AP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const res = await fetch(SUPABASE_URL + '/rest/v1/registrations', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        event_id: eventId,
        name: name,
        email: email,
        payment_status: 'pending',
        payment_amount: event.price,
        payment_currency: event.currency || 'AMD',
        payment_order_id: orderId,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const regId = data[0]?.id || '';
    const returnUrl = window.location.origin + '/event.html?id=' + eventId;
    const paymentUrl = '/payment-test.html?order_id=' + orderId
      + '&amount=' + event.price
      + '&currency=' + (event.currency || 'AMD')
      + '&event_title=' + encodeURIComponent(event.title || '')
      + '&name=' + encodeURIComponent(name)
      + '&registration_id=' + regId
      + '&event_id=' + eventId
      + '&return_url=' + encodeURIComponent(returnUrl);
    return { payment_url: paymentUrl, order_id: orderId };
  } else {
    // Production: call Edge Function
    const res = await fetch(SUPABASE_FUNCTIONS_URL + '/create-payment-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, name, email }),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  }
}

// Format price for display
function formatPrice(price, currency) {
  if (!price || price <= 0) return null;
  return price.toLocaleString() + ' ' + (currency || 'AMD');
}
