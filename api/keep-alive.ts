import { createClient } from '@supabase/supabase-js';

// Vercel Edge/Serverless types
interface VercelRequest {
  method?: string;
  headers: { [key: string]: string | string[] | undefined };
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

/**
 * Keep-Alive Endpoint
 * This endpoint is called periodically to prevent Supabase from pausing
 * 
 * Set up a cron job to call this endpoint every 5 days:
 * - Use Vercel Cron (Pro) or
 * - Use a free service like cron-job.org
 * 
 * Cron expression: 0 0 every-5-days (every 5 days at midnight)
 */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Security: require secret if configured
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.KEEP_ALIVE_SECRET;

  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Simple query to keep the database active
    const { error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    // Fallback: try students table if organizations doesn't exist (single-tenant)
    if (error?.code === '42P01') {
      const { error: studentsError } = await supabase
        .from('students')
        .select('id')
        .limit(1);
      
      if (studentsError) {
        throw studentsError;
      }
      
      return res.status(200).json({
        success: true,
        message: 'Database is active (students table)',
        timestamp: new Date().toISOString(),
        table: 'students'
      });
    }

    if (error) {
      throw error;
    }

    // ── Auto-cleanup old notifications ──
    // Read > 30 days old, Unread > 90 days old
    let cleanupResult = null;
    try {
      const { data } = await supabase.rpc('cleanup_old_notifications', {
        p_read_days: 30,
        p_unread_days: 90,
      });
      cleanupResult = data;
    } catch {
      // Non-critical — function may not exist yet
    }

    return res.status(200).json({
      success: true,
      message: 'Database is active',
      timestamp: new Date().toISOString(),
      table: 'organizations',
      notifications_cleanup: cleanupResult,
    });

  } catch (error) {
    console.error('Keep-alive error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}
