import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { SocketProvider } from '@/context/SocketContext';
import { CustomerProvider } from '@/context/CustomerContext';

export const metadata: Metadata = {
  title: 'QFlow — Smart Queue Management System',
  description: 'Allow customers to join virtual queues by scanning a QR code or entering a queue ID. Real-time updates powered by Socket.IO.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <SocketProvider>
            <CustomerProvider>
              {children}
            </CustomerProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
