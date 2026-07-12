import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

export function getAppBaseUrl(requestOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (requestOrigin) {
    return requestOrigin.replace(/\/$/, '');
  }

  return 'http://localhost:3001';
}

export function buildCheckoutUrls(baseUrl: string, orderId: string) {
  const success = new URL('/settings/billing', baseUrl);
  success.searchParams.set('checkout', 'success');
  success.searchParams.set('orderId', orderId);

  const cancel = new URL('/settings/billing', baseUrl);
  cancel.searchParams.set('checkout', 'canceled');
  cancel.searchParams.set('orderId', orderId);

  return {
    successUrl: success.toString(),
    cancelUrl: cancel.toString(),
  };
}

