import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Reveal, HomeNavigation, LandingHero, SignalField, AgentExplorer } from './home-motion';
import { PixelArt } from './home-illustrations';
import styles from './home.module.css';

const workflow = [
  {
    title: 'We find the signals. You see the evidence.',
    text: 'Repository analysis and seven specialist agents surface potential waste. Trace each finding back to its source, understand the assumptions, and see what still needs investigation.',
    link: '/dashboard?tab=investigations',
    action: 'Explore investigations',
    kind: 'server' as const,
  },
  {
    title: 'We propose a plan. You make the call.',
    text: 'Approve a plan, request a revision or reject it. Human review stays part of the workflow, with decisions recorded alongside the recommendation. Approval alone never means a change was deployed.',
    link: '/dashboard?tab=approval',
    action: 'Explore human approvals',
    kind: 'shield' as const,
  },
  {
    title: 'Try the change. Check the difference.',
    text: 'Follow supported changes through isolated sandbox workflows. Compare before and after, inspect the checks, and distinguish projected improvements from verified results.',
    link: '/dashboard/ai-efficiency-demo',
    action: 'Try the AI efficiency demo',
    kind: 'chip' as const,
  },
];

export default function Home() {
  return (
    <div className={styles.root}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <HomeNavigation />
      <main id="main">
        <LandingHero />
        <div className={styles.disciplineStrip} aria-label="GreenOps areas of focus">
          {['Code', 'Cloud', 'AI', 'Resilience', 'People'].map((name, i) => (
            <div key={name}>
              <span aria-hidden="true">{['⌘', '▦', '✳', '◈', '⊞'][i]}</span>
              {name}
            </div>
          ))}
        </div>
        <SignalField />
        <section id="agents" className={styles.agents}>
          <Reveal>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>SEVEN SPECIALISTS. ONE CONNECTED PERSPECTIVE.</span>
              <h2>
                GreenOps helps you decide
                <br />
                what changes in your infrastructure.
              </h2>
            </div>
          </Reveal>
          <AgentExplorer />
        </section>
        <section id="workflow" className={styles.workflow}>
          <Reveal>
            <div className={styles.sectionHeading}>
              <span className={styles.eyebrow}>FROM SIGNAL TO CHANGE</span>
              <h2>
                Intelligence that assists.
                <br />
                Decisions that stay yours.
              </h2>
            </div>
          </Reveal>
          {workflow.map((step, i) => (
            <Reveal key={step.title} className={styles.workflowRow}>
              <div className={styles.workflowCopy}>
                <span className={styles.eyebrow}>
                  0{i + 1} / {['INVESTIGATE', 'REVIEW', 'VERIFY'][i]}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <Link className={styles.textLink} href={step.link}>
                  {step.action}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </div>
              <div className={`${styles.workflowArt} ${styles[`scene${i}`]}`} aria-hidden="true">
                <div className={styles.pixelSteps} />
                <PixelArt kind={step.kind} />
                <span className={styles.sceneLabel}>
                  {
                    [
                      'OBSERVATION → EVIDENCE',
                      'RECOMMENDATION → HUMAN DECISION',
                      'BASELINE → REPLAY → CHECK',
                    ][i]
                  }
                </span>
              </div>
            </Reveal>
          ))}
        </section>
        <section id="principles" className={styles.principles}>
          <Reveal>
            <div className={styles.principleIntro}>
              <span className={styles.eyebrow}>EVIDENCE BEFORE EVERYTHING</span>
              <h2>
                A lighter footprint.
                <br />A clearer account.
              </h2>
              <p>
                Observations, estimates and verified results deserve different names. GreenOps keeps
                the distinction visible.
              </p>
              <Link className={styles.primary} href="/dashboard?tab=results">
                Explore results & evidence <ArrowUpRight size={18} />
              </Link>
            </div>
          </Reveal>
          <div className={styles.principleGrid}>
            {[
              [
                '01',
                'Trace the source.',
                'An append-only sustainability ledger connects findings, recommendations and decisions.',
              ],
              [
                '02',
                'Keep the unknowns.',
                'Missing measurements remain missing. Model estimates are not power-meter readings.',
              ],
              [
                '03',
                'Measure with context.',
                'The SCI worksheet makes energy, carbon intensity, embodied emissions and functional units explicit.',
              ],
            ].map(([n, title, text]) => (
              <Reveal key={n}>
                <article>
                  <span>{n}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
        <section id="explore" className={styles.explore}>
          <Reveal>
            <div className={styles.exploreHeading}>
              <h2>Go deeper.</h2>
              <p>Start with a question. Follow the evidence.</p>
            </div>
          </Reveal>
          <div className={styles.exploreGrid}>
            {[
              {
                title: 'Explore the workspace',
                text: 'Bring your recorded analysis into one place, or explore the separate synthetic scenarios.',
                link: '/dashboard?data=sample',
                action: 'Try sample scenarios',
                kind: 'cloud' as const,
              },
              {
                title: 'Test a better idea',
                text: 'Replay the AI caching sandbox and inspect requests, answers and isolation checks. No API key required.',
                link: '/dashboard/ai-efficiency-demo',
                action: 'Open the AI demo',
                kind: 'chip' as const,
              },
              {
                title: 'Understand the footprint',
                text: 'Explore the Software Carbon Intensity worksheet and make every assumption visible.',
                link: '/dashboard/measurement',
                action: 'Explore the SCI worksheet',
                kind: 'ledger' as const,
              },
            ].map((card) => (
              <Reveal key={card.title}>
                <Link href={card.link} className={styles.exploreCard}>
                  <div className={styles.cardArt}>
                    <PixelArt kind={card.kind} />
                  </div>
                  <div className={styles.cardCopy}>
                    <h3>{card.title}</h3>
                    <p>{card.text}</p>
                    <span className={styles.textLink}>
                      {card.action}
                      <ArrowUpRight size={18} />
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
        <section className={styles.closing}>
          <Reveal>
            <span className={styles.eyebrow}>BUILD WITH MORE CONSIDERATION</span>
            <h2>
              Your next improvement
              <br />
              starts with a closer look.
            </h2>
            <Link className={styles.primary} href="/dashboard">
              Open GreenOps <ArrowUpRight size={20} />
            </Link>
          </Reveal>
          <PixelArt className={styles.closingTree} />
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div>
            <Link href="/" className={styles.brand}>
              <PixelArt />
              GreenOps
            </Link>
            <p>
              Better software.
              <br />A smaller footprint.
            </p>
          </div>
          <div>
            <h3>Explore</h3>
            <a href="#agents">Specialist agents</a>
            <a href="#workflow">How it works</a>
            <Link href="/dashboard?data=sample">Sample scenarios</Link>
          </div>
          <div>
            <h3>Build with evidence</h3>
            <Link href="/dashboard?tab=approval">Human approvals</Link>
            <Link href="/dashboard?tab=results">Results & evidence</Link>
            <Link href="/dashboard/measurement">SCI worksheet</Link>
          </div>
          <div>
            <h3>Try GreenOps</h3>
            <Link href="/dashboard">Open workspace</Link>
            <Link href="/dashboard/ai-efficiency-demo">AI efficiency demo</Link>
            <Link href="/dashboard?tab=waste&sandbox=1">Digital Waste sandbox</Link>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>GreenOps Engineering · Local prototype</span>
          <span>
            Sample scenarios are illustrative. Token reductions are not measured carbon savings.
          </span>
        </div>
        <div className={styles.footerLandscape} aria-hidden="true">
          <PixelArt kind="server" />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </footer>
    </div>
  );
}
