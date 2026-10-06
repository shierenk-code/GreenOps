'use client';

import { useState } from 'react';
import styles from './workspace-pages.module.css';
import { ArchitectureReview } from './architecture-review';

const template = {
  stack: 'my-synthetic-architecture',
  resources: [
    {
      name: 'example-worker',
      type: 'vm_scale_set',
      region: 'eastus',
      gridIntensityKgPerKwh: 0.45,
      instanceCores: 8,
      neededCores: 2,
      autoscale: false,
    },
  ],
};

export function DataSetup({ signedIn = false }: { signedIn?: boolean }) {
  const [kind, setKind] = useState('form');
  const [subscription, setSubscription] = useState('');
  const [copied, setCopied] = useState('');
  const validSubscription = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    subscription,
  );
  const commands =
    kind === 'architecture'
      ? 'pnpm.cmd greenops architecture assess ./architecture.json --ledger ./.tmp/architecture-review.json'
      : `az login\npnpm.cmd greenops azure scan --subscription ${validSubscription ? subscription : '<subscription-id>'} --ledger ./.tmp/azure-readonly-review.json`;
  const sync = `pnpm.cmd greenops sync --ledger ./.tmp/${kind === 'architecture' ? 'architecture' : 'azure-readonly'}-review.json --project ${kind === 'architecture' ? 'architecture' : 'azure-review'}`;
  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'architecture.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={styles.card} aria-label="Bring your own data">
      <h3>Bring your own data</h3>
      <p>
        Run read-only checks on your machine, then load the results here. Only use public, synthetic
        or explicitly permitted non-sensitive test resources.
      </p>
      <div className={styles.filters}>
        <label>
          Review source{' '}
          <select
            aria-label="Review source"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setCopied('');
            }}
          >
            <option value="form">Review resource configuration · browser form</option>
            <option value="architecture">Advanced · Architecture JSON / CLI</option>
            <option value="azure">Azure subscription · read-only</option>
          </select>
        </label>
      </div>
      {kind === 'form' ? (
        <ArchitectureReview />
      ) : (
        <>
          {kind === 'architecture' ? (
            <>
              <h4>1. Prepare the architecture</h4>
              <p>
                Download the template and save it as architecture.json in the repository root.
                Replace its synthetic resource fields with your permitted test data. This checks
                structured resource records—not architecture screenshots, raw Terraform or Bicep.
              </p>
              <button type="button" className={styles.button} onClick={downloadTemplate}>
                Download architecture template
              </button>
              <details>
                <summary>Required fields and limits</summary>
                <p>
                  stack; resources with name, type, region, gridIntensityKgPerKwh, instanceCores,
                  neededCores and autoscale (true/false). Maximum 500 resources and 1 MiB. Use
                  evidenced numbers; do not guess utilization or grid intensity.
                </p>
              </details>
            </>
          ) : (
            <>
              <h4>1. Choose your Azure test subscription</h4>
              <p>
                Install Azure CLI and sign in on your machine. Use Reader access to an explicitly
                permitted test subscription. Credentials remain with Azure CLI; GreenOps does not
                ask for your password or store the access token.
              </p>
              <label>
                Subscription ID{' '}
                <input
                  aria-label="Azure subscription ID"
                  value={subscription}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  onChange={(event) => setSubscription(event.target.value.trim())}
                />
              </label>
              {subscription && !validSubscription && (
                <p role="alert">Enter a valid subscription UUID.</p>
              )}
              <p>
                <strong>Coverage:</strong> VM scale sets and Azure Monitor autoscale settings only.
                No live utilization, billing, grid-carbon or seven-agent baseline is collected. A
                missing autoscale setting is a review prompt, not proof of wasted energy. No
                deployments or resource changes.
              </p>
            </>
          )}
          <h4>2. Run the assessment</h4>
          <p>
            Open a terminal in this repository after setup. These commands use deterministic checks;
            no resource details are sent to Gemini.
          </p>
          <pre className={styles.command}>{commands}</pre>
          <button
            type="button"
            className={styles.textButton}
            disabled={kind === 'azure' && !validSubscription}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(commands);
                setCopied('Commands copied.');
              } catch {
                setCopied('Copy unavailable. Select the commands above manually.');
              }
            }}
          >
            Copy assessment commands
          </button>
          <span role="status">{copied}</span>
          <h4>3. Show the results</h4>
          {signedIn ? (
            <>
              <p>
                Choose <strong>Connect terminal</strong> in the account bar and run its connection
                command first, then:
              </p>
              <pre className={styles.command}>{sync}</pre>
              <p>
                Select the new run in Run history and open Architecture. Scanning Azure does not
                connect Azure to MongoDB; syncing stores the resulting assessment in your GreenOps
                account.
              </p>
            </>
          ) : (
            <p>
              Use <strong>Import results</strong> above to select the generated ledger JSON. For a
              signed-in workspace, connect the terminal and sync the ledger instead.
            </p>
          )}
          <p>
            No findings can mean no supported issues were detected, no supported resources exist, or
            the selected run/date window differs. Other agents stay empty unless the imported run
            contains their evidence.
          </p>
        </>
      )}
    </section>
  );
}
