import { Queue } from "bullmq";
import type { ReviewJobPayload } from "../types/review"

const redisUrl = new URL(process.env.REDIS_URL!);

export const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null as null,
}

export const reviewQueue = new Queue<ReviewJobPayload>("pr-review", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  }
})