import { App } from '@octokit/app';
import type { ChangedFile } from '../types/review.js';

function getPrivateKey(): string {
  const b64 = process.env.GITHUB_PRIVATE_KEY_B64;
  if (!b64) {
    console.error("[github] GITHUB_PRIVATE_KEY_B64 is not set");
    throw new Error("GITHUB_PRIVATE_KEY_B64 is not Set");
  }
  console.log("[github] GITHUB_PRIVATE_KEY_B64 loaded");
  return Buffer.from(b64, "base64").toString("utf-8");
}

const appId = process.env.GITHUB_APP_ID;
if (!appId) {
  console.error("[github] GITHUB_APP_ID is not set");
  throw new Error("GITHUB_APP_ID is not Set");
}
console.log(`[github] GITHUB_APP_ID loaded: ${appId}`);

const app = new App({
  appId,
  privateKey: getPrivateKey(),
});
console.log("[github] GitHub App initialized");

export async function getInstallationOctokit(installationId: number) {
  console.log(`[github] Getting octokit for installation ${installationId}`);
  return app.getInstallationOctokit(installationId);
}

export async function fetchChangedFiles(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  { withFullContent = true, maxFiles = 15 } = {}
): Promise<ChangedFile[]> {
  
  const octokit = await getInstallationOctokit(installationId);

  console.log(`[github] GET /repos/${owner}/${repo}/pulls/${prNumber}/files`);
  const { data: files } = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
    owner,
    repo,
    pull_number: prNumber
  })
  console.log(`[github] Got ${files.length} file(s) from PR, filtering to those with patches...`);

  const relevantFiles = files.filter(( f: { patch?: string } ) => f.patch ).slice(0, maxFiles);
  console.log(`[github] ${relevantFiles.length} file(s) with patches (max: ${maxFiles})`);

  const result: ChangedFile[] = [];

  for(const file of relevantFiles){
    console.log(`[github] Processing file: ${file.filename} (${file.status})`);

    let fullContent: string | undefined;

    if(withFullContent && file.status !== "removed"){
      try{
        console.log(`[github] GET /repos/${owner}/${repo}/contents/${file.filename}`);
        const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
          owner,
          repo,
          path: file.filename,
          ref: `refs/pull/${prNumber}/head`,
        })

        if(!Array.isArray(data) && data.type === "file" && data.content){
          fullContent = Buffer.from(data.content, "base64").toString("utf-8");
          console.log(`[github] Got full content for ${file.filename} (${fullContent.length} chars)`);
        } else {
          console.log(`[github] No usable content returned for ${file.filename}`);
        }

      } catch(err){
        console.error(`[github] Failed to fetch full content for ${file.filename}:`, err instanceof Error ? err.message : err);
      }
    } else {
      console.log(`[github] Skipping full content fetch for ${file.filename} (removed or withFullContent=false)`);
    }
    result.push({
      fileName: file.filename,
      patch: file.patch!, fullContent,
      status: file.status,
    })
  }
  return result;
}

export async function getLatestCommitSha(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {

  const octokit = await getInstallationOctokit(installationId);
  console.log(`[github] GET /repos/${owner}/${repo}/pulls/${prNumber} (for commit SHA)`);
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
    owner,
    repo,
    pull_number: prNumber,
  })

  console.log(`[github] Latest commit SHA: ${data.head.sha}`);
  return data.head.sha;
}

export async function postReviews(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  commitId: string,
  comments: { path: string, line: number, body: string }[]
){
  const octokit = await getInstallationOctokit(installationId);

  if(comments.length === 0){
    console.log(`[github] No issues found — posting "no issues" review`);
    await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitId,
      event: "COMMENT",
      body: "🤖 AI review complete — no issues found in this diff.",
    })
    console.log(`[github] Posted empty review on ${owner}/${repo}#${prNumber}`);
    return;
  }

  console.log(`[github] Creating review with ${comments.length} comment(s) on ${owner}/${repo}#${prNumber}`);
  await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitId,
    event: "COMMENT",
    body: `🤖 AI review complete — ${comments.length} issue(s) found.`
  })

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    console.log(`[github] Posting comment ${i + 1}/${comments.length}: ${comment.path}:${comment.line}`);
    try {
      await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/comments", {
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitId,
        path: comment.path,
        line: comment.line,
        side: "RIGHT",
        body: comment.body,
      })
      console.log(`[github] Comment ${i + 1}/${comments.length} posted successfully`);
    } catch (err) {
      console.error(`[github] Failed to post comment ${i + 1}/${comments.length} on ${comment.path}:${comment.line}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }
}