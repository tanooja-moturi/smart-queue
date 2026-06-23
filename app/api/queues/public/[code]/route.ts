import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/queues/public/:code — public, no auth required
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const { data: queue, error: dbError } = await supabaseAdmin
      .from('queues')
      .select('*')
      .ilike('queue_code', code)
      .maybeSingle();

    if (dbError || !queue) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    const { count: waitingCount } = await supabaseAdmin
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('queue_id', queue.id)
      .eq('status', 'waiting');

    const { data: currentServingEntry } = await supabaseAdmin
      .from('queue_entries')
      .select('token')
      .eq('queue_id', queue.id)
      .eq('status', 'called')
      .order('called_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      _id: queue.id.toString(),
      queueName: queue.queue_name,
      queueCode: queue.queue_code,
      averageServiceTime: queue.average_service_time,
      tokenPrefix: queue.token_prefix,
      lastTokenNumber: queue.last_token_number,
      waitingCount: waitingCount || 0,
      currentServing: currentServingEntry ? currentServingEntry.token : 'None',
    });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
