import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, role } = await req.json();

    const { data: userExists, error: existError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (userExists) {
      return NextResponse.json({ message: 'User already exists' }, { status: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const { data: user, error: createError } = await supabaseAdmin
      .from('users')
      .insert({
        name,
        email,
        password: hashedPassword,
        role: role || 'staff',
      })
      .select('*')
      .single();

    if (createError || !user) {
      return NextResponse.json({ message: createError?.message || 'Invalid user data' }, { status: 400 });
    }

    if (!process.env.JWT_SECRET) {
      return NextResponse.json({ message: 'Internal server configuration error' }, { status: 500 });
    }
    const token = jwt.sign({ id: user.id.toString() }, process.env.JWT_SECRET, { expiresIn: '30d' });

    return NextResponse.json(
      {
        _id: user.id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        token,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
