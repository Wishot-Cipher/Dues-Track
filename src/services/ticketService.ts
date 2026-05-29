/**
 * ticketService — event tickets (buy → QR ticket → door check-in).
 *
 * Tickets are minted server-side by issue_event_ticket after a successful
 * event payment (Paystack verify/webhook). This service reads them for the
 * buyer's ticket view, resolves a code for the scanner/public view, and runs
 * the door check-in. Backed by migrations 057/058/077.
 */

import { supabase } from '@/config/supabase';

export interface MyTicket {
  id: string;
  ticket_code: string;
  status: 'valid' | 'used' | 'cancelled' | 'refunded';
  tier_name: string | null;
  price: number | null;
  created_at: string;
  checked_in_at: string | null;
  event_title: string;
  event_venue: string | null;
  event_date: string | null;
  icon: string | null;
  color: string | null;
}

export interface TicketDetail {
  id: string;
  ticket_code: string;
  status: 'valid' | 'used' | 'cancelled' | 'refunded';
  tier_name: string | null;
  price: number | null;
  buyer_name: string | null;
  buyer_email: string | null;
  checked_in_at: string | null;
  created_at: string;
  organization_id: string;
  payment_type_id: string;
  event_title: string;
  event_venue: string | null;
  event_date: string | null;
  icon: string | null;
  color: string | null;
  org_name: string;
  org_slug: string;
  logo_url: string | null;
  group_name: string | null;
}

export interface CheckInResult {
  ok: boolean;
  result?: 'checked_in' | 'already_used' | 'invalid' | 'unauthorized' | 'cancelled' | 'refunded';
  error?: string;
  checked_in_at?: string;
  ticket?: {
    code: string;
    buyer_name: string | null;
    tier_name: string | null;
    price?: number | null;
    event_title?: string;
    event_venue?: string | null;
    event_date?: string | null;
  };
}

export const ticketService = {
  async getMyTickets(memberId: string): Promise<MyTicket[]> {
    const { data } = await supabase.rpc('get_my_tickets', { p_member_id: memberId });
    if (data && (data as { ok?: boolean }).ok) return ((data as { tickets?: MyTicket[] }).tickets || []);
    return [];
  },

  async getTicketByCode(code: string): Promise<TicketDetail | null> {
    const { data } = await supabase.rpc('get_ticket_by_code', { p_ticket_code: code });
    if (data && (data as { ok?: boolean }).ok) return (data as { ticket?: TicketDetail }).ticket ?? null;
    return null;
  },

  async checkIn(code: string, adminMemberId: string): Promise<CheckInResult> {
    const { data, error } = await supabase.rpc('check_in_ticket', {
      p_ticket_code: code,
      p_admin_member_id: adminMemberId,
    });
    if (error) return { ok: false, error: error.message, result: 'invalid' };
    return (data ?? { ok: false, error: 'Empty response' }) as CheckInResult;
  },
};

export default ticketService;
