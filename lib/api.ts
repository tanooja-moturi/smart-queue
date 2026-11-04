/**
 * Client-side API utility.
 * In the unified Next.js app, API routes are on the same origin,
 * so we use /api as the base URL (no cross-origin requests needed).
 */

const API_BASE_URL = '/api';

const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
};

const inFlightGets = new Map<string, Promise<any>>();

export const apiRequest = async (
  endpoint: string,
  method: string = 'GET',
  body?: any
): Promise<any> => {
  const isGet = method.toUpperCase() === 'GET';
  if (isGet && inFlightGets.has(endpoint)) {
    return inFlightGets.get(endpoint);
  }

  const execute = async () => {
    try {
      const config: RequestInit = {
        method,
        headers: getHeaders(),
      };
      if (body) {
        config.body = JSON.stringify(body);
      }
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }
      return data;
    } catch (error) {
      console.error(`API Error in ${endpoint}:`, error);
      throw error;
    } finally {
      if (isGet) {
        inFlightGets.delete(endpoint);
      }
    }
  };

  const promise = execute();
  if (isGet) {
    inFlightGets.set(endpoint, promise);
  }

  return promise;
};
