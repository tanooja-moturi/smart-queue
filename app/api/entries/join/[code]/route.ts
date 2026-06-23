import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// POST /api/entries/join/:code — public, no auth required
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { customerName } = await req.json();

    if (!customerName || customerName.trim() === '') {
      return NextResponse.json({ message: 'Customer name is required' }, { status: 400 });
    }

    // 1. Find Queue
    const { data: queue, error: queueError } = await supabaseAdmin
      .from('queues')
      .select('*')
      .ilike('queue_code', code)
      .maybeSingle();

    if (queueError || !queue) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    // Check if customer is already active in this queue (waiting or called)
    const trimmedName = customerName.trim();
    const { data: existingEntry } = await supabaseAdmin
      .from('queue_entries')
      .select('*')
      .eq('queue_id', queue.id)
      .ilike('customer_name', trimmedName)
      .in('status', ['waiting', 'called'])
      .limit(1)
      .maybeSingle();

    if (existingEntry) {
      return NextResponse.json({
        _id: existingEntry.id.toString(),
        customerName: existingEntry.customer_name,
        queueId: existingEntry.queue_id.toString(),
        token: existingEntry.token,
        status: existingEntry.status,
        joinedAt: existingEntry.joined_at,
      });
    }

    // 2. Increment lastTokenNumber
    const nextTokenNumber = queue.last_token_number + 1;
    const { data: updatedQueue, error: updateError } = await supabaseAdmin
      .from('queues')
      .update({ last_token_number: nextTokenNumber })
      .eq('id', queue.id)
      .select('*')
      .single();

    if (updateError || !updatedQueue) {
      return NextResponse.json({ message: 'Error generating token' }, { status: 500 });
    }

    // 3. Format Token (e.g. A001, B015)
    const paddedNum = String(updatedQueue.last_token_number).padStart(3, '0');
    const token = `${updatedQueue.token_prefix}${paddedNum}`;

    // 4. Create Entry
    const { data: entry, error: createError } = await supabaseAdmin
      .from('queue_entries')
      .insert({
        customer_name: trimmedName,
        queue_id: queue.id,
        token,
        status: 'waiting',
        joined_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (createError || !entry) {
      return NextResponse.json({ message: createError?.message || 'Error joining queue' }, { status: 500 });
    }

    // 5. Broadcast real-time update via socket
    const io = (global as any).io;
    if (io) {
      io.to(queue.id.toString()).emit('queue_updated', { queueId: queue.id });
    }

    return NextResponse.json({
      _id: entry.id.toString(),
      customerName: entry.customer_name,
      queueId: entry.queue_id.toString(),
      token: entry.token,
      status: entry.status,
      joinedAt: entry.joined_at,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
