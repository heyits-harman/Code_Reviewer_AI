import "../config.js";
import { Worker, Job } from "bullmq";
import { connection } from "./reviewQueue.js";
import { fetchChangedFiles, getLatestCommitSha, postReviews }from "../services/github.js";
import { reviewAllFiles } from "../services/gemini.js";
import type { ReviewJobPayload } from "../types/review.js"

const worker = new Worker<ReviewJobPayload>(
  'pr-review', async (job: Job<ReviewJobPayload>) => {
    const { installationId, owner, repo, prNumber } = job.data;
    console.log(`[worker] ========== Starting review for ${owner}/${repo}#${prNumber} ==========`);
    console.log(`[worker] Job ID: ${job.id}, Attempt: ${job.attemptsMade + 1}`);

    try {
      console.log(`[worker] Step 1/4: Fetching changed files...`);
      const files = await fetchChangedFiles(installationId, owner, repo, prNumber);
      console.log(`[worker] Got ${files.length} changed file(s): ${files.map(f => f.fileName).join(', ')}`);

      if(files.length === 0){
        console.log(`[worker] No reviewable files in ${owner}/${repo}#${prNumber} — skipping`);
        return { issueCount: 0 };
      }

      console.log(`[worker] Step 2/4: Running Gemini review on ${files.length} file(s)...`);
      const issues = await reviewAllFiles(files);
      console.log(`[worker] Got ${issues.length} issue(s) from AI review`);

      console.log(`[worker] Step 3/4: Fetching latest commit SHA...`);
      const commitSha = await getLatestCommitSha(installationId, owner, repo, prNumber);
      console.log(`[worker] Commit SHA: ${commitSha}`);

      const comments = issues.map((issue) => ({
        path: issue.file,
        line: issue.line,
        body: `**[${issue.severity.toUpperCase()} · ${issue.category}]** ${issue.comment}${
          issue.suggestion ? `\n\n\`\`\`suggestion\n${issue.suggestion}\n\`\`\`` : ""
        }`,
      }))

      console.log(`[worker] Step 4/4: Posting ${comments.length} review comment(s)...`);
      await postReviews(installationId, owner, repo, prNumber, commitSha, comments);

      console.log(`[worker] ========== Review complete for ${owner}/${repo}#${prNumber}: ${comments.length} comment(s) posted ==========`);
      return { issueCount: comments.length };
    } catch (err) {
      console.error(`[worker] ========== Review FAILED for ${owner}/${repo}#${prNumber} ==========`);
      console.error(`[worker] Error:`, err);
      throw err;
    }
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
