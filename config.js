// AgentPark Site Configuration
const SUPABASE_URL = 'https://uvmfjdaqpsdbvokaynpi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bWZqZGFxcHNkYnZva2F5bnBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMjkyMzMsImV4cCI6MjA4ODgwNTIzM30.aML-rv78JdyxUakBCAC-nE28tLLRcwOWRBp8wZt3ows';

// Payment Configuration
// 'test' uses /payment-test.html for local clicking-through;
// 'live' calls the create-payment-order Edge Function which talks to ACBA.
const PAYMENT_MODE = 'test';
// Edge Function URL (update when deployed to Supabase)
const SUPABASE_FUNCTIONS_URL = SUPABASE_URL + '/functions/v1';

// Test mode: create payment order locally (bypasses Edge Functions)
// extras = { tier_id?, phone? }
async function createPaymentOrder(eventId, name, email, event, extras) {
  extras = extras || {};
  if (PAYMENT_MODE === 'test') {
    // In test mode, create registration directly and redirect to test payment page
    const orderId = 'AP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const regBody = {
      event_id: eventId,
      name: name,
      email: email,
      payment_status: 'pending',
      payment_amount: event.price,
      payment_currency: event.currency || 'AMD',
      payment_order_id: orderId,
    };
    if (extras.tier_id) regBody.ticket_tier_id = extras.tier_id;
    if (extras.phone) regBody.phone = extras.phone;
    const res = await fetch(SUPABASE_URL + '/rest/v1/registrations', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(regBody),
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
      + '&event_date=' + encodeURIComponent(event.date || '')
      + '&start_time=' + encodeURIComponent(event.start_time || '')
      + '&end_time=' + encodeURIComponent(event.end_time || '')
      + '&lang=' + (window.currentLang || 'en')
      + '&return_url=' + encodeURIComponent(returnUrl);
    return { payment_url: paymentUrl, order_id: orderId };
  } else {
    // Live: call the create-payment-order Edge Function. It validates input,
    // looks up the canonical price from events.ticket_tiers, registers the
    // order with ACBA, and returns { registration_id, order_id, form_url }.
    const body = {
      event_id: eventId,
      name,
      email,
      lang: (window.currentLang === 'am') ? 'am' : 'en',
    };
    if (extras.tier_id) body.ticket_tier_id = extras.tier_id;
    if (extras.phone) body.phone = extras.phone;
    const res = await fetch(SUPABASE_FUNCTIONS_URL + '/create-payment-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }
    const data = await res.json();
    // Caller (event.html) expects payment_url; map from the function's form_url.
    return {
      payment_url: data.form_url,
      order_id: data.order_id,
      registration_id: data.registration_id,
    };
  }
}

// Format price for display
function formatPrice(price, currency) {
  if (!price || price <= 0) return null;
  return price.toLocaleString() + ' ' + (currency || 'AMD');
}
