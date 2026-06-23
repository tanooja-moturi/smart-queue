import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Extracts and verifies the Bearer JWT from the Authorization header.
 * Returns the user document if valid, or null with an error message.
 */
export const getAuthUser = async (
  req: NextRequest
): Promise<{ user: any; error: string | null }> => {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Not authorized, no token' };
  }

  const token = authHeader.split(' ')[1];

  if (!process.env.JWT_SECRET) {
    return { user: null, error: 'Internal server configuration error' };
  }

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET);
    
    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role')
      .eq('id', decoded.id)
      .single();

    if (dbError || !user) {
      return { user: null, error: 'Not authorized, user not found' };
    }

    // Map Supabase fields to Mongoose shape
    const mappedUser = {
      _id: user.id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return { user: mappedUser, error: null };
  } catch (error) {
    console.error('Auth middleware error:', error);
    return { user: null, error: 'Not authorized, token failed' };
  }
};
