import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/entries/track/:token — public, no auth required
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(req.url);
    const queue = searchParams.get('queue');

    let resolvedQueueId: string | null = null;

    if (queue) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queue);
      if (isUuid) {
        resolvedQueueId = queue;
      } else {
        const { data: foundQueue } = await supabaseAdmin
          .from('queues')
          .select('id')
          .ilike('queue_code', queue)
          .maybeSingle();
        if (foundQueue) {
          resolvedQueueId = foundQueue.id;
        }
      }
    }

    let dbQuery = supabaseAdmin
      .from('queue_entries')
      .select('*, queues(*)')
      .eq('token', token.toUpperCase());

    if (resolvedQueueId) {
      dbQuery = dbQuery.eq('queue_id', resolvedQueueId);
    }

    const { data: entries, error: dbError } = await dbQuery
      .order('joined_at', { ascending: false })
      .limit(1);

    if (dbError || !entries || entries.length === 0) {
      return NextResponse.json({ message: 'Queue entry not found' }, { status: 404 });
    }

    const entry = entries[0];
    const queueDetails = entry.queues;

    const { count: peopleAhead } = await supabaseAdmin
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('queue_id', entry.queue_id)
      .eq('status', 'waiting')
      .lt('joined_at', entry.joined_at);

    const { data: currentServingEntry } = await supabaseAdmin
      .from('queue_entries')
      .select('token')
      .eq('queue_id', entry.queue_id)
      .eq('status', 'called')
      .order('called_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const mappedEntry = {
      _id: entry.id.toString(),
      customerName: entry.customer_name,
      token: entry.token,
      status: entry.status,
      joinedAt: entry.joined_at,
      queueId: {
        _id: queueDetails.id.toString(),
        queueName: queueDetails.queue_name,
        queueCode: queueDetails.queue_code,
        averageServiceTime: queueDetails.average_service_time,
      },
    };

    return NextResponse.json({
      entry: mappedEntry,
      peopleAhead: peopleAhead || 0,
      currentServing: currentServingEntry ? currentServingEntry.token : 'None',
      averageServiceTime: queueDetails.average_service_time,
    });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
