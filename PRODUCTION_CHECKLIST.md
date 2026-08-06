# Production Checklist

## Before deployment

- [ ] Use Node.js 22 or newer.
- [ ] Run `npm install` from the monorepo root.
- [ ] Copy `apps/api/.env.example` to the API environment and replace `CAMPUS_BITES_JWT_SECRET` with a unique high-entropy value.
- [ ] Set the Student App and Ops Dashboard `VITE_API_URL` values to the deployed API URL.
- [ ] Configure `CAMPUS_BITES_DB_PATH` on persistent storage and verify database backup and recovery procedures.
- [ ] Keep `CAMPUS_BITES_AUTO_PAYOUT=false` unless automatic settlement is approved and monitored.

## Release validation

- [x] API TypeScript build passes.
- [x] Student App production build passes.
- [x] Ops Dashboard production build passes.
- [x] Student App and Ops Dashboard lint have no errors.
- [ ] Start API, Student App, and Ops Dashboard in the deployment environment.
- [ ] Verify student registration and login.
- [ ] Verify restaurant, admin, and super-admin login and permissions.
- [ ] Verify orders, payments, payouts, refunds, shared delivery, Pair Code, and QR handover workflows with non-production test data.
- [ ] Verify token refresh and logout behavior.
- [ ] Verify notification delivery, landing page, and light/dark appearance.

## Deployment commands

```bash
npm install
npm run build
npm run dev
```
