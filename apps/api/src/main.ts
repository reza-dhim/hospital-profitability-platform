import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

/**
 * OpenAPI is generated from code, served at /api/docs (UI) and /api/docs-json
 * (consumed by packages/types' codegen script). docs/28_OPENAPI_STRATEGY.md §1.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1", { exclude: ["health"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Required to read the httpOnly refresh-token cookie (docs/05_AUTHENTICATION.md §1).
  app.use(cookieParser());
  // credentials:true requires an explicit origin (browsers reject wildcard
  // origin on credentialed/cookie-bearing requests) — defaults to apps/web's
  // local dev port.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Hospital Profitability Intelligence Platform API")
    .setDescription("See docs/API_SPEC.md and docs/28_OPENAPI_STRATEGY.md")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}, docs at /api/docs`);
}

bootstrap();
