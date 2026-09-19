import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { reviewQueue } from '../queue/reviewQueue.js';

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

}

router.post("/github",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {

    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    const rawBody = req.body;

    if(!Buffer.isBuffer(rawBody)){
      return res.status(400).send("Request body must be raw");
    }

    if(!verifySignature(rawBody, signature)){
      return res.status(401).send("Invalid signature");
    }
    
    console.log("[webhook] Signature verified");

    const event = req.headers["x-github-event"];
    const data = JSON.parse(rawBody.toString("utf-8"));

    console.log(`[webhook] Event: ${event}, Action: ${data.action}`);

    res.status(200).send("ok");

    if(event === "pull_request" && ["opened", "synchronize"].includes(data.action)){
      try{
        console.log(`[webhook] Processing PR: ${data.repository.full_name}#${data.pull_request.number}`);
        await reviewQueue.add("review-pr", {
          installationId: data.installation.id,
          owner: data.repository.owner.login,
          repo: data.repository.name,
          prNumber: data.pull_request.number,
        })
        console.log(`[webhook] Job queued successfully`);
        console.log(`[webhook] Queued review for ${data.repository.full_name}#${data.pull_request.number}`);
      } catch(err){
        console.error("[webhook] Failed to enqueue review job:", err);
      }
    } else{
      console.log(`[webhook] Ignoring event: ${event} with action: ${data.action}`);
    }
  }
);

export default router;
