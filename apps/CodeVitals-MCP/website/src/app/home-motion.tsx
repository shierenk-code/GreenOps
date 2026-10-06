'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform, useReducedMotion, AnimatePresence } from 'framer-motion';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { PixelArt } from './home-illustrations';
import styles from './home.module.css';

export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={false}
      whileInView={reduced ? undefined : { opacity: [0.65, 1], y: [32, 0] }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function HomeNavigation() {
  const ref = useRef<HTMLDetailsElement>(null);
  const items = [
    ['#agents', 'The agents'],
    ['#workflow', 'How it works'],
    ['#principles', 'Our approach'],
    ['#explore', 'Explore'],
  ];
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="GreenOps home">
        <PixelArt />
        GreenOps
      </Link>
      <nav className={styles.desktopNav} aria-label="Main navigation">
        {items.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>
      <Link className={styles.navDemo} href="/dashboard?data=sample">
        Try a scenario
      </Link>
      <Link className={styles.navCta} href="/dashboard">
        Workspace <ArrowUpRight size={17} aria-hidden="true" />
      </Link>
      <details
        className={styles.mobileNav}
        ref={ref}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            ref.current?.removeAttribute('open');
            ref.current?.querySelector('summary')?.focus();
          }
        }}
      >
        <summary>
          Menu <span aria-hidden="true">⌄</span>
        </summary>
        <nav aria-label="Mobile navigation" onClick={() => ref.current?.removeAttribute('open')}>
          {items.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
              <ArrowUpRight size={16} />
            </a>
          ))}
          <Link href="/dashboard">
            Open workspace <ArrowUpRight size={16} />
          </Link>
        </nav>
      </details>
    </header>
  );
}

export function LandingHero() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const rotation = useTransform(scrollYProgress, [0, 1], [45, 140]);
  return (
    <section className={styles.hero} ref={ref}>
      <div className={styles.orbit} aria-hidden="true" />
      <motion.div
        className={styles.leftTower}
        style={reduced ? undefined : { y }}
        aria-hidden="true"
      >
        <i />
        <i />
        <i />
      </motion.div>
      <div className={styles.rightTower} aria-hidden="true">
        <motion.i style={{ rotate: reduced ? 45 : rotation }} />
        <i />
        <i />
      </div>
      <div className={styles.heroContent}>
        <h1>
          GreenOps <PixelArt /> makes
          <br />
          every resource count.
        </h1>
        <p>
          Understand your digital footprint.
          <br />
          Turn evidence into better engineering decisions.
        </p>
        <Link className={styles.primary} href="/dashboard">
          Explore GreenOps <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <PixelArt kind="server" className={styles.heroServer} />
      <PixelArt kind="cloud" className={styles.heroCloud} />
      <a href="#perspective" className={styles.scroll}>
        SCROLL <ArrowDown size={15} aria-hidden="true" />
      </a>
    </section>
  );
}

const labels = [
  'Cloud resources',
  'Carbon signals',
  'Model requests',
  'Idle capacity',
  'Data retention',
  'Recovery plans',
  'Your codebase',
  'Human decisions',
  'Verified results',
];
export function SignalField() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const left = useTransform(scrollYProgress, [0, 1], [-75, 50]);
  const right = useTransform(scrollYProgress, [0, 1], [75, -50]);
  return (
    <section id="perspective" ref={ref} className={styles.perspective}>
      <Reveal>
        <h2>
          A smaller footprint starts
          <br />
          with a clearer picture.
        </h2>
        <p>Connect the signals across your digital world.</p>
      </Reveal>
      <div className={styles.signalField}>
        <svg viewBox="0 0 1440 430" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M0 ${i * 48} L1440 ${430 - i * 48}`} />
          ))}
        </svg>
        {[0, 1, 2].map((row) => (
          <motion.div
            className={styles.signalRow}
            key={row}
            style={reduced ? undefined : { x: row % 2 ? right : left }}
          >
            {labels.slice(row * 3, row * 3 + 3).map((label, i) => (
              <span key={label}>
                {i === 1 && <PixelArt kind={row === 0 ? 'cloud' : row === 1 ? 'chip' : 'ledger'} />}
                {label}
              </span>
            ))}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

const agents = [
  {
    key: 'carbon',
    name: 'Carbon efficiency',
    title: 'A better time. A better place.',
    text: 'Compare regional carbon-intensity scenarios and find cleaner windows for flexible workloads. Inspect the evidence and operating constraints before making a move.',
    kind: 'cloud' as const,
    tag: 'ENERGY & EMISSIONS',
  },
  {
    key: 'waste',
    name: 'Digital waste',
    title: 'Make room for what matters.',
    text: 'Bring idle resources, oversized infrastructure and forgotten storage into view. Review a right-sizing proposal and follow the supported synthetic workflow from finding to verification.',
    kind: 'server' as const,
    tag: 'RESOURCES & RETENTION',
  },
  {
    key: 'ai',
    name: 'AI efficiency',
    title: 'Less repetition. More intention.',
    text: 'Investigate repeated requests, unnecessary retries and token overhead. Test caching in an isolated sandbox, replay requests and compare the results.',
    kind: 'chip' as const,
    tag: 'MODELS & INFERENCE',
  },
  {
    key: 'arch',
    name: 'Architecture',
    title: 'Better choices, by design.',
    text: 'Explore infrastructure sizing and architecture choices with a smaller footprint. Keep service requirements, rollback and the supporting evidence in the same conversation.',
    kind: 'server' as const,
    tag: 'SYSTEMS & DESIGN',
  },
  {
    key: 'dr',
    name: 'Disaster recovery',
    title: 'Ready when it counts.',
    text: 'Balance recovery requirements with the overhead of standing by. Investigate resilience scenarios without mistaking unused capacity for unnecessary protection.',
    kind: 'shield' as const,
    tag: 'RESILIENCE & READINESS',
  },
  {
    key: 'collab',
    name: 'Collaboration',
    title: 'Give content a considered lifecycle.',
    text: 'Explore recordings, transcripts and shared content through retention and ownership. Bring the right people into decisions about what to keep and what to review.',
    kind: 'ledger' as const,
    tag: 'CONTENT & LIFECYCLE',
  },
  {
    key: 'pipeline',
    name: 'Pipeline efficiency',
    title: 'Build once. Ship with less.',
    text: 'Find CI/CD runs that repeat work already done: cold caches, duplicate builds for one commit and artifacts nobody deploys. Review a workflow change before it reaches the main branch.',
    kind: 'chip' as const,
    tag: 'BUILDS & DELIVERY',
  },
];

export function AgentExplorer() {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const agent = agents[active];
  return (
    <div className={styles.explorer}>
      <div
        className={styles.agentTabs}
        role="tablist"
        aria-label="Specialist agents"
        onKeyDown={(event) => {
          const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? agents.length - 1
                : (active + (event.key === 'ArrowRight' ? 1 : -1) + agents.length) % agents.length;
          setActive(next);
          (event.currentTarget.children[next] as HTMLButtonElement)?.focus();
        }}
      >
        {agents.map((item, i) => (
          <button
            key={item.key}
            id={`agent-tab-${item.key}`}
            role="tab"
            aria-selected={active === i}
            aria-controls="agent-panel"
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
          >
            {item.name}
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <div id="agent-panel" role="tabpanel" aria-labelledby={`agent-tab-${agent.key}`} tabIndex={0}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={agent.key}
            className={styles.agentPanel}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: reduced ? 1 : 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className={styles.agentCopy}>
              <span className={styles.eyebrow}>{agent.tag}</span>
              <h3>{agent.title}</h3>
              <p>{agent.text}</p>
              <Link className={styles.primary} href={`/dashboard?tab=${agent.key}`}>
                Explore {agent.name.toLowerCase()} <ArrowUpRight size={18} />
              </Link>
              <small>Findings support human review. Plans do not deploy changes.</small>
            </div>
            <div className={styles.agentArt} aria-hidden="true">
              <div className={styles.artOrbit} />
              <PixelArt kind={agent.kind} />
              <span className={styles.artBlock} />
              <span className={styles.artCaption}>
                GREENOPS / SPECIALIST {String(active + 1).padStart(2, '0')}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
