import "dotenv/config";
import { Worker, Job } from "bullmq";
import { connection } from "./reviewQueue.js";
import { fetchChangedFiles, getLatestCommitSha, postReviews }from "../services/github.js";
import { reviewAllFiles } from "../services/gemini.js";
import type { ReviewJobPayload } from "../types/review.js"

const worker = new Worker<ReviewJobPayload>(
  'pr-review', async (job: Job<ReviewJobPayload>) => {
    const { installationId, owner, repo, prNumber } = job.data;
    console.log(`[worker] Reviewing ${owner}/${repo}#${prNumber}`);

    const files = await fetchChangedFiles(installationId, owner, repo, prNumber);

    if(files.length === 0){
      console.log(`[worker] No reviewable files in ${owner}/${repo}#${prNumber}`);
      return;
    }

    const issues = await reviewAllFiles(files);
    const commitSha = await getLatestCommitSha(installationId, owner, repo, prNumber);

    const comments = issues.map((issue) => ({
      path: issue.file,
      line: issue.line,
      body: `**[${issue.severity.toUpperCase()} · ${issue.category}]** ${issue.comment}${
        issue.suggestion ? `\n\n\`\`\`suggestion\n${issue.suggestion}\n\`\`\`` : ""
      }`,
    }))

    await postReviews(installationId, owner, repo, prNumber, commitSha, comments);

    console.log(`[worker] Posted ${comments.length} comment(s) on ${owner}/${repo}#${prNumber}`);

    return { issueCount: comments.length };
  },

  { connection, concurrency: 2 }
)

worker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`);
})

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
})

console.log("PR review worker started, waiting for jobs...");