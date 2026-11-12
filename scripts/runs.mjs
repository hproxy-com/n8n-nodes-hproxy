// Lists this repository's latest GitHub Actions runs (name, branch or tag, status, result), with the GitHub login
// git already holds for github.com (the same lane as the toolbox's github/gh.mjs). Prints no token.
//   node scripts/runs.mjs [count]            e.g. after pushing a version tag, to see the Publish run finish
import { spawnSync } from 'node:child_process';

const count = Number(process.argv[2] || 5);
const fill = spawnSync('git', ['credential', 'fill'], {
	input: 'protocol=https\nhost=github.com\n\n',
	encoding: 'utf8',
});
const token = ((fill.stdout || '').match(/^password=(.+)$/m) || [])[1];
if (!token) {
	console.error('no GitHub login stored for github.com');
	process.exit(2);
}
const response = await fetch(
	`https://api.github.com/repos/hproxy-com/n8n-nodes-hproxy/actions/runs?per_page=${count}`,
	{
		headers: {
			Authorization: `token ${token.trim()}`,
			Accept: 'application/vnd.github+json',
			'User-Agent': 'n8n-nodes-hproxy/scripts/runs.mjs',
		},
	},
);
const data = await response.json();
for (const run of data.workflow_runs || []) {
	console.log(
		`${run.id}  ${run.name.padEnd(12)} ${String(run.head_branch).padEnd(8)} ${run.status.padEnd(11)} ${run.conclusion || ''}`,
	);
}
