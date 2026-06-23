import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/authMiddleware';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/queues — list all queues with stats (protected)
export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: 401 });
    }

    const { data: queues, error: dbError } = await supabaseAdmin
      .from('queues')
      .select('*')
      .eq('user_id', user._id)
      .order('created_at', { ascending: false });

    if (dbError || !queues) {
      return NextResponse.json({ message: dbError?.message || 'Error fetching queues' }, { status: 500 });
    }

    const queuesWithStats = await Promise.all(
      queues.map(async (queue) => {
        const { count: waitingCount } = await supabaseAdmin
          .from('queue_entries')
          .select('*', { count: 'exact', head: true })
          .eq('queue_id', queue.id)
          .eq('status', 'waiting');

        const { count: servedCount } = await supabaseAdmin
          .from('queue_entries')
          .select('*', { count: 'exact', head: true })
          .eq('queue_id', queue.id)
          .eq('status', 'served');

        const { data: activeEntry } = await supabaseAdmin
          .from('queue_entries')
          .select('token')
          .eq('queue_id', queue.id)
          .eq('status', 'called')
          .order('called_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          _id: queue.id.toString(),
          queueName: queue.queue_name,
          queueCode: queue.queue_code,
          averageServiceTime: queue.average_service_time,
          tokenPrefix: queue.token_prefix,
          lastTokenNumber: queue.last_token_number,
          waitingCount: waitingCount || 0,
          servedCount: servedCount || 0,
          currentServing: activeEntry ? activeEntry.token : 'None',
        };
      })
    );

    return NextResponse.json(queuesWithStats);
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}

// POST /api/queues — create a queue (protected)
export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: 401 });
    }

    const { queueName, averageServiceTime } = await req.json();

    if (!queueName || !averageServiceTime) {
      return NextResponse.json({ message: 'All fields are required' }, { status: 400 });
    }

    // Generate unique queue code (e.g. SHOP-A8F3)
    const cleanPrefix = queueName.trim().toUpperCase().replace(/[^A-Z0-9\s-]/g, '').replace(/[\s-]+/g, '-');
    const codePrefix = cleanPrefix || 'QUEUE';
    const suffixChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    let codeNormalized = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 100) {
      attempts++;
      const suffixLen = Math.floor(Math.random() * 3) + 4; // random length 4, 5, or 6
      let suffix = '';
      for (let i = 0; i < suffixLen; i++) {
        suffix += suffixChars.charAt(Math.floor(Math.random() * suffixChars.length));
      }
      codeNormalized = `${codePrefix}-${suffix}`;

      const { data: queueExists } = await supabaseAdmin
        .from('queues')
        .select('id')
        .eq('queue_code', codeNormalized)
        .maybeSingle();

      if (!queueExists) {
        isUnique = true;
      }
    }

    if (!isUnique) {
      return NextResponse.json({ message: 'Could not generate a unique queue code. Please try again.' }, { status: 500 });
    }

    // Extract first character of the queue name as token prefix, fallback to 'A'
    let tokenPrefix = queueName.trim().charAt(0).toUpperCase();
    if (!/^[A-Z]$/.test(tokenPrefix)) {
      tokenPrefix = 'A';
    }

    const { data: queue, error: createError } = await supabaseAdmin
      .from('queues')
      .insert({
        queue_name: queueName,
        queue_code: codeNormalized,
        average_service_time: Number(averageServiceTime),
        token_prefix: tokenPrefix,
        last_token_number: 0,
        user_id: user._id,
      })
      .select('*')
      .single();

    if (createError || !queue) {
      return NextResponse.json({ message: createError?.message || 'Error creating queue' }, { status: 500 });
    }

    return NextResponse.json({
      _id: queue.id.toString(),
      queueName: queue.queue_name,
      queueCode: queue.queue_code,
      averageServiceTime: queue.average_service_time,
      tokenPrefix: queue.token_prefix,
      lastTokenNumber: queue.last_token_number,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
