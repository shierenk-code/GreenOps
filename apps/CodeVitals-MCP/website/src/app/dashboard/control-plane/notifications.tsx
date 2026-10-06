'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { Bell, Check, X } from 'lucide-react';
import type { DashboardNotification } from './notification-data';
import styles from './notifications.module.css';

export function Notifications({
  items,
  href,
  onNavigate,
}: {
  items: DashboardNotification[];
  href: (item: DashboardNotification) => string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<string[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const unread = items.filter((item) => !read.includes(item.id)).length;
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className={styles.root} ref={container}>
      <button
        type="button"
        ref={trigger}
        className={styles.bell}
        aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <span aria-hidden="true">{unread}</span>}
      </button>
      {open && (
        <section id={id} className={styles.panel} aria-label="Notifications">
          <header>
            <h2>Notifications</h2>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={17} />
            </button>
          </header>
          <div className={styles.toolbar}>
            <span>{unread} unread</span>
            <button
              type="button"
              disabled={!unread}
              onClick={() =>
                setRead((current) => [...new Set([...current, ...items.map((item) => item.id)])])
              }
            >
              <Check size={14} aria-hidden="true" />
              Mark all read
            </button>
          </div>
          <ul>
            {items.map((item) => (
              <li key={item.id} data-unread={!read.includes(item.id)} data-tone={item.tone}>
                <Link
                  href={href(item)}
                  prefetch={false}
                  onClick={(event) => {
                    setRead((current) =>
                      current.includes(item.id) ? current : [...current, item.id],
                    );
                    setOpen(false);
                    onNavigate(event);
                  }}
                >
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </Link>
              </li>
            ))}
          </ul>
          {!items.length && <p className={styles.empty}>No notifications for this selection.</p>}
        </section>
      )}
    </div>
  );
}
