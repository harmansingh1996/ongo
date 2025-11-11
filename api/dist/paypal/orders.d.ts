import type { Router } from 'express';
import { PayPalClient } from './client.js';
import { PayPalService } from './service.js';
export declare function registerOrderRoutes(router: Router, client: PayPalClient, service: PayPalService): void;
