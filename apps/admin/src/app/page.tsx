'use client';

import dynamic from 'next/dynamic';

// React Admin потребує client-side рендеру — вимикаємо SSR,
// інакше Next падає під час пререндеру '/' на етапі збірки.
const AdminApp = dynamic(() => import('../AdminApp').then((m) => m.AdminApp), {
  ssr: false,
});

export default function AdminPage() {
  return <AdminApp />;
}
