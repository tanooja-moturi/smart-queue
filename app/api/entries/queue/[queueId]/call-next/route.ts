import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/authMiddleware';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// POST /api/entries/queue/:queueId/call-next — protected
export async function POST(
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

    // 1. Mark any currently 'called' customer as 'served'
    await supabaseAdmin
      .from('queue_entries')
      .update({ status: 'served', served_at: new Date().toISOString() })
      .eq('queue_id', queueId)
      .eq('status', 'called');

    // 2. Find the oldest waiting customer for this queue
    const { data: nextEntry, error: fetchError } = await supabaseAdmin
      .from('queue_entries')
      .select('*')
      .eq('queue_id', queueId)
      .eq('status', 'waiting')
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const io = (global as any).io;

    if (!nextEntry) {
      if (io) {
        io.to(queueId).emit('queue_updated', { queueId });
      }
      return NextResponse.json({ message: 'No customers waiting in queue', entry: null });
    }

    // 3. Mark next customer as called
    const { data: updatedEntry, error: updateError } = await supabaseAdmin
      .from('queue_entries')
      .update({ status: 'called', called_at: new Date().toISOString() })
      .eq('id', nextEntry.id)
      .select('*')
      .single();

    if (updateError || !updatedEntry) {
      return NextResponse.json({ message: updateError?.message || 'Error calling next customer' }, { status: 500 });
    }

    // 4. Broadcast the update
    if (io) {
      io.to(queueId).emit('queue_updated', { queueId });
      io.emit('customer_called', {
        queueId,
        token: updatedEntry.token,
        customerName: updatedEntry.customer_name,
      });
    }

    return NextResponse.json({
      _id: updatedEntry.id.toString(),
      customerName: updatedEntry.customer_name,
      queueId: updatedEntry.queue_id.toString(),
      token: updatedEntry.token,
      status: updatedEntry.status,
      joinedAt: updatedEntry.joined_at,
      calledAt: updatedEntry.called_at,
      servedAt: updatedEntry.served_at,
    });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
