'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Estado' },
  { href: '/admin/liquidez', label: 'Liquidez' },
  { href: '/admin/transacciones', label: 'Transacciones' },
  { href: '/admin/configuracion', label: 'Configuración' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map(({ href, label }) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap ${
              active ? 'bg-info-bg text-brand' : 'text-ink hover:bg-canvas'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
