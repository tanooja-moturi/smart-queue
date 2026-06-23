import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/authMiddleware';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);

    if (error || !user) {
      return NextResponse.json({ message: error || 'Not authorized' }, { status: 401 });
    }

    return NextResponse.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
