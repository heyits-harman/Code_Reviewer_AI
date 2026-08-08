import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { reviewQueue } from './reviewQueue';

const router = Router();
function verifySignature(payload: Buffer, signature: string | undefined): boolean{
  if (!signature) return false;

  const expected = 
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
      .update(payload)
      .digest("hex");

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if(sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);

    router.post("/github",
        express.raw({ type: "application/json" }),
        async (req: Request, res: Response) => {

          const signature = req.headers["x-hub-signature-256"] as string | undefined;
          const rawBody = req.body as Buffer;

          if(!verifySignature(rawBody, signature)){
            return res.status(401).send("Invalid signature");
          }

          const event = req.headers["x-github-event"];
          const data = JSON.parse(rawBody.toString("utf-8"));

          res.status(200).send("ok");

          if(event === "pull_request" && ["opened", "synchronize"].includes(data.action)){
            try{
              await reviewQueue.add("review-pr", {
                installationId: data.installation.id,
                owner: data.repository.owner.login,
                repo: data.repository.name,
                prNumber: data.pull_request.number,
              })
              console.log(`[webhook] Queued review for ${data.repository.full_name}#${data.pull_request.number}`);
            } catch(err){
              console.error("[webhook] Failed to enqueue review job:", err);
            }
          }
        }
    );
}

export default router;
