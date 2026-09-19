import { App } from '@octokit/app';
import type { ChangedFile } from '../types/review.js';
import dotenv from 'dotenv';

dotenv.config();

function getPrivateKey(): string {
  const b64 = process.env.GITHUB_PRIVATE_KEY_B64;
  if (!b64) throw new Error("GITHUB_PRIVATE_KEY_B64 is not Set");
  return Buffer.from(b64, "base64").toString("utf-8");
}

const appId = process.env.GITHUB_APP_ID;
if (!appId) throw new Error("GITHUB_APP_ID is not Set");

const app = new App({
  appId,
  privateKey: getPrivateKey(),
});

export async function getInstallationOctokit(installationId: number) {
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

  const { data: files } = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
    owner,
    repo,
    pull_number: prNumber
  })

  const relevantFiles = files.filter(( f: { patch?: string } ) => f.patch ).slice(0, maxFiles);

  const result: ChangedFile[] = [];

  for(const file of relevantFiles){

    let fullContent: string | undefined;

    if(withFullContent && file.status !== "removed"){
      try{

        const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
          owner,
          repo,
          path: file.filename,
          ref: `refs/pull/${prNumber}/head`,
        })

        if(!Array.isArray(data) && data.type === "file" && data.content){
          fullContent = Buffer.from(data.content, "base64").toString("utf-8");
        }

      } catch(err){
        console.log(`Skipping full content for ${file.filename}`);
      }
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
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
    owner,
    repo,
    pull_number: prNumber,
  })

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
    await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitId,
      event: "COMMENT",
      body: "🤖 AI review complete — no issues found in this diff.",
    })
    return;
  }

  await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitId,
    event: "COMMENT",
    body: `🤖 AI review complete — ${comments.length} issue(s) found.`
  })

  for (const comment of comments) {
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
  }
}