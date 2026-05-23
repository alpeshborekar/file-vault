import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../config/swagger';

const router = Router();


router.use(
  '/',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'CloudStash API Docs',
    customCss: `
      .topbar { background-color: #1e1e2e; }
      .topbar-wrapper img { content: url(''); }
      .topbar-wrapper::after {
        content: '🔐 CloudStash API';
        color: #a78bfa;
        font-size: 1.2rem;
        font-weight: 700;
        margin-left: 1rem;
      }
      .swagger-ui .info .title { color: #a78bfa; }
      .swagger-ui .scheme-container { background: #1e1e2e; padding: 1rem; }
    `,
    swaggerOptions: {
      persistAuthorization: true,   // JWT stays after page refresh
      displayRequestDuration: true, // shows response time
      filter: true,                 // search bar across endpoints
      tryItOutEnabled: true,        // "Try it out" open by default
    },
  }),
);

router.get('.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

export default router;