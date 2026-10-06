'use client';

import Link from 'next/link';
import { useRef, type MouseEvent, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import styles from './workspace-motion.module.css';

export function PixelTree({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 112" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="#ffb000" d="M32 0h32v16H32zM16 16h64v16H16zM0 32h96v16H0z" />
      <path fill="#ff8200" d="M0 48h96v16H0zM16 64h64v16H16z" />
      <path fill="#fa501f" d="M32 80h32v16H32zM40 48h16v64H40zM24 104h48v8H24z" />
      <path fill="#d74218" d="M56 48h8v64h-8z" />
    </svg>
  );
}

export function WorkspaceHero({
  href,
  onNavigate,
  summary,
}: {
  href: string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  summary: string;
}) {
  const target = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 130]);
  const rotate = useTransform(scrollYProgress, [0, 1], [45, 135]);
  return (
    <section ref={target} className={styles.hero} aria-label="GreenOps sustainability workspace">
      <div className={styles.orbit} aria-hidden="true" />
      <motion.div className={styles.blocks} style={reduced ? undefined : { y }} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </motion.div>
      <motion.div
        className={styles.diamond}
        style={reduced ? { rotate: 45 } : { rotate }}
        aria-hidden="true"
      />
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>ENGINEERING A LIGHTER FOOTPRINT</span>
        <h2>
          GreenOps <PixelTree /> puts
          <br />
          impact in your hands.
        </h2>
        <p>
          Your infrastructure. Your decisions.
          <br />
          {summary}
        </p>
        <Link className={styles.action} href={href} onClick={onNavigate}>
          Explore your findings <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <a href="#global-footprint" className={styles.scroll}>
        EXPLORE THE WORKSPACE <ArrowDown size={15} aria-hidden="true" />
      </a>
      <svg
        className={styles.server}
        viewBox="0 0 80 96"
        aria-hidden="true"
        shapeRendering="crispEdges"
      >
        <path fill="#a9d4f9" d="M16 0h48v16H16zM0 16h80v80H0z" />
        <path fill="#297ec1" d="M8 24h64v24H8zM8 56h64v24H8z" />
        <path fill="#fff" d="M16 32h8v8h-8zM16 64h8v8h-8z" />
        <path fill="#ff8200" d="M48 32h16v8H48zM48 64h16v8H48z" />
      </svg>
    </section>
  );
}

/** Content renders visibly on the server; motion never gates access to evidence. */
export function ScrollSection({ children, id }: { children: ReactNode; id?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      id={id}
      className={styles.section}
      initial={false}
      whileInView={reduced ? undefined : { y: [24, 0], opacity: [0.7, 1] }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
