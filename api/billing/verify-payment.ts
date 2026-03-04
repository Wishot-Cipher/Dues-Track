import { createClient } from '@supabase/supabase-js';

// Vercel Serverless types
interface VercelRequest {
  method?: string;
  headers: { [key: string]: string | string[] | undefined };
  body?: {
    reference?: string;
  };
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => VercelResponse;
}

/**
 * Verify Paystack Payment
 * POST /api/billing/verify-payment
 * Body: { reference: string }
 * 
 * Verifies a payment with Paystack's API using the secret key,
 * then returns the verification result to the client.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET_KEY) {
    console.error('PAYSTACK_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Payment system not configured' });
  }

  const { reference } = req.body || {};
  if (!reference || typeof reference !== 'string') {
    return res.status(400).json({ error: 'Payment reference is required' });
  }

  try {
    // Verify with Paystack API
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status || paystackData.data?.status !== 'success') {
      // Payment not successful
      // Update transaction in DB
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from('billing_transactions')
          .update({
            status: 'failed',
            gateway_reference: paystackData.data?.reference || null,
            gateway_response: paystackData.data || paystackData,
            updated_at: new Date().toISOString(),
          })
          .eq('reference', reference);
      }

      return res.status(400).json({
        success: false,
        message: paystackData.data?.gateway_response || 'Payment was not successful',
        data: paystackData.data,
      });
    }

    // Payment successful — update transaction with gateway details
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase
        .from('billing_transactions')
        .update({
          gateway_reference: paystackData.data.reference,
          gateway_response: paystackData.data,
          updated_at: new Date().toISOString(),
        })
        .eq('reference', reference);
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        amount: paystackData.data.amount / 100, // Convert from kobo/cents
        currency: paystackData.data.currency,
        reference: paystackData.data.reference,
        paid_at: paystackData.data.paid_at,
      },
    });
  } catch (error) {
    console.error('Paystack verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify payment',
    });
  }
}
