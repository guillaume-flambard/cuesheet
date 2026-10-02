/**
 * Entry point: rewrite the committed manifest from the current tree.
 *
 * The manifest carries a SHA256 per declared source, so editing any declared file makes
 * the committed artifact stale and fails test/state-graph-manifest.test.ts. Regenerating
 * by hand means re-deriving those digests, which is exactly the step a person forgets.
 * Run `npm run graph:regen` and commit the result.
 *
 * It writes only the manifest, refuses if that would change anything else, and prints
 * the new revision so the commit message can name it.
 */
import {writeFileSync} from 'node:fs';
import {MANIFEST_PATH,stateGraphJson} from './manifest.ts';
import {graphRevision,loadStateGraph} from './loader.ts';

const root=process.cwd(),next=stateGraphJson(root),path=`${root}/${MANIFEST_PATH}`;
writeFileSync(path,next);
const loaded=await loadStateGraph(root);
console.log(`regenerated ${MANIFEST_PATH}: ${loaded.graph.nodes.length} nodes, ${loaded.graph.edges.length} edges, revision ${graphRevision(loaded.graph)}`);