import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/authMiddleware';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// DELETE /api/queues/:id — protected
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: queue } = await supabaseAdmin
      .from('queues')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!queue) {
      return NextResponse.json({ message: 'Queue not found' }, { status: 404 });
    }

    // Cascade delete: delete queue entries first, then delete queue itself
    await supabaseAdmin.from('queue_entries').delete().eq('queue_id', id);
    await supabaseAdmin.from('queues').delete().eq('id', id);

    // Broadcast a socket event to notify clients
    const io = (global as any).io;
    if (io) {
      io.to(id.toString()).emit('queue_updated', { queueId: id });
    }

    return NextResponse.json({ message: 'Queue and all associated entries deleted successfully', queueId: id });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
