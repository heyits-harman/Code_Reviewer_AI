import express from 'express';
import 'dotenv/config';
import webhookRouter from './routes/webhook.js';

const app = express();

app.use(express.json());

app.use('/webhook', webhookRouter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: "OK", service: "ai-pr-reviewer" });
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})