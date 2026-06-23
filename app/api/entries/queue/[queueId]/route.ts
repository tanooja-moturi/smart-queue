import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/authMiddleware';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/entries/queue/:queueId — protected
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ queueId: string }> }
) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: 401 });
    }

    const { queueId } = await params;

    // Verify queue ownership
    const { data: queue, error: queueError } = await supabaseAdmin
      .from('queues')
      .select('user_id')
      .eq('id', queueId)
      .maybeSingle();

    if (queueError || !queue) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    if (queue.user_id !== user._id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const { data: entries, error: dbError } = await supabaseAdmin
      .from('queue_entries')
      .select('*')
      .eq('queue_id', queueId)
      .order('joined_at', { ascending: true });

    if (dbError || !entries) {
      return NextResponse.json({ message: dbError?.message || 'Error fetching entries' }, { status: 500 });
    }

    const mappedEntries = entries.map((entry) => ({
      _id: entry.id.toString(),
      customerName: entry.customer_name,
      queueId: entry.queue_id.toString(),
      token: entry.token,
      status: entry.status,
      joinedAt: entry.joined_at,
      calledAt: entry.called_at,
      servedAt: entry.served_at,
    }));

    return NextResponse.json(mappedEntries);
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
