/* global process, console */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { releaseRepository, releaseVersion, collectReleaseAssets } from './release-config.mjs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = releaseVersion(pkg);
const { owner, repo } = releaseRepository(pkg);
const repository = `${owner}/${repo}`;
const tag = `v${version}`;
if (process.env.GITHUB_REPOSITORY !== repository || !/^[a-f\d]{40}$/i.test(process.env.GITHUB_SHA || '')) {
  throw new Error('Release must run in its configured GitHub repository at an exact commit');
}
const ghJson = args => JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
if (ghJson(['api', `repos/${repository}`]).private !== false) throw new Error('Public repository required for token-free updates');
const tags = ghJson(['api', `repos/${repository}/git/matching-refs/tags/${tag}`]);
if (tags.some(ref => ref.ref === `refs/tags/${tag}`)) throw new Error(`${tag} already exists: bump the version instead of replacing a release`);
if (process.argv[2] === '--check') {
  console.log(`Ready to build ${tag} from ${process.env.GITHUB_SHA}`);
} else {
  if (process.argv.length !== 3) throw new Error('Usage: prepare-github-release.mjs --check|<artifact-directory>');
  const directory = process.argv[2];
  const files = collectReleaseAssets(directory, version);
  // No --clobber and no --latest: a rerun must never replace a published version.
  execFileSync('gh', ['release', 'create', tag, ...files, '--repo', repository, '--target', process.env.GITHUB_SHA,
    '--draft', '--title', `MarkD ${version}`, '--generate-notes'], { stdio: 'inherit' });
}
