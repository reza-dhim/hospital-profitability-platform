# Hospital Profitability Intelligence Platform

Enterprise AI platform untuk rumah sakit dalam menghitung:
- Cost Center Allocation
- Profit Center Profitability
- Unit Cost
- Tariff Recommendation
- Doctor Cost & Profitability Analytics
- Executive Decision Support

## Recommended Stack
Frontend: Next.js, React, TypeScript, TailwindCSS, shadcn/ui  
Backend: NestJS, PostgreSQL, Prisma, Redis, BullMQ  
AI: OpenAI API, RAG, pgvector  
Storage: S3-compatible storage

## Development Strategy
Jangan bangun semua fitur sekaligus. Gunakan sprint bertahap:

1. Project setup + design system
2. Auth + RBAC
3. Master data
4. Bulk upload template
5. Validation engine
6. Cost allocation engine
7. Profitability dashboard
8. AI recommendation
9. Doctor analytics
10. Reporting
