import type { Router } from 'express';
import { PayPalClient } from './client.js';
import { PayPalService } from './service.js';
export declare function registerAuthorizationRoutes(router: Router, client: PayPalClient, service: PayPalService): void;
