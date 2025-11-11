import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createStripeRouter } from './stripe/index.js';
import { createPayPalRouter } from './paypal/index.js';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/api/stripe', createStripeRouter());
app.use('/api/paypal', createPayPalRouter());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Stripe API server running on port ${port}`);
});
