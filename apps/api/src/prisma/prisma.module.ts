import { Global, Module } from "@nestjs/common";
import { TenantContextService } from "../tenancy/tenant-context.service";
import { createPrismaService, PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: createPrismaService,
      inject: [TenantContextService],
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
