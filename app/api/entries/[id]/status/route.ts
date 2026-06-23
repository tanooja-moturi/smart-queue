import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/authMiddleware';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// PATCH /api/entries/:id/status — protected
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: 401 });
    }

    const { id } = await params;
    const { status } = await req.json();

    if (!['waiting', 'called', 'served', 'skipped'].includes(status)) {
      return NextResponse.json({ message: 'Invalid status value' }, { status: 400 });
    }

    const { data: entry, error: fetchError } = await supabaseAdmin
      .from('queue_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !entry) {
      return NextResponse.json({ message: 'Queue entry not found' }, { status: 404 });
    }

    const updateFields: any = { status };
    if (status === 'called') {
      updateFields.called_at = new Date().toISOString();
    } else if (status === 'served') {
      updateFields.served_at = new Date().toISOString();
    }

    const { data: updatedEntry, error: updateError } = await supabaseAdmin
      .from('queue_entries')
      .update(updateFields)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updatedEntry) {
      return NextResponse.json({ message: updateError?.message || 'Error updating status' }, { status: 500 });
    }

    const io = (global as any).io;
    if (io) {
      io.to(updatedEntry.queue_id.toString()).emit('queue_updated', { queueId: updatedEntry.queue_id });

      if (status === 'called') {
        io.emit('customer_called', {
          queueId: updatedEntry.queue_id,
          token: updatedEntry.token,
          customerName: updatedEntry.customer_name,
        });
      }
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
