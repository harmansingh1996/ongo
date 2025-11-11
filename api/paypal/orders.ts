import type { Router, Request, Response } from 'express';
import { PayPalClient } from './client.js';
import { PayPalService } from './service.js';

export function registerOrderRoutes(router: Router, client: PayPalClient, service: PayPalService) {
  router.post('/orders', async (req: Request, res: Response) => {
    try {
      const { amount, currency = 'CAD', intent = 'AUTHORIZE' } = req.body ?? {};

      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be a positive number' });
      }

      if (!['CAD', 'USD', 'EUR', 'GBP'].includes(currency)) {
        return res.status(400).json({ success: false, error: 'Unsupported currency code' });
      }

      if (!['AUTHORIZE', 'CAPTURE'].includes(intent)) {
        return res.status(400).json({ success: false, error: 'intent must be AUTHORIZE or CAPTURE' });
      }

      const order = await service.createOrder(client, {
        amount,
        currency,
        intent: intent as 'AUTHORIZE' | 'CAPTURE',
      });

      return res.status(201).json({ success: true, data: order });
    } catch (error) {
      console.error('PayPal order creation failed:', error);
      return res.status(500).json({ success: false, error: 'Failed to create PayPal order' });
    }
  });

  router.get('/orders/:orderId', async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const order = await service.getOrderDetails(client, orderId);
      return res.json({ success: true, data: order });
    } catch (error) {
      console.error('PayPal get order failed:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch PayPal order details' });
    }
  });

  router.post('/orders/:orderId/capture', async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const capture = await service.captureOrder(client, orderId);
      return res.json({ success: true, data: capture });
    } catch (error) {
      console.error('PayPal capture order failed:', error);
      return res.status(500).json({ success: false, error: 'Failed to capture PayPal order' });
    }
  });

  router.post('/orders/:orderId/authorize', async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const authorization = await service.authorizeOrder(client, orderId);
      return res.json({ success: true, data: authorization });
    } catch (error) {
      console.error('PayPal authorize order failed:', error);
      return res.status(500).json({ success: false, error: 'Failed to authorize PayPal order' });
    }
  });
}
