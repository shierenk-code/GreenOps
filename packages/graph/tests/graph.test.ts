import { describe, it, expect } from 'vitest';
import { DependencyGraph } from '../src/graph.js';
import { createGraphNode } from '../src/node.js';
import { createGraphEdge } from '../src/edge.js';
import { GraphTraversal } from '../src/traversal.js';

describe('Dependency Graph & Traversal', () => {
  it('constructs edges and resolves callers / callees correctly', () => {
    const graph = new DependencyGraph();

    const nodeA = createGraphNode({ id: 'sym_a', name: 'callerFunc', type: 'function' });
    const nodeB = createGraphNode({ id: 'sym_b', name: 'targetFunc', type: 'function' });
    const nodeC = createGraphNode({ id: 'sym_c', name: 'calleeFunc', type: 'function' });

    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);

    graph.addEdge(createGraphEdge({ source: 'sym_a', target: 'sym_b', type: 'calls' }));
    graph.addEdge(createGraphEdge({ source: 'sym_b', target: 'sym_c', type: 'calls' }));

    const traversal = new GraphTraversal(graph);

    const callers = traversal.findCallers('targetFunc');
    expect(callers).toHaveLength(1);
    expect(callers[0].id).toBe('sym_a');

    const callees = traversal.findCallees('targetFunc');
    expect(callees).toHaveLength(1);
    expect(callees[0].id).toBe('sym_c');
  });
});
