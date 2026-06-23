import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (dbError || !user) {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    if (await bcrypt.compare(password, user.password)) {
      if (!process.env.JWT_SECRET) {
        return NextResponse.json({ message: 'Internal server configuration error' }, { status: 500 });
      }
      const token = jwt.sign({ id: user.id.toString() }, process.env.JWT_SECRET, { expiresIn: '30d' });

      return NextResponse.json({
        _id: user.id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        token,
      });
    } else {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
